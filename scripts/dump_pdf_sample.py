# -*- coding: utf-8 -*-
"""Dump first N pages of a Focus Gold PDF to UTF-8 text for inspection."""
import sys
from pathlib import Path

import fitz


def main() -> int:
    vol = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 8
    web_root = Path(__file__).resolve().parent.parent
    path = web_root / "public" / "focusgold" / f"{vol}.pdf"
    if not path.exists():
        print("PDF not found", path, file=sys.stderr)
        return 1
    out = web_root / f"_pdf_dump_vol{vol}.txt"
    doc = fitz.open(path)
    lines = [f"FILE={path} pages={doc.page_count}\n"]
    for i in range(min(n, doc.page_count)):
        t = doc[i].get_text("text") or ""
        lines.append(f"\n===== PAGE {i+1} =====\n")
        lines.append(t)
    doc.close()
    with open(out, "w", encoding="utf-8") as f:
        f.write("".join(lines))
    print("wrote", out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
