"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  buildRangeQueue,
  buildVolQueue,
  countProblemsInVol,
  shuffleInPlace,
} from "@/lib/curriculum";
import { writeSession } from "@/lib/session-storage";
import type { SessionPayloadV1 } from "@/lib/types";

export default function HomePage() {
  const router = useRouter();
  const [startVol, setStartVol] = useState(1);
  const [startIdx, setStartIdx] = useState(1);
  const [endVol, setEndVol] = useState(1);
  const [endIdx, setEndIdx] = useState(1);
  const [random, setRandom] = useState(false);
  const [rangeError, setRangeError] = useState<string | null>(null);

  const vols = useMemo(() => Array.from({ length: 14 }, (_, i) => i + 1), []);

  function startSession(payload: SessionPayloadV1) {
    if (payload.queue.length === 0) {
      setRangeError("指定範囲に問題がありません。");
      return;
    }
    writeSession(payload);
    setRangeError(null);
    router.push("/session");
  }

  function handleVolClick(vol: number) {
    const queue = buildVolQueue(vol);
    startSession({ version: 1, queue, index: 0, random: false });
  }

  function handleRangeSubmit(e: React.FormEvent) {
    e.preventDefault();
    const queue = buildRangeQueue({
      startVol,
      startIndex: startIdx,
      endVol,
      endIndex: endIdx,
    });
    if (queue.length === 0) {
      setRangeError("範囲が不正か、問題が存在しません。Vol と番号を確認してください。");
      return;
    }
    const q = random ? shuffleInPlace([...queue]) : [...queue];
    startSession({ version: 1, queue: q, index: 0, random });
  }

  return (
    <div className="relative min-h-screen px-4 pb-16 pt-10 text-fg-muted">
      <div className="mx-auto max-w-3xl space-y-10">
        <header className="space-y-2 text-center">
          <p className="text-sm tracking-wide text-fg-muted/90">個人用</p>
          <h1 className="fg-serif text-3xl font-semibold text-white sm:text-4xl">
            Focus Gold 方針暗記
          </h1>
          <p className="text-sm text-fg-muted/85">
            問題の本質的方針を文章化し、採点して記憶を定着させます。
          </p>
        </header>

        <section className="fg-card p-6 sm:p-8">
          <h2 className="fg-serif text-lg font-semibold text-fg-ink">Vol へ直行</h2>
          <p className="mt-1 text-sm text-fg-ink-soft">該当 Vol の全問を順に出題します。</p>
          <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-7">
            {vols.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => handleVolClick(v)}
                className="rounded-lg border border-fg-muted bg-white px-2 py-2 text-sm font-medium text-fg-ink shadow-sm transition hover:border-[#1e4a8a] hover:text-[#0b1f3a]"
              >
                Vol.{v}
              </button>
            ))}
          </div>
        </section>

        <section className="fg-card p-6 sm:p-8">
          <h2 className="fg-serif text-lg font-semibold text-fg-ink">範囲選択</h2>
          <p className="mt-1 text-sm text-fg-ink-soft">
            開始 (Vol, 問番号) から終了 (Vol, 問番号) まで連続で出題します。中間の Vol は全問を含みます。
          </p>
          <form className="mt-6 space-y-4" onSubmit={handleRangeSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-fg-ink">
                開始 Vol
                <select
                  className="fg-input mt-1 block w-full"
                  value={startVol}
                  onChange={(e) => setStartVol(Number(e.target.value))}
                >
                  {vols.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium text-fg-ink">
                開始の問番号
                <input
                  type="number"
                  min={1}
                  max={countProblemsInVol(startVol) || 99}
                  className="fg-input mt-1 block w-full"
                  value={startIdx}
                  onChange={(e) => setStartIdx(Number(e.target.value))}
                />
              </label>
              <label className="block text-sm font-medium text-fg-ink">
                終了 Vol
                <select
                  className="fg-input mt-1 block w-full"
                  value={endVol}
                  onChange={(e) => setEndVol(Number(e.target.value))}
                >
                  {vols.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium text-fg-ink">
                終了の問番号
                <input
                  type="number"
                  min={1}
                  max={countProblemsInVol(endVol) || 99}
                  className="fg-input mt-1 block w-full"
                  value={endIdx}
                  onChange={(e) => setEndIdx(Number(e.target.value))}
                />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm font-medium text-fg-ink">
              <input
                type="checkbox"
                checked={random}
                onChange={(e) => setRandom(e.target.checked)}
                className="h-4 w-4 accent-[#1e4a8a]"
              />
              ランダム出題
            </label>
            {rangeError && (
              <p className="text-sm font-medium text-red-700" role="alert">
                {rangeError}
              </p>
            )}
            <button
              type="submit"
              className="w-full rounded-lg bg-[#1e4a8a] px-4 py-3 text-sm font-semibold text-white shadow hover:bg-[#163a72]"
            >
              この範囲で開始
            </button>
          </form>
        </section>

        <p className="text-center text-xs text-fg-muted/70">
          採点はサーバー経由で Gemini を呼び出します。API キーは Vercel の環境変数{' '}
          <code className="rounded bg-white/10 px-1">GEMINI_API_KEY</code> に設定してください。
        </p>
      </div>
    </div>
  );
}
