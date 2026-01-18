// src/lib/api.rides.ts
"use client";

import { apiFetch } from "./api";
import type {
  RideStatus,
  ListRidesParams,
  RideListItem,
  RideListItemFromApi,
  UpdateRidePayload,
} from "./types.rides";

/**
 * 送迎管理一覧取得（Dashboard 用）
 * GET /api/v1/rides
 */
export async function ListRides(
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

  // apiFetch のジェネリクスでレスポンス型を固定
  const json = await apiFetch<RideListItemFromApi[]>(url, { method: "GET" });

  // API の camelCase + ネストされた cast / shop → UI 用 snake_case ＋フラット
  return json.map(
    (r): RideListItem => ({
      id: r.id,
      request_date: r.requestDate,
      status: r.status,
      pickup_city: r.pickupCity ?? null,
      note: r.note ?? null,
      car_number: r.carNumber ?? null,
      driver_id: r.driverId ?? null,
      driver_name: r.driver?.name ?? null,
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
 * 送迎情報の更新（Dashboard 用）
 * PATCH /api/v1/rides/:id
 */
export async function updateRide(
  id: string,
  payload: UpdateRidePayload,
): Promise<void> {
  await apiFetch<void>(`/rides/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}
