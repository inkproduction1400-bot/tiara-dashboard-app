// src/components/AppShell.tsx
"use client";

import Sidebar from "@/components/Sidebar";
import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getToken } from "@/lib/device";
import { API_BASE } from "@/lib/api";
import { NotificationsProvider, useNotifications } from "@/contexts/NotificationsContext";

type Props = {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
};

type ApiSummaryResponse = {
  unreadNotifications: number;
  counts: Record<string, number>;
};

function getApiBase(): string {
  return API_BASE;
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

export default function AppShell({ children }: Props) {
  const router = useRouter();

  // 簡易ログインガード：トークン無ければ /login へ
  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/login");
    }
  }, [router]);

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
            <div className="mx-auto w-full max-w-none px-4 sm:px-6 lg:px-8 py-6">
              {children}
            </div>
          </div>
        </div>
      </main>
    </NotificationsProvider>
  );
}
