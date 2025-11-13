"use client";

import { getToken } from "./device";

// NEXT_PUBLIC_API_URL が未設定なら /api/v1 まで入ったデフォルトを使う
const RAW_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "https://tiara-api.vercel.app/api/v1";

// 末尾スラッシュを除去しておく（結合時に二重 / を避ける）
const API_BASE = RAW_BASE.replace(/\/+$/, "");

export type LoginOk = { status: "ok"; token: string };
export type LoginChallenge = {
  status: "challenge";
  tx_id: string;
  method?: "email" | "sms";
};
export type LoginDenied = { status: "denied" };
export type LoginRes = LoginOk | LoginChallenge | LoginDenied;

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(init?.headers ?? {}),
  };
  const url = `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, { ...init, headers, cache: "no-store" });
  if (!res.ok) throw new Error(`API ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export async function login(email: string, password: string, device_id: string) {
  return apiFetch<LoginRes>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password, device_id }),
  });
}

export async function verifyChallenge(tx_id: string, code: string, device_id: string) {
  return apiFetch<LoginOk>("/auth/challenge/verify", {
    method: "POST",
    body: JSON.stringify({ tx_id, code, device_id }),
  });
}
