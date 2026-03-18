// src/app/layout.tsx
import "../styles/globals.css";
import type { Metadata } from "next";
import { PwaBootstrap } from "@/components/PwaBootstrap";

export const metadata: Metadata = {
  title: "ティアラ管理システム | Login",
  description: "TIARA Monitoring System — Welcome",
  manifest: "/manifest.json",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0b8ef3" />
      </head>
      <body className="min-h-dvh w-full max-w-full overflow-x-hidden text-ink antialiased">
        {/* 背景グラデーション（ライトテーマ固定） */}
        <div className="tiara-bg" aria-hidden />

        <PwaBootstrap />

        {/* コンテンツ */}
        <div className="min-h-dvh w-full max-w-full overflow-x-hidden">{children}</div>

        {/* フッターマーク */}
        <div className="fixed bottom-2 right-3 text-xs text-muted">© TIARA</div>
      </body>
    </html>
  );
}
