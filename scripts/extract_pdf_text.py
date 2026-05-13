"""
Focus Gold PDF からページ単位のテキストをダンプする補助スクリプト。
問題分割・ルーブリック生成の前処理として利用します。

依存: pip install pymupdf
使い方（web フォルダの親から）:
  python scripts/extract_pdf_text.py --vol 1 --pages 1-5
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--vol", type=int, required=True, help="1-14")
    parser.add_argument("--pages", type=str, default="1-3", help='例: "1-5" または "3"')
    parser.add_argument(
        "--root",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "public" / "focusgold",
        help="PDF ディレクトリ（既定: <repo>/web/public/focusgold）",
    )
    args = parser.parse_args()

    if args.vol < 1 or args.vol > 14:
        print("vol は 1-14 で指定してください。", file=sys.stderr)
        return 2

    pdf_path = args.root / f"{args.vol}.pdf"
    if not pdf_path.exists():
        print(f"PDF が見つかりません: {pdf_path}", file=sys.stderr)
        return 2

    try:
        import fitz  # type: ignore  # PyMuPDF
    except ImportError:
        print("PyMuPDF が未インストールです。次を実行してください:", file=sys.stderr)
        print("  pip install pymupdf", file=sys.stderr)
        return 3

    doc = fitz.open(pdf_path)
    total = doc.page_count

    def parse_range(spec: str) -> tuple[int, int]:
        if "-" in spec:
            a, b = spec.split("-", 1)
            return int(a), int(b)
        p = int(spec)
        return p, p

    start, end = parse_range(args.pages)
    start = max(1, start)
    end = min(total, end)

    for p in range(start - 1, end):
        text = doc[p].get_text("text")
        print(f"\n===== vol{args.vol} page {p + 1} / {total} =====\n")
        print(text.strip() or "(テキストが空です。スキャン画像主体の可能性があります)")

    doc.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
