import raw from "@/data/problems.meta.json";
import type { Problem } from "@/lib/types";

const problems: Problem[] = raw.problems as Problem[];

const byId = new Map(problems.map((p) => [p.id, p]));

export function getAllProblems(): Problem[] {
  return problems;
}

export function getProblemById(id: string): Problem | undefined {
  return byId.get(id);
}

export function problemsByVol(): Map<number, Problem[]> {
  const m = new Map<number, Problem[]>();
  for (const p of problems) {
    const arr = m.get(p.vol) ?? [];
    arr.push(p);
    m.set(p.vol, arr);
  }
  for (const arr of m.values()) {
    arr.sort((a, b) => a.indexInVol - b.indexInVol);
  }
  return m;
}

export function countProblemsInVol(vol: number): number {
  return problemsByVol().get(vol)?.length ?? 0;
}

function idsForVolRange(
  byVol: Map<number, Problem[]>,
  vol: number,
  fromIndex: number,
  toIndex: number,
): string[] {
  const list = byVol.get(vol) ?? [];
  return list
    .filter((p) => p.indexInVol >= fromIndex && p.indexInVol <= toIndex)
    .sort((a, b) => a.indexInVol - b.indexInVol)
    .map((p) => p.id);
}

/**
 * （開始 vol, 開始番号）→（終了 vol, 終了番号）まで連続。中間 vol は全問。
 */
export function buildRangeQueue(params: {
  startVol: number;
  startIndex: number;
  endVol: number;
  endIndex: number;
}): string[] {
  const { startVol, startIndex, endVol, endIndex } = params;
  const byVol = problemsByVol();
  if (
    startVol < 1 ||
    endVol > 14 ||
    startVol > endVol ||
    startIndex < 1 ||
    endIndex < 1
  ) {
    return [];
  }
  if (startVol === endVol && startIndex > endIndex) {
    return [];
  }

  const ids: string[] = [];

  for (let v = startVol; v <= endVol; v++) {
    const maxIdx = Math.max(
      ...(byVol.get(v) ?? []).map((p) => p.indexInVol),
      0,
    );
    if (maxIdx === 0) continue;

    if (v === startVol && v === endVol) {
      ids.push(...idsForVolRange(byVol, v, startIndex, endIndex));
    } else if (v === startVol) {
      ids.push(...idsForVolRange(byVol, v, startIndex, maxIdx));
    } else if (v === endVol) {
      ids.push(...idsForVolRange(byVol, v, 1, endIndex));
    } else {
      ids.push(...idsForVolRange(byVol, v, 1, maxIdx));
    }
  }

  return ids;
}

export function buildVolQueue(vol: number): string[] {
  const byVol = problemsByVol();
  return idsForVolRange(byVol, vol, 1, 9999);
}

export function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
