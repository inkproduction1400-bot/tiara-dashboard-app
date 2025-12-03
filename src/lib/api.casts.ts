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

/** Cast 一覧（/casts GET のレスポンスをフロント用に正規化した型） */
export type CastListItem = {
  /** 一覧では userId をキーとして扱う（API の id or userId を吸収） */
  userId: string;
  displayName: string;
  /** NEW: ふりがな（一覧でも扱えるようにオプショナルで定義） */
  furigana?: string | null;
  phone?: string | null;
  email?: string | null;
  drinkOk?: boolean | null;
  hasExperience?: boolean | null;
  /** API から来ない可能性があるので null / undefined 許容 */
  createdAt?: string | null;
  managementNumber?: string | null;
  legacyStaffId?: number | null; // 旧システムのスタッフID
  birthdate?: string | null;
  age?: number | null;
  /** 一覧で希望時給を表示するため */
  desiredHourly?: number | null;
  /** NEW: キャストID（英字+数字ランダム） */
  castCode?: string | null;
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

  const mapItem = (it: any): CastListItem => ({
    userId: it.userId ?? it.id ?? "",
    displayName: it.displayName ?? "",
    furigana: it.furigana ?? null,
    phone: it.phone ?? null,
    email: it.email ?? null,
    drinkOk: it.drinkOk ?? null,
    hasExperience: it.hasExperience ?? null,
    createdAt: it.createdAt ?? null,
    managementNumber: it.managementNumber ?? null,
    legacyStaffId: it.legacyStaffId ?? null,
    birthdate: it.birthdate ?? null,
    age: it.age ?? null,
    desiredHourly: it.desiredHourly ?? null,
    castCode: it.castCode ?? null,
  });

  if (Array.isArray(raw)) {
    const items = (raw as any[]).map(mapItem);
    return { items, total: items.length };
  }

  const rawItems = Array.isArray(raw?.items) ? (raw.items as any[]) : [];
  const items = rawItems.map(mapItem);
  const total =
    typeof raw?.total === "number" ? (raw.total as number) : items.length;

  return { items, total };
}

/** NG / 専属 / 指名 店舗で共通して使える簡易 Shop 型 */
export type CastNamedShop = {
  shopId: string;
  shopName: string | null;
  shopNumber: string | null;
  prefecture: string | null;
  city: string | null;
};

