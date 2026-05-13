import type { Metadata } from "next";
import { Shippori_Mincho, Noto_Sans_JP } from "next/font/google";
import { HomeBackButton } from "@/components/HomeBackButton";
import "./globals.css";

const shippori = Shippori_Mincho({
  variable: "--font-shippori",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const notoSans = Noto_Sans_JP({
  variable: "--font-noto-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Focus Gold 方針暗記",
  description: "数学の本質的方針を暗記・自己採点する個人用サイト",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className={`${shippori.variable} ${notoSans.variable} h-full`}>
      <body className="min-h-full antialiased">
        <HomeBackButton />
        {children}
      </body>
    </html>
  );
}
