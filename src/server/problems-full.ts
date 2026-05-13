import fs from "node:fs";
import path from "node:path";

import type { Problem } from "@/lib/types";

let cache: Map<string, Problem> | null = null;

export function getProblemFullFromDisk(id: string): Problem | undefined {
  if (!cache) {
    const fp = path.join(process.cwd(), "src", "data", "problems.full.json");
    const raw = JSON.parse(fs.readFileSync(fp, "utf8")) as { problems: Problem[] };
    cache = new Map(raw.problems.map((p) => [p.id, p]));
  }
  return cache.get(id);
}
