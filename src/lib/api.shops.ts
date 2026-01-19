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

// ==== Shops 型定義（API/DB/DTO と揃える）====

export type ShopGenre = "club" | "cabaret" | "snack" | "gb";
export type ShopRank = "S" | "A" | "B" | "C";
export type ShopDrinkPreference = "none" | "weak" | "normal" | "strong";
export type ShopIdRequirement =
  | "none"
  | "photo_only"
  | "address_only"
  | "both";
export type ShopPreferredAgeRange =
  | "age_18_19"
  | "age_20_24"
  | "age_25_29"
  | "age_30_34"
  | "age_35_39"
  | "age_40_49"
  | "age_50_plus";

// 一覧の並び替えモード
export type ShopOrderBy = "kana" | "number" | "favorite";

export type ShopListItem = {
  id: string;
  name: string;

  // API から返却される拡張フィールド
  nameKana?: string | null;
  kana?: string | null;

  shopNumber?: string | null;
  phone?: string | null;
  genre?: ShopGenre | null;

  prefecture?: string | null;
  city?: string | null;
  addressLine?: string | null;
  buildingName?: string | null;

  // ランク・飲酒・身分証・希望年齢・時給ラベル
  rank?: ShopRank | null;
  drinkPreference?: ShopDrinkPreference | null;
  idDocumentRequirement?: ShopIdRequirement | null;
  preferredAgeRange?: ShopPreferredAgeRange | null;
  wageLabel?: string | null;

  createdAt: string;

  // コントローラの select に含めていないケースもあるので optional
  updatedAt?: string;
};

export type ShopListResponse = {
  items: ShopListItem[];
  total: number;
};

/**
 * 店舗詳細用の型
 * - ベースは ShopListItem
 * - 詳細画面で追加で扱いたいフィールドを拡張
 */
export type ShopDetail = ShopListItem & {
  /** 求人用キーワード（店舗条件・特徴など） */
  reqKeywords?: string[] | null;

  /** 備考欄など（必要に応じて API 側の note カラム等に対応） */
  note?: string | null;

  // ---- 登録情報① など（UI で参照しているキー群）----
  postalCode?: string | null;
  height?: string | null;
  bodyType?: string | null;
  caution?: string | null;
  contactMethod?: string | null; // "line" | "sms" | "tel" | "" を想定（API側は string）
  hairSet?: string | null; // ★ 登録情報①の hairSet（当日とは別）
  ownerStaff?: string | null;
  phoneChecked?: boolean | null;

  // 当日特別オーダー（Controller が GET/PATCH で返す想定）
  // - API 側は snake/camel を吸収して返すが、型はユルく持つ
  dailyOrder?: {
    date?: string | null; // Date or string が混在し得るが UI は基本 YYYY-MM-DD を想定
    contactConfirm?: string | null;
    drink?: string | null;
    height?: string | null;
    bodyType?: string | null;
    hairSet?: string | null; // ★ 当日特別オーダー側 hairSet（衝突回避）
    wage?: string | null;
    note?: string | null;
    updatedBy?: string | null;
    updatedAt?: string | null;
    createdAt?: string | null;
  } | null;
};

/**
 * 店舗一覧取得
 * API 実体は `ShopListItem[]` を返すので、ここで `{ items, total }` にラップする
 * - q: 店舗名・住所などのキーワード
 * - limit: take にマップ
 * - offset: offset にマップ
 * - genre: ジャンル絞り込み (club/cabaret/snack/gb)
 * - orderBy: ソート (kana/number/favorite)
 */
