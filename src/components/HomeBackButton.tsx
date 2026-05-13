"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * ホーム画面・採点結果画面では非表示（要件）。
 */
export function HomeBackButton() {
  const pathname = usePathname();
  if (pathname === "/" || pathname === "/session/result") {
    return null;
  }
  return (
    <div className="fixed left-4 top-4 z-50">
      <Link href="/" className="icon-btn" aria-label="ホームへ戻る" title="ホームへ戻る">
        <Image
          src="/images/home-nav.png"
          alt=""
          width={22}
          height={22}
          priority
          unoptimized
        />
      </Link>
    </div>
  );
}
