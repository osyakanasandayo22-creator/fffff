"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { clearSession } from "@/lib/session-storage";

export default function SessionDonePage() {
  const router = useRouter();

  useEffect(() => {
    const raw =
      typeof window !== "undefined" ? sessionStorage.getItem("fg_session_v1") : null;
    if (!raw) {
      router.replace("/");
    }
  }, [router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-16 text-center text-fg-muted">
      <p className="fg-serif text-2xl font-semibold text-white">範囲終了</p>
      <p className="mt-3 max-w-md text-sm text-fg-muted/90">
        選択した範囲の問題はすべて完了しました。お疲れさまでした。
      </p>
      <Link
        href="/"
        onClick={() => clearSession()}
        className="mt-10 inline-flex items-center justify-center rounded-lg bg-white px-6 py-3 text-sm font-semibold text-fg-ink shadow hover:bg-fg-muted"
      >
        ホームへ戻る
      </Link>
    </div>
  );
}
