"use client";

import { getToken } from "./device";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://tiara-api.vercel.app";

type LoginOk = { status: "ok"; token: string };
type LoginChallenge = { status: "challenge"; tx_id: string; method?: "email" | "sms" };
type LoginDenied = { status: "denied" };
export type LoginRes = LoginOk | LoginChallenge | LoginDenied;

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(init?.headers ?? {}),
  };
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers, cache: "no-store" });
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
