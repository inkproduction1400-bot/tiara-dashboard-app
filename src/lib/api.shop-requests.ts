// src/lib/api.shop-requests.ts
"use client";

import { apiFetch } from "./api";

/**
 * 店舗リクエスト（当日スケジュール）API クライアント
 *
 * バックエンド側のエンドポイント:
 *   - GET    /shop-requests?date=YYYY-MM-DD&take=&offset=
 *   - POST   /shop-requests
 *   - PATCH  /shop-requests/:id
 *   - DELETE /shop-requests/:id
 */

/** API から返ってくる shop 部分 */
export type ShopSummary = {
  id: string;
  shopNumber: string | null;
  name: string;
};

/** API の 1 レコードそのもの */
export type ShopRequestRecord = {
  id: string;
  shopId: string;
  requestDate: string; // ISO (DATE カラムだが ISO 文字列で返ってくる)
  requestedHeadcount: number;
  minHourly: number | null;
  maxHourly: number | null;
  minAge: number | null;
  maxAge: number | null;
  requireDrinkOk: boolean;
  contactStatus?: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  shop?: ShopSummary;
};

export type ShopRequestListResponse = {
  total: number;
  items: ShopRequestRecord[];
};

export type ListShopRequestsParams = {
  date?: string; // YYYY-MM-DD （指定しない場合は API 側で「今日」扱い）
  take?: number;
  offset?: number;
  shopId?: string;
};

/**
 * 指定日の店舗リクエスト一覧を取得
 */
export async function listShopRequests(
  params: ListShopRequestsParams = {},
): Promise<ShopRequestListResponse> {
  const qs = new URLSearchParams();

  if (params.date) qs.set("date", params.date);
  if (typeof params.take === "number") qs.set("take", String(params.take));
  if (typeof params.offset === "number")
    qs.set("offset", String(params.offset));
  if (params.shopId) qs.set("shopId", params.shopId);

  const path = `/shop-requests${
    qs.toString() ? `?${qs.toString()}` : ""
  }`;

  // バックエンド実装に合わせて { total, items } 形で受ける
  return apiFetch<ShopRequestListResponse>(path);
}

/**
 * 店舗リクエストの新規作成
 */
export type CreateShopRequestPayload = {
  shopId: string;
  requestDate: string; // YYYY-MM-DD
  requestedHeadcount: number;
  minHourly?: number;
  maxHourly?: number;
  minAge?: number;
  maxAge?: number;
  requireDrinkOk?: boolean;
  contactStatus?: string | null;
  note?: string | null;
};

export async function createShopRequest(
  payload: CreateShopRequestPayload,
): Promise<ShopRequestRecord> {
  return apiFetch<ShopRequestRecord>("/shop-requests", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

/**
 * 店舗リクエストの更新
 */
export type UpdateShopRequestPayload = Partial<CreateShopRequestPayload>;

export async function updateShopRequest(
  id: string,
  payload: UpdateShopRequestPayload,
): Promise<ShopRequestRecord> {
  return apiFetch<ShopRequestRecord>(`/shop-requests/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

/**
 * 店舗リクエストの削除
 */
export async function deleteShopRequest(id: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/shop-requests/${id}`, {
    method: "DELETE",
  });
}
