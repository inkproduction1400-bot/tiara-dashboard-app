// src/lib/api.rides.ts
"use client";

import { apiFetch } from "./api";
import type { RideListItem } from "./types.rides";

/**
 * 送迎ステータス
 * （必要に応じて実際の enum に合わせて追加・変更してください）
 */
export type RideStatus = "pending" | "accepted" | "completed" | "cancelled";

/**
 * /api/v1/rides のクエリパラメータ
 */
export type ListRidesParams = {
  status?: RideStatus;
  pickup_city?: string;
  date?: string; // YYYY-MM-DD
  from?: string; // ISO8601 など
  to?: string;   // ISO8601 など
};

/**
 * PATCH /api/v1/rides/:id のペイロード
 * page.tsx では `updateRide(id, { [field]: value })` として
 * 部分更新で使っているので全部 optional にしておく
 */
export type UpdateRidePayload = {
  car_number?: string | null;
  boarding_time?: string | null;
  arrival_time?: string | null;
  note?: string | null;
  status?: RideStatus;
};

/**
 * 送迎依頼一覧取得（Dashboard 用）
 * GET /api/v1/rides
 */
export async function listRides(
  params: ListRidesParams = {},
): Promise<RideListItem[]> {
  const qs = new URLSearchParams();

  if (params.status) {
    qs.set("status", params.status);
  }
  if (params.pickup_city) {
    qs.set("pickup_city", params.pickup_city);
  }
  if (params.date) {
    qs.set("date", params.date);
  }
  if (params.from) {
    qs.set("from", params.from);
  }
  if (params.to) {
    qs.set("to", params.to);
  }

  const query = qs.toString();
  const path = query ? `/rides?${query}` : "/rides";

  // Authorization ヘッダー付きで叩く
  return apiFetch<RideListItem[]>(path);
}

/**
 * 送迎依頼の更新（PATCH /rides/:id）
 */
export async function updateRide(
  id: string,
  payload: UpdateRidePayload,
): Promise<RideListItem> {
  return apiFetch<RideListItem>(`/rides/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}
