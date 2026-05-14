# -*- coding: utf-8 -*-
"""
officialAnswerText から、解答の途中（= で始まる行以降）を落として「与えられた式・条件」だけを残し、
predictedProblemText を API なしで組み立てる。

教科書の原文の文章とは一致しないが、採点用アプリで「何を解かせたいか」を推定する実用的な中間表現。
"""
from __future__ import annotations

import json
import re
from pathlib import Path

WEB = Path(__file__).resolve().parent.parent
FULL = WEB / "src" / "data" / "problems.full.json"
META = WEB / "src" / "data" / "problems.meta.json"


def strip_leading_problem_label(text: str) -> str:
    t = text.strip()
    t = re.sub(r"^問題[０-９0-9]+\s*", "", t)
    return t.strip()


def split_subquestions(body: str) -> list[str]:
    body = body.strip()
    if not body:
        return []
    return [p.strip() for p in re.split(r"(?=\([0-9]+\)\s)", body) if p.strip()]


def trim_at_first_equals(line: str) -> str:
    """1 行に複数の '=' が並ぶ解答冒頭を、左辺（与式）だけに切る。"""
    if " = " in line:
        return line.split(" = ", 1)[0].rstrip()
    return line.rstrip()


def strip_solution_tail(chunk: str) -> str:
    """小問ブロックのうち、途中式（行頭 '='）や別解・代入説明以降を捨てる。"""
    lines = chunk.splitlines()
    out: list[str] = []
    for i, line in enumerate(lines):
        s = line.strip()
        if not s:
            continue
        if "別解" in s or "別　解" in s:
            break
        if "ここで" in s:
            break
        if out and (re.match(r"^[−-]𝑋\s*=", s) or re.match(r"^𝑋\s*=", s)):
            break
        if i > 0 and s.startswith("="):
            break
        if i > 0 and re.match(r"^=\S", s):
            break
        trimmed = trim_at_first_equals(line)
        if not trimmed.strip():
            continue
        out.append(trimmed)
    return "\n".join(out).strip()


def infer_core(official: str) -> str:
    body = strip_leading_problem_label(official)
    chunks = split_subquestions(body)
    parts = [strip_solution_tail(c) for c in chunks]
    parts = [p for p in parts if p]
    text = "\n\n".join(parts)
    if len(text) > 4000:
        text = text[:4000].rstrip() + "\n…（長いため省略）"
    return text


def main() -> None:
    data = json.loads(FULL.read_text(encoding="utf-8"))
    problems = data["problems"]
    for p in problems:
        vol = int(p["vol"])
        idx = int(p["indexInVol"])
        official = p.get("officialAnswerText") or ""
        core = infer_core(official)
        if not core.strip():
            core = official.strip()[:800]
        header = (
            f"【Focus Gold Vol.{vol} 問{idx}（解答PDFの抜粋から推定。"
            "式の変形途中は除き、与えられた式・条件のみを示す）】"
        )
        footer = "\n\n上の小問について、求められた結論（値・式・因数分解・証明など）を示せ。"
        p["predictedProblemText"] = header + "\n\n" + core + footer

    FULL.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    meta = {
        "problems": [
            {
                "id": x["id"],
                "vol": x["vol"],
                "indexInVol": x["indexInVol"],
                "answerPdfPage": x["answerPdfPage"],
                "predictedProblemText": x["predictedProblemText"],
            }
            for x in problems
        ]
    }
    META.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    print("wrote", FULL, "and", META, "n=", len(problems))


if __name__ == "__main__":
    main()
