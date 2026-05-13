"use client";

import dynamic from "next/dynamic";

const ResultPageClient = dynamic(() => import("./ResultPageClient"), { ssr: false });

export default function SessionResultPage() {
  return <ResultPageClient />;
}
