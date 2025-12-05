// src/lib/api.rides.ts
"use client";

import { apiFetch } from "./api";
import type {
  RideListItem,
  RideStatus,
  ListRidesParams,
  RideListItemFromApi,
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

  // apiFetch は Promise<unknown> なので Response にキャスト
  const res = (await apiFetch(url, { method: "GET" })) as Response;

  if (!res.ok) {
    throw new Error(`Failed to fetch rides: ${res.status}`);
  }

  const json = (await res.json()) as RideListItemFromApi[];

  // API 側は snake_case、そのまま UI 用の型に詰め替える
  return json.map(
    (r: RideListItemFromApi): RideListItem => ({
      id: r.id,
      request_date: r.request_date,
      status: r.status,
      pickup_city: r.pickup_city,
      note: r.note,
      car_number: r.car_number,
      boarding_time: r.boarding_time,
      arrival_time: r.arrival_time,
      created_at: r.created_at,
      cast_name: r.cast_name,
      cast_management_number: r.cast_management_number,
      shop_name: r.shop_name,
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
