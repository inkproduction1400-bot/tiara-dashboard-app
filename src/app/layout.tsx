import "../styles/globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ティアラ管理システム | Login",
  description: "TIARA Monitoring System — Welcome",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-dvh text-ink bg-slate-950 antialiased">
        <div className="tiara-bg" aria-hidden />
        {children}
        <div className="fixed bottom-2 right-3 text-xs text-muted">© TIARA</div>
      </body>
    </html>
  );
}