/** NG 店舗（GET /casts/:id の ngShops 要素） */
export type CastNgShop = CastNamedShop & {
  source: string | null;
  reason: string | null;
  createdAt: string;
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
  /** 'ng' | 'weak' | 'normal' | 'strong' | null */
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

/**
 * CastBackground
 * - モーダルで扱う背景情報＋備考類をすべて型でカバー
 */
export type CastBackground = {
  howFound: string | null;
  motivation: string | null;
  otherAgencies: string | null;
  reasonChoose: string | null;
  shopSelectionPoints: string | null;

  // 追加: 比較・紹介・備考系
  referrerName: string | null; // 紹介者名 / サイト名
  compareOtherAgencies: string | null; // 他の派遣会社との比較
  otherAgencyName: string | null; // 派遣会社名
  otherNotes: string | null; // その他（備考）
  thirtyKComment: string | null; // 30,000円到達への所感

  // 追加: 時給・月給メモ／ジャンル／NGメモ
  salaryNote: string | null;
  genres: string[] | null; // フロント側では CastGenre[] 相当
  ngShopMemo: string | null;

  // 追加: 身分証関連
  idDocType: string | null; // "運転免許証" 等
  residencyProof: string | null; // "済" / "未"
  oathStatus: string | null; // "済" / "未"
  idMemo: string | null;
};

/** GET /casts/:id のレスポンス形（モーダル用） */
export type CastDetail = {
  userId: string;
  displayName: string;
  /** NEW: ふりがな（バックエンドの buildCastDetail に合わせて追加） */
  furigana: string | null;
  managementNumber: string | null;
  /** NEW: キャストID（英字+数字ランダム） */
  castCode: string | null;
  birthdate: string | null;
  age: number | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  drinkOk: boolean | null;
  hasExperience: boolean | null;
  note: string | null;
  profilePhotoUrl: string | null;

  /** NEW: ティアラランク / 担当者名（バックエンド側で順次対応予定） */
  tiaraRank?: string | null;
  ownerStaffName?: string | null;

  /** 属性・希望条件・背景 */
  attributes: CastAttributes | null;
  preferences: CastPreferences | null;
  background: CastBackground | null;

  /** NG 店舗一覧 */
  ngShops: CastNgShop[];

  /** 専属指名店舗（1件のみ） */
  exclusiveShopId: string | null;
  exclusiveShop: CastNamedShop | null;

  /** 指名店舗（複数件） */
  nominatedShops: CastNamedShop[];

  /** お気に入り店舗（複数件） */
  favoriteShops?: CastNamedShop[];

  /** 直近シフト（本日〜翌日分） */
  latestShifts: CastLatestShift[];

  /** 旧システムのスタッフID（存在する場合のみ） */
  legacyStaffId?: number | null;
};

/** PATCH /casts/:id 用の簡易ペイロード */
export type CastUpdatePayload = {
  displayName?: string | null;
  /** NEW: ふりがな */
  furigana?: string | null;
  birthdate?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  note?: string | null;
  drinkOk?: boolean | null;
  hasExperience?: boolean | null;
  managementNumber?: string | null;

  /** NEW: ティアラランク / 担当者名 */
  tiaraRank?: string | null;
  ownerStaffName?: string | null;

  /**
   * NG店舗（キャスト都合）のショップID一覧
   * - undefined … 変更なし（API にキーを送らない）
   * - []        … 既存の NG を全削除
   * - ["shop-uuid", ...] … このリストで置き換え
   */
  ngShopIds?: string[];

  /**
   * 専属指名店舗ID
   * - undefined … 変更なし
   * - null / "" … 専属を解除
   * - "shop-uuid" … 該当店舗を専属として設定
   */
  exclusiveShopId?: string | null;

  /**
   * 専属指名店舗IDの配列（/casts/:id PATCH 側では exclusiveShopId / exclusiveShopIds の両方を吸収）
   * - undefined … 変更なし
   * - []        … 専属を全削除
   * - ["shop-uuid"] … 1件だけ専属として設定
   */
  exclusiveShopIds?: string[];

  /**
   * 指名店舗のショップID一覧
   * - undefined … 変更なし
   * - []        … 既存の指名店舗を全削除
   * - ["shop-uuid", ...] … このリストで置き換え
   */
  nominatedShopIds?: string[];

  /**
   * お気に入り店舗のショップID一覧
   * - undefined … 変更なし
   * - []        … 既存のお気に入り店舗を全削除
   * - ["shop-uuid", ...] … このリストで置き換え
   */
  favoriteShopIds?: string[];

  attributes?:
    | {
        heightCm?: number | null;
        clothingSize?: string | null;
        shoeSizeCm?: number | null;
        tattoo?: boolean | null;
        needPickup?: boolean | null;
        /** 'ng' | 'weak' | 'normal' | 'strong' | null */
        drinkLevel?: string | null;
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
        /** 手数料区分 (busy/normal/slow 等) */
        feeCategory?: string | null;
      }
    | null;

  background?:
    | {
        howFound?: string | null;
        motivation?: string | null;
        otherAgencies?: string | null;
        reasonChoose?: string | null;
        shopSelectionPoints?: string | null;

        // 追加: 比較・紹介・備考系
        referrerName?: string | null;
        compareOtherAgencies?: string | null;
        otherAgencyName?: string | null;
        otherNotes?: string | null;
        thirtyKComment?: string | null;

        // 追加: 時給・月給メモ／ジャンル／NGメモ
        salaryNote?: string | null;
        genres?: string[] | null;
        ngShopMemo?: string | null;

        // 追加: 身分証関連
        idDocType?: string | null;
        residencyProof?: string | null;
        oathStatus?: string | null;
        idMemo?: string | null;
      }
    | null;
};

/** ===== 今日出勤キャスト (/casts/today) 用の型 ===== */

/** TodayCast の assignment 要素 */
export type TodayCastAssignmentItem = {
  id: string;
  shopId: string;
  shopName: string;
  shopNumber: string | null;
  assignedFrom: string; // ISO文字列
  assignedTo: string | null; // ISO文字列 or null
  status: string;
};

/** TodayCast の attendance 要素 */
export type TodayCastAttendanceItem = {
  id: string;
  shopId: string;
  checkInAt: string; // ISO文字列
  returnedAt: string | null;
  checkOutAt: string | null;
  method: string | null;
};

/** /casts/today の 1 レコード（バックエンドの TodayCastItem に対応） */
export type TodayCastApiItem = {
  castId: string;
  managementNumber: string;
  /** NEW: キャストID（英字+数字ランダム） */
  castCode: string | null;
  displayName: string;
  age: number | null;
  desiredHourly: number | null;
  drinkOk: boolean;

  primaryShopId: string;
  primaryShopName: string;
  primaryShopNumber: string | null;
  primaryStatus: string;

  assignments: TodayCastAssignmentItem[];
  attendance: TodayCastAttendanceItem | null;
};

/** /casts/today のレスポンス全体 */
export type TodayCastsApiResponse = {
  date: string;
  items: TodayCastApiItem[];
};

/**
 * Cast 一覧取得
 * - バックエンド側の ListCastsDto に合わせて
 *   q / take / offset / drinkOk / hasExperience / hasNgShops / hasExclusiveShop / hasNominatedShops
 *   をクエリで指定可能
 * - バックのレスポンスが { items, total } or 配列 のどちらでも吸収する
 */
export async function listCasts(
  params: {
    q?: string;
    limit?: number; // 取得件数（take にマップ）
    offset?: number;
    drinkOk?: boolean;
    hasExperience?: boolean;
    hasNgShops?: boolean;
    hasExclusiveShop?: boolean;
    hasNominatedShops?: boolean;
  } = {},
): Promise<CastListResponse> {
  const {
    q,
    limit,
    offset,
    drinkOk,
    hasExperience,
    hasNgShops,
    hasExclusiveShop,
    hasNominatedShops,
  } = params;

  // API 側の上限が 10,000 なので、それを越えないように丸める
  const MAX_TAKE = 10_000;
  const DEFAULT_TAKE = 10_000;
  const take = Math.min(limit ?? DEFAULT_TAKE, MAX_TAKE);

  const qs = new URLSearchParams();
  if (q) qs.set("q", q);
  if (take) qs.set("take", String(take));
  if (typeof offset === "number" && offset >= 0) {
    qs.set("offset", String(offset));
  }
  if (typeof drinkOk === "boolean") {
    qs.set("drinkOk", String(drinkOk));
  }
  if (typeof hasExperience === "boolean") {
    qs.set("hasExperience", String(hasExperience));
  }
  if (typeof hasNgShops === "boolean") {
    qs.set("hasNgShops", String(hasNgShops));
  }
  if (typeof hasExclusiveShop === "boolean") {
    qs.set("hasExclusiveShop", String(hasExclusiveShop));
  }
  if (typeof hasNominatedShops === "boolean") {
    qs.set("hasNominatedShops", String(hasNominatedShops));
  }

  const path = `/casts${qs.toString() ? `?${qs.toString()}` : ""}`;

  const raw = await apiFetch<any>(path, withUser());

  const mapItem = (it: any): CastListItem => ({
    userId: it.userId ?? it.id ?? "",
    displayName: it.displayName ?? "",
    furigana: it.furigana ?? null,
    phone: it.phone ?? null,
    email: it.email ?? null,
    drinkOk: it.drinkOk ?? null,
    hasExperience: it.hasExperience ?? null,
    createdAt: it.createdAt ?? null,
    managementNumber: it.managementNumber ?? null,
    legacyStaffId: it.legacyStaffId ?? null,
    birthdate: it.birthdate ?? null,
    age: it.age ?? null,
    desiredHourly: it.desiredHourly ?? null,
    castCode: it.castCode ?? null,
  });

  if (Array.isArray(raw)) {
    const items = (raw as any[]).map(mapItem);
    return { items, total: items.length };
  }

  const rawItems = Array.isArray(raw?.items) ? (raw.items as any[]) : [];
  const items = rawItems.map(mapItem);
  const total =
    typeof raw?.total === "number" ? (raw.total as number) : items.length;

  return { items, total };
}

/** Cast 詳細取得（モーダル用） */
export async function getCast(id: string): Promise<CastDetail> {
  return apiFetch<CastDetail>(`/casts/${id}`, withUser());
}

/** Cast 一括更新（本体＋attributes/preferences/background＋ngShopIds 等） */
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
