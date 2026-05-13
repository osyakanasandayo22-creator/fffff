"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getProblemById } from "@/lib/curriculum";
import { readSession, writeGradeContext } from "@/lib/session-storage";
import type { GradeResult, Problem } from "@/lib/types";

export default function SessionPageClient() {
  const router = useRouter();
  const session = useMemo(() => readSession(), []);
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session || session.queue.length === 0) {
      router.replace("/");
    }
  }, [session, router]);

  const problemId = session?.queue[session?.index ?? 0];
  const meta = problemId ? getProblemById(problemId) : undefined;

  async function handleGrade() {
    if (!problemId || !meta) return;
    const trimmed = answer.trim();
    if (!trimmed) {
      setError("方針を入力してください。");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const pr = await fetch(`/api/problem?id=${encodeURIComponent(problemId)}`);
      const fullProblem = (await pr.json()) as Problem & { error?: string };
      if (!pr.ok) {
        throw new Error(fullProblem.error ?? `問題の取得に失敗しました (${pr.status})`);
      }
      if (!fullProblem.canonicalPolicy) {
        throw new Error("問題データにルーブリックがありません");
      }

      const res = await fetch("/api/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problemId,
          userAnswer: trimmed,
        }),
      });
      const data = (await res.json()) as {
        grade?: GradeResult;
        error?: string;
        detail?: string;
        model?: string;
      };
      if (!res.ok) {
        const parts = [data.error, data.detail, data.model ? `model: ${data.model}` : ""].filter(
          Boolean,
        );
        throw new Error(parts.join(" — ") || "採点に失敗しました");
      }
      if (!data.grade) throw new Error("採点結果が空です");
      writeGradeContext({
        version: 1,
        problem: fullProblem,
        userAnswer: trimmed,
        grade: data.grade,
      });
      router.push("/session/result");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  if (!session || session.queue.length === 0 || !meta) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-fg-muted">
        読み込み中…
      </div>
    );
  }

  const pos = `${session.index + 1} / ${session.queue.length}`;

  return (
    <div className="min-h-screen px-4 pb-24 pt-16 text-fg-muted">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center justify-between text-xs text-fg-muted/90">
          <span>
            Vol.{meta.vol} 問{meta.indexInVol}
          </span>
          <span>{pos}</span>
        </div>

        <section className="fg-card p-6 sm:p-8">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-fg-ink-soft">
            問題文
          </h2>
          <p className="fg-serif mt-3 whitespace-pre-wrap text-base leading-relaxed text-fg-ink">
            {meta.predictedProblemText}
          </p>
        </section>

        <section className="fg-card p-6 sm:p-8">
          <label className="block">
            <span className="text-sm font-semibold text-fg-ink">方針解答欄</span>
            <textarea
              className="fg-input mt-2 min-h-[180px] w-full resize-y font-sans text-sm leading-relaxed"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="本質的な方針を、自分の言葉で簡潔に書いてください。"
              disabled={loading}
            />
          </label>
          {error && (
            <p className="mt-2 text-sm font-medium text-red-700" role="alert">
              {error}
            </p>
          )}
        </section>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleGrade}
            disabled={loading}
            className="icon-btn h-12 w-12 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="採点へ"
            title="採点へ"
          >
            {loading ? (
              <span className="text-xs text-fg-ink">…</span>
            ) : (
              <Image src="/images/arrow.png" alt="" width={24} height={24} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
