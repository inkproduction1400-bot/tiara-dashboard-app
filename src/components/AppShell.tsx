// src/components/AppShell.tsx
"use client";

import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import React, { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getToken } from "@/lib/device";
import { NotificationsProvider, useNotifications } from "@/contexts/NotificationsContext";

type Props = {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
};

const PATH_TITLE_MAP: Record<string, { title: string; subtitle?: string }> = {
  "/casts": { title: "キャスト管理", subtitle: "登録・編集・検索・各種設定" },
  "/casts/today": { title: "本日出勤キャスト", subtitle: "確認・割当て" },
  "/requests": { title: "リクエスト店舗", subtitle: "当日の依頼を確認・登録" },
  "/assignments": { title: "割当確認", subtitle: "当日割当・差替え" },
  "/schedule": {
    title: "スケジュール",
    subtitle: "キャスト/マッチングスケジュール",
  },
  "/shops": { title: "店舗管理", subtitle: "登録・編集・検索" },
  "/assets": { title: "備品管理", subtitle: "備品/ロッカー" },
  "/chat": { title: "チャット", subtitle: "キャストとの連絡" },
  "/sos": { title: "SOS", subtitle: "緊急連絡" },
  "/approvals": { title: "申請・承認", subtitle: "各種申請の確認" },
  "/settings": { title: "設定", subtitle: "ポータルの各種設定" },
  "/rides": { title: "送迎", subtitle: "車両とスケジュール" },
  "/rides/schedule": { title: "送迎スケジュール", subtitle: "登録・確認" },
};

type ApiSummaryResponse = {
  unreadNotifications: number;
  counts: Record<string, number>;
};

function getApiBase(): string {
  const envBase =
    (process.env.NEXT_PUBLIC_API_URL || "").trim() ||
    "http://localhost:4000/api/v1";
  return envBase.replace(/\/+$/, "");
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const base = getApiBase();
  const token = getToken();

  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `API ${res.status} ${res.statusText}: ${text || "(no body)"}`,
    );
  }

  return (await res.json()) as T;
}

/**
 * NotificationsProvider 配下で Context を更新するブリッジ
 * - 初回に summary を取得
 * - window の "tiara:notification-summary" を受け取って Context に流す
 */
function NotificationBridge() {
  const n = useNotifications() as any;

  useEffect(() => {
    let mounted = true;

    const apply = (detail: ApiSummaryResponse) => {
      // Context 側の実装差に備えて、複数候補で更新
      if (typeof n?.setSummary === "function") n.setSummary(detail);
      if (typeof n?.setCounts === "function") n.setCounts(detail.counts);
      if (typeof n?.setUnreadNotifications === "function")
        n.setUnreadNotifications(detail.unreadNotifications);

      // 最低限: counts を直置きしても Sidebar が拾えるように
      if (typeof n === "object" && n) {
        try {
          n.counts = detail.counts;
        } catch {
          // noop
        }
      }
    };

    // 初回 fetch
    (async () => {
      try {
        const summary = await apiFetch<ApiSummaryResponse>(
          "/me/notifications/summary",
          { method: "GET" },
        );
        if (!mounted) return;
        apply(summary);
      } catch {
        // 未ログイン/サーバ未起動でも AppShell は落とさない
      }
    })();

    // イベント購読
    const onSummary = (ev: Event) => {
      const ce = ev as CustomEvent<ApiSummaryResponse>;
      if (!ce?.detail) return;
      apply(ce.detail);
    };

    window.addEventListener("tiara:notification-summary", onSummary);

    return () => {
      mounted = false;
      window.removeEventListener("tiara:notification-summary", onSummary);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

export default function AppShell({ children, title, subtitle }: Props) {
  const router = useRouter();

  // 簡易ログインガード：トークン無ければ /login へ
  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/login");
    }
  }, [router]);

  const pathname = usePathname() || "/";
  const base = "/" + (pathname.split("/").slice(0, 3).join("/") || "");
  const fallback =
    PATH_TITLE_MAP[base] || PATH_TITLE_MAP[pathname] || { title: "" };

  return (
    <NotificationsProvider>
      <NotificationBridge />

      <main className="h-[100dvh] overflow-hidden">
        <div className="h-full flex">
          {/* 左：サイドバー（幅固定・縮まない） */}
          <aside className="side-nav flex-shrink-0">
            <Sidebar />
          </aside>

          {/* 右：コンテンツ（縦スク有効・横スク抑止） */}
          <div className="flex-1 min-w-0 min-h-0 overflow-auto">
            {/* 中央寄せ・最大幅2XL・レスポンシブ余白 */}
            <div className="mx-auto w-full max-w-screen-2xl px-4 sm:px-6 lg:px-8 py-6">
              <Header
                title={title ?? fallback.title ?? ""}
                subtitle={subtitle ?? fallback.subtitle}
              />
              {children}
            </div>
          </div>
        </div>
      </main>
    </NotificationsProvider>
  );
}
