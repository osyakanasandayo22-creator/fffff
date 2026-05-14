# -*- coding: utf-8 -*-
"""
problems.full.json の officialAnswerText をもとに、Gemini で「問題文」を推定し
predictedProblemText を上書きする。problems.meta.json も同期更新。

環境変数（web/.env.local からも読み取り）:
  GEMINI_API_KEY … 必須
  GEMINI_PROBLEM_TEXT_MODEL … 省略時は GEMINI_GRADING_MODEL、それもなければ gemini-2.0-flash

例:
  python scripts/predict_problem_statements.py
  python scripts/predict_problem_statements.py --limit 30
  python scripts/predict_problem_statements.py --resume
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

WEB_ROOT = Path(__file__).resolve().parent.parent
FULL_PATH = WEB_ROOT / "src" / "data" / "problems.full.json"
META_PATH = WEB_ROOT / "src" / "data" / "problems.meta.json"
CACHE_PATH = WEB_ROOT / "scripts" / "_predicted_cache.jsonl"
ENV_LOCAL = WEB_ROOT / ".env.local"


def load_env() -> dict[str, str]:
    out: dict[str, str] = {}
    if ENV_LOCAL.exists():
        for line in ENV_LOCAL.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            k, v = k.strip(), v.strip().strip('"').strip("'")
            if k:
                out[k] = v
    for k, v in os.environ.items():
        if k.startswith("GEMINI_"):
            out[k] = v
    return out


def extract_json_array(text: str) -> list:
    t = text.strip()
    m = re.search(r"```(?:json)?\s*([\s\S]*?)```", t, re.I)
    if m:
        t = m.group(1).strip()
    start = t.find("[")
    end = t.rfind("]")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("JSON 配列が見つかりません")
    return json.loads(t[start : end + 1])


def parse_retry_after_seconds(err_msg: str) -> float | None:
    m = re.search(r"Please retry in ([\d.]+)\s*s", err_msg, re.I)
    if m:
        return float(m.group(1)) + 0.75
    return None


def call_gemini(api_key: str, model: str, prompt: str) -> str:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    body = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.25,
            "maxOutputTokens": 8192,
        },
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            raw = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {e.code}: {err[:800]}") from e
    try:
        parts = raw["candidates"][0]["content"]["parts"]
        return "".join(p.get("text", "") for p in parts)
    except (KeyError, IndexError) as e:
        raise RuntimeError(f"応答形式が不正: {str(raw)[:600]}") from e


def build_batch_prompt(vol: int, items: list[dict]) -> str:
    blocks = []
    for it in items:
        aid = it["id"]
        idx = it["indexInVol"]
        snip = (it.get("officialAnswerText") or "")[:4200]
        blocks.append(f"--- id:{aid} vol:{vol} 問:{idx} ---\n{snip}")
    joined = "\n\n".join(blocks)
    return f"""あなたは高校数学の教師です。Focus Gold 参考書の同一 Vol.{vol} 内の複数小問について、与えられた【解答テキスト】から逆算し、生徒が解くべき【問題文】を推定してください。

【厳守】
- 各小問について「問題文」だけを書く。解答の途中式・最終答え（「= ...」で示す計算過程や結果の列挙）は問題文に含めない。
- 求める演算・図形の性質・方程式のタイプなどが伝わるように、与えられた式・条件を自然な日本語に織り込む。
- 不確かな箇所は「次の式について」「次の条件を満たす～について」のように括る。
- 出力は JSON 配列のみ（前後に説明や Markdown を付けない）。要素はオブジェクトで、キーは id（文字列）と statement（文字列）のみ。順番は入力の id 列と同じにすること。
- statement はおおむね 120～500 文字程度（最大 900 文字）。

