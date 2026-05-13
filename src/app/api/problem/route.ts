import { NextResponse } from "next/server";

import { getProblemFullFromDisk } from "@/server/problems-full";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id?.trim()) {
    return NextResponse.json({ error: "クエリ id が必要です" }, { status: 400 });
  }
  const p = getProblemFullFromDisk(id.trim());
  if (!p) {
    return NextResponse.json({ error: "問題が見つかりません" }, { status: 404 });
  }
  return NextResponse.json(p);
}
