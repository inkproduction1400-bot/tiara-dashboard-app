// src/contexts/NotificationsContext.tsx
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  fetchNotificationSummary,
  markTalkRead,
  type NotificationSummary,
} from "@/lib/api";

type NotificationsContextValue = {
  summary: NotificationSummary | null;
  headerUnread: number;
  talkUnread: number;
  loading: boolean;
  refresh: () => Promise<void>;
  markTalkReadAndSync: () => Promise<void>;
};

const NotificationsContext = createContext<NotificationsContextValue | undefined>(
  undefined,
);

type Props = {
  children: ReactNode;
};

export function NotificationsProvider({ children }: Props) {
  const [summary, setSummary] = useState<NotificationSummary | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchNotificationSummary();
      setSummary(res);
    } catch (e) {
      // サマリー取得失敗は致命的ではないので握りつぶす
      // console.error("[Notifications] fetchNotificationSummary failed", e);
    } finally {
      setLoading(false);
    }
  }, []);

  const markTalkReadAndSync = useCallback(async () => {
    try {
      const res = await markTalkRead();
      setSummary(res);
    } catch (e) {
      // 既読更新失敗時もアプリ全体は動かしたいので握りつぶす
      // console.error("[Notifications] markTalkRead failed", e);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (cancelled) return;
      await refresh();
    };

    load();
    const timer = setInterval(load, 30_000); // 30秒ごとポーリング

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [refresh]);

  const headerUnread = summary?.headerUnreadCount ?? 0;
  const summaryCounts = (summary as any)?.counts;
  const talkUnread =
    (typeof summaryCounts?.staffTalk === "number"
      ? summaryCounts.staffTalk
      : null) ?? summary?.talkUnreadCount ?? 0;

  return (
    <NotificationsContext.Provider
      value={{
        summary,
        headerUnread,
        talkUnread,
        loading,
        refresh,
        markTalkReadAndSync,
      }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error(
      "useNotifications must be used within <NotificationsProvider>",
    );
  }
  return ctx;
}
