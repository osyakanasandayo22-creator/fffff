"use client";

import dynamic from "next/dynamic";

const SessionPageClient = dynamic(() => import("./SessionPageClient"), { ssr: false });

export default function SessionPage() {
  return <SessionPageClient />;
}
