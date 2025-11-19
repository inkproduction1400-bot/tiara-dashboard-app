// src/lib/api.casts.ts
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

/** Cast 一覧（/casts GET の select に対応） */
export type CastListItem = {
  userId: string;
  displayName: string;
  phone?: string | null;
  email?: string | null;
  drinkOk?: boolean | null;
  hasExperience?: boolean | null;
  createdAt: string;
  managementNumber?: string | null;
  legacyStaffId?: number | null; // 追加
};

export type CastListResponse = {
  items: CastListItem[];
  total: number;
};

/** NG 店舗（GET /casts/:id の ngShops 要素） */
export type CastNgShop = {
  shopId: string;
  shopName: string | null;
  shopNumber: string | null;
  source: string | null;
  reason: string | null;
  createdAt: string;
  prefecture: string | null;
  city: string | null;
};

/** シフトに紐づく店舗情報 */
export type CastShiftShop = {
  id: string;
  name: string;
  shopNumber: string | null;
  prefecture: string | null;
  city: string | null;
};

/** 直近シフト */
export type CastLatestShift = {
  id: string;
  date: string; // YYYY-MM-DD
  startAt: string;
  endAt: string | null;
  status: string | null;
  wagePerHour: number | null;
  rateToShop: number | null;
  shop: CastShiftShop | null;
};

/** CastAttributes */
export type CastAttributes = {
  heightCm: number | null;
  clothingSize: string | null;
  shoeSizeCm: number | null;
  tattoo: boolean | null;
  needPickup: boolean | null;
  drinkLevel: string | null;
};

/** CastPreferences */
export type CastPreferences = {
  desiredHourly: number | null;
  desiredMonthly: number | null;
  preferredDays: string[];
  preferredTimeFrom: string | null;
  preferredTimeTo: string | null;
  preferredArea: string | null;
  feeCategory: string | null;
  ngShopNotes: string | null;
  notes: string | null;
};

/** CastBackground */
export type CastBackground = {
  howFound: string | null;
  motivation: string | null;
  otherAgencies: string | null;
  reasonChoose: string | null;
  shopSelectionPoints: string | null;
};

/** GET /casts/:id のレスポンス形（モーダル用） */
export type CastDetail = {
  userId: string;
  displayName: string;
  managementNumber: string | null;
  birthdate: string | null;
  age: number | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  drinkOk: boolean | null;
  hasExperience: boolean | null;
  note: string | null;
  profilePhotoUrl: string | null;
  attributes: CastAttributes | null;
  preferences: CastPreferences | null;
  background: CastBackground | null;
  ngShops: CastNgShop[];
  latestShifts: CastLatestShift[];
  legacyStaffId?: number | null; // 追加
};

/** PATCH /casts/:id 用の簡易ペイロード */
export type CastUpdatePayload = {
  displayName?: string | null;
  birthdate?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  note?: string | null;
  drinkOk?: boolean | null;
  hasExperience?: boolean | null;
  managementNumber?: string | null;
  attributes?: {
    heightCm?: number | null;
    clothingSize?: string | null;
    shoeSizeCm?: number | null;
    tattoo?: boolean | null;
    needPickup?: boolean | null;
  } | null;
  preferences?: {
    desiredHourly?: number | null;
    desiredMonthly?: number | null;
    preferredDays?: string[]; // API 側で join(',')
    preferredTimeFrom?: string | null;
    preferredTimeTo?: string | null;
    preferredArea?: string | null;
    ngShopNotes?: string | null;
    notes?: string | null;
  } | null;
  background?: {
    howFound?: string | null;
    motivation?: string | null;
    otherAgencies?: string | null;
    reasonChoose?: string | null;
    shopSelectionPoints?: string | null;
  } | null;
};

/**
 * Cast 一覧取得
 */
export async function listCasts(params: {
  q?: string;
  limit?: number;
  offset?: number;
  drinkOk?: boolean;
  hasExperience?: boolean;
} = {}): Promise<CastListResponse> {
  const qs = new URLSearchParams();

  const { q, limit, offset, drinkOk, hasExperience } = params;

  if (q) qs.set("q", q);

  // ★ API 側の上限（仮に 1000）を超えないようにする
  const MAX_TAKE = 1000;
  const effectiveLimit =
    limit != null ? Math.min(limit, MAX_TAKE) : MAX_TAKE;
  qs.set("take", String(effectiveLimit));

  if (offset != null) {
    qs.set("offset", String(offset));
  }
  if (typeof drinkOk === "boolean") {
    qs.set("drinkOk", String(drinkOk));
  }
  if (typeof hasExperience === "boolean") {
    qs.set("hasExperience", String(hasExperience));
  }

  const path = `/casts${qs.toString() ? `?${qs.toString()}` : ""}`;
  const raw = await apiFetch<CastListItem[]>(path, withUser());

  const items = Array.isArray(raw) ? raw : [];
  return {
    items,
    total: items.length,
  };
}

/** Cast 詳細取得（モーダル用） */
export async function getCast(id: string): Promise<CastDetail> {
  return apiFetch<CastDetail>(`/casts/${id}`, withUser());
}

/** Cast 一括更新（本体＋attributes/preferences/background） */
export function updateCast(
  id: string,
  payload: CastUpdatePayload,
): Promise<CastDetail> {
  return apiFetch<CastDetail>(
    `/casts/${id}`,
    withUser({
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }),
  );
}

/** NG 店舗 upsert */
export async function upsertCastNg(input: {
  castId: string;
  shopId: string;
  source?: string;
  reason?: string;
}): Promise<{ ngs: CastNgShop[] } | any> {
  const { castId, ...body } = input;
  return apiFetch<any>(
    `/casts/${castId}/ngs`,
    withUser({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }),
  );
}

/** NG 店舗削除 */
export async function deleteCastNg(input: {
  castId: string;
  shopId: string;
}): Promise<{ ngs: CastNgShop[] } | any> {
  const { castId, shopId } = input;
  return apiFetch<any>(
    `/casts/${castId}/ngs/${shopId}`,
    withUser({
      method: "DELETE",
    }),
  );
}
