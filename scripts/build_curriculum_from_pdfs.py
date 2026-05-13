# -*- coding: utf-8 -*-
"""
Focus Gold PDF（public/focusgold/{1..14}.pdf）から問題ブロックを抽出し、
src/data/problems.full.json（サーバー専用・全文）と
src/data/problems.meta.json（クライアント用・軽量）を生成する。
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import fitz

FW = str.maketrans("０１２３４５６７８９", "0123456789")

PAGE_MARK = re.compile(r"__PAGE__(\d+)__")
PROB_HEAD = re.compile(r"問題[ \t　]*([0-9０-９]+)")


def fw_to_ascii(s: str) -> str:
    return s.translate(FW)


def clean_segment(raw: str) -> str:
    s = PAGE_MARK.sub("", raw)
    s = re.sub(r"[ \t]+\n", "\n", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip()


def first_page_in_segment(seg: str) -> int:
    m = PAGE_MARK.search(seg)
    if m:
        return int(m.group(1))
    return 1


def guess_problem_statement(full: str, max_chars: int = 1200) -> str:
    """
    解答本編が続く前提で、先頭付近を問題文として切り出す。
    （完全分離は PDF 構造上困難なため、冒頭を重視）
    """
    t = clean_segment(full)
    if not t:
        return ""
    # 先頭の「問題n」行を除いたあと、長すぎる場合は先頭のみ
    lines = t.splitlines()
    out: list[str] = []
    n = 0
    for line in lines:
        if PROB_HEAD.match(line.strip()):
            continue
        out.append(line)
        n += len(line) + 1
        if n >= max_chars:
            break
    stem = "\n".join(out).strip()
    if len(stem) > max_chars:
        stem = stem[:max_chars].rstrip() + "…"
    return stem


def truncate(s: str, n: int) -> str:
    s = s.strip()
    if len(s) <= n:
        return s
    return s[:n].rstrip() + "\n…（省略）…"


def build_policy(vol: int, index: int, answer_excerpt: str) -> str:
    excerpt = truncate(answer_excerpt, 2200)

    lines = [
        f"【Vol.{vol} 問{index} 方針ルーブリック（採点基準）】",
        "1) 問題が求める結論・形式（値・式・因数分解・次数と係数など）を明示している。",
        "2) 使用する定義・公式（展開・因数分解・次数の定義など）を選び、その理由が文章で追える。",
        "3) 式変形の各ステップに飛躍がなく、中間式から最終形まで論理的につながっている。",
        "4) 最終解答が問題の要求と一致しており、致命的な計算ミスがない。",
        "5) 別解がある場合は、与式の変形として正当であることを示せている。",
        "",
        "【Focus Gold 解答テキスト抜粋（PDF 抽出・照合用）】",
        excerpt,
    ]
    return "\n".join(lines)


def extract_vol(doc: fitz.Document) -> list[dict]:
    buf_parts: list[str] = []
    for i in range(doc.page_count):
        t = doc[i].get_text("text") or ""
        buf_parts.append(f"\n__PAGE__{i + 1}__\n")
        buf_parts.append(t)
    full = "".join(buf_parts)

    pieces = re.split(r"(?=問題[ \t　]*[0-9０-９]+)", full)
    out: list[dict] = []
    for piece in pieces:
        piece = piece.strip()
        if not piece:
            continue
        m0 = PROB_HEAD.search(piece)
        if not m0:
            continue
        idx_s = fw_to_ascii(m0.group(1))
        if not idx_s.isdigit():
            continue
        index = int(idx_s)
        body = piece[m0.start() :].strip()
        page = first_page_in_segment(body)
        cleaned = clean_segment(body)
        if len(cleaned) < 8:
            continue

        pred = guess_problem_statement(body, max_chars=1200)
        head_line = m0.group(0).strip()
        if pred:
            predicted = truncate(f"【Focus Gold より】{head_line}\n\n{pred}", 1800)
        else:
            predicted = truncate(f"【Focus Gold より】{head_line}\n\n{cleaned}", 1800)

        official = truncate(cleaned, 5000)
        out.append(
            {
                "indexInVol": index,
                "page": page,
                "predictedProblemText": predicted,
                "officialAnswerText": official,
            }
        )

    # 同一 index が複数ある場合は、先に出現した（ページが若い）ものを採用
    by_idx: dict[int, dict] = {}
    for row in sorted(out, key=lambda r: (r["indexInVol"], r["page"])):
        if row["indexInVol"] not in by_idx:
            by_idx[row["indexInVol"]] = row
    return [by_idx[k] for k in sorted(by_idx)]


def main() -> int:
    web_root = Path(__file__).resolve().parent.parent
    pdf_dir = web_root / "public" / "focusgold"
    out_dir = web_root / "src" / "data"
    out_dir.mkdir(parents=True, exist_ok=True)
    full_path = out_dir / "problems.full.json"
    meta_path = out_dir / "problems.meta.json"

    all_problems: list[dict] = []

    for vol in range(1, 15):
        pdf = pdf_dir / f"{vol}.pdf"
        if not pdf.exists():
            print("missing", pdf, file=sys.stderr)
            continue
        doc = fitz.open(pdf)
        rows = extract_vol(doc)
        doc.close()
        for row in rows:
            idx = row["indexInVol"]
            policy = build_policy(vol, idx, row["officialAnswerText"])
            all_problems.append(
                {
                    "id": f"v{vol}-q{idx}",
                    "vol": vol,
                    "indexInVol": idx,
                    "predictedProblemText": row["predictedProblemText"],
                    "officialAnswerText": row["officialAnswerText"],
                    "canonicalPolicy": policy,
                    "answerPdfPage": int(row["page"]),
                }
            )
        print(f"vol{vol}: {len(rows)} problems")

    meta_list: list[dict] = []
    for p in all_problems:
        meta_list.append(
            {
                "id": p["id"],
                "vol": p["vol"],
                "indexInVol": p["indexInVol"],
                "answerPdfPage": p["answerPdfPage"],
                "predictedProblemText": p["predictedProblemText"],
            }
        )

    with open(full_path, "w", encoding="utf-8") as f:
        json.dump({"problems": all_problems}, f, ensure_ascii=False, indent=2)
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump({"problems": meta_list}, f, ensure_ascii=False, indent=2)

    old = out_dir / "problems.json"
    if old.exists():
        old.unlink()

    print("wrote", full_path, "and", meta_path, "total", len(all_problems))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
