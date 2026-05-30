// src/lib/api.ts
"use client";

import { getToken } from "./device";

// NEXT_PUBLIC_API_URL が未設定/空なら /api/v1 まで入ったデフォルトを使う
const RAW_BASE =
  process.env.NEXT_PUBLIC_API_URL?.trim() ||
  "https://api.tiara-system.com/api/v1";

// 末尾スラッシュを除去しておく（結合時に二重 / を避ける）
export const API_BASE = RAW_BASE.replace(/\/+$/, "");

export type DashboardUser = {
  id: string;
  userType: string;
  email: string | null;
  loginId: string | null;
  staffName: string | null;
};

export type LoginOk = { status: "ok"; token: string; user?: DashboardUser };
export type LoginChallenge = {
  status: "challenge";
  tx_id: string;
  method?: "email" | "sms";
};
export type LoginDenied = { status: "denied" };
export type LoginRes = LoginOk | LoginChallenge | LoginDenied;

// 固定 DEMO ユーザー（.env.local）
// NEXT_PUBLIC_USER_ID を優先し、なければ NEXT_PUBLIC_DEMO_USER_ID を使う
const ENV_USER_ID =
  process.env.NEXT_PUBLIC_USER_ID ?? process.env.NEXT_PUBLIC_DEMO_USER_ID ?? "";

/**
 * リクエストに載せる x-user-id を解決する
 * 1. .env.local の固定ユーザー（ENV_USER_ID）があればそれを最優先
 * 2. 将来ログイン実装されたとき用に localStorage("tiara:user_id") も見る
 */
function resolveUserId(): string | undefined {
  if (ENV_USER_ID && ENV_USER_ID.trim() !== "") {
    return ENV_USER_ID.trim();
  }

  if (typeof window !== "undefined") {
    const stored = window.localStorage.getItem("tiara:user_id");
    if (stored && stored.trim() !== "") {
      return stored.trim();
    }
  }

  return undefined;
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const rawToken = getToken();
  const token =
    rawToken && rawToken !== "null" && rawToken !== "undefined"
      ? rawToken
      : null;
  // 認証系エンドポイントかどうか
  const isAuthPath = path.startsWith("/auth/");

  // 基本ヘッダ
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(init?.headers ?? {}),
    // /auth/* のときは Authorization を付けない
    ...(!isAuthPath && token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const url = `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  const origin =
    typeof window !== "undefined" ? window.location.origin : "server";
  if (path.includes("/shop-orders")) {
    const query = url.includes("?") ? url.split("?")[1] : "";
    console.warn("[apiFetch]", { base: API_BASE, path, url, query });
  }
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers, cache: "no-store" });
  } catch (err) {
    console.warn("[api] fetch failed", {
      baseUrl: API_BASE,
      fullUrl: url,
      origin,
      method: init?.method ?? "GET",
      name: err instanceof Error ? err.name : "UnknownError",
      message: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  if (!res.ok) {
    throw new Error(`API ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<T>;
}

// ========= 汎用ヘルパー =========

export async function apiGet<T>(path: string): Promise<T> {
  return apiFetch<T>(path, { method: "GET" });
}

export async function apiPost<T>(
  path: string,
  body?: unknown
): Promise<T> {
  return apiFetch<T>(path, {
    method: "POST",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// ========= 認証系 =========

export async function login(
  email: string,
  password: string,
  device_id: string
) {
  return apiFetch<LoginRes>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password, device_id }),
  });
}

export async function getCurrentUser() {
  return apiGet<DashboardUser>("/auth/me");
}

export const CHAT_NOTIFICATION_TARGET_KEY = "tiara:chat_notification_target";
export const CHAT_NOTIFICATION_TARGET_CHANGED_EVENT =
  "tiara:chat-notification-target-changed";

export function resolveChatNotificationOwnerStaffName(): string | null {
  if (typeof window === "undefined") return null;

  const savedTarget =
    window.localStorage.getItem(CHAT_NOTIFICATION_TARGET_KEY)?.trim() ?? "";
  const userType =
    window.localStorage.getItem("tiara:user_type")?.trim().toLowerCase() ?? "";
  const staffName =
    window.localStorage.getItem("tiara:staff_name")?.trim() ?? "";
  const target = savedTarget || (userType === "admin" ? "all" : "mine");

  if (target === "all") return "all";
  if (target === "mine") return staffName || null;
  return target;
}

export function buildNotificationSummaryPath(): string {
  const ownerStaffName = resolveChatNotificationOwnerStaffName();
  if (!ownerStaffName) return "/me/notifications/summary";

  const qs = new URLSearchParams({ ownerStaffName });
  return `/me/notifications/summary?${qs.toString()}`;
}

export async function verifyChallenge(
  tx_id: string,
  code: string,
  device_id: string
) {
  return apiFetch<LoginOk>("/auth/challenge/verify", {
    method: "POST",
    body: JSON.stringify({ tx_id, code, device_id }),
  });
}

// ========= 通知サマリー（headerUnreadCount / talkUnreadCount） =========

export type NotificationSummary = {
  headerUnreadCount: number;
  talkUnreadCount: number;
};

/**
 * ヘッダー／トーク用の未読サマリーを取得
 * GET /me/notifications/summary
 */
export function fetchNotificationSummary(): Promise<NotificationSummary> {
  return apiGet<NotificationSummary>(buildNotificationSummaryPath());
}

/**
 * トーク画面側から既読更新
 * POST /me/notifications/mark-talk-read
 */
export function markTalkRead(): Promise<NotificationSummary> {
  return apiPost<NotificationSummary>("/me/notifications/mark-talk-read", {});
}
