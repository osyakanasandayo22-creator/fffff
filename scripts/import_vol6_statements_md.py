# -*- coding: utf-8 -*-
"""vol6-problems-98-158.md を読み、problems.full.json / problems.meta.json の predictedProblemText を更新。"""
from __future__ import annotations

import json
import re
from pathlib import Path

WEB = Path(__file__).resolve().parent.parent
MD_PATH = WEB / "src" / "data" / "vol6-problems-98-158.md"
FULL_PATH = WEB / "src" / "data" / "problems.full.json"
META_PATH = WEB / "src" / "data" / "problems.meta.json"


def normalize_line(line: str) -> str:
    s = line.rstrip()
    if not s:
        return ""
    m = re.match(r"^\*\s+\*\*\((\d+)\)\*\*\s*(.*)$", s)
    if m:
        return f"({m.group(1)}) {m.group(2)}"
    m = re.match(r"^\s+\*\*\((\d+)\)\*\*\s*(.*)$", s)
    if m:
        return f"({m.group(1)}) {m.group(2)}"
    m = re.match(r"^\*\s+(.*)$", s)
    if m:
        return m.group(1).strip()
    return s


def normalize_body(body: str) -> str:
    lines = [normalize_line(ln) for ln in body.strip().splitlines()]
    text = "\n".join(lines).strip()
    return re.sub(r"\n{3,}", "\n\n", text)


def parse_md(text: str) -> dict[int, str]:
    pat = re.compile(
        r"^###\s*\*\*問題\s*(\d+)\*\*\s*\n([\s\S]*?)(?=^###\s*\*\*問題|\Z)",
        re.MULTILINE,
    )
    out: dict[int, str] = {}
    for m in pat.finditer(text):
        n = int(m.group(1))
        body = normalize_body(m.group(2))
        header = f"【Focus Gold Vol.6 問{n}（数学II 第4章・ユーザー整理の問題文）】\n\n"
        out[n] = header + body
    return out


def main() -> None:
    md = MD_PATH.read_text(encoding="utf-8")
    by_idx = parse_md(md)
    data = json.loads(FULL_PATH.read_text(encoding="utf-8"))
    problems = data["problems"]
    updated = 0
    for p in problems:
        if int(p.get("vol", 0)) != 6:
            continue
        idx = int(p["indexInVol"])
        if idx not in by_idx:
            continue
        pid = p["id"]
        if pid != f"v6-q{idx}":
            raise SystemExit(f"id 不整合: {pid} vs v6-q{idx}")
        p["predictedProblemText"] = by_idx[idx]
        updated += 1
    FULL_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
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
    META_PATH.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    print("updated", updated, "problems. indices:", sorted(by_idx.keys()))


if __name__ == "__main__":
    main()
