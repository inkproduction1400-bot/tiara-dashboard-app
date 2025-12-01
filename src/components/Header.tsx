// src/components/Header.tsx
"use client";

import ThemeToggle from "@/components/ThemeToggle";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearAuth } from "@/lib/device";
import {
  fetchNotificationSummary,
  type NotificationSummary,
} from "@/lib/api";

type Props = {
  title: string;
  subtitle?: string;
  /** 明示指定があれば優先表示 */
  userName?: string;
};

export default function Header({ title, subtitle, userName }: Props) {
  const router = useRouter();
  const [name, setName] = useState<string>(userName ?? "");
  const [headerUnread, setHeaderUnread] = useState<number>(0);

  // デモ用：ローカル保持名を採用（実サービスでは認証情報から取得）
  useEffect(() => {
    if (userName) return;
    const local =
      localStorage.getItem("tiara_user_name") ||
      localStorage.getItem("tiara_login_id");
    setName(local && local.trim() ? local : "ゲスト");
  }, [userName]);

  // ヘッダー未読数のポーリング（30秒ごと）
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res: NotificationSummary = await fetchNotificationSummary();
        if (!cancelled) {
          setHeaderUnread(res.headerUnreadCount ?? 0);
        }
      } catch (e) {
        // サマリー取得失敗は致命的ではないのでログだけ
        // console.error("[Header] fetchNotificationSummary failed:", e);
      }
    };

    load();
    const timer = setInterval(load, 30_000); // 30秒ごとに更新

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const onLogout = async () => {
    try {
      // 認証情報は lib/device 側で一括クリア
      clearAuth();
    } finally {
      router.push("/login");
    }
  };

  return (
    <header className="mb-3 flex items-center justify-between gap-3">
      {/* 左：ページタイトル */}
      <div className="min-w-0">
        <h1 className="text-xl md:text-2xl font-extrabold truncate">
          {title}
        </h1>
        {subtitle && (
          <p className="text-xs text-muted mt-0.5 truncate">{subtitle}</p>
        )}
      </div>

      {/* 右：テーマ切替 → ユーザー → ログアウト */}
      <div className="flex items-center gap-3">
        {/* テーマ切替（アイコン左隣に配置） */}
        <ThemeToggle />

        {/* ユーザーアイコン + 名前（縦並び）＋ヘッダー未読バッジ */}
        <div className="relative flex flex-col items-center -mt-0.5">
          <div
            className="w-8 h-8 rounded-full border border-white/15 bg-white/10"
            aria-hidden
          />
          {headerUnread > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-[10px] font-semibold text-white flex items-center justify-center shadow-sm">
              {headerUnread > 99 ? "99+" : headerUnread}
            </span>
          )}
          <div className="mt-1 max-w-[9rem] text-[10px] leading-none text-ink/85 text-center truncate">
            {name || "ゲスト"}
          </div>
        </div>

        <button className="tiara-btn px-3 py-2 text-xs" onClick={onLogout}>
          ログアウト
        </button>
      </div>
    </header>
  );
}