export async function listShops(
  params: {
    q?: string;
    limit?: number;
    offset?: number;
    genre?: ShopGenre;
    orderBy?: ShopOrderBy;
  } = {},
): Promise<ShopListResponse> {
  const qs = new URLSearchParams();

  if (params.q) qs.set("q", params.q);
  if (params.limit != null) qs.set("take", String(params.limit));
  if ((params as any).offset != null) {
    qs.set("offset", String((params as any).offset));
  }
  if (params.genre) {
    qs.set("genre", params.genre);
  }
  if (params.orderBy) {
    qs.set("orderBy", params.orderBy);
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

/**
 * 店舗詳細取得
 * - /shops/:id のレスポンスを ShopDetail として扱う
 */
export async function getShop(id: string): Promise<ShopDetail> {
  return apiFetch<ShopDetail>(`/shops/${id}`, withUser());
}

// =======================
// NGキャスト / 専属キャスト
// =======================

export type ShopNgCast = {
  id: string;
  shopId: string;
  castId: string;
  source?: string | null;
  reason?: string | null;
  cast?: {
    userId: string;
    displayName: string;
    managementNumber: string | null;
    castCode?: string | null;
  };
};

export type ShopFixedCast = {
  id: string;
  shopId: string;
  castId: string;
  note?: string | null;
  cast?: {
    userId: string;
    displayName: string;
    managementNumber: string | null;
    castCode?: string | null;
  };
};

export async function listShopNgCasts(shopId: string): Promise<ShopNgCast[]> {
  return apiFetch<ShopNgCast[]>(`/shops/${shopId}/ng-casts`, withUser());
}

export async function listShopFixedCasts(
  shopId: string,
): Promise<ShopFixedCast[]> {
  return apiFetch<ShopFixedCast[]>(`/shops/${shopId}/fixed-casts`, withUser());
}

// =======================
// PATCH 用 payload 型（DTO/Prisma に合わせる）
// =======================

/**
 * ★ 当日特別オーダー（shop_daily_orders）
 * - API DTO は dailyOrder（ネスト）を正式対応
 * - かつ互換としてフラット（dailyOrderDate など）も受理する
 */
export type ShopDailyOrderPayload = Partial<{
  date: string; // "YYYY-MM-DD"
  contactConfirm: string | null;
  drink: string | null;
  height: string | null;
  bodyType: string | null;
  hairSet: string | null; // ★ 当日特別オーダー側 hairSet（衝突回避）
  wage: string | null;
  note: string | null;
  updatedBy: string | null;
}>;

/**
 * ★ UpdateShopPayload（今回の API UpdateShopDto キー名に完全追従）
 *
 * 【A: 店舗基本情報（shops）】
 * - name/nameKana/prefecture/city/addressLine/buildingName/phone/postalCode/contactMethod/hairSet/wageLabel/caution/ownerStaff
 * - genre/rank/drinkPreference/idDocumentRequirement/preferredAgeRange
 * - shopNumber（互換で shop_number も送れるように型として持つ）
 * - reqKeywords（全入替）
 *
 * 【B: 当日特別オーダー（shop_daily_orders）】
 * - 推奨: dailyOrder ネスト
 * - 互換: dailyOrderDate + (contactConfirm/drink/height/bodyType/wage/note/updatedBy/hairSet) のフラット
 *
 * ※ hairSet は「shops 基本情報」と「dailyOrder」の両方に存在する。
 *    衝突回避のため dailyOrder 側は dailyOrder.hairSet を推奨。
 */
export type UpdateShopPayload = Partial<{
  // ------- A: 基本情報（shops） -------
  name: string;
  nameKana: string | null;

  prefecture: string | null;
  city: string | null;
  addressLine: string | null;
  buildingName: string | null;
  phone: string | null;

  postalCode: string | null;
  contactMethod: string | null;

  hairSet: string | null; // ★ 店舗基本情報側
  wageLabel: string | null;
  caution: string | null;
  ownerStaff: string | null;

  genre: ShopGenre | null;
  rank: ShopRank | null;
  drinkPreference: ShopDrinkPreference | null;
  idDocumentRequirement: ShopIdRequirement | null;
  preferredAgeRange: ShopPreferredAgeRange | null;

  // 店舗番号（互換）
  shopNumber: string | null;
  shop_number: string | null;

  // 要件キーワード（全入替）
  reqKeywords: string[] | null;

  // 備考（※ API 側 shops.note を実装している場合のみ有効）
  note: string | null;

  // ------- B: 当日特別オーダー（ネスト推奨） -------
  dailyOrder: ShopDailyOrderPayload | null;

  // ------- B: 当日特別オーダー（フラット互換） -------
  dailyOrderDate: string | null; // "YYYY-MM-DD"
  contactConfirm: string | null;
  drink: string | null;
  height: string | null;
  bodyType: string | null;
  wage: string | null;

  // dailyOrder 側 note/updatedBy とフラット互換
  updatedBy: string | null;

  // 将来用（boolean で来るケース）
  phoneChecked: boolean | null;
}>;

/**
 * 店舗更新
 * - 戻り値は ShopDetail（Controller が dailyOrder も同梱して返す想定）
 */
export async function updateShop(
  id: string,
  payload: UpdateShopPayload,
): Promise<ShopDetail> {
  return apiFetch<ShopDetail>(
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

export async function deleteShop(id: string): Promise<void> {
  await apiFetch<void>(`/shops/${id}`, withUser({ method: "DELETE" }));
}

export async function importShopsExcel(file: File) {
  // apiFetch は JSON 前提なのでここは fetch を直接使う
  const RAW_BASE = (
    process.env.NEXT_PUBLIC_API_URL ?? "https://tiara-api.vercel.app/api/v1"
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

/* ============================================================
 * 専属指名キャスト / NGキャスト API クライアント
 * ============================================================ */

// 共通で返ってくる Cast 情報（API の select と揃える）
export type ShopCastSummary = {
  userId: string;
  displayName: string | null;
  managementNumber: string | null;
  castCode: string | null;
};

// --- 専属指名キャスト（shop_fixed_casts） ---

export type ShopFixedCastItem = {
  id: string;
  shopId: string;
  castId: string;
  note: string | null;
  createdAt: string;
  cast: ShopCastSummary;
};

export type UpsertFixedCastPayload = {
  castId: string;
  note?: string;
};

export async function listShopFixedCasts(
  shopId: string,
): Promise<ShopFixedCastItem[]> {
  return apiFetch<ShopFixedCastItem[]>(
    `/shops/${shopId}/fixed-casts`,
    withUser(),
  );
}

export async function upsertShopFixedCast(
  shopId: string,
  payload: UpsertFixedCastPayload,
): Promise<ShopFixedCastItem> {
  return apiFetch<ShopFixedCastItem>(
    `/shops/${shopId}/fixed-casts`,
    withUser({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }),
  );
}

export async function deleteShopFixedCast(
  shopId: string,
  castId: string,
): Promise<{ count: number }> {
  return apiFetch<{ count: number }>(
    `/shops/${shopId}/fixed-casts/${castId}`,
    withUser({
      method: "DELETE",
    }),
  );
}

// --- 店舗 → NGキャスト（shop_ng_casts） ---

export type ShopNgCastItem = {
  id: string;
  shopId: string;
  castId: string;
  reason: string | null;
  source: string | null;
  createdAt: string;
  cast: ShopCastSummary;
};

export type UpsertNgCastPayload = {
  castId: string;
  reason?: string;
  source?: string;
};

export async function listShopNgCasts(
  shopId: string,
): Promise<ShopNgCastItem[]> {
  return apiFetch<ShopNgCastItem[]>(
    `/shops/${shopId}/ng-casts`,
    withUser(),
  );
}

export async function upsertShopNgCast(
  shopId: string,
  payload: UpsertNgCastPayload,
): Promise<ShopNgCastItem> {
  return apiFetch<ShopNgCastItem>(
    `/shops/${shopId}/ng-casts`,
    withUser({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }),
  );
}

export async function deleteShopNgCast(
  shopId: string,
  castId: string,
): Promise<{ count: number }> {
  return apiFetch<{ count: number }>(
    `/shops/${shopId}/ng-casts/${castId}`,
    withUser({
      method: "DELETE",
    }),
  );
}
