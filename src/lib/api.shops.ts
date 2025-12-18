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

  // コントローラの select に含めていないケースもあるので optional に変更
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

  // ---- 追加：登録情報①・当日特別オーダーなど（page.tsx で参照しているキー群）----
  postalCode?: string | null;
  height?: string | null;
  bodyType?: string | null;
  caution?: string | null;
  contactMethod?: string | null; // "line" | "sms" | "tel" | "" を想定（API側は string の想定）
  hairSet?: string | null; // ★ 登録情報①の hairSet（当日とは別）
  ownerStaff?: string | null;
  phoneChecked?: boolean | null;

  // 当日特別オーダー（GET で返している場合のために optional で持つ）
  dailyOrderDate?: string | null;
  dailyOrder?: {
    date?: string | null;
    contactConfirm?: string | null;
    drink?: string | null;
    height?: string | null;
    bodyType?: string | null;
    hairSet?: string | null; // ★ 当日特別オーダー側 hairSet（衝突回避）
    wage?: string | null;
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
// PATCH 用 payload 型（DTO/Prisma に合わせる）
// =======================

// ★ 当日特別オーダー（衝突回避のため dailyOrder にネストで送る）
export type ShopDailyOrderPayload = Partial<{
  date: string; // "YYYY-MM-DD"
  contactConfirm: string;
  drink: string;
  height: string;
  bodyType: string;
  hairSet: string; // ★ 当日特別オーダー側 hairSet
  wage: string;
}>;

// ★ 保存対象：登録情報①（page.tsx で payload に積んだキー名へ完全追従）
export type UpdateShopPayload = Partial<{
  // --- 店舗基本 ---
  name: string;
  nameKana: string;
  shopNumber: string;
  prefecture: string;
  city: string;
  addressLine: string;
  buildingName: string;
  phone: string;

  genre: ShopGenre | null;
  rank: ShopRank | null;
  drinkPreference: ShopDrinkPreference | null;
  idDocumentRequirement: ShopIdRequirement | null;
  preferredAgeRange: ShopPreferredAgeRange | null;
  wageLabel: string | null;

  reqKeywords: string[];
  note: string | null;

  // --- 登録情報①（保存対象） ---
  postalCode: string; // page.tsx では空でも送る想定のため string
  height: string;
  bodyType: string;
  caution: string;
  contactMethod: string; // "line" | "sms" | "tel" | "" を想定（API側は string）
  hairSet: string; // ★ 登録情報①の hairSet（当日とは別）
  ownerStaff: string;
  phoneChecked: boolean;

  // --- 当日特別オーダー（保存対象） ---
  // 互換のため dailyOrderDate も残す（API側が参照している可能性があるため）
  dailyOrderDate: string; // "YYYY-MM-DD"
  dailyOrder: ShopDailyOrderPayload;

  // ※ 旧フラットキー（contactConfirm/drink/height/bodyType/hairSet/wage）は廃止
  //    ただし API がまだ旧キーを受けている場合は、ここに残すのではなく
  //    page.tsx 側で「両方送る」にする方が安全（型汚染を避ける）
}>;

/**
 * 店舗更新
 * - 戻り値は ShopDetail として扱えるようにしておく
 *   （保存後に一覧の 1 行を更新する際にも利用しやすい）
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
