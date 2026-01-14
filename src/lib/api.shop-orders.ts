// src/lib/api.shop-orders.ts
"use client";

import { apiFetch } from "./api";

/** x-user-id を付与（localStorage 'tiara:user_id' or 環境変数） */
function withUser(init?: RequestInit): RequestInit {
  const userId =
    (typeof window !== "undefined" && localStorage.getItem("tiara:user_id")) ||
    process.env.NEXT_PUBLIC_DEMO_USER_ID ||
    "";
  return {
    ...init,
    headers: {
      ...(init?.headers || {}),
      ...(userId ? { "x-user-id": userId } : {}),
    },
  };
}

export type ShopOrderStatus = "draft" | "confirmed" | "canceled";
export type CastWorkEventType = "confirmed" | "no_show" | "canceled";

export type ShopOrderRecord = {
  id: string;
  shopId: string;
  date: string;
  orderNo?: number | null;
  headcount?: number | null;
  entryTime?: string | null;
  status?: ShopOrderStatus | null;
  shop?: { id: string; code?: string | null; name?: string | null };
  assignments?: unknown[];
  [key: string]: any;
};

export type ShopOrderAssignment = {
  id?: string;
  castId?: string;
  castCode?: string;
  castName?: string;
  agreedHourly?: number | null;
  note?: string | null;
  status?: CastWorkEventType | null;
  [key: string]: any;
};

export type ShopOrderAssignmentPayload = {
  castId?: string;
  castCode?: string;
  castName?: string;
  agreedHourly?: number | null;
  note?: string | null;
  status?: CastWorkEventType | null;
};

const assertOrderStatus = (value: any): ShopOrderStatus | null => {
  if (value === "draft" || value === "confirmed" || value === "canceled") {
    return value;
  }
  return null;
};

const assertCastWorkEventType = (value: any): CastWorkEventType | null => {
  if (value === "confirmed" || value === "no_show" || value === "canceled") {
    return value;
  }
  return null;
};

export async function listShopOrders(
  date: string,
): Promise<ShopOrderRecord[]> {
  const res = await apiFetch<any>(
    `/shop-orders?date=${encodeURIComponent(date)}`,
    withUser(),
  );
  if (Array.isArray(res)) return res as ShopOrderRecord[];
  if (Array.isArray(res?.items)) {
    const items = res.items as any[];
    if (items.some((item) => Array.isArray(item?.orders))) {
      return items.flatMap((item) =>
        (item.orders ?? []).map((order: any) => ({
          ...order,
          shopId:
            order?.shopId ??
            order?.shop_request?.shopId ??
            item?.shopRequest?.shopId ??
            null,
          shop: order?.shop ?? item?.shopRequest?.shop ?? null,
        })),
      ) as ShopOrderRecord[];
    }
    return items as ShopOrderRecord[];
  }
  if (Array.isArray(res?.data)) {
    const data = res.data as any[];
    if (data.some((item) => Array.isArray(item?.orders))) {
      return data.flatMap((item) =>
        (item.orders ?? []).map((order: any) => ({
          ...order,
          shopId:
            order?.shopId ??
            order?.shop_request?.shopId ??
            item?.shopRequest?.shopId ??
            null,
          shop: order?.shop ?? item?.shopRequest?.shop ?? null,
        })),
      ) as ShopOrderRecord[];
    }
    return data as ShopOrderRecord[];
  }
  return [];
}

export type CreateShopOrderPayload = {
  shopRequestId: string;
  orderNo: number;
  headcount?: number;
  startTime?: string;
  status?: ShopOrderStatus;
  note?: string | null;
};

export async function createShopOrder(
  payload: CreateShopOrderPayload,
): Promise<ShopOrderRecord> {
  return apiFetch<ShopOrderRecord>("/shop-orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function getOrderAssignments(
  orderId: string,
): Promise<ShopOrderAssignment[]> {
  const res = await apiFetch<any>(
    `/shop-orders/${orderId}/assignments`,
    withUser(),
  );
  if (Array.isArray(res)) return res as ShopOrderAssignment[];
  if (Array.isArray(res?.items)) return res.items as ShopOrderAssignment[];
  if (Array.isArray(res?.data)) return res.data as ShopOrderAssignment[];
  return [];
}

export async function replaceOrderAssignments(
  orderId: string,
  assignments: ShopOrderAssignmentPayload[],
): Promise<void> {
  const safe = assignments.map((a) => ({
    ...a,
    status: a.status ? assertCastWorkEventType(a.status) : undefined,
  }));
  await apiFetch<void>(
    `/shop-orders/${orderId}/assignments`,
    withUser({
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(safe),
    }),
  );
}

export async function upsertShopOrder(
  orderId: string,
  payload: Partial<ShopOrderRecord>,
): Promise<ShopOrderRecord> {
  const safeStatus = payload.status ? assertOrderStatus(payload.status) : null;
  if (payload.status && !safeStatus) {
    throw new Error(`invalid shop order status: ${payload.status}`);
  }
  return apiFetch<ShopOrderRecord>(
    `/shop-orders/${orderId}`,
    withUser({
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, status: safeStatus }),
    }),
  );
}
