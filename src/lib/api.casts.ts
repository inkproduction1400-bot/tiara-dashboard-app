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
  legacyStaffId?: number | null; // 旧システムのスタッフID
  birthdate?: string | null;
  age?: number | null;
};

export type CastListResponse = {
  items: CastListItem[];
  total: number;
};

/**
 * キャスト一覧（ピッカー用）クエリ
 * - 店舗NG/専属モーダルなどで利用することを想定
 * - API 側では /casts?for=picker&... のような形で拡張する前提
 */
export type CastPickerQuery = {
  q?: string; // 名前・番号などの曖昧検索
  minAge?: number;
  maxAge?: number;
  limit?: number;
  offset?: number;
};

/**
 * キャスト一覧取得（ピッカー用）
 * - /casts?for=picker を叩き、{ items, total } 形式 or 配列を吸収して返す
 * - レスポンスの 1件は既存の CastListItem をそのまま利用
 */
export async function listCastsForPicker(
  params: CastPickerQuery = {},
): Promise<CastListResponse> {
  const { q, minAge, maxAge, limit, offset } = params;

  const searchParams = new URLSearchParams();
  if (q) searchParams.set("q", q);
  if (minAge != null) searchParams.set("minAge", String(minAge));
  if (maxAge != null) searchParams.set("maxAge", String(maxAge));
  if (limit != null) searchParams.set("limit", String(limit));
  if (offset != null) searchParams.set("offset", String(offset));

  const qs = searchParams.toString();
  const path = `/casts?for=picker${qs ? `&${qs}` : ""}`;

  const raw = await apiFetch<any>(path, withUser());

  if (Array.isArray(raw)) {
    return { items: raw as CastListItem[], total: raw.length };
  }

  const items = Array.isArray(raw?.items) ? (raw.items as CastListItem[]) : [];
  const total =
    typeof raw?.total === "number" ? (raw.total as number) : items.length;

  return { items, total };
}

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
  legacyStaffId?: number | null; // 旧システムのスタッフID
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
  attributes?:
    | {
        heightCm?: number | null;
        clothingSize?: string | null;
        shoeSizeCm?: number | null;
        tattoo?: boolean | null;
        needPickup?: boolean | null;
      }
    | null;
  preferences?:
    | {
        desiredHourly?: number | null;
        desiredMonthly?: number | null;
        preferredDays?: string[]; // API 側で join(',')
        preferredTimeFrom?: string | null;
        preferredTimeTo?: string | null;
        preferredArea?: string | null;
        ngShopNotes?: string | null;
        notes?: string | null;
      }
    | null;
  background?:
    | {
        howFound?: string | null;
        motivation?: string | null;
        otherAgencies?: string | null;
        reasonChoose?: string | null;
        shopSelectionPoints?: string | null;
      }
    | null;
};

/** ===== 今日出勤キャスト (/casts/today) 用の型 ===== */

/** /casts/today の 1 レコード */
export type TodayCastApiItem = {
  castId: string;
  managementNumber: string | null;
  displayName: string;
  age: number | null;
  desiredHourly: number | null;
  drinkOk: boolean | null;
};

/** /casts/today のレスポンス全体 */
export type TodayCastsApiResponse = {
  date: string;
  items: TodayCastApiItem[];
};

/**
 * Cast 一覧取得
 * - API 仕様上、クエリで使えるのは q / take / drinkOk / hasExperience のみ
 * - offset を付けると 400 になるため、1 回だけ /casts?take=N で取得する
 * - バック側の上限と揃えて take の最大値は 10,000
 */
export async function listCasts(
  params: {
    q?: string;
    limit?: number; // 取得件数（take にマップ）
    drinkOk?: boolean;
    hasExperience?: boolean;
  } = {},
): Promise<CastListResponse> {
  const { q, limit, drinkOk, hasExperience } = params;

  // API 側の上限が 10,000 なので、それを越えないように丸める
  const MAX_TAKE = 10_000;
  const DEFAULT_TAKE = 10_000;
  const take = Math.min(limit ?? DEFAULT_TAKE, MAX_TAKE);

  const qs = new URLSearchParams();
  if (q) qs.set("q", q);
  if (take) qs.set("take", String(take));
  if (typeof drinkOk === "boolean") {
    qs.set("drinkOk", String(drinkOk));
  }
  if (typeof hasExperience === "boolean") {
    qs.set("hasExperience", String(hasExperience));
  }

  const path = `/casts${qs.toString() ? `?${qs.toString()}` : ""}`;

  // API は { items, total } or 配列 どちらもあり得る
  const raw = await apiFetch<any>(path, withUser());

  if (Array.isArray(raw)) {
    return { items: raw, total: raw.length };
  }

  const items = Array.isArray(raw?.items) ? raw.items : [];
  const total =
    typeof raw?.total === "number" ? raw.total : items.length;

  return { items, total };
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

/**
 * 今日出勤キャスト一覧取得 (/casts/today)
 * - 認証・x-user-id 付与は他 API と同じく withUser 経由
 */
export async function listTodayCasts(): Promise<TodayCastsApiResponse> {
  return apiFetch<TodayCastsApiResponse>("/casts/today", withUser());
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

/** Cast 削除 */
export async function deleteCast(id: string): Promise<void> {
  await apiFetch<void>(
    `/casts/${id}`,
    withUser({
      method: "DELETE",
    }),
  );
}
