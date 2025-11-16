// src/lib/api.shops.ts
"use client";

import { apiFetch } from "./api";

/** x-user-id を付与（localStorage 'tiara:user_id' or 環境変数） */
function withUser(init?: RequestInit): RequestInit {
  const userId =
    (typeof window !== "undefined" && localStorage.getItem("tiara:user_id")) ||
    process.env.NEXT_PUBLIC_DEMO_USER_ID ||
    ""; // 必要なら固定の検証ユーザーIDを環境変数で
  return {
    ...init,
    headers: {
      ...(init?.headers || {}),
      ...(userId ? { "x-user-id": userId } : {}),
    },
  };
}

export type ShopListItem = {
  id: string;
  name: string;

  // ← ここを追加（API から返ってきているので型として受けておく）
  nameKana?: string | null;
  kana?: string | null;

  shopNumber?: string | null;
  phone?: string | null;
  genre?: string | null; // API は string/null 想定にしておく
  prefecture?: string | null;
  city?: string | null;
  addressLine?: string | null;
  createdAt: string;

  // コントローラの select に含めていないケースもあるので optional に変更
  updatedAt?: string;
};

export type ShopListResponse = {
  items: ShopListItem[];
  total: number;
};

/**
 * 店舗一覧取得
 * API 実体は `ShopListItem[]` を返すので、ここで `{ items, total }` にラップする
 */
export async function listShops(
  params: { q?: string; limit?: number; offset?: number } = {},
): Promise<ShopListResponse> {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.limit != null) qs.set("take", String(params.limit));
  if ((params as any).offset != null) {
    qs.set("offset", String((params as any).offset));
  }

  const path = `/shops${qs.toString() ? `?${qs.toString()}` : ""}`;

  // ← API は配列を返す想定
  const raw = await apiFetch<ShopListItem[]>(path, withUser());
  const items = Array.isArray(raw) ? raw : [];

  return {
    items,
    total: items.length,
  };
}

export async function getShop(id: string) {
  return apiFetch<any>(`/shops/${id}`, withUser());
}

export async function updateShop(
  id: string,
  payload: Partial<{ name: string; phone: string; genre: string }>,
) {
  return apiFetch<any>(
    `/shops/${id}`,
    withUser({
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }),
  );
}

export async function importShopsExcel(file: File) {
  // apiFetch は JSON 前提なのでここは fetch を直接使う
  const RAW_BASE = (
    process.env.NEXT_PUBLIC_API_URL ??
    "https://tiara-api.vercel.app/api/v1"
  ).replace(/\/+$/, "");

  const form = new FormData();
  form.append("file", file);

  const headers: HeadersInit = {};
  const uid =
    (typeof window !== "undefined" && localStorage.getItem("tiara:user_id")) ||
    process.env.NEXT_PUBLIC_DEMO_USER_ID ||
    "";
  if (uid) (headers as any)["x-user-id"] = uid;

  const res = await fetch(`${RAW_BASE}/shops/import-excel`, {
    method: "POST",
    body: form,
    headers,
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Import failed (${res.status}): ${t}`);
  }

  return res.json() as Promise<{
    total: number;
    created: number;
    updated: number;
    skipped: number;
  }>;
}