【小問一覧】
{joined}
"""


def write_outputs(data: dict, problems: list[dict]) -> None:
    FULL_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    meta = {
        "problems": [
            {
                "id": p["id"],
                "vol": p["vol"],
                "indexInVol": p["indexInVol"],
                "answerPdfPage": p["answerPdfPage"],
                "predictedProblemText": p["predictedProblemText"],
            }
            for p in problems
        ]
    }
    META_PATH.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--batch", type=int, default=6, help="同一 Vol 内の連続問題をまとめる数")
    ap.add_argument("--sleep", type=float, default=0.35, help="API 呼び出し間隔（秒）")
    ap.add_argument("--limit", type=int, default=0, help="0 で全件")
    ap.add_argument("--resume", action="store_true", help="キャッシュ済み id はスキップ")
    args = ap.parse_args()

    env = load_env()
    api_key = (env.get("GEMINI_API_KEY") or "").strip()
    if not api_key:
        print("GEMINI_API_KEY がありません（.env.local または環境変数）", file=sys.stderr)
        return 2
    model = (
        env.get("GEMINI_PROBLEM_TEXT_MODEL")
        or env.get("GEMINI_GRADING_MODEL")
        or "gemini-2.0-flash"
    ).strip()
    model = model.replace("models/", "")

    data = json.loads(FULL_PATH.read_text(encoding="utf-8"))
    problems: list[dict] = data["problems"]

    done_ids: set[str] = set()
    if args.resume and CACHE_PATH.exists():
        for line in CACHE_PATH.read_text(encoding="utf-8").splitlines():
            try:
                o = json.loads(line)
                done_ids.add(o["id"])
            except Exception:
                pass

    processed = 0
    cache_lines: list[str] = []

    by_vol: dict[int, list[dict]] = {}
    for p in problems:
        by_vol.setdefault(int(p["vol"]), []).append(p)
    for v in by_vol:
        by_vol[v].sort(key=lambda x: int(x["indexInVol"]))

    def flush_cache() -> None:
        if cache_lines:
            with open(CACHE_PATH, "a", encoding="utf-8") as f:
                for ln in cache_lines:
                    f.write(ln + "\n")
            cache_lines.clear()

    for vol in sorted(by_vol):
        lst = by_vol[vol]
        i = 0
        while i < len(lst):
            batch = lst[i : i + args.batch]
            i += args.batch
            batch = [p for p in batch if p["id"] not in done_ids]
            if not batch:
                continue
            if args.limit and processed >= args.limit:
                break
            prompt = build_batch_prompt(vol, batch)
            for attempt in range(5):
                try:
                    text = call_gemini(api_key, model, prompt)
                    arr = extract_json_array(text)
                    if not isinstance(arr, list) or len(arr) != len(batch):
                        raise ValueError(f"要素数不一致: want {len(batch)} got {len(arr)}")
                    id_to_stmt: dict[str, str] = {}
                    for el in arr:
                        if not isinstance(el, dict):
                            continue
                        pid = str(el.get("id", "")).strip()
                        st = str(el.get("statement", "")).strip()
                        if pid and st:
                            id_to_stmt[pid] = st
                    missing = [p["id"] for p in batch if p["id"] not in id_to_stmt]
                    if missing:
                        raise ValueError(f"欠損 id: {missing[:5]}")
                    for p in batch:
                        pid = p["id"]
                        stmt = id_to_stmt[pid]
                        header = f"【Focus Gold Vol.{vol} 問{p['indexInVol']}（問題文は解答から推定）】"
                        p["predictedProblemText"] = f"{header}\n\n{stmt}"
                        cache_lines.append(json.dumps({"id": pid}, ensure_ascii=False))
                        done_ids.add(pid)
                        processed += 1
                        if args.limit and processed >= args.limit:
                            break
                    write_outputs(data, problems)
                    flush_cache()
                    break
                except Exception as e:
                    msg = str(e)
                    wait = 1.5 * (2**attempt)
                    if "429" in msg or "RESOURCE_EXHAUSTED" in msg:
                        ra = parse_retry_after_seconds(msg)
                        if ra is not None:
                            wait = max(wait, ra)
                    print(f"retry vol{vol} batch err: {e} sleep {wait:.1f}s", file=sys.stderr)
                    time.sleep(wait)
            else:
                print(f"FAILED vol{vol} after retries", file=sys.stderr)
                return 3
            time.sleep(args.sleep)
            if args.limit and processed >= args.limit:
                break
        if args.limit and processed >= args.limit:
            break

    flush_cache()

    if processed > 0:
        write_outputs(data, problems)

    print("updated", FULL_PATH, META_PATH, "predicted count", processed, "model", model)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
