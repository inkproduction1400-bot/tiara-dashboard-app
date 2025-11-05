"use client";

import ThemeToggle from "@/components/ThemeToggle";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  title: string;
  subtitle?: string;
  /** 明示指定があれば優先表示 */
  userName?: string;
};

export default function Header({ title, subtitle, userName }: Props) {
  const router = useRouter();
  const [name, setName] = useState<string>(userName ?? "");

  // デモ用：ローカル保持名を採用（実サービスでは認証情報から取得）
  useEffect(() => {
    if (userName) return;
    const local =
      localStorage.getItem("tiara_user_name") ||
      localStorage.getItem("tiara_login_id");
    setName(local && local.trim() ? local : "ゲスト");
  }, [userName]);

  const onLogout = async () => {
    try {
      // TODO: 認証導線を組み込んだらAPIに変更
      localStorage.removeItem("tiara_token");
      localStorage.removeItem("tiara_user_name");
      localStorage.removeItem("tiara_login_id");
    } finally {
      router.push("/login");
    }
  };

  return (
    <header className="mb-3 flex items-center justify-between gap-3">
      {/* 左：ページタイトル */}
      <div className="min-w-0">
        <h1 className="text-xl md:text-2xl font-extrabold truncate">{title}</h1>
        {subtitle && (
          <p className="text-xs text-muted mt-0.5 truncate">{subtitle}</p>
        )}
      </div>

      {/* 右：テーマ切替 → ユーザー → ログアウト */}
      <div className="flex items-center gap-3">
        {/* テーマ切替（アイコン左隣に配置） */}
        <ThemeToggle />

        {/* ユーザーアイコン + 名前（縦並び） */}
        <div className="flex flex-col items-center -mt-0.5">
          <div
            className="w-8 h-8 rounded-full border border-white/15 bg-white/10"
            aria-label="ログインユーザー"
            title={name || "ログインユーザー"}
          />
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
