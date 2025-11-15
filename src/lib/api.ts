"use client";

import { getToken } from "./device";

// NEXT_PUBLIC_API_URL が未設定なら /api/v1 まで入ったデフォルトを使う
const RAW_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "https://tiara-api.vercel.app/api/v1";

// 末尾スラッシュを除去しておく（結合時に二重 / を避ける）
export const API_BASE = RAW_BASE.replace(/\/+$/, "");

export type LoginOk = { status: "ok"; token: string };
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
  const token = getToken();
  // 認証系エンドポイントかどうか
  const isAuthPath = path.startsWith('/auth/');

  // 基本ヘッダ
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(init?.headers ?? {}),
    // /auth/* のときは Authorization を付けない
    ...(!isAuthPath && token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const url = `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  const res = await fetch(url, { ...init, headers, cache: 'no-store' });

  if (!res.ok) {
    throw new Error(`API ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<T>;
}

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
