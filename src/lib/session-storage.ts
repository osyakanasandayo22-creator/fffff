import type { GradeResult, Problem, SessionPayloadV1 } from "@/lib/types";

const SESSION_KEY = "fg_session_v1";
const GRADE_CTX_KEY = "fg_grade_context_v1";

export function readSession(): SessionPayloadV1 | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SessionPayloadV1;
    if (data?.version !== 1 || !Array.isArray(data.queue)) return null;
    return data;
  } catch {
    return null;
  }
}

export function writeSession(payload: SessionPayloadV1): void {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload));
}

export function clearSession(): void {
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(GRADE_CTX_KEY);
}

export type GradeContextV1 = {
  version: 1;
  problem: Problem;
  userAnswer: string;
  grade: GradeResult;
};

export function readGradeContext(): GradeContextV1 | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(GRADE_CTX_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as GradeContextV1;
    if (data?.version !== 1 || !data.problem || !data.grade) return null;
    return data;
  } catch {
    return null;
  }
}

export function writeGradeContext(ctx: GradeContextV1): void {
  sessionStorage.setItem(GRADE_CTX_KEY, JSON.stringify(ctx));
}

export function clearGradeContext(): void {
  sessionStorage.removeItem(GRADE_CTX_KEY);
}
