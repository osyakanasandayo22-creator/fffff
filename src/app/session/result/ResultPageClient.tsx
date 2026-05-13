"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { normalizeMultiline } from "@/lib/text";
import {
  clearGradeContext,
  clearSession,
  readGradeContext,
  readSession,
  writeSession,
} from "@/lib/session-storage";

export default function ResultPageClient() {
  const router = useRouter();
  const ctx = useMemo(() => readGradeContext(), []);

  const pdfHref = useMemo(() => {
    if (!ctx) return "";
    const vol = ctx.problem.vol;
    const page = ctx.problem.answerPdfPage;
    return `/focusgold/${vol}.pdf#page=${page}`;
  }, [ctx]);

  useEffect(() => {
    if (!ctx) {
      router.replace("/");
    }
  }, [ctx, router]);

  if (!ctx) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-fg-muted">
        読み込み中…
      </div>
    );
  }

  const { problem, userAnswer, grade } = ctx;
  const policy = normalizeMultiline(problem.canonicalPolicy ?? "");
  const official = (problem.officialAnswerText ?? "").trim();

  function goNext() {
    const s = readSession();
    if (!s) {
      router.replace("/");
      return;
    }
    const nextIndex = s.index + 1;
    clearGradeContext();
    if (nextIndex >= s.queue.length) {
      router.push("/session/done");
      return;
    }
    writeSession({ ...s, index: nextIndex });
    router.push("/session");
  }

  return (
    <div className="min-h-screen px-4 pb-24 pt-10 text-fg-muted">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="text-center">
          <p className="text-4xl font-semibold text-white">
            {grade.score}/{grade.maxScore}
            <span className="text-lg font-medium"> 点</span>
          </p>
        </div>

        <section className="fg-card p-6 sm:p-8">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-ink-soft">
            予測問題文
          </h3>
          <p className="fg-serif mt-2 whitespace-pre-wrap text-sm leading-relaxed text-fg-ink">
            {problem.predictedProblemText}
          </p>
        </section>

        <section className="fg-card p-6 sm:p-8">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-ink-soft">
            自分の方針回答
          </h3>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-fg-ink">{userAnswer}</p>
        </section>

        <section className="fg-card p-6 sm:p-8">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-ink-soft">
            正解の方針解答（ルーブリック）
          </h3>
          <pre className="fg-serif mt-2 whitespace-pre-wrap text-sm leading-relaxed text-fg-ink">
            {policy || "（ルーブリックがありません）"}
          </pre>
        </section>

        {official ? (
          <section className="fg-card p-6 sm:p-8">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-ink-soft">
              Focus Gold 解答（PDF 抽出テキスト）
            </h3>
            <pre className="fg-serif mt-2 max-h-[480px] overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-fg-ink">
              {official}
            </pre>
          </section>
        ) : null}

        <section className="fg-card p-6 sm:p-8">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-ink-soft">
            ポイント・分析コメント
          </h3>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-fg-ink">
            {grade.points.length === 0 ? (
              <li className="list-none pl-0 text-fg-ink-soft">（箇条書きは生成されませんでした）</li>
            ) : (
              grade.points.map((p, i) => <li key={i}>{p}</li>)
            )}
          </ul>
          <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-fg-ink">
            {grade.analysis}
          </p>
        </section>

        <section className="fg-card p-6 sm:p-8">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-ink-soft">
            Focus Gold の解答（PDF）
          </h3>
          <p className="mt-2 text-sm text-fg-ink-soft">
            Vol.{problem.vol} の {problem.answerPdfPage} ページ目付近を開きます（書籍 PDF）。
          </p>
          <div className="mt-4 overflow-hidden rounded-lg border border-fg-muted">
            <iframe title="Focus Gold PDF" src={pdfHref} className="h-[520px] w-full bg-white" />
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-sm">
            <a
              className="font-medium text-[#1e4a8a] underline"
              href={pdfHref}
              target="_blank"
              rel="noreferrer"
            >
              新しいタブで開く
            </a>
          </div>
        </section>

        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:justify-between">
          <Link
            href="/"
            onClick={() => {
              clearGradeContext();
              clearSession();
            }}
            className="rounded-lg border border-white/30 px-4 py-3 text-center text-sm font-medium text-white hover:bg-white/10"
          >
            ホームへ戻る
          </Link>
          <button
            type="button"
            onClick={goNext}
            className="rounded-lg bg-[#1e4a8a] px-4 py-3 text-sm font-semibold text-white shadow hover:bg-[#163a72]"
          >
            次の問題へ
          </button>
        </div>
      </div>
    </div>
  );
}
