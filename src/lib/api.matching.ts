// src/lib/api.matching.ts
"use client";

import { apiFetch } from "./api";
import type { ShopListItem } from "./api.shops";
import type { CastAttributes, CastPreferences } from "./api.casts";

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

/**
 * マッチング候補1件分（API /matching/shops/:shopId/candidates の想定 shape）
 * - NGフラグは2方向＋両方NGを分かりやすく boolean で保持
 */
export type MatchingCandidate = {
  castId: string;
  managementNumber: string | null;
  displayName: string;
  age: number | null;
  desiredHourly: number | null;
  feeCategory: string | null;

  // NG 状態
  ngByShop: boolean;
  ngByCast: boolean;
  bothNg: boolean;

  // 任意：理由テキストなど（あれば表示に使う）
  ngReasonFromShop?: string | null;
  ngReasonFromCast?: string | null;

  // 将来拡張用（画面では一部だけ使う）
  attributes?: CastAttributes | null;
  preferences?: CastPreferences | null;

  // マッチ度（将来スコアリング用）
  matchScore?: number | null;
};

/**
 * /matching/shops/:shopId/candidates のレスポンス想定
 * - 店舗情報＋候補キャスト一覧
 * - 店舗情報は既存 ShopListItem と部分的に揃える
 */
export type MatchingResult = {
  shop: {
    id: string;
    name: string;
    shopNumber: string | null;
    genre?: ShopListItem["genre"];
    rank?: ShopListItem["rank"];
    drinkPreference?: ShopListItem["drinkPreference"];
    preferredAgeRange?: ShopListItem["preferredAgeRange"];
    wageLabel?: ShopListItem["wageLabel"];
    prefecture?: string | null;
    city?: string | null;
  };
  candidates: MatchingCandidate[];
};

/**
 * 店舗基点のマッチング候補取得
 * GET /matching/shops/:shopId/candidates を叩く前提
 */
export async function getMatchingCandidates(
  shopId: string,
): Promise<MatchingResult> {
  const path = `/matching/shops/${shopId}/candidates`;

  // API 側の正式 shape に揃えるだけ（特別なラップはしない）
  const raw = await apiFetch<MatchingResult>(path, withUser());
  return raw;
}
