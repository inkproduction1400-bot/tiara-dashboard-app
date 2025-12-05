// src/lib/api.rides.ts
"use client";

import { apiFetch } from "./api";
import type {
  RideListItem,
  RideStatus,
  ListRidesParams,
  UpdateRidePayload,
} from "./types.rides";

/**
 * 送迎依頼一覧取得（Dashboard 用）
 * GET /api/v1/rides
 */
export async function listRides(
  params: ListRidesParams = {},
): Promise<RideListItem[]> {
  const qs = new URLSearchParams();

  if (params.status) {
    qs.set("status", params.status as RideStatus);
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
  const url = query ? `/rides?${query}` : "/rides";

  // apiFetch は unknown を返すので Response として扱う
  const res = (await apiFetch(url, { method: "GET" })) as Response;

  if (!res.ok) {
    throw new Error(`Failed to fetch rides: ${res.status}`);
  }

  // ★ 実際の API は camelCase + ネストされた cast / shop
  const json = (await res.json()) as any[];

  // ★ UI 用に snake_case + フラット構造へ変換
  return json.map(
    (r): RideListItem => ({
      id: r.id,
      request_date: r.requestDate,
      status: r.status,
      pickup_city: r.pickupCity ?? null,
      note: r.note ?? null,
      car_number: r.carNumber ?? null,
      boarding_time: r.boardingTime ?? null,
      arrival_time: r.arrivalTime ?? null,
      created_at: r.createdAt,

      cast_name: r.cast?.displayName ?? null,
      cast_management_number: r.cast?.managementNumber ?? null,
      shop_name: r.shop?.name ?? null,
    }),
  );
}

/**
 * 送迎依頼の更新（Dashboard 用）
 * PATCH /api/v1/rides/:id
 */
export async function updateRide(
  id: string,
  payload: UpdateRidePayload,
): Promise<void> {
  const res = (await apiFetch(`/rides/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })) as Response;

  if (!res.ok) {
    throw new Error(`Failed to update ride: ${res.status}`);
  }
}
