// src/app/casts/today/TodayPageClient.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Bot } from "lucide-react";
import AppShell from "@/components/AppShell";
import { CastPhotoImage } from "@/components/CastPhotoImage";
import {
  listTodayCasts,
  listCasts as fetchCastList,
  getCast,
  getCastSignedPhotoUrl,
  isHttpUrl,
  isLocalPreviewUrl,
  resolveLegacyPhotoFallbackUrl,
  resolveCastPhotoDisplayUrl,
  resolveCastPhotoSource,
} from "@/lib/api.casts";
import {
  listShopOrders,
  createShopOrder,
  replaceOrderAssignments,
  updateShopOrder,
} from "@/lib/api.shop-orders";
import {
  listShopRequests,
  createShopRequest,
  updateShopRequest,
} from "@/lib/api.shop-requests";
import {
  getShop,
  listShopFixedCasts,
  listShopNgCasts,
  upsertShopFixedCast,
  listShops,
  type ShopDetail,
} from "@/lib/api.shops";
import { apiFetch, getCurrentUser } from "@/lib/api";
import {
  type ScheduleShopRequest,
  loadScheduleShopRequests,
} from "@/lib/schedule.store";
import {
  getMatchingSettings,
  updateMatchingSettings,
  type MatchingSettings,
} from "@/lib/api.matching";
import { listStaffs, type StaffUser } from "@/lib/api.staffs";
import {
  bulkAttendanceRequest,
  cancelDispatchSheetRow,
  confirmDispatchSheet,
  confirmDispatchSheetRow,
  getAttendanceRequests,
  getDispatchSheet,
  upsertAttendanceRequest,
  upsertDispatchSheetRow,
  type AttendanceRequestItem,
  type AttendanceRequestStatus,
  type DispatchSheetRow,
  type DispatchSheetShop,
} from "@/lib/api.dispatch-sheet";
import {
  subscribeAttendanceRequestUpdates,
  subscribeDispatchSheetUpdates,
} from "@/lib/socket";

// ====== 追加: 型定義 ======

type DrinkLevel = "ng" | "weak" | "normal" | "strong" | null;

// キャストのジャンル（複数選択用）
type CastGenre = "club" | "cabaret" | "snack" | "gb";

// 店舗ジャンル（NG登録モーダルの絞り込み用）
type ShopGenre = "club" | "cabaret" | "snack" | "gb";
type YesNoFilter = "" | "yes" | "no";
type CastNominationFilter = "" | "exclusive" | "nominated" | "free";
type ContactMethodFilter = "" | "line" | "sms" | "tel";
type WageFilter =
  | ""
  | "2500"
  | "3000"
  | "3500"
  | "4500"
  | "5000"
  | "5500"
  | "6000"
  | "6500";
type ShopSortKey = "number" | "kana" | "favorite";
type DispatchCancelType = "cast" | "shop";
type MatchingAdvice = {
  title: string;
  body: string;
  tone: "shortage" | "surplus" | "normal";
};

const WAGE_BUCKETS = [2500, 3000, 3500, 4500, 5000, 5500, 6000, 6500] as const;
const assignmentPickStorageKey = "tiara:assignments:pick";
const DISPATCH_SHEET_SLOT_COUNT = 100;
const CAST_LIST_PAGE_SIZE = 56;
const DISPATCH_TIME_OPTIONS = ["21:00~", "21:30~", "22:00~"] as const;
const DISPATCH_TIME_DATALIST_ID = "dispatch-time-options";
type DispatchStatusFilter = "" | "unassigned" | "matched";
type CastStatusTab = "today" | "all" | "dormant";
type CastListMode = "proposal" | "request";
type AttendanceRequestFilter = "" | "none" | AttendanceRequestStatus;
type TutorialTarget =
  | "shop-tab"
  | "shop-list"
  | "cast-tab"
  | "all-casts-tab"
  | "active-shop-order"
  | "proposal-filters"
  | "request-status-filter"
  | "request-mode"
  | "request-filters"
  | "bulk-request"
  | "cast-list"
  | "dispatch-tab"
  | "dispatch-sheet"
  | null;
type TutorialMessage = {
  title: string;
  body: string;
  target: TutorialTarget;
};

const normalizeDispatchTimeForSave = (value?: string | null) => {
  const trimmed = (value ?? "").trim();
  const withoutSuffix = trimmed.replace(/[~〜～]+$/u, "").trim();
  return withoutSuffix;
};

const buildDispatchSlots = (
  rows: DispatchSheetRow[],
  options: { includeCanceledTail: boolean },
) => {
  const rowPriority = (row: DispatchSheetRow) => {
    if (row.isOrderSlot && row.shopId && !row.castId) return 0;
    if (row.shopId && row.castId && row.status !== "confirmed") return 1;
    if (row.castId && !row.shopId) return 2;
    if (row.status === "confirmed") return 3;
    return 4;
  };
  const byDisplayOrder = (a: DispatchSheetRow, b: DispatchSheetRow) => {
    const priorityDiff = rowPriority(a) - rowPriority(b);
    if (priorityDiff !== 0) return priorityDiff;
    const aOrder =
      typeof a.displayOrder === "number" && a.displayOrder >= 0
        ? a.displayOrder
        : Number.MAX_SAFE_INTEGER;
    const bOrder =
      typeof b.displayOrder === "number" && b.displayOrder >= 0
        ? b.displayOrder
        : Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return (a.managementNumber ?? "").localeCompare(
      b.managementNumber ?? "",
      "ja",
      { numeric: true },
    );
  };
  const activeRows = rows
    .filter((row) => row.status !== "canceled")
    .sort(byDisplayOrder);
  const canceledRows = rows
    .filter((row) => row.status === "canceled")
    .sort(byDisplayOrder);
  const slotCount = Math.max(DISPATCH_SHEET_SLOT_COUNT, activeRows.length);
  const slots = Array.from<DispatchSheetRow | undefined>({
    length: slotCount,
  });

  activeRows.forEach((row, index) => {
    slots[index] = row;
  });

  if (!options.includeCanceledTail) return slots;
  return [...slots, ...canceledRows];
};

// 年齢レンジフィルタ
type AgeRangeFilter =
  | ""
  | "18-19"
  | "20-24"
  | "25-29"
  | "30-34"
  | "35-39"
  | "40-49"
  | "50-";

type Cast = {
  id: string;
  code: string;
  name: string;
  nickname?: string | null;
  age: number;
  desiredHourly: number;
  heightCm?: number | null;
  bodyType?: string | null;
  /** 飲酒レベル: NG / 弱い / 普通 / 強い / 未登録(null) */
  drinkLevel: DrinkLevel;
  photoUrl?: string;
  photoUrlRaw?: string;
  hasExclusive?: boolean;
  hasNominated?: boolean;
  /** 専属店舗ID（キャスト側に紐付けがある場合） */
  exclusiveShopId?: string | null;
  /** このキャストがNGの店舗ID一覧（将来APIから付与 or 更新） */
  ngShopIds?: string[];
  /** 旧ID（既存仕様：管理番号・名前・旧IDで検索できる想定） */
  oldId?: string;
  /** キャストのジャンル（クラブ / キャバ / スナック / ガルバ など複数） */
  genres?: CastGenre[];
  /** 将来の休眠キャスト管理用ステータス */
  lifecycleStatus?: string | null;
  activityStatus?: string | null;
  status?: string | null;
  attendanceRequestStatus?: AttendanceRequestStatus | null;
  ownerStaffName?: string | null;
};

type Shop = {
  id: string;
  requestId?: string;
  code: string;
  name: string;
  nameKana?: string | null;
  /** 最低時給（未指定なら無制限） */
  minHourly?: number;
  /** 最大時給（未指定なら無制限） */
  maxHourly?: number;
  /** 最低年齢 */
  minAge?: number;
  /** 最高年齢 */
  maxAge?: number;
  /** true の場合は「NG 以外で飲めるキャスト」のみマッチ */
  requireDrinkOk?: boolean;
  /** 店舗ジャンル（将来の拡張を想定） */
  genre?: ShopGenre | null;
  /** 電話番号（店舗管理の情報） */
  phone?: string | null;
  /** 連絡方法（店舗管理の情報） */
  contactMethod?: string | null;
  /** 連絡ステータス（入力中/済/確定など） */
  contactStatus?: string | null;
  /** 時給ラベル（店舗管理の情報） */
  wageLabel?: string | null;
  /** 身分証要件（店舗管理の情報） */
  idDocumentRequirement?: string | null;
  /** 飲酒条件（店舗管理の情報） */
  drinkPreference?: string | null;
  /** 体型（店舗管理の情報） */
  bodyType?: string | null;
  /** ヘアセット（店舗管理の情報） */
  hairSet?: string | null;
  /** 注意点（店舗管理の情報） */
  caution?: string | null;
  /** 担当者（店舗管理の情報） */
  ownerStaff?: string | null;
  rank?: string | null;
  [key: string]: any;
};

const DEFAULT_MATCHING_SETTINGS: MatchingSettings = {
  id: "local",
  scope: "global",
  enableGenre: true,
  enableHourly: true,
  enableDrink: true,
  enableHeight: true,
  enableBodyType: true,
  weightGenre: 100,
  weightHourly: 70,
  weightDrink: 40,
  weightHeight: 30,
  weightBodyType: 20,
  fixedCastAlwaysTop: true,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

// ===== スケジュール連携: 本日分の店舗を取得 =====

// 本日の日付キー（YYYY-MM-DD）
// ※ 営業日ベース（AM5:00 までは前日扱い）
const todayKey = () => {
  const d = new Date();
  if (d.getHours() < 5) {
    d.setDate(d.getDate() - 1);
  }
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const dd = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${dd}`;
};

const formatJapaneseDate = (dateKey: string) => {
  const [year, month, day] = dateKey.split("-");
  if (!year || !month || !day) return dateKey;
  return `${year}年${Number(month)}月${Number(day)}日`;
};

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

type IdDocPrintMode = "shop_required" | "all_with_id" | "manual";

type IdDocSource = {
  urlOrPath: string;
  label: string;
  purpose: "id_with_face" | "id_without_face";
};

type IdDocPrintImage = {
  url: string;
  label: string;
};

type IdDocPrintTarget = {
  key: string;
  assignmentId: string | null;
  castId: string;
  castName: string;
  castCode: string | null;
  shopName: string;
  shopNumber: string | null;
  requirement: string;
  requirementLabel: string;
  shopRequiresId: boolean;
  hasIdDocs: boolean;
  sources: IdDocSource[];
  recommended: boolean;
  reason: string;
};

const ID_REQUIREMENT_LABEL: Record<string, string> = {
  none: "不要",
  photo_only: "写真のみ",
  address_only: "住所のみ",
  both: "両方",
};

const getIdRequirementLabel = (requirement: string) =>
  ID_REQUIREMENT_LABEL[requirement] ?? (requirement || "未設定");

const isShopIdRequired = (requirement: string) =>
  Boolean(requirement && requirement !== "none");

const pickIdDocSources = (cast: any): IdDocSource[] => {
  const sources: IdDocSource[] = [];
  const seen = new Set<string>();
  const pushUnique = (
    urlOrPath: unknown,
    label: string,
    purpose: IdDocSource["purpose"],
  ) => {
    if (typeof urlOrPath !== "string" || !urlOrPath.trim()) return;
    const value = urlOrPath.trim();
    if (seen.has(value)) return;
    seen.add(value);
    sources.push({ urlOrPath: value, label, purpose });
  };

  pushUnique(cast?.idDocWithFaceUrl, "身分証（顔あり）", "id_with_face");
  pushUnique(cast?.idDocWithoutFaceUrl, "身分証（本籍地）", "id_without_face");
  if (Array.isArray(cast?.idPhotosWithFace)) {
    cast.idPhotosWithFace.forEach((url: unknown) =>
      pushUnique(url, "身分証（顔あり）", "id_with_face"),
    );
  }
  if (Array.isArray(cast?.idPhotosWithoutFace)) {
    cast.idPhotosWithoutFace.forEach((url: unknown) =>
      pushUnique(url, "身分証（本籍地）", "id_without_face"),
    );
  }
  return sources;
};

const resolveSignedIdDocImages = async (
  castId: string,
  sources: IdDocSource[],
): Promise<IdDocPrintImage[]> => {
  const images: IdDocPrintImage[] = [];
  for (const source of sources) {
    const raw = source.urlOrPath;
    if (isLocalPreviewUrl(raw)) {
      images.push({ url: raw, label: source.label });
      continue;
    }
    const signed = await getCastSignedPhotoUrl({
      castId,
      purpose: source.purpose,
      urlOrPath: raw,
    });
    if (signed) {
      images.push({ url: signed, label: source.label });
      continue;
    }
    if (isHttpUrl(raw)) {
      images.push({ url: raw, label: source.label });
    }
  }
  return images;
};

const buildIdDocPrintHtml = (
  items: {
    castName: string;
    castCode: string | null;
    shopName: string;
    images: IdDocPrintImage[];
  }[],
) => {
  const body = items
    .map((item) => {
      const title = `${item.castName || "キャスト"}${
        item.castCode ? `（${item.castCode}）` : ""
      } / ${item.shopName || "派遣先未設定"}`;
      const images = item.images.length
        ? item.images
            .map(
              (image) => `
                <figure class="doc">
                  <figcaption>${escapeHtml(image.label)}</figcaption>
                  <img src="${escapeHtml(image.url)}" alt="${escapeHtml(
                    image.label,
                  )}" />
                </figure>`,
            )
            .join("")
        : `<p class="empty">身分証画像が未登録です</p>`;
      return `
        <section class="card">
          <h2>${escapeHtml(title)}</h2>
          <div class="grid">${images}</div>
        </section>`;
    })
    .join("");

  return `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>身分証印刷</title>
        <style>
          @page { size: A4; margin: 12mm; }
          body { font-family: "Hiragino Sans", "Noto Sans JP", sans-serif; color: #111827; }
          h2 { font-size: 14px; margin: 0 0 8px; }
          .card { border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px; margin-bottom: 16px; break-inside: avoid; }
          .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
          .doc { margin: 0; }
          figcaption { font-size: 11px; color: #6b7280; margin-bottom: 6px; }
          img { width: 100%; height: auto; border: 1px solid #e5e7eb; border-radius: 4px; }
          .empty { font-size: 12px; color: #9ca3af; }
        </style>
      </head>
      <body>
        ${body}
        <script>
          window.addEventListener("load", () => {
            setTimeout(() => window.print(), 150);
          });
        </script>
      </body>
    </html>`;
};

type SortKey = "default" | "hourlyDesc" | "ageAsc" | "ageDesc";
type DrinkLevelOption = Exclude<DrinkLevel, null>;
type DrinkLevelFilter = "" | DrinkLevelOption;

// NG登録モード
type NgMode = "shopToCast" | "castToShop";

/** boolean/文字列から4段階の飲酒レベルに変換するヘルパー */
const mapDrinkLevel = (raw: any): DrinkLevel => {
  // すでに enum 的な文字列ならそれを優先
  if (raw === "ng" || raw === "weak" || raw === "normal" || raw === "strong") {
    return raw;
  }
  // 旧データ boolean 対応
  if (raw === true) return "normal";
  if (raw === false) return "ng";
  return null; // 未登録
};

/** 飲酒レベルを数値スコアに変換（ソート用） */
const drinkScore = (level: DrinkLevel): number => {
  switch (level) {
    case "ng":
      return 0;
    case "weak":
      return 1;
    case "normal":
      return 2;
    case "strong":
      return 3;
    default:
      return -1; // 未登録は最後寄せ
  }
};

const formatDrinkLevelShort = (level: DrinkLevel): string => {
  switch (level) {
    case "strong":
      return "強い";
    case "normal":
      return "普通";
    case "weak":
      return "弱い";
    case "ng":
      return "NG";
    default:
      return "";
  }
};

const parseDispatchOrderConditions = (
  note?: string | null,
): { wage: number | null; drinkLevel: DrinkLevel } => {
  const text = note ?? "";
  const wageMatch = text.match(/時給:\s*([\d,]+)\s*円/);
  const drinkMatch = text.match(/お酒:\s*(強い|普通|弱い|NG)/);
  const wage = wageMatch
    ? Number(wageMatch[1].replaceAll(",", ""))
    : null;
  const drinkLabel = drinkMatch?.[1] ?? "";
  const drinkLevel =
    drinkLabel === "強い"
      ? "strong"
      : drinkLabel === "普通"
        ? "normal"
        : drinkLabel === "弱い"
          ? "weak"
          : drinkLabel === "NG"
            ? "ng"
            : null;
  return {
    wage: Number.isFinite(wage) ? wage : null,
    drinkLevel,
  };
};

const getDispatchOrderMismatchWarnings = (
  cast: Cast | null,
  slotRow?: DispatchSheetRow,
): string[] => {
  if (!cast || !slotRow?.isOrderSlot) return [];
  const conditions = parseDispatchOrderConditions(slotRow.note);
  const warnings: string[] = [];

  if (
    conditions.wage != null &&
    conditions.wage > 0 &&
    cast.desiredHourly > 0 &&
    cast.desiredHourly < conditions.wage
  ) {
    warnings.push(
      `時給: オーダーは${conditions.wage.toLocaleString()}円ですが、キャスト時給は${cast.desiredHourly.toLocaleString()}円です。`,
    );
  }

  if (conditions.drinkLevel && conditions.drinkLevel !== "ng") {
    const requestedScore = drinkScore(conditions.drinkLevel);
    const castScore = drinkScore(cast.drinkLevel);
    if (castScore < requestedScore) {
      warnings.push(
        `お酒: オーダーは「${formatDrinkLevelShort(conditions.drinkLevel)}」ですが、キャストは「${formatDrinkLevelShort(cast.drinkLevel) || "未登録"}」です。`,
      );
    }
  }

  return warnings;
};

const drinkPreferencePriority = (
  castLevel: DrinkLevel,
  requestedLevel: DrinkLevelOption | "",
): number => {
  if (!requestedLevel) return 0;
  if (castLevel == null) return 4;
  if (requestedLevel === "ng") return castLevel === "ng" ? 0 : 2;
  const castScore = drinkScore(castLevel);
  const requestedScore = drinkScore(requestedLevel);
  if (requestedLevel === "strong") return castLevel === "strong" ? 0 : 3 - castScore + 1;
  return castScore >= requestedScore ? 0 : requestedScore - castScore;
};

const normalizeShopDrinkPreference = (raw: any): DrinkLevel | null => {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  if (!s) return null;
  if (s === "none" || s.includes("指定なし")) return null;
  if (s.includes("ng") || s.includes("不可") || s.includes("飲まない"))
    return "ng";
  if (s.includes("weak") || s.includes("弱")) return "weak";
  if (s.includes("normal") || s.includes("普通")) return "normal";
  if (s.includes("strong") || s.includes("強")) return "strong";
  return mapDrinkLevel(raw);
};

const formatShopDrinkLabel = (shop: Shop): string => {
  const level = normalizeShopDrinkPreference(shop.drinkPreference);
  switch (level) {
    case "ng":
      return "NG";
    case "weak":
      return "弱い";
    case "normal":
      return "普通";
    case "strong":
      return "強い";
    default:
      if (shop.requireDrinkOk) return "OKのみ";
      return "-";
  }
};

const formatContactMethodLabel = (shop: Shop): string => {
  const m = normalizeContactMethod(shop);
  if (m === "line") return "LINE";
  if (m === "sms") return "SMS";
  if (m === "tel") return "TEL";
  return "-";
};

const formatHairSetLabel = (raw?: string | null): string => {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return "-";
  if (s === "need" || s.includes("必要")) return "必要";
  if (s === "none" || s.includes("不要")) return "不要";
  return raw ?? "-";
};

const hourlyMatchScore = (
  desiredHourly: number | null | undefined,
  minHourly: number | null | undefined,
  maxHourly: number | null | undefined,
): number => {
  if (typeof desiredHourly !== "number") return 0;
  if (minHourly == null && maxHourly == null) return 0;
  const clampScore = (diff: number, span: number) =>
    Math.max(0, 1 - diff / span);

  if (minHourly != null && maxHourly != null) {
    const center = (minHourly + maxHourly) / 2;
    const halfSpan = Math.max(1, (maxHourly - minHourly) / 2);
    const diff = Math.abs(desiredHourly - center);
    return clampScore(diff, halfSpan);
  }

  if (minHourly != null) {
    const diff = Math.abs(desiredHourly - minHourly);
    return clampScore(diff, 1000);
  }

  if (maxHourly != null) {
    const diff = Math.abs(desiredHourly - maxHourly);
    return clampScore(diff, 1000);
  }

  return 0;
};

/** キャストの「番号ソート用キー」（管理番号が優先 / 数字抽出） */
const castNumberKey = (cast: Cast): number => {
  const s = cast.code ?? "";
  const m = s.match(/\d+/);
  if (!m) return 999999;
  const n = Number.parseInt(m[0], 10);
  return Number.isNaN(n) ? 999999 : n;
};

/** キャストの「50音ソート用キー」（名前ベース） */
const castKanaKey = (cast: Cast): string => {
  return getCastCardName(cast);
};

const getCastCardName = (cast: Cast): string => {
  const nickname = cast.nickname?.trim();
  if (nickname) return nickname;
  return cast.name ?? "";
};

const getPrimaryCastGenre = (cast: Cast): CastGenre | null =>
  cast.genres?.[0] ?? null;

const formatCastGenreShort = (genre?: CastGenre | ShopGenre | null): string =>
  genre ? (CAST_GENRE_LABEL as Record<string, string>)[genre] ?? "ジャンル未設定" : "ジャンル未設定";

const bucketWage = (value?: number | null): number | null => {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  const v = Math.max(0, value);
  for (const bucket of WAGE_BUCKETS) {
    if (v <= bucket) return bucket;
  }
  return WAGE_BUCKETS[WAGE_BUCKETS.length - 1] ?? null;
};

const buildWageCounts = (casts: Cast[]): Record<number, number> => {
  const counts: Record<number, number> = {};
  for (const bucket of WAGE_BUCKETS) {
    counts[bucket] = 0;
  }
  for (const cast of casts) {
    const bucket = bucketWage(cast.desiredHourly);
    if (!bucket) continue;
    counts[bucket] = (counts[bucket] ?? 0) + 1;
  }
  return counts;
};

/** 店舗の「番号ソート用キー」（codeから数字を抽出） */
const shopNumberKey = (shop: Shop): number => {
  const s = shop.code ?? "";
  const m = s.match(/\d+/);
  if (!m) return 999999;
  const n = Number.parseInt(m[0], 10);
  return Number.isNaN(n) ? 999999 : n;
};

/** 店舗の「50音ソート用キー」（店舗名ベース） */
const shopKanaKey = (shop: Shop): string => {
  return shop.name ?? "";
};

const shopFavoriteKey = (shop: Shop): number => {
  const raw = String(shop.rank ?? "").trim().toUpperCase();
  if (raw === "S") return 4;
  if (raw === "A") return 3;
  if (raw === "B") return 2;
  if (raw === "C") return 1;
  return 0;
};

const resolvePhotoUrl = (item: any): string | undefined =>
  resolveCastPhotoSource(item) ?? undefined;

const isStorageProxyPhotoUrl = (value: string): boolean => {
  if (!value) return false;
  if (value.startsWith("/api/v1/storage/object/")) return true;
  if (!isHttpUrl(value)) return false;
  try {
    const parsed = new URL(value);
    return parsed.pathname.startsWith("/api/v1/storage/object/");
  } catch {
    return false;
  }
};

const isDisplayablePhotoUrl = (value: string): boolean =>
  (isLocalPreviewUrl(value) ||
    isHttpUrl(value) ||
    value.startsWith("/")) &&
  !isStorageProxyPhotoUrl(value);

const resolveImmediateDisplayPhotoUrl = (item: any): string | undefined => {
  const raw = resolvePhotoUrl(item);
  if (!raw) return undefined;
  return isDisplayablePhotoUrl(raw) ? raw : undefined;
};

const parseWageMinFromLabel = (label?: string | null): number | null => {
  if (!label) return null;
  const m = String(label).match(/(\d{4})/);
  if (!m) return null;
  const v = Number(m[1]);
  return Number.isFinite(v) ? v : null;
};

const getCastExclusiveFlag = (item: any): boolean => {
  const direct = [
    item?.hasExclusive,
    item?.has_exclusive,
    item?.exclusive,
    item?.exclusiveFlag,
  ];
  for (const v of direct) {
    if (typeof v === "boolean") return v;
  }
  const ids = item?.exclusiveShopIds ?? item?.exclusive_shop_ids;
  if (Array.isArray(ids)) return ids.length > 0;
  if (item?.exclusiveShopId || item?.exclusive_shop_id) return true;
  if (item?.exclusiveShop) return true;
  return false;
};

const getCastExclusiveShopId = (item: any): string | null => {
  const direct =
    item?.exclusiveShopId ??
    item?.exclusive_shop_id ??
    item?.exclusiveShop?.shopId ??
    null;
  if (typeof direct === "string" && direct) return direct;
  return null;
};

const getCastNominatedFlag = (item: any): boolean => {
  const direct = [
    item?.hasNominated,
    item?.has_nominated,
    item?.nominated,
    item?.nominatedFlag,
  ];
  for (const v of direct) {
    if (typeof v === "boolean") return v;
  }
  const ids = item?.nominatedShopIds ?? item?.nominated_shop_ids;
  if (Array.isArray(ids)) return ids.length > 0;
  const shops = item?.nominatedShops ?? item?.nominated_shops;
  if (Array.isArray(shops)) return shops.length > 0;
  return false;
};

const getDrinkLevelFromDetail = (detail: any): DrinkLevel =>
  mapDrinkLevel(
    detail?.attributes?.drinkLevel ?? detail?.drinkLevel ?? detail?.drinkOk,
  );

const getCastBadgeIcons = (cast: Cast) => {
  const icons: { src: string; alt: string }[] = [];
  if (cast.drinkLevel === "strong") {
    icons.push({ src: "/img/strong.svg", alt: "飲酒: 強い" });
  } else if (cast.drinkLevel === "normal") {
    icons.push({ src: "/img/normal.svg", alt: "飲酒: 普通" });
  } else if (cast.drinkLevel === "ng") {
    icons.push({ src: "/img/nothing.svg", alt: "飲酒: NG" });
  }
  if (cast.hasExclusive) {
    icons.push({ src: "/img/senzoku.svg", alt: "専属指名あり" });
  }
  if (cast.hasNominated) {
    icons.push({ src: "/img/shimei.svg", alt: "指名あり" });
  }
  return icons;
};

const normalizeContactMethod = (shop: Shop): ContactMethodFilter => {
  const raw =
    (shop.contactMethod ??
      shop.contact_method ??
      shop.preferredContactMethod ??
      shop.preferred_contact_method ??
      shop.contact ??
      "") as string;
  const s = String(raw).toLowerCase().trim();
  if (!s) return "";
  if (s.includes("line") || s.includes("ライン")) return "line";
  if (s.includes("sms") || s.includes("ショート")) return "sms";
  if (s.includes("tel") || s.includes("phone") || s.includes("電話")) {
    return "tel";
  }
  return "";
};

const normalizeIdRequirement = (shop: Shop): string => {
  const raw =
    (shop.idDocumentRequirement ??
      shop.id_document_requirement ??
      shop.idRequirement ??
      shop.id_requirement ??
      "") as string;
  const s = String(raw).toLowerCase().trim();
  if (!s) return "";
  if (s.includes("photo_only") || s.includes("photo")) return "photo_only";
  if (s.includes("address_only") || s.includes("address")) return "address_only";
  if (s.includes("both")) return "both";
  if (s.includes("none")) return "none";
  return s;
};

const hasExclusive = (shop: Shop): boolean => {
  const candidates = [
    shop.fixedCastCount,
    shop.fixed_cast_count,
    shop.exclusiveCount,
    shop.exclusive_count,
    shop.hasFixedCasts,
    shop.has_fixed_casts,
    shop.hasExclusive,
    shop.has_exclusive,
  ];
  for (const c of candidates) {
    if (typeof c === "number") return c > 0;
    if (typeof c === "boolean") return c;
  }
  const arrCandidates = [
    shop.fixedCasts,
    shop.fixed_casts,
    shop.exclusiveCasts,
    shop.exclusive_casts,
  ];
  for (const a of arrCandidates) {
    if (Array.isArray(a)) return a.length > 0;
  }
  return false;
};

const hasNominated = (shop: Shop): boolean => {
  const candidates = [
    shop.nominatedCastCount,
    shop.nominated_cast_count,
    shop.nominationCount,
    shop.nomination_count,
    shop.hasNominatedCasts,
    shop.has_nominated_casts,
    shop.hasNomination,
    shop.has_nomination,
  ];
  for (const c of candidates) {
    if (typeof c === "number") return c > 0;
    if (typeof c === "boolean") return c;
  }
  const arrCandidates = [
    shop.nominatedCasts,
    shop.nominated_casts,
    shop.nominations,
    shop.nomination_ids,
  ];
  for (const a of arrCandidates) {
    if (Array.isArray(a)) return a.length > 0;
  }
  return false;
};

/** キャストのジャンルラベル */
const CAST_GENRE_LABEL: Record<CastGenre, string> = {
  club: "クラブ",
  cabaret: "キャバ",
  snack: "スナック",
  gb: "ガルバ",
};

/** 店舗ジャンルラベル */
const SHOP_GENRE_LABEL: Record<ShopGenre, string> = {
  club: "クラブ",
  cabaret: "キャバ",
  snack: "スナック",
  gb: "ガルバ",
};

const normalizeCastGenre = (raw: string): CastGenre | null => {
  const s = String(raw).trim().toLowerCase();
  if (!s) return null;
  if (s === "club" || s.includes("クラブ")) return "club";
  if (s === "cabaret" || s.includes("キャバ")) return "cabaret";
  if (s === "snack" || s.includes("スナック")) return "snack";
  if (s === "gb" || s.includes("ガルバ") || s.includes("ガールズ"))
    return "gb";
  return null;
};

const getGenresFromDetail = (detail: any): CastGenre[] => {
  const raw =
    detail?.background?.genres ??
    detail?.cast_background?.[0]?.genres ??
    detail?.genres ??
    detail?.genre;
  const list: string[] = [];
  if (Array.isArray(raw)) {
    for (const v of raw) {
      if (typeof v === "string" && v.trim()) list.push(v);
    }
  } else if (typeof raw === "string") {
    list.push(...raw.split(/[、,]/g));
  }
  const normalized = list
    .map((v) => normalizeCastGenre(v))
    .filter(Boolean) as CastGenre[];
  return Array.from(new Set(normalized));
};

const getHeightFromDetail = (detail: any): number | null => {
  const raw =
    detail?.attributes?.heightCm ??
    detail?.heightCm ??
    detail?.height_cm ??
    null;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
};

const getBodyTypeFromDetail = (detail: any): string | null => {
  const raw =
    detail?.attributes?.bodyType ??
    detail?.bodyType ??
    detail?.body_type ??
    null;
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  return s ? s : null;
};

const normalizeBodyType = (raw?: string | null): string => {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return "";
  if (s.includes("細") || s.includes("スリム")) return "slim";
  if (s.includes("標準") || s.includes("普通")) return "normal";
  if (s.includes("ぽっちゃり") || s.includes("太") || s.includes("ふくよか"))
    return "plus";
  return s;
};

const parseHeightRange = (
  raw?: string | null,
): { min: number | null; max: number | null } => {
  if (!raw) return { min: null, max: null };
  const s = String(raw);
  const nums = (s.match(/\d{2,3}/g) ?? [])
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v));
  if (nums.length === 0) return { min: null, max: null };
  if (s.includes("以上")) return { min: nums[0], max: null };
  if (s.includes("以下")) return { min: null, max: nums[0] };
  if (nums.length === 1) return { min: nums[0], max: nums[0] };
  return { min: Math.min(nums[0], nums[1]), max: Math.max(nums[0], nums[1]) };
};

const heightMatchScore = (
  height: number | null | undefined,
  range: { min: number | null; max: number | null },
): number => {
  if (!height || (!range.min && !range.max)) return 0;
  if (
    range.min != null &&
    range.max != null &&
    height >= range.min &&
    height <= range.max
  ) {
    return 1;
  }
  let diff = 0;
  if (range.min != null && height < range.min) {
    diff = range.min - height;
  } else if (range.max != null && height > range.max) {
    diff = height - range.max;
  } else {
    return 0;
  }
  return Math.max(0, 1 - diff / 20);
};

/** 年齢レンジ判定 */
const isInAgeRange = (age: number, range: AgeRangeFilter): boolean => {
  if (!range) return true;
  if (!age || age <= 0) return false;

  switch (range) {
    case "18-19":
      return age >= 18 && age <= 19;
    case "20-24":
      return age >= 20 && age <= 24;
    case "25-29":
      return age >= 25 && age <= 29;
    case "30-34":
      return age >= 30 && age <= 34;
    case "35-39":
      return age >= 35 && age <= 39;
    case "40-49":
      return age >= 40 && age <= 49;
    case "50-":
      return age >= 50;
    default:
      return true;
  }
};

const isDormantCast = (cast: Cast): boolean => {
  const status = (
    cast.lifecycleStatus ??
    cast.activityStatus ??
    cast.status ??
    ""
  ).toLowerCase();
  return status === "dormant" || status === "inactive" || status === "休眠";
};

const isActiveCast = (cast: Cast): boolean => !isDormantCast(cast);

const getShopNgFlags = (
  cast: Cast,
  shopId: string | null | undefined,
  shopNgSet?: Set<string>,
): { shopNg: boolean; castNg: boolean } => ({
  shopNg: Boolean(shopId && shopNgSet?.has(cast.id)),
  castNg: Boolean(shopId && cast.ngShopIds?.includes(shopId)),
});

const getShopNgBlockMessages = (
  cast: Cast,
  shopId: string | null | undefined,
  shopNgSet?: Set<string>,
): string[] => {
  const flags = getShopNgFlags(cast, shopId, shopNgSet);
  const messages: string[] = [];
  if (flags.shopNg) {
    messages.push("店舗側でこのキャストがNG登録されています。");
  }
  if (flags.castNg) {
    messages.push("キャスト側でこの店舗がNG登録されています。");
  }
  return messages;
};

/** 店舗条件を元に「この店舗にマッチするキャストか？」を判定 */
const matchesShopConditions = (
  cast: Cast,
  shop: Shop | null,
  _shopNgSet?: Set<string>,
  shopFixedSet?: Set<string>,
): boolean => {
  if (!shop) return true;
  if (cast.hasExclusive && shopFixedSet && !shopFixedSet.has(cast.id))
    return false;
  return true;
};

const calcMatchScore = (
  cast: Cast,
  shop: Shop | null,
  shopDetail: ShopDetail | null,
  settings: MatchingSettings,
): number => {
  if (!shop) return 0;

  const shopGenre = shopDetail?.genre ?? shop.genre ?? null;
  const shopDrink = normalizeShopDrinkPreference(
    shopDetail?.dailyOrder?.drink ??
      shopDetail?.drinkPreference ??
      shop.drinkPreference ??
      null,
  );
  const shopHeightRaw =
    shopDetail?.dailyOrder?.height ?? shopDetail?.height ?? null;
  const shopBodyRaw =
    shopDetail?.dailyOrder?.bodyType ?? shopDetail?.bodyType ?? null;

  if (settings.enableDrink && shop.requireDrinkOk) {
    if (cast.drinkLevel === "ng") return -1_000_000;
  }

  let total = 0;

  if (settings.enableGenre && shopGenre) {
    const match = cast.genres?.includes(shopGenre) ? 1 : 0;
    total += settings.weightGenre * match;
  }

  if (settings.enableHourly) {
    total +=
      settings.weightHourly *
      hourlyMatchScore(cast.desiredHourly, shop.minHourly, shop.maxHourly);
  }

  if (settings.enableDrink) {
    if (shop.requireDrinkOk) {
      const rankScore = Math.max(0, drinkScore(cast.drinkLevel)) / 3;
      total += settings.weightDrink * rankScore;
    } else if (shopDrink) {
      const diff = Math.abs(
        drinkScore(cast.drinkLevel) - drinkScore(shopDrink),
      );
      const score = Math.max(0, 1 - diff / 3);
      total += settings.weightDrink * score;
    }
  }

  if (settings.enableHeight) {
    const range = parseHeightRange(shopHeightRaw);
    total += settings.weightHeight * heightMatchScore(cast.heightCm, range);
  }

  if (settings.enableBodyType) {
    const shopBody = normalizeBodyType(shopBodyRaw);
    const castBody = normalizeBodyType(cast.bodyType ?? null);
    const score = shopBody && castBody && shopBody === castBody ? 1 : 0;
    total += settings.weightBodyType * score;
  }

  return total;
};

export default function Page() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pickMode = searchParams?.get("pick") === "1";
  const debugMatchingCard = searchParams?.get("debugMatchingCard") === "1";
  const pickReturnTo = searchParams?.get("return") || "/assignments";
  const pickShopId = searchParams?.get("shopId") || "";
  const pickOrderId = searchParams?.get("orderId") || "";
  const pickOrderStartTime = searchParams?.get("orderStartTime") || "";
  const initialTab = searchParams?.get("tab");
  // 本日出勤キャスト一覧（/casts/today）
  const [todayCasts, setTodayCasts] = useState<Cast[]>([]);
  // 全キャスト（シフトに関係なく /casts から取得）
  const [allCasts, setAllCasts] = useState<Cast[]>([]);
  const [matchedCastIds, setMatchedCastIds] = useState<Set<string>>(
    () => new Set<string>(),
  );
  const [matchingSettings, setMatchingSettings] =
    useState<MatchingSettings | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsDraft, setSettingsDraft] =
    useState<MatchingSettings | null>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  // 本日分の店舗（スケジュールAPI連携）
  const [todayShops, setTodayShops] = useState<Shop[]>([]);
  const [fallbackShops, setFallbackShops] = useState<Shop[]>([]);

  const [staged, setStaged] = useState<Cast[]>([]);
  const [selectedShopId, setSelectedShopId] = useState<string>("");
  const [selectedShopDetail, setSelectedShopDetail] =
    useState<ShopDetail | null>(null);
  const [selectedShopNgCastIds, setSelectedShopNgCastIds] = useState<string[]>(
    [],
  );
  const [shopNgCastIdsByShopId, setShopNgCastIdsByShopId] = useState<
    Record<string, string[]>
  >({});
  const [selectedShopFixedCastIds, setSelectedShopFixedCastIds] = useState<
    string[]
  >([]);
  const exclusiveSyncRef = useRef<Set<string>>(new Set());
  const [keyword, setKeyword] = useState("");
  const [担当者, set担当者] = useState<string>("all");
  const [currentStaffName, setCurrentStaffName] = useState<string>("");
  const [staffAccounts, setStaffAccounts] = useState<StaffUser[]>([]);
  const [dispatchStatusFilter, setDispatchStatusFilter] =
    useState<DispatchStatusFilter>("");
  const [statusTab, setStatusTab] = useState<CastStatusTab>("all");
  const [castListMode, setCastListMode] =
    useState<CastListMode>("proposal");
  const [supportMode, setSupportMode] = useState(false);

  // 既存ソート（年齢・時給など）
  const [sortKey, setSortKey] = useState<SortKey>("default");
  const [drinkLevelFilter, setDrinkLevelFilter] =
    useState<DrinkLevelFilter>("");

  // 追加: 複数選択可能な並び順（50音順 / 番号小さい順 / 番号大きい順）
  const [sortKana, setSortKana] = useState<boolean>(false);
  const [sortNumberSmallFirst, setSortNumberSmallFirst] =
    useState<boolean>(false);
  const [sortNumberLargeFirst, setSortNumberLargeFirst] =
    useState<boolean>(false);

  // 追加: キャストジャンル・年齢レンジでの絞り込み
  const [castGenreFilter, setCastGenreFilter] = useState<CastGenre | "">("");
  const [ageRangeFilter, setAgeRangeFilter] = useState<AgeRangeFilter>("");
  const [castWageFilter, setCastWageFilter] = useState<WageFilter>("");
  const [castNominationFilter, setCastNominationFilter] =
    useState<CastNominationFilter>("");

  const [currentPage, setCurrentPage] = useState<number>(1);

  // ローディング・エラー表示用
  const [loading, setLoading] = useState(true);
  const [cancelDialogRow, setCancelDialogRow] =
    useState<DispatchSheetRow | null>(null);
  const [cancelDialogType, setCancelDialogType] =
    useState<DispatchCancelType>("cast");
  const [cancelDialogReason, setCancelDialogReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  // 店舗選択モーダル用
  const [shopModalOpen, setShopModalOpen] = useState(false);
  const [shopSearch, setShopSearch] = useState("");
  const [dispatchRows, setDispatchRows] = useState<DispatchSheetRow[]>([]);
  const [dispatchShops, setDispatchShops] = useState<DispatchSheetShop[]>([]);
  const [dispatchLoading, setDispatchLoading] = useState(false);
  const [dispatchSavingKey, setDispatchSavingKey] = useState<string | null>(
    null,
  );
  const [dispatchShopPickerCastId, setDispatchShopPickerCastId] = useState<
    string | null
  >(null);
  const [dispatchShopQuery, setDispatchShopQuery] = useState("");
  const [dispatchOwnerFilter, setDispatchOwnerFilter] = useState("");
  const [dispatchGenreFilter, setDispatchGenreFilter] = useState("");
  const [idDocPrintOpen, setIdDocPrintOpen] = useState(false);
  const [idDocPrintLoading, setIdDocPrintLoading] = useState(false);
  const [idDocPrinting, setIdDocPrinting] = useState(false);
  const [idDocPrintMode, setIdDocPrintMode] =
    useState<IdDocPrintMode>("shop_required");
  const [idDocPrintTargets, setIdDocPrintTargets] = useState<
    IdDocPrintTarget[]
  >([]);
  const [selectedIdDocPrintKeys, setSelectedIdDocPrintKeys] = useState<
    string[]
  >([]);
  const [attendanceRequests, setAttendanceRequests] = useState<
    AttendanceRequestItem[]
  >([]);
  const [attendanceRequestFilter, setAttendanceRequestFilter] =
    useState<AttendanceRequestFilter>("");
  const [pendingDispatchSlotIndex, setPendingDispatchSlotIndex] = useState<
    number | null
  >(null);
  const [dragOverDispatchSlotIndex, setDragOverDispatchSlotIndex] = useState<
    number | null
  >(null);
  const [proposalOrderHeadcount, setProposalOrderHeadcount] =
    useState<number>(1);
  const [proposalOrderWage, setProposalOrderWage] = useState<WageFilter>("");
  const [proposalOrderAlcohol, setProposalOrderAlcohol] = useState<
    DrinkLevelOption | ""
  >("");
  const [proposalOrderHairSet, setProposalOrderHairSet] = useState("");
  const [proposalOrderSaving, setProposalOrderSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    void getCurrentUser()
      .then((user) => {
        if (!mounted) return;
        const staffName = user.staffName?.trim() ?? "";
        setCurrentStaffName(staffName);
      })
      .catch(() => {
        if (typeof window === "undefined" || !mounted) return;
        const storedStaff = localStorage.getItem("tiara:staff_name") ?? "";
        setCurrentStaffName(storedStaff);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    listStaffs()
      .then((items) => {
        if (mounted) setStaffAccounts(items);
      })
      .catch((err) => {
        console.warn("[casts/today] failed to load staffs", err);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // キャスト詳細モーダル用
  const [castDetailModalOpen, setCastDetailModalOpen] = useState(false);
  const [selectedCast, setSelectedCast] = useState<Cast | null>(null);
  const [castDetailSource, setCastDetailSource] = useState<
    "cast-list" | "dispatch-sheet"
  >("cast-list");
  const [chatDraft, setChatDraft] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [bulkRequestSending, setBulkRequestSending] = useState(false);
  const [bulkRequestModalOpen, setBulkRequestModalOpen] = useState(false);
  const [bulkRequestDraft, setBulkRequestDraft] = useState("");
  const [chatDisabledUntil, setChatDisabledUntil] = useState<Date | null>(null);
  const chatTemplateStorageKey = "tiara:matching-chat-templates:v1";
  const defaultChatTemplates = useMemo(
    () => ({
      request:
        "お疲れ様です。本日の出勤をお願いできないでしょうか？",
      confirm:
        "お疲れ様です。本日は出勤予定となっていますが出勤時間に変更等はないでしょうか？",
    }),
    [],
  );
  const [chatTemplates, setChatTemplates] = useState<{
    request: string;
    confirm: string;
  }>(defaultChatTemplates);
  const [chatTemplateEditOpen, setChatTemplateEditOpen] = useState(false);
  const [chatTemplateEditingKey, setChatTemplateEditingKey] = useState<
    "request" | "confirm"
  >("request");
  const [chatTemplateDraft, setChatTemplateDraft] = useState("");
  const chatTemplateLongPressTimerRef = useRef<number | null>(null);
  const chatTemplateLongPressFiredRef = useRef(false);

  // NG登録モーダル用
  const [ngModalOpen, setNgModalOpen] = useState(false);
  const [ngMode, setNgMode] = useState<NgMode>("shopToCast");
  const [ngFilterGenre, setNgFilterGenre] = useState<ShopGenre | "">("");
  const [ngFilterName, setNgFilterName] = useState("");
  const [ngFilterCode, setNgFilterCode] = useState("");
  const [ngSortKey, setNgSortKey] = useState<"number" | "kana">("number");
  const [ngSelectedShopIds, setNgSelectedShopIds] = useState<string[]>([]);

  const [panelTab, setPanelTab] = useState<"casts" | "shops">("casts");
  const [shopSortKey, setShopSortKey] = useState<ShopSortKey>("number");
  const [floatPos, setFloatPos] = useState<{ x: number; y: number } | null>(
    null,
  );
  useEffect(() => {
    if (pickMode) {
      setPanelTab("casts");
      return;
    }
    if (initialTab === "casts" || initialTab === "shops") {
      setPanelTab(initialTab);
    }
  }, [pickMode, initialTab]);
  const [dragging, setDragging] = useState(false);
  const [castCardDragging, setCastCardDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const [floatMinimized, setFloatMinimized] = useState(true);
  const [floatZ, setFloatZ] = useState(40);
  const [dispatchCount, setDispatchCount] = useState<string>("1");
  const [entryTime, setEntryTime] = useState<string>("00:00");
  const [orderItems, setOrderItems] = useState<
    {
      id: string;
      name: string;
      detail: string;
      shopId?: string;
      headcount?: number;
      startTime?: string;
      apiOrderId?: string | null;
    }[]
  >([]);
  const [orderAssignments, setOrderAssignments] = useState<
    Record<string, Cast[]>
  >({});
  const [photoByCastId, setPhotoByCastId] = useState<Record<string, string>>(
    {},
  );
  const [photoFallbackByCastId, setPhotoFallbackByCastId] = useState<Record<string, string>>(
    {},
  );
  const [castDetailById, setCastDetailById] = useState<Record<string, any>>(
    {},
  );
  const castDetailFetchRef = useRef<Set<string>>(new Set());
  const photoCacheSaveTimer = useRef<number | null>(null);
  const prefetchedImageUrlsRef = useRef<Set<string>>(new Set());
  const [orderSelectOpen, setOrderSelectOpen] = useState(false);
  const [pendingCast, setPendingCast] = useState<Cast | null>(null);
  const [confirmOrderSelectOpen, setConfirmOrderSelectOpen] = useState(false);
  const [confirmOrderCandidates, setConfirmOrderCandidates] = useState<
    { id: string; name: string; detail: string; shopId?: string }[]
  >([]);
  const [rejectOrderSelectOpen, setRejectOrderSelectOpen] = useState(false);
  const [rejectOrderCandidates, setRejectOrderCandidates] = useState<
    { id: string; name: string; detail: string; shopId?: string }[]
  >([]);
  const [missingOrderConfirmOpen, setMissingOrderConfirmOpen] = useState(false);
  const [missingOrderTargetId, setMissingOrderTargetId] = useState<string | null>(
    null,
  );
  const orderSeqRef = useRef(1);
  const [orderShopQuery, setOrderShopQuery] = useState<string>("");
  const [orderShopOpen, setOrderShopOpen] = useState(false);
  const [orderShopActiveIndex, setOrderShopActiveIndex] = useState(0);
  const lastEditingShopIdRef = useRef<string>("");
  const [shopFilterExclusive, setShopFilterExclusive] = useState<YesNoFilter>(
    "",
  );
  const [shopFilterNominated, setShopFilterNominated] = useState<YesNoFilter>(
    "",
  );
  const [shopFilterWage, setShopFilterWage] = useState<WageFilter>("");
  const [shopFilterIdReq, setShopFilterIdReq] = useState<string>("");
  const [shopFilterGenre, setShopFilterGenre] = useState<ShopGenre | "">("");
  const [shopFilterContact, setShopFilterContact] =
    useState<ContactMethodFilter>("");

  const [buildStamp, setBuildStamp] = useState("");
  const printDateLabel = useMemo(() => formatJapaneseDate(todayKey()), []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setBuildStamp(new Date().toLocaleString());
  }, []);

  const loadDispatchSheet = useCallback(async () => {
    try {
      setDispatchLoading(true);
      const [res, requests] = await Promise.all([
        getDispatchSheet(todayKey()),
        getAttendanceRequests(todayKey()),
      ]);
      setDispatchRows(res.rows ?? []);
      setDispatchShops(res.shops ?? []);
      setAttendanceRequests(requests.items ?? []);
    } catch (err) {
      console.warn("[casts/today] failed to load dispatch sheet", err);
      setDispatchRows([]);
      setDispatchShops([]);
      setAttendanceRequests([]);
    } finally {
      setDispatchLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDispatchSheet();
  }, [loadDispatchSheet]);

  useEffect(() => {
    return subscribeDispatchSheetUpdates(() => {
      void loadDispatchSheet();
    });
  }, [loadDispatchSheet]);

  useEffect(() => {
    return subscribeAttendanceRequestUpdates(() => {
      void loadDispatchSheet();
    });
  }, [loadDispatchSheet]);

  const formatMatchingDebugValue = useCallback((value: unknown): string => {
    if (value == null) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    if (Array.isArray(value)) {
      return JSON.stringify(value);
    }
    if (typeof value === "object") {
      const record = value as Record<string, unknown>;
      const summary = {
        keys: Object.keys(record),
        id:
          record.id ??
          record.userId ??
          record.castId ??
          record.managementNumber ??
          null,
        photoUrl:
          typeof record.photoUrl === "string" ? record.photoUrl : undefined,
        photoUrlRaw:
          typeof record.photoUrlRaw === "string" ? record.photoUrlRaw : undefined,
        profilePhotoUrl:
          typeof record.profilePhotoUrl === "string"
            ? record.profilePhotoUrl
            : undefined,
        profilePhotoUrlRaw:
          typeof record.profilePhotoUrlRaw === "string"
            ? record.profilePhotoUrlRaw
            : undefined,
      };
      return JSON.stringify(summary);
    }
    return String(value);
  }, []);

  const renderMatchingPhotoDebug = useCallback(
    (
      scope: string,
      payload: {
        id?: string | null;
        castId?: string | null;
        userId?: string | null;
        photoUrl?: string | null;
        photoUrlRaw?: string | null;
        mapPhotoUrl?: string | null;
        mapPhotoFallback?: string | null;
        detail?: unknown;
        detailDisplayUrl?: string | null;
        detailFallbackUrl?: string | null;
        finalSrc?: string | null;
        finalFallbackSrc?: string | null;
      },
    ) => {
      if (!debugMatchingCard) return null;
      return (
        <div className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-[10px] leading-tight text-amber-950">
          <div className="font-semibold">debug: {scope}</div>
          <pre className="mt-1 whitespace-pre-wrap break-all">
            {[
              `id=${formatMatchingDebugValue(payload.id)}`,
              `castId=${formatMatchingDebugValue(payload.castId)}`,
              `userId=${formatMatchingDebugValue(payload.userId)}`,
              `cast.photoUrl=${formatMatchingDebugValue(payload.photoUrl)}`,
              `cast.photoUrlRaw=${formatMatchingDebugValue(payload.photoUrlRaw)}`,
              `photoByCastId=${formatMatchingDebugValue(payload.mapPhotoUrl)}`,
              `photoFallbackByCastId=${formatMatchingDebugValue(payload.mapPhotoFallback)}`,
              `castDetailById=${formatMatchingDebugValue(payload.detail)}`,
              `detailDisplay=${formatMatchingDebugValue(payload.detailDisplayUrl)}`,
              `detailFallback=${formatMatchingDebugValue(payload.detailFallbackUrl)}`,
              `finalSrc=${formatMatchingDebugValue(payload.finalSrc)}`,
              `finalFallbackSrc=${formatMatchingDebugValue(payload.finalFallbackSrc)}`,
            ].join("\n")}
          </pre>
        </div>
      );
    },
    [debugMatchingCard, formatMatchingDebugValue],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(chatTemplateStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<typeof chatTemplates>;
      setChatTemplates((prev) => ({
        ...prev,
        ...Object.fromEntries(
          Object.entries(parsed).filter(([, value]) => typeof value === "string"),
        ),
      }));
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        chatTemplateStorageKey,
        JSON.stringify(chatTemplates),
      );
    } catch {}
  }, [chatTemplates, chatTemplateStorageKey]);


  useEffect(() => {
    // signed URL は短TTLのため永続キャッシュしない
    if (typeof window === "undefined") return;
    return () => {
      if (photoCacheSaveTimer.current) {
        window.clearTimeout(photoCacheSaveTimer.current);
      }
    };
  }, []);

  const shopTableColumns = [
    { key: "code", label: "店舗番号", width: "50px" },
    { key: "name", label: "店舗", width: "140px" },
    { key: "tel", label: "TEL", width: "100px" },
    { key: "hourly", label: "時給", width: "90px" },
    { key: "genre", label: "ジャンル", width: "90px" },
    { key: "drink", label: "お酒", width: "70px" },
    { key: "body", label: "体系", width: "70px" },
    { key: "hair", label: "ヘアセット", width: "80px" },
    { key: "notes", label: "注意点", width: "100px" },
    { key: "owner", label: "担当", width: "80px" },
    { key: "contact", label: "連絡方法", width: "90px" },
    { key: "contacted", label: "連絡済", width: "80px" },
  ] as const;

  const formatContactStatus = (status?: string | null) => {
    switch (status) {
      case "editing":
        return "入力中";
      case "ordered":
      case "confirmed":
      case "rejected":
        return "完了";
      default:
        return "-";
    }
  };

  const isClosedContactStatus = (status?: string | null) =>
    status === "ordered" || status === "rejected" || status === "confirmed";

  const renderShopCell = (
    shop: Shop,
    key: (typeof shopTableColumns)[number]["key"],
  ) => {
    switch (key) {
      case "code":
        return shop.code || "-";
      case "name":
        return shop.name || "-";
      case "tel":
        return shop.phone || "-";
      case "hourly": {
        if (shop.wageLabel) return shop.wageLabel;
        const min = shop.minHourly != null ? `¥${shop.minHourly.toLocaleString()}` : "";
        const max = shop.maxHourly != null ? `¥${shop.maxHourly.toLocaleString()}` : "";
        if (min && max) return `${min}〜${max}`;
        if (min) return `${min}〜`;
        if (max) return `〜${max}`;
        return "-";
      }
      case "genre":
        return shop.genre ? SHOP_GENRE_LABEL[shop.genre] : "-";
      case "drink":
        return formatShopDrinkLabel(shop);
      case "body":
        return shop.bodyType || "-";
      case "hair":
        return formatHairSetLabel(shop.hairSet);
      case "notes":
        return shop.caution || "-";
      case "owner":
        return shop.ownerStaff || "-";
      case "contact":
        return formatContactMethodLabel(shop);
      case "contacted":
        return formatContactStatus(shop.contactStatus);
      default:
        return "-";
    }
  };

  // ★ スケジュールで登録された「本日分の店舗」をロード（無ければ空配列）
  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;

    const run = async () => {
      try {
        const today = todayKey();
        const reqs: ScheduleShopRequest[] =
          await loadScheduleShopRequests(today);

        if (cancelled) return;

        const shops: Shop[] = reqs.map((req) => ({
          id: req.shopId ?? req.id, // shopId(UUID) を優先
          requestId: req.id,
          code: req.code,
          name: req.name,
          minHourly: req.minHourly,
          maxHourly: req.maxHourly,
          minAge: req.minAge,
          maxAge: req.maxAge,
          requireDrinkOk: req.requireDrinkOk,
          contactStatus: req.contactStatus ?? null,
          // もしスケジュール側に genre があれば取り込む（無ければ undefined）
          genre: (req as any).genre ?? null,
        }));
        setTodayShops(shops);
      } catch (e) {
        console.error("failed to load today shops from schedule", e);
        if (!cancelled) {
          setTodayShops([]);
        }
      }
    };

    void run();
    timer = window.setInterval(run, 15000);

    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const res = await listShops({ limit: 10_000 });
        if (cancelled) return;
        const items = (res.items ?? []).map((shop) => ({
          ...shop,
          id: shop.id,
          code: shop.shopNumber ?? shop.id,
          name: shop.name ?? "",
          nameKana: shop.nameKana ?? shop.kana ?? null,
          genre: shop.genre ?? null,
          phone:
            shop.phone ??
            (shop as any).tel ??
            (shop as any).telephone ??
            null,
          contactMethod:
            (shop as any).contactMethod ??
            (shop as any).contact_method ??
            (shop as any).preferredContactMethod ??
            (shop as any).preferred_contact_method ??
            null,
          drinkPreference:
            (shop as any).drinkPreference ??
            (shop as any).drink_preference ??
            null,
          wageLabel: (shop as any).wageLabel ?? (shop as any).wage_label ?? null,
          idDocumentRequirement:
            (shop as any).idDocumentRequirement ??
            (shop as any).id_document_requirement ??
            null,
          bodyType:
            (shop as any).bodyType ??
            (shop as any).body_type ??
            (shop as any).dailyOrder?.bodyType ??
            (shop as any).dailyOrder?.body_type ??
            null,
          hairSet:
            (shop as any).hairSet ??
            (shop as any).hair_set ??
            (shop as any).dailyOrder?.hairSet ??
            (shop as any).dailyOrder?.hair_set ??
            null,
          caution:
            (shop as any).caution ??
            (shop as any).note ??
            (shop as any).notes ??
            null,
          ownerStaff:
            (shop as any).ownerStaff ??
            (shop as any).owner_staff ??
            (shop as any).staff ??
            null,
        })) as Shop[];
        setFallbackShops(items);
      } catch {
        if (!cancelled) setFallbackShops([]);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const effectiveShops = useMemo(() => {
    const dispatchShopMetaById = new Map(
      dispatchShops.map((shop) => [
        shop.id,
        {
          fixedCastCount: shop.fixedCastCount,
          fixed_cast_count: shop.fixed_cast_count,
          hasFixedCasts: shop.hasFixedCasts,
          has_fixed_casts: shop.has_fixed_casts,
          exclusiveCount: shop.exclusiveCount,
          exclusive_count: shop.exclusive_count,
          hasExclusive: shop.hasExclusive,
          has_exclusive: shop.has_exclusive,
          nominatedCastCount: shop.nominatedCastCount,
          nominated_cast_count: shop.nominated_cast_count,
          hasNominatedCasts: shop.hasNominatedCasts,
          has_nominated_casts: shop.has_nominated_casts,
          nominationCount: shop.nominationCount,
          nomination_count: shop.nomination_count,
          hasNomination: shop.hasNomination,
          has_nomination: shop.has_nomination,
        },
      ]),
    );
    const shopsWithDispatchMeta = fallbackShops.map((shop) => {
      const meta = dispatchShopMetaById.get(shop.id);
      return meta ? { ...shop, ...meta } : shop;
    });
    if (todayShops.length === 0) return shopsWithDispatchMeta;
    const statusByShop = new Map(
      todayShops.map((shop) => [
        shop.id,
        { contactStatus: shop.contactStatus ?? null, requestId: shop.requestId },
      ]),
    );
    return shopsWithDispatchMeta.map((shop) => {
      const match = statusByShop.get(shop.id);
      return match
        ? {
            ...shop,
            contactStatus: match.contactStatus ?? shop.contactStatus ?? null,
            requestId: match.requestId ?? shop.requestId,
          }
        : shop;
    });
  }, [dispatchShops, fallbackShops, todayShops]);

  const selectedShop = useMemo(
    () => effectiveShops.find((s: Shop) => s.id === selectedShopId) ?? null,
    [effectiveShops, selectedShopId],
  );

  const selectedShopNgCastIdSet = useMemo(
    () => new Set(selectedShopNgCastIds),
    [selectedShopNgCastIds],
  );

  const exclusiveFixedCastIds = useMemo(() => {
    if (!selectedShopId) return [];
    return allCasts
      .filter((c) => c.exclusiveShopId === selectedShopId)
      .map((c) => c.id);
  }, [allCasts, selectedShopId]);

  const selectedShopFixedCastIdSet = useMemo(
    () => new Set([...selectedShopFixedCastIds, ...exclusiveFixedCastIds]),
    [selectedShopFixedCastIds, exclusiveFixedCastIds],
  );

  const effectiveMatchingSettings =
    matchingSettings ?? DEFAULT_MATCHING_SETTINGS;

  useEffect(() => {
    const prev = lastEditingShopIdRef.current;
    if (prev && prev !== selectedShopId) {
      void setContactStatus(prev, null);
    }
    if (selectedShopId) {
      void setContactStatus(selectedShopId, "editing");
    }
    lastEditingShopIdRef.current = selectedShopId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedShopId]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const settings = await getMatchingSettings();
        if (!cancelled) setMatchingSettings(settings);
      } catch (e) {
        console.warn("[casts/today] matching settings load failed", e);
        if (!cancelled) setMatchingSettings(DEFAULT_MATCHING_SETTINGS);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!selectedShopId) {
      setSelectedShopDetail(null);
      setSelectedShopNgCastIds([]);
      setSelectedShopFixedCastIds([]);
      return;
    }

    const run = async () => {
      try {
        const [detail, ngCasts, fixedCasts] = await Promise.all([
          getShop(selectedShopId),
          listShopNgCasts(selectedShopId),
          listShopFixedCasts(selectedShopId),
        ]);
        if (cancelled) return;
        const ngCastIds = (ngCasts ?? [])
          .map((row) => row.castId ?? row.cast?.userId ?? "")
          .filter((id) => id);
        setSelectedShopDetail(detail);
        setSelectedShopNgCastIds(ngCastIds);
        setShopNgCastIdsByShopId((prev) => ({
          ...prev,
          [selectedShopId]: ngCastIds,
        }));
        setSelectedShopFixedCastIds(
          (fixedCasts ?? [])
            .map((row) => row.castId ?? row.cast?.userId ?? "")
            .filter((id) => id),
        );
      } catch (e) {
        console.warn("[casts/today] failed to load shop detail/ng/fixed", e);
        if (!cancelled) {
          setSelectedShopDetail(null);
          setSelectedShopNgCastIds([]);
          setSelectedShopFixedCastIds([]);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [selectedShopId]);

  useEffect(() => {
    if (!selectedShopId) return;
    if (exclusiveFixedCastIds.length === 0) return;

    const missing = exclusiveFixedCastIds.filter(
      (id) => !selectedShopFixedCastIdSet.has(id),
    );
    const toSync = missing.filter((id) => {
      const key = `${selectedShopId}:${id}`;
      if (exclusiveSyncRef.current.has(key)) return false;
      exclusiveSyncRef.current.add(key);
      return true;
    });
    if (toSync.length === 0) return;

    void Promise.allSettled(
      toSync.map((castId) =>
        upsertShopFixedCast(selectedShopId, { castId }),
      ),
    ).then((results) => {
      const succeeded = toSync.filter(
        (_, idx) => results[idx]?.status === "fulfilled",
      );
      if (succeeded.length === 0) return;
      setSelectedShopFixedCastIds((prev) => {
        const merged = new Set(prev);
        for (const id of succeeded) merged.add(id);
        return Array.from(merged);
      });
    });
  }, [
    selectedShopId,
    exclusiveFixedCastIds,
    selectedShopFixedCastIdSet,
  ]);

  // ★ 初回マウント時に /casts/today と /casts を叩いてキャスト一覧を取得
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        setLoading(true);
        setError(null);

        const [todayResp, allResp] = await Promise.all([
          listTodayCasts(),
          fetchCastList({ limit: 10_000 }),
        ]);

        if (cancelled) return;

        const allPhotoMap = new Map<string, string | undefined>(
          (allResp.items ?? []).map((item: any) => [
            item.userId ?? item.id ?? "",
            resolveImmediateDisplayPhotoUrl(item),
          ]),
        );
        const allPhotoFallbackMap = new Map<string, string | undefined>(
          (allResp.items ?? []).map((item: any) => [
            item.userId ?? item.id ?? "",
            resolveLegacyPhotoFallbackUrl(item) ?? undefined,
          ]),
        );

        // 本日出勤キャスト
        const todayList: Cast[] = todayResp.items.map((item) => ({
          id: item.castId,
          code: item.managementNumber ?? item.castId.slice(0, 8),
          name: item.displayName,
          nickname: (item as any).nickname ?? null,
          age: item.age ?? 0,
          desiredHourly: item.desiredHourly ?? 0,
          heightCm: getHeightFromDetail(item),
          bodyType: getBodyTypeFromDetail(item),
          drinkLevel: mapDrinkLevel(
            (item as any).drinkLevel ?? (item as any).drinkOk,
          ),
          photoUrl:
            resolveImmediateDisplayPhotoUrl(item) ??
            allPhotoMap.get(item.castId) ??
            undefined,
          photoUrlRaw:
            resolveLegacyPhotoFallbackUrl(item) ??
            allPhotoFallbackMap.get(item.castId) ??
            undefined,
          hasExclusive: getCastExclusiveFlag(item),
          hasNominated: getCastNominatedFlag(item),
          exclusiveShopId: getCastExclusiveShopId(item),
          ngShopIds: (item as any).ngShopIds ?? [],
          oldId: (item as any).oldId ?? (item as any).legacyId ?? undefined,
          genres: getGenresFromDetail(item),
          activityStatus: (item as any).activityStatus ?? null,
          lastMatchedAt: (item as any).lastMatchedAt ?? null,
          ownerStaffName: (item as any).ownerStaffName ?? null,
        }));

        const todayMap = new Map(todayList.map((c) => [c.id, c]));

        // 全キャスト（/casts）。本日出勤分は todayList を優先し、それ以外はデフォルト値で補完
        const allList: Cast[] = allResp.items.map((item) => {
          const fromToday = todayMap.get(item.userId);
          if (fromToday) {
            return {
              ...fromToday,
              nickname: (item as any).nickname ?? fromToday.nickname ?? null,
              ownerStaffName:
                (item as any).ownerStaffName ?? fromToday.ownerStaffName ?? null,
            };
          }

          return {
            id: item.userId,
            code: item.managementNumber ?? item.userId.slice(0, 8),
            name: item.displayName,
            nickname: item.nickname ?? null,
            age: item.age ?? 0,
            desiredHourly: item.desiredHourly ?? 0,
            heightCm: getHeightFromDetail(item),
            bodyType: getBodyTypeFromDetail(item),
            drinkLevel: mapDrinkLevel(
              (item as any).drinkLevel ?? (item as any).drinkOk,
            ),
            photoUrl: resolveImmediateDisplayPhotoUrl(item) ?? undefined,
            photoUrlRaw: resolveLegacyPhotoFallbackUrl(item) ?? undefined,
            hasExclusive: getCastExclusiveFlag(item),
            hasNominated: getCastNominatedFlag(item),
            exclusiveShopId: getCastExclusiveShopId(item),
            ngShopIds: (item as any).ngShopIds ?? [],
            oldId: (item as any).oldId ?? (item as any).legacyId ?? undefined,
            genres: getGenresFromDetail(item),
            activityStatus: (item as any).activityStatus ?? null,
            lastMatchedAt: (item as any).lastMatchedAt ?? null,
            ownerStaffName: (item as any).ownerStaffName ?? null,
          };
        });

        const seededPhotoMap = Object.fromEntries(
          [...todayList, ...allList]
            .filter((cast) => typeof cast.photoUrl === "string" && cast.photoUrl)
            .map((cast) => [cast.id, cast.photoUrl as string]),
        );
        const seededPhotoFallbackMap = Object.fromEntries(
          [...todayList, ...allList]
            .filter(
              (cast) =>
                typeof cast.photoUrlRaw === "string" && cast.photoUrlRaw,
            )
            .map((cast) => [cast.id, cast.photoUrlRaw as string]),
        );

        setTodayCasts(todayList);
        setAllCasts(allList);
        setPhotoByCastId(seededPhotoMap);
        setPhotoFallbackByCastId(seededPhotoFallbackMap);
      } catch (e: any) {
        console.error(e);
        if (!cancelled) {
          setError(e?.message ?? "データ取得に失敗しました");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, []);

  // 絞り込み条件が変わったら 1 ページ目に戻す
  useEffect(() => {
    setCurrentPage(1);
  }, [
    statusTab,
    castListMode,
    担当者,
    keyword,
    selectedShopId,
    dispatchStatusFilter,
    attendanceRequestFilter,
    sortKey,
    drinkLevelFilter,
    sortKana,
    sortNumberSmallFirst,
    sortNumberLargeFirst,
    castGenreFilter,
    ageRangeFilter,
    castWageFilter,
    castNominationFilter,
  ]);

  // NGモーダルが開いた時点で、対象キャストの既存NG店舗を初期選択にする
  useEffect(() => {
    if (ngModalOpen && selectedCast) {
      setNgSelectedShopIds(selectedCast.ngShopIds ?? []);
    }
  }, [ngModalOpen, selectedCast]);

  useEffect(() => {
    setChatDraft("");
  }, [selectedCast?.id]);

  useEffect(() => {
    if (!selectedCast?.id) {
      setChatDisabledUntil(null);
      return;
    }
    const detail = castDetailById[selectedCast.id];
    const raw =
      detail?.chatSendDisabledUntil ?? detail?.chat_send_disabled_until ?? null;
    if (!raw) {
      setChatDisabledUntil(null);
      return;
    }
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) {
      setChatDisabledUntil(null);
      return;
    }
    setChatDisabledUntil(parsed);
  }, [selectedCast?.id, castDetailById]);

  const handleSendChat = useCallback(async () => {
    if (!selectedCast) return;
    if (chatDisabledUntil) {
      alert(
        `本日中のチャット送信は停止されています（解除: ${chatDisabledUntil.toLocaleString()}）。`,
      );
      return;
    }
    const text = chatDraft.trim();
    if (!text) {
      alert("チャット内容を入力してください。");
      return;
    }
    try {
      setChatSending(true);
      await apiFetch("/chat/staff/messages", {
        method: "POST",
        headers: {
          "x-chat-source": "matching",
        },
        body: JSON.stringify({
          castId: selectedCast.id,
          text,
        }),
      });
      await upsertAttendanceRequest({
        date: todayKey(),
        castId: selectedCast.id,
        status: "requested",
        displayOrder: pendingDispatchSlotIndex ?? null,
      })
        .then((res) => setAttendanceRequests(res.items ?? []))
        .catch((err) => {
          console.warn("[casts/today] failed to mark request sent", err);
        });
      setChatDraft("");
      alert("送信しました。");
    } catch (err) {
      console.warn("[casts/today] chat send failed", err);
      const msg = String((err as any)?.message ?? "");
      if (msg.includes("chat_send_disabled_until")) {
        const iso = msg.split("chat_send_disabled_until:")[1]?.trim();
        const until = iso ? new Date(iso) : null;
        if (until && !Number.isNaN(until.getTime())) {
          setChatDisabledUntil(until);
          alert(
            `本日中のチャット送信は停止されています（解除: ${until.toLocaleString()}）。`,
          );
          return;
        }
        alert("本日中のチャット送信は停止されています。");
        return;
      }
      alert("送信に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setChatSending(false);
    }
  }, [chatDraft, selectedCast, chatDisabledUntil, pendingDispatchSlotIndex]);

  const insertChatTemplate = useCallback((text: string) => {
    setChatDraft((prev) => (prev ? `${prev}\n${text}` : text));
  }, []);

  const openChatTemplateEdit = useCallback(
    (key: "request" | "confirm") => {
      setChatTemplateEditingKey(key);
      setChatTemplateDraft(chatTemplates[key] ?? "");
      setChatTemplateEditOpen(true);
    },
    [chatTemplates],
  );

  const startChatTemplateLongPress = useCallback(
    (key: "request" | "confirm") => {
      if (chatTemplateLongPressTimerRef.current) {
        window.clearTimeout(chatTemplateLongPressTimerRef.current);
      }
      chatTemplateLongPressFiredRef.current = false;
      chatTemplateLongPressTimerRef.current = window.setTimeout(() => {
        chatTemplateLongPressFiredRef.current = true;
        openChatTemplateEdit(key);
      }, 600);
    },
    [openChatTemplateEdit],
  );

  const stopChatTemplateLongPress = useCallback(() => {
    if (chatTemplateLongPressTimerRef.current) {
      window.clearTimeout(chatTemplateLongPressTimerRef.current);
      chatTemplateLongPressTimerRef.current = null;
    }
  }, []);

  const handleSaveMatchingSettings = async () => {
    if (!settingsDraft) return;
    setSettingsSaving(true);
    setSettingsError(null);
    try {
      const payload = {
        enableGenre: settingsDraft.enableGenre,
        enableHourly: settingsDraft.enableHourly,
        enableDrink: settingsDraft.enableDrink,
        enableHeight: settingsDraft.enableHeight,
        enableBodyType: settingsDraft.enableBodyType,
        weightGenre: settingsDraft.weightGenre,
        weightHourly: settingsDraft.weightHourly,
        weightDrink: settingsDraft.weightDrink,
        weightHeight: settingsDraft.weightHeight,
        weightBodyType: settingsDraft.weightBodyType,
        fixedCastAlwaysTop: settingsDraft.fixedCastAlwaysTop,
      };
      const saved = await updateMatchingSettings(payload);
      setMatchingSettings(saved);
      setSettingsOpen(false);
    } catch (e) {
      console.warn("[casts/today] matching settings save failed", e);
      setSettingsError("保存に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setSettingsSaving(false);
    }
  };

  const updateSettingsDraft = (patch: Partial<MatchingSettings>) => {
    setSettingsDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const todayCastIdSet = useMemo(
    () => new Set(todayCasts.map((cast) => cast.id)),
    [todayCasts],
  );
  const getEffectiveAttendanceStatus = useCallback(
    (castId: string): AttendanceRequestStatus | null => {
      const requestStatus =
        attendanceRequests.find((row) => row.castId === castId)?.status ?? null;
      if (requestStatus === "no_show") return "no_show";
      if (requestStatus === "ng") return "ng";
      if (
        requestStatus === "ok" ||
        requestStatus === "added" ||
        todayCastIdSet.has(castId)
      ) {
        return "ok";
      }
      if (requestStatus === "requested") return "requested";
      return requestStatus;
    },
    [attendanceRequests, todayCastIdSet],
  );

  const {
    allItems: allFilteredCasts,
    items: filteredCasts,
    total: filteredTotal,
    totalPages,
    page: effectivePage,
  } = useMemo(() => {
    const todayIds = new Set(todayCasts.map((c) => c.id));
    const attendanceRequestByCastId = new Map(
      attendanceRequests.map((row) => [row.castId, row]),
    );
    const availableTodayIds = new Set(todayIds);
    attendanceRequests.forEach((row) => {
      if (row.status === "ok" || row.status === "added") {
        availableTodayIds.add(row.castId);
      }
    });

    // ① ベース集合の選択（タブ + 業務モード）
    // - 派遣表：本日シフトがあるキャスト
    // - 全キャスト：休眠ではない稼働対象キャスト
    // - 休眠キャスト：休眠ステータスが付いたキャスト
    // - マッチング提案モード：カード一覧では本日出勤キャストに絞る
    let base: Cast[];
    if (statusTab === "all") {
      base = allCasts.filter(isActiveCast);
    } else if (statusTab === "dormant") {
      base = allCasts.filter(isDormantCast);
    } else {
      base = allCasts.filter((c) => availableTodayIds.has(c.id));
    }

    let list: Cast[] = [...base];

    if (statusTab !== "today" && castListMode === "proposal") {
      list = list.filter((c) => availableTodayIds.has(c.id));
    }

    if (pendingDispatchSlotIndex !== null) {
      const assignedCastIds = new Set(
        dispatchRows.map((row) => row.castId).filter(Boolean),
      );
      list = list.filter((c) => {
        if (assignedCastIds.has(c.id)) return false;
        const requestStatus = attendanceRequestByCastId.get(c.id)?.status;
        return requestStatus !== "ok" && requestStatus !== "added";
      });
    }

    if (castListMode === "request" && 担当者 !== "all") {
      list = list.filter((c) => (c.ownerStaffName ?? "").includes(担当者));
    }

    if (castListMode === "request" && attendanceRequestFilter) {
      list = list.filter((c) => {
        const status = getEffectiveAttendanceStatus(c.id);
        if (attendanceRequestFilter === "none") return !status;
        return status === attendanceRequestFilter;
      });
    }

    // ③ 派遣票の入力状態フィルタ
    if (castListMode === "proposal" && dispatchStatusFilter) {
      const dispatchRowByCastId = new Map(
        dispatchRows
          .filter((row) => row.castId)
          .map((row) => [row.castId as string, row]),
      );
      list = list.filter((c) => {
        const row = dispatchRowByCastId.get(c.id);
        const hasDispatchShop = Boolean(row?.shopId);
        if (dispatchStatusFilter === "unassigned") return !row;
        return dispatchStatusFilter === "matched" ? hasDispatchShop : true;
      });
    }

    // ④ 店舗条件フィルタ
    if (selectedShop) {
      list = list.filter((c: Cast) =>
        matchesShopConditions(
          c,
          selectedShop,
          selectedShopNgCastIdSet,
          selectedShopFixedCastIdSet,
        ),
      );
    }

    // ⑤ キーワード（管理番号・名前・旧ID）
    if (keyword.trim()) {
      const q = keyword.trim();
      list = list.filter((c: Cast) => {
        const inName = c.name?.includes(q);
        const inCode = c.code?.includes(q);
        const inOld = c.oldId?.includes(q);
        return inName || inCode || inOld;
      });
    }

    // ⑥ キャストジャンル絞り込み
    if (castGenreFilter) {
      list = list.filter((c) => c.genres?.includes(castGenreFilter));
    }

    // ⑦ 年齢レンジ絞り込み
    if (ageRangeFilter) {
      list = list.filter((c) => isInAgeRange(c.age, ageRangeFilter));
    }

    if (castWageFilter) {
      const wage = Number(castWageFilter);
      list = list.filter((c) => bucketWage(c.desiredHourly) === wage);
    }

    if (castNominationFilter) {
      list = list.filter((c) => {
        if (castNominationFilter === "exclusive") return !!c.hasExclusive;
        if (castNominationFilter === "nominated") {
          return !c.hasExclusive && !!c.hasNominated;
        }
        return !c.hasExclusive && !c.hasNominated;
      });
    }

    if (drinkLevelFilter) {
      list = list.filter((c) => c.drinkLevel === drinkLevelFilter);
    }

    // ⑧ 既存ソート（年齢・時給）
    switch (sortKey) {
      case "hourlyDesc":
        list.sort((a: Cast, b: Cast) => b.desiredHourly - a.desiredHourly);
        break;
      case "ageAsc":
        list.sort((a: Cast, b: Cast) => a.age - b.age);
        break;
      case "ageDesc":
        list.sort((a: Cast, b: Cast) => b.age - a.age);
        break;
      default:
        break;
    }

    // ⑨ 追加ソート（50音 / 番号：複数選択可）
    const comparators: ((a: Cast, b: Cast) => number)[] = [];
    if (sortNumberSmallFirst) {
      comparators.push((a, b) => castNumberKey(a) - castNumberKey(b));
    }
    if (sortNumberLargeFirst) {
      comparators.push((a, b) => castNumberKey(b) - castNumberKey(a));
    }
    if (sortKana) {
      comparators.push((a, b) =>
        castKanaKey(a).localeCompare(castKanaKey(b), "ja"),
      );
    }
    if (comparators.length > 0) {
      list.sort((a, b) => {
        for (const cmp of comparators) {
          const r = cmp(a, b);
          if (r !== 0) return r;
        }
        return 0;
      });
    }

    if (
      castListMode === "proposal" &&
      statusTab !== "today" &&
      proposalOrderAlcohol
    ) {
      const baseOrder = new Map(
        list.map((c: Cast, idx: number) => [c.id, idx]),
      );
      list.sort((a, b) => {
        const priorityDiff =
          drinkPreferencePriority(a.drinkLevel, proposalOrderAlcohol) -
          drinkPreferencePriority(b.drinkLevel, proposalOrderAlcohol);
        if (priorityDiff !== 0) return priorityDiff;
        const drinkDiff = drinkScore(b.drinkLevel) - drinkScore(a.drinkLevel);
        if (drinkDiff !== 0) return drinkDiff;
        return (baseOrder.get(a.id) ?? 0) - (baseOrder.get(b.id) ?? 0);
      });
    }

    // ⑪ マッチング優先度（選択店舗がある場合のみ）
    if (selectedShop) {
      const baseOrder = new Map(
        list.map((c: Cast, idx: number) => [c.id, idx]),
      );
      const scoreMap = new Map<string, number>();
      for (const c of list) {
        scoreMap.set(
          c.id,
          calcMatchScore(
            c,
            selectedShop,
            selectedShopDetail,
            effectiveMatchingSettings,
          ),
        );
      }
      const shopGenre =
        selectedShopDetail?.genre ?? selectedShop?.genre ?? null;
      const requireDrinkOk = !!selectedShop?.requireDrinkOk;
      list.sort((a, b) => {
        if (effectiveMatchingSettings.fixedCastAlwaysTop) {
          const aFixed = selectedShopFixedCastIdSet.has(a.id);
          const bFixed = selectedShopFixedCastIdSet.has(b.id);
          if (aFixed !== bFixed) return aFixed ? -1 : 1;
        }
        if (shopGenre) {
          const aGenre = a.genres?.includes(shopGenre) ?? false;
          const bGenre = b.genres?.includes(shopGenre) ?? false;
          if (aGenre !== bGenre) return aGenre ? -1 : 1;
        }
        if (requireDrinkOk) {
          const diff = drinkScore(b.drinkLevel) - drinkScore(a.drinkLevel);
          if (diff !== 0) return diff;
        }
        if (
          castListMode === "proposal" &&
          statusTab !== "today" &&
          proposalOrderAlcohol
        ) {
          const priorityDiff =
            drinkPreferencePriority(a.drinkLevel, proposalOrderAlcohol) -
            drinkPreferencePriority(b.drinkLevel, proposalOrderAlcohol);
          if (priorityDiff !== 0) return priorityDiff;
        }
        const sa = scoreMap.get(a.id) ?? 0;
        const sb = scoreMap.get(b.id) ?? 0;
        if (sa !== sb) return sb - sa;
        return (baseOrder.get(a.id) ?? 0) - (baseOrder.get(b.id) ?? 0);
      });
    }

    // ⑫ ページネーション
    const total = list.length;
    const perPage = CAST_LIST_PAGE_SIZE;
    const tp = Math.max(1, Math.ceil(total / perPage));
    const page = Math.min(currentPage, tp);
    const start = (page - 1) * perPage;
    const end = start + perPage;
    const paged = list.slice(start, end);

    return {
      allItems: list,
      items: paged,
      total,
      totalPages: tp,
      page,
    };
  }, [
    allCasts,
    todayCasts,
    castListMode,
    担当者,
    attendanceRequests,
    attendanceRequestFilter,
    getEffectiveAttendanceStatus,
    dispatchRows,
    dispatchStatusFilter,
    selectedShop,
    selectedShopDetail,
    selectedShopNgCastIds,
    selectedShopFixedCastIds,
    effectiveMatchingSettings,
    keyword,
    sortKey,
    drinkLevelFilter,
    proposalOrderAlcohol,
    statusTab,
    currentPage,
    castGenreFilter,
    ageRangeFilter,
    castWageFilter,
    castNominationFilter,
    sortKana,
    sortNumberSmallFirst,
    sortNumberLargeFirst,
    pendingDispatchSlotIndex,
  ]);

  const bulkRequestTargets = useMemo(() => {
    if (castListMode !== "request" || statusTab !== "all") return [];
    const requestByCastId = new Map(
      attendanceRequests.map((item) => [item.castId, item]),
    );
    return allFilteredCasts.filter((cast) => {
      const status = requestByCastId.get(cast.id)?.status ?? null;
      return !status;
    });
  }, [allFilteredCasts, attendanceRequests, castListMode, statusTab]);

  const openBulkRequestModal = useCallback(() => {
    const text = chatTemplates.request.trim();
    if (!text) {
      alert("出勤依頼の定型文を入力してください。");
      return;
    }

    if (castListMode !== "request" || statusTab !== "all") {
      alert("一括送信は出勤依頼モードの全キャスト画面で実行してください。");
      return;
    }

    const skippedCount = allFilteredCasts.length - bulkRequestTargets.length;
    if (bulkRequestTargets.length === 0) {
      alert(
        skippedCount > 0
          ? "条件に該当するキャストはすでに出勤依頼済み、または出勤OK/NGのため送信対象がありません。"
          : "一括送信の対象キャストが表示されていません。",
      );
      return;
    }

    setBulkRequestDraft(text);
    setBulkRequestModalOpen(true);
  }, [
    allFilteredCasts.length,
    bulkRequestTargets.length,
    castListMode,
    chatTemplates.request,
    statusTab,
  ]);

  const submitBulkRequestChat = useCallback(async () => {
    const text = bulkRequestDraft.trim();
    if (!text) {
      alert("送信する本文を入力してください。");
      return;
    }

    setBulkRequestSending(true);
    try {
      const res = await bulkAttendanceRequest({
        date: todayKey(),
        text,
        castIds: allFilteredCasts.map((cast) => cast.id),
      });
      setAttendanceRequests(res.items ?? []);
      if (res.sentCount === 0) {
        alert(
          res.skippedCount > 0
            ? "対象キャストは他スタッフの操作を含め、すでに出勤依頼済み、または出勤OK/NGのため送信対象がありません。"
            : "一括送信の対象キャストがありません。",
        );
        return;
      }
      setBulkRequestModalOpen(false);
      alert(
        `${res.sentCount}名に送信しました。${res.skippedCount > 0 ? `重複防止のため${res.skippedCount}名はスキップしました。` : ""}`,
      );
    } catch (err) {
      console.warn("[casts/today] bulk request chat failed", err);
      alert("一括送信に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setBulkRequestSending(false);
    }
  }, [
    allFilteredCasts,
    bulkRequestDraft,
  ]);

  const ownerStaffOptions = useMemo(() => {
    const names = new Set<string>();
    if (currentStaffName) names.add(currentStaffName);
    for (const staff of staffAccounts) {
      if (staff.userType !== "staff") continue;
      if (staff.status !== "active") continue;
      const name = staff.loginId?.trim();
      if (name && !name.toLowerCase().includes("demo")) names.add(name);
    }
    for (const cast of allCasts) {
      const name = cast.ownerStaffName?.trim();
      if (name) names.add(name);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b, "ja"));
  }, [allCasts, currentStaffName, staffAccounts]);

  const formatDrinkLabel = (cast: Cast) => {
    switch (cast.drinkLevel) {
      case "ng":
        return "飲酒: NG";
      case "weak":
        return "飲酒: 弱い";
      case "normal":
        return "飲酒: 普通";
      case "strong":
        return "飲酒: 強い";
      default:
        return "飲酒: 未登録";
    }
  };

  const searchedShops = useMemo(() => {
    const q = shopSearch.trim().toLowerCase();
    if (!q) return effectiveShops;
    return effectiveShops.filter(
      (s: Shop) =>
        s.code.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q),
    );
  }, [shopSearch, effectiveShops]);

  const filteredShops = useMemo(() => {
    let list = [...searchedShops];
    if (shopFilterExclusive) {
      list = list.filter((s) =>
        shopFilterExclusive === "yes" ? hasExclusive(s) : !hasExclusive(s),
      );
    }
    if (shopFilterNominated) {
      list = list.filter((s) =>
        shopFilterNominated === "yes" ? hasNominated(s) : !hasNominated(s),
      );
    }
    if (shopFilterWage) {
      const w = Number(shopFilterWage);
      list = list.filter((s) => parseWageMinFromLabel(s.wageLabel) === w);
    }
    if (shopFilterIdReq) {
      list = list.filter(
        (s) => normalizeIdRequirement(s) === shopFilterIdReq,
      );
    }
    if (shopFilterGenre) {
      list = list.filter((s) => s.genre === shopFilterGenre);
    }
    if (shopFilterContact) {
      list = list.filter((s) => normalizeContactMethod(s) === shopFilterContact);
    }
    return list;
  }, [
    searchedShops,
    shopFilterExclusive,
    shopFilterNominated,
    shopFilterWage,
    shopFilterIdReq,
    shopFilterGenre,
    shopFilterContact,
  ]);

  const sortedTodayShops = useMemo(() => {
    const list = [...filteredShops];
    if (shopSortKey === "number") {
      list.sort((a, b) => shopNumberKey(a) - shopNumberKey(b));
    } else if (shopSortKey === "favorite") {
      list.sort((a, b) => {
        const rankDiff = shopFavoriteKey(b) - shopFavoriteKey(a);
        if (rankDiff !== 0) return rankDiff;
        return shopNumberKey(a) - shopNumberKey(b);
      });
    } else {
      list.sort((a, b) => shopKanaKey(a).localeCompare(shopKanaKey(b), "ja"));
    }
    return list;
  }, [filteredShops, shopSortKey]);

  const filteredDispatchRows = useMemo(() => {
    if (担当者 === "all") return dispatchRows;
    return dispatchRows.filter((row) =>
      (row.ownerStaffName ?? "").includes(担当者),
    );
  }, [dispatchRows, 担当者]);

  const dispatchSlots = useMemo(() => {
    return buildDispatchSlots(filteredDispatchRows, {
      includeCanceledTail: false,
    });
  }, [filteredDispatchRows]);

  const dispatchPrintSlots = useMemo(() => {
    return buildDispatchSlots(filteredDispatchRows, {
      includeCanceledTail: false,
    });
  }, [filteredDispatchRows]);

  const shopWageOptions: WageFilter[] = [
    "2500",
    "3000",
    "3500",
    "4500",
    "5000",
    "5500",
    "6000",
    "6500",
  ];

  const orderShopMatches = useMemo(() => {
    const t = orderShopQuery.trim().toLowerCase();
    if (!t) return [];
    return effectiveShops
      .filter((s) => {
        const code = s.code?.toLowerCase() ?? "";
        const name = s.name?.toLowerCase() ?? "";
        const kana = s.nameKana?.toLowerCase() ?? "";
        return code.includes(t) || name.includes(t) || kana.includes(t);
      })
      .slice(0, 8);
  }, [orderShopQuery, effectiveShops]);

  useEffect(() => {
    if (orderShopActiveIndex > 0) setOrderShopActiveIndex(0);
  }, [orderShopQuery]);

  const todayWageCounts = useMemo(() => buildWageCounts(todayCasts), [todayCasts]);
  const orderSummary = useMemo(() => {
    const assignedRows = filteredDispatchRows.filter((row) => Boolean(row.shopId));
    return {
      count: assignedRows.length,
      headcount: assignedRows.filter((row) => row.status === "confirmed").length,
    };
  }, [filteredDispatchRows]);

  const unfilledOrderCount = useMemo(
    () =>
      filteredDispatchRows.filter(
        (row) =>
          row.status !== "canceled" &&
          Boolean(row.shopId) &&
          !row.castId,
      ).length,
    [filteredDispatchRows],
  );

  const tutorialMessage = useMemo<TutorialMessage | null>(() => {
    if (!supportMode) return null;
    if (castListMode === "request") {
      const hasRequestAuxFilter =
        keyword.trim() ||
        castWageFilter ||
        castNominationFilter ||
        drinkLevelFilter ||
        castGenreFilter ||
        ageRangeFilter ||
        担当者 !== "all" ||
        sortKey !== "default";
      if (statusTab !== "all") {
        return {
          target: "all-casts-tab",
          title: "全キャストを開く",
          body: "出勤依頼は全キャストから対象を探します。まず全キャストタブを開いてください。",
        };
      }
      if (!attendanceRequestFilter) {
        return {
          target: "request-status-filter",
          title: "依頼状態を選ぶ",
          body: "まず未依頼・依頼済み・出勤OK/NGを切り替えます。依頼を送る場合は未依頼を選んでください。",
        };
      }
      if (!hasRequestAuxFilter) {
        return {
          target: "request-filters",
          title: "不足属性で絞り込む",
          body: "不足している時給帯・ジャンル・飲酒・年齢・担当者などで絞り込み、依頼対象を絞ってください。",
        };
      }
      if (bulkRequestTargets.length > 0) {
        return {
          target: "bulk-request",
          title: "出勤依頼を送る",
          body: "条件内の未送信キャストへ一括送信できます。個別確認したい場合はキャストカードを開いてチャット送信してください。",
        };
      }
      if (allFilteredCasts.length > 0) {
        return {
          target: "cast-list",
          title: "個別確認する",
          body: "この条件の未送信対象はいません。表示中のキャストカードを開き、依頼済み・OK/NGの状況を確認してください。",
        };
      }
      return {
        target: "request-filters",
        title: "条件を広げる",
        body: "条件に合うキャストがいません。時給・ジャンル・飲酒・年齢などの条件を広げて再検索してください。",
      };
    }
    if (castCardDragging) {
      return statusTab === "today"
        ? {
            target: "dispatch-sheet",
            title: "派遣表へ配置",
            body: "空いているオーダー枠、または空欄にキャストカードをドロップしてください。",
          }
        : {
            target: "dispatch-tab",
            title: "派遣表へ移動",
            body: "キャストカードを持ったまま、派遣表タブへ移動してください。",
          };
    }
    if (panelTab === "shops") {
      if (selectedShopId) {
        return {
          target: "cast-tab",
          title: "キャスト一覧へ戻る",
          body: "営業先店舗を選択しました。キャスト一覧に戻り、店舗から聞いたオーダー条件を入力します。",
        };
      }
      return {
        target: "shop-list",
        title: "営業先店舗を選ぶ",
        body: "店舗一覧から営業連絡する店舗を選択してください。完了済み店舗は確認ダイアログ後に再編集できます。",
      };
    }
    if (selectedShopId) {
      return {
        target: "active-shop-order",
        title: "オーダー情報をセット",
        body: "稼働中店舗へ営業連絡し、人数・希望時給・飲酒・ヘアセットを確認してセットします。提案時は下の補助フィルターとキャストカードも確認してください。",
      };
    }
    if (unfilledOrderCount > 0) {
      return {
        target: "dispatch-tab",
        title: "キャストを当て込む",
        body: "取得済みオーダーがあります。補助フィルターで条件に合うキャストを探し、キャストカードを派遣表へドラッグしてください。",
      };
    }
    return {
      target: "shop-tab",
      title: "店舗へ営業する",
      body: "まずアドバイス欄と時給別の出勤状況を確認し、店舗一覧から営業先店舗を選択してください。",
    };
  }, [
    castCardDragging,
    castListMode,
    allFilteredCasts.length,
    attendanceRequestFilter,
    ageRangeFilter,
    bulkRequestTargets.length,
    castGenreFilter,
    castNominationFilter,
    castWageFilter,
    drinkLevelFilter,
    keyword,
    panelTab,
    selectedShopId,
    sortKey,
    statusTab,
    supportMode,
    unfilledOrderCount,
    担当者,
  ]);

  const tutorialTarget = tutorialMessage?.target ?? null;

  const matchingAdvices = useMemo<MatchingAdvice[]>(() => {
    const shopById = new Map(effectiveShops.map((shop) => [shop.id, shop]));
    const requestByCastId = new Map(
      attendanceRequests.map((item) => [item.castId, item]),
    );
    const assignedCastIds = new Set(
      filteredDispatchRows
        .filter((row) => row.status !== "canceled" && row.castId)
        .map((row) => row.castId as string),
    );
    const availableCasts = allCasts.filter((cast) => {
      if (!isActiveCast(cast)) return false;
      if (assignedCastIds.has(cast.id)) return false;
      return getEffectiveAttendanceStatus(cast.id) === "ok";
    });

    const unfilledOrders = filteredDispatchRows.filter(
      (row) =>
        row.status !== "canceled" &&
        Boolean(row.shopId) &&
        !row.castId,
    );

    const orderGroups = new Map<
      string,
      {
        count: number;
        wage: number | null;
        genre: CastGenre | null;
        drinkLevel: DrinkLevelOption | "";
      }
    >();
    for (const row of unfilledOrders) {
      const conditions = parseDispatchOrderConditions(row.note);
      const shop = row.shopId ? shopById.get(row.shopId) : null;
      const wage =
        bucketWage(conditions.wage) ??
        bucketWage(parseWageMinFromLabel(shop?.wageLabel ?? null));
      const genre = normalizeCastGenre(String(shop?.genre ?? "")) ?? null;
      const drinkLevel = conditions.drinkLevel ?? "";
      const key = `${wage ?? "none"}:${genre ?? "none"}:${drinkLevel || "none"}`;
      const prev = orderGroups.get(key);
      orderGroups.set(key, {
        count: (prev?.count ?? 0) + 1,
        wage,
        genre,
        drinkLevel,
      });
    }

    const advices: MatchingAdvice[] = [];
    const shortage = Array.from(orderGroups.values())
      .map((group) => {
        const compatibleCount = availableCasts.filter((cast) => {
          if (group.wage && bucketWage(cast.desiredHourly) !== group.wage) {
            return false;
          }
          if (group.genre && !cast.genres?.includes(group.genre)) {
            return false;
          }
          if (group.drinkLevel) {
            return drinkPreferencePriority(cast.drinkLevel, group.drinkLevel) === 0;
          }
          return true;
        }).length;
        return {
          ...group,
          shortageCount: Math.max(0, group.count - compatibleCount),
          compatibleCount,
        };
      })
      .filter((group) => group.shortageCount > 0)
      .sort((a, b) => b.shortageCount - a.shortageCount)[0];

    if (castListMode === "proposal" && selectedShop) {
      advices.push({
        tone: "normal",
        title: "オーダー入力",
        body: `${selectedShop.name}へ営業連絡し、派遣人数・希望時給・飲酒・ヘアセットなど必要な情報を確認して、稼働中店舗のオーダー情報をセットしてください。`,
      });
    }

    if (castListMode === "proposal" && !selectedShop && unfilledOrders.length > 0) {
      advices.push({
        tone: "normal",
        title: "次の操作",
        body: `オーダー枠が${unfilledOrders.length}名分あります。次の店舗へ営業するか、出勤OKキャストを派遣表へドラッグ&ドロップしてください。`,
      });
    }

    if (shortage && advices.length < 2) {
      const wageLabel = shortage.wage ? `${shortage.wage.toLocaleString()}円` : "時給未指定";
      const genreLabel = formatCastGenreShort(shortage.genre);
      const drinkLabel = shortage.drinkLevel
        ? `・飲酒${formatDrinkLevelShort(shortage.drinkLevel)}`
        : "";
      if (castListMode === "request") {
        advices.push({
          tone: "shortage",
          title: "依頼対象",
          body: `${wageLabel}・${genreLabel}系${drinkLabel}のオーダーが${shortage.count}名分あります。条件に合う出勤キャストが不足しているため、この条件に近いキャストへ出勤依頼を送ってください。`,
        });
      } else {
        advices.push({
          tone: "shortage",
          title: "不足しています",
          body: `${wageLabel}・${genreLabel}系${drinkLabel}のオーダーが${shortage.count}名分あります。条件に合う未割当キャストが不足しています。出勤依頼モードで該当キャストへ依頼してください。`,
        });
      }
    }

    if (castListMode === "proposal") {
      const surplusGroups = new Map<
        string,
        { count: number; wage: number | null; genre: CastGenre | null }
      >();
      for (const cast of availableCasts) {
        const wage = bucketWage(cast.desiredHourly);
        const genre = getPrimaryCastGenre(cast);
        const key = `${wage ?? "none"}:${genre ?? "none"}`;
        const prev = surplusGroups.get(key);
        surplusGroups.set(key, {
          count: (prev?.count ?? 0) + 1,
          wage,
          genre,
        });
      }

      const surplus = Array.from(surplusGroups.values())
        .filter((group) => group.count >= 2)
        .sort((a, b) => b.count - a.count)[0];
      if (surplus && advices.length < 2) {
        const wageLabel = surplus.wage ? `${surplus.wage.toLocaleString()}円` : "時給未設定";
        const genreLabel = formatCastGenreShort(surplus.genre);
        advices.push({
          tone: "surplus",
          title: "営業できます",
          body: `${wageLabel}・${genreLabel}系の出勤OKキャストが${surplus.count}名未割当です。店舗一覧で営業先を選択し、${genreLabel}店舗へ${wageLabel}帯で営業をかけてください。`,
        });
      }
    } else {
      const unrequestedCount = allCasts.filter((cast) => {
        if (!isActiveCast(cast)) return false;
        const status = getEffectiveAttendanceStatus(cast.id);
        return !status && !requestByCastId.get(cast.id)?.status;
      }).length;
      if (unrequestedCount > 0 && advices.length < 2) {
        advices.push({
          tone: "normal",
          title: "未依頼あり",
          body: `未依頼のキャストが${unrequestedCount}名います。不足している時給帯・ジャンルで絞り込み、一括送信で出勤依頼を進めてください。`,
        });
      }
    }

    if (advices.length === 0 && castListMode === "proposal") {
      advices.push({
        tone: "normal",
        title: "状況確認",
        body: "店舗一覧で営業先店舗を選択し、稼働中店舗のオーダー情報をセットしてください。未割当キャストを確認しながら進めてください。",
      });
    } else if (advices.length === 0) {
      advices.push({
        tone: "normal",
        title: "状況確認",
        body: "不足条件は大きく出ていません。依頼済み・出勤OK・出勤NGのステータスを確認して次の連絡対象を整理してください。",
      });
    }

    return advices;
  }, [
    allCasts,
    attendanceRequests,
    castListMode,
    effectiveShops,
    filteredDispatchRows,
    getEffectiveAttendanceStatus,
    selectedShop,
  ]);

  const applyMatchedFromOrders = useCallback((orders: any[]) => {
    const set = new Set<string>();
    orders.forEach((order) => {
      const status = order?.status ?? order?.order_status ?? null;
      if (status === "canceled") return;
      const assigns = Array.isArray(order?.assignments)
        ? order.assignments
        : [];
      assigns.forEach((item: any) => {
        const castId =
          item?.castId ??
          item?.cast?.userId ??
          item?.cast?.id ??
          item?.cast_id ??
          null;
        if (castId) set.add(castId);
      });
    });
    setMatchedCastIds(set);
  }, []);

  const fetchMatchedCastIds = useCallback(async () => {
    try {
      const date = todayKey();
      const orders = await listShopOrders(date);
      applyMatchedFromOrders(orders);
    } catch (err) {
      console.warn("[casts/today] load matched casts failed", { err });
    }
  }, [applyMatchedFromOrders]);

  useEffect(() => {
    const onFocus = () => {
      void fetchMatchedCastIds();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void fetchMatchedCastIds();
      }
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [fetchMatchedCastIds]);

  // NG登録モーダル用 店舗リスト（ジャンル・名前・ID・並び替え）
  const ngCandidateShops = useMemo(() => {
    let list = [...todayShops];

    if (ngFilterGenre) {
      list = list.filter((s) => s.genre === ngFilterGenre);
    }

    if (ngFilterName.trim()) {
      const q = ngFilterName.trim().toLowerCase();
      list = list.filter((s) => s.name.toLowerCase().includes(q));
    }

    if (ngFilterCode.trim()) {
      const q = ngFilterCode.trim().toLowerCase();
      list = list.filter((s) => s.code.toLowerCase().includes(q));
    }

    if (ngSortKey === "number") {
      list.sort((a, b) => shopNumberKey(a) - shopNumberKey(b));
    } else {
      list.sort((a, b) =>
        shopKanaKey(a).localeCompare(shopKanaKey(b), "ja"),
      );
    }

    return list;
  }, [todayShops, ngFilterGenre, ngFilterName, ngFilterCode, ngSortKey]);

  const dispatchOwnerOptions = useMemo(() => {
    const values = new Set<string>();
    for (const shop of dispatchShops) {
      const owner = (shop.ownerStaff ?? "").trim();
      if (owner) values.add(owner);
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b, "ja"));
  }, [dispatchShops]);

  const dispatchShopCandidates = useMemo(() => {
    const q = dispatchShopQuery.trim().toLowerCase();
    const pickerCastId = dispatchShopPickerCastId;
    return dispatchShops
      .filter((shop) => {
        if (
          pickerCastId &&
          Array.isArray(shop.blockedCastIds) &&
          shop.blockedCastIds.includes(pickerCastId)
        ) {
          return false;
        }
        if (dispatchOwnerFilter && shop.ownerStaff !== dispatchOwnerFilter) {
          return false;
        }
        if (dispatchGenreFilter && shop.genre !== dispatchGenreFilter) {
          return false;
        }
        if (!q) return true;
        const haystack = [
          shop.name,
          shop.code,
          shop.nameKana,
          shop.ownerStaff,
          shop.addressLine,
          shop.buildingName,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      })
      .sort((a, b) => {
        const an = shopNumberKey({
          id: a.id,
          code: a.code ?? "",
          name: a.name,
        } as Shop);
        const bn = shopNumberKey({
          id: b.id,
          code: b.code ?? "",
          name: b.name,
        } as Shop);
        if (an !== bn) return an - bn;
        return a.name.localeCompare(b.name, "ja");
      });
  }, [
    dispatchShops,
    dispatchShopQuery,
    dispatchShopPickerCastId,
    dispatchOwnerFilter,
    dispatchGenreFilter,
  ]);

  const updateDispatchRowLocal = (
    castId: string,
    patch: Partial<DispatchSheetRow>,
  ) => {
    setDispatchRows((prev) =>
      prev.map((row) => (row.castId === castId ? { ...row, ...patch } : row)),
    );
  };

  const saveDispatchRow = async (
    row: DispatchSheetRow,
    patch: Partial<DispatchSheetRow> = {},
  ): Promise<DispatchSheetRow[] | null> => {
    const next = { ...row, ...patch };
    if (!next.castId) return null;
    if (!next.shopId) return null;
    const startTime = normalizeDispatchTimeForSave(next.startTime);
    if (!startTime) return null;
    setDispatchSavingKey(next.castId);
    try {
      const res = await upsertDispatchSheetRow({
        date: todayKey(),
        castId: next.castId,
        assignmentId: next.assignmentId,
        orderId: next.orderId,
        shopId: next.shopId,
        startTime,
        endTime: next.endTime || null,
        castHourly: next.castHourly ?? null,
        shopFee: next.shopFee ?? null,
        note: next.note ?? null,
        displayOrder: next.displayOrder ?? 0,
      });
      setDispatchRows(res.rows ?? []);
      setDispatchShops(res.shops ?? dispatchShops);
      return res.rows ?? [];
    } catch (err) {
      console.warn("[casts/today] failed to save dispatch row", err);
      await loadDispatchSheet();
      const message = err instanceof Error ? err.message : "";
      alert(
        message.includes("409")
          ? "他スタッフの操作と競合しました。このキャストは既に別の派遣表へ割り当てられている可能性があります。最新状態を再読み込みしました。"
          : "派遣表の保存に失敗しました。最新状態を再読み込みしました。",
      );
      return null;
    } finally {
      setDispatchSavingKey(null);
    }
  };

  const selectDispatchShop = async (shop: DispatchSheetShop) => {
    const castId = dispatchShopPickerCastId;
    if (!castId) return;
    const row = dispatchRows.find((item) => item.castId === castId);
    if (!row) return;
    const patch: Partial<DispatchSheetRow> = {
      shopId: shop.id,
      shopName: shop.name,
      shopNumber: shop.code,
      startTime: row.startTime || "",
      castHourly: row.castHourly ?? row.desiredHourly ?? null,
    };
    updateDispatchRowLocal(castId, patch);
    setDispatchShopPickerCastId(null);
    if (normalizeDispatchTimeForSave(patch.startTime)) {
      await saveDispatchRow(row, patch);
    }
  };

  const getDefaultIdDocPrintKeys = useCallback(
    (targets: IdDocPrintTarget[], mode: IdDocPrintMode) => {
      if (mode === "manual") return [];
      if (mode === "all_with_id") {
        return targets
          .filter((target) => target.hasIdDocs)
          .map((target) => target.key);
      }
      return targets
        .filter((target) => target.recommended)
        .map((target) => target.key);
    },
    [],
  );

  const openIdDocPrintModal = useCallback(async () => {
    const confirmedRows = filteredDispatchRows.filter(
      (row): row is DispatchSheetRow & { castId: string } =>
        row.status === "confirmed" && Boolean(row.shopId) && Boolean(row.castId),
    );
    if (confirmedRows.length === 0) {
      alert("確定済みの派遣がないため、身分証印刷対象がありません。");
      return;
    }

    setIdDocPrintOpen(true);
    setIdDocPrintLoading(true);
    try {
      const shopById = new Map(dispatchShops.map((shop) => [shop.id, shop]));
      const nextDetails: Record<string, any> = {};
      const targets = await Promise.all(
        confirmedRows.map(async (row) => {
          const detail = castDetailById[row.castId] ?? (await getCast(row.castId));
          nextDetails[row.castId] = detail;
          const shop = row.shopId ? shopById.get(row.shopId) : null;
          const requirement = normalizeIdRequirement({
            idDocumentRequirement: shop?.idDocumentRequirement ?? null,
          } as Shop);
          const shopRequiresId = isShopIdRequired(requirement);
          const sources = pickIdDocSources(detail);
          const hasIdDocs = sources.length > 0;
          const key = row.assignmentId ?? `${row.castId}:${row.shopId ?? ""}`;
          return {
            key,
            assignmentId: row.assignmentId,
            castId: row.castId,
            castName: row.displayName,
            castCode: row.castCode,
            shopName: row.shopName ?? shop?.name ?? "",
            shopNumber: row.shopNumber ?? shop?.code ?? null,
            requirement,
            requirementLabel: getIdRequirementLabel(requirement),
            shopRequiresId,
            hasIdDocs,
            sources,
            recommended: shopRequiresId && hasIdDocs,
            reason: !shopRequiresId
              ? "店舗条件では不要"
              : hasIdDocs
                ? "印刷推奨"
                : "身分証未登録",
          } satisfies IdDocPrintTarget;
        }),
      );
      if (Object.keys(nextDetails).length > 0) {
        setCastDetailById((prev) => ({ ...prev, ...nextDetails }));
      }
      setIdDocPrintTargets(targets);
      setSelectedIdDocPrintKeys(
        getDefaultIdDocPrintKeys(targets, idDocPrintMode),
      );
    } catch (err) {
      console.warn("[casts/today] failed to prepare id doc print", err);
      alert("身分証印刷対象の取得に失敗しました。");
    } finally {
      setIdDocPrintLoading(false);
    }
  }, [
    filteredDispatchRows,
    dispatchShops,
    castDetailById,
    idDocPrintMode,
    getDefaultIdDocPrintKeys,
  ]);

  const changeIdDocPrintMode = (mode: IdDocPrintMode) => {
    setIdDocPrintMode(mode);
    setSelectedIdDocPrintKeys(getDefaultIdDocPrintKeys(idDocPrintTargets, mode));
  };

  const toggleIdDocPrintTarget = (key: string) => {
    setSelectedIdDocPrintKeys((prev) =>
      prev.includes(key)
        ? prev.filter((item) => item !== key)
        : [...prev, key],
    );
  };

  const printSelectedIdDocs = async () => {
    const selected = idDocPrintTargets.filter(
      (target) =>
        selectedIdDocPrintKeys.includes(target.key) && target.hasIdDocs,
    );
    if (selected.length === 0) {
      alert("印刷可能な身分証が選択されていません。");
      return;
    }

    setIdDocPrinting(true);
    try {
      const items = await Promise.all(
        selected.map(async (target) => ({
          castName: target.castName,
          castCode: target.castCode,
          shopName: target.shopName,
          images: await resolveSignedIdDocImages(target.castId, target.sources),
        })),
      );
      const printable = items.filter((item) => item.images.length > 0);
      if (printable.length === 0) {
        alert("印刷可能な身分証画像がありません。");
        return;
      }
      const win = window.open("", "_blank", "noopener,noreferrer");
      if (!win) {
        alert("印刷ウィンドウを開けませんでした。ポップアップ許可をご確認ください。");
        return;
      }
      win.document.open();
      win.document.write(buildIdDocPrintHtml(printable));
      win.document.close();
    } catch (err) {
      console.warn("[casts/today] failed to print id docs", err);
      alert("身分証印刷の準備に失敗しました。");
    } finally {
      setIdDocPrinting(false);
    }
  };

  const markAttendanceRequest = async (
    castId: string,
    status: AttendanceRequestStatus,
    displayOrder?: number | null,
  ) => {
    try {
      const res = await upsertAttendanceRequest({
        date: todayKey(),
        castId,
        status,
        displayOrder: displayOrder ?? null,
      });
      setAttendanceRequests(res.items ?? []);
      await loadDispatchSheet();
    } catch (err) {
      console.warn("[casts/today] failed to update attendance request", err);
      alert("出勤依頼ステータスの保存に失敗しました。");
    }
  };

  const loadShopNgCastIdsForShop = useCallback(
    async (shopId: string): Promise<string[]> => {
      const cached = shopNgCastIdsByShopId[shopId];
      if (cached) return cached;
      const ngCasts = await listShopNgCasts(shopId);
      const ids = (ngCasts ?? [])
        .map((row) => row.castId ?? row.cast?.userId ?? "")
        .filter((id) => id);
      setShopNgCastIdsByShopId((prev) => ({ ...prev, [shopId]: ids }));
      return ids;
    },
    [shopNgCastIdsByShopId],
  );

  const startManualDispatchPick = (slotIndex: number) => {
    setPendingDispatchSlotIndex(slotIndex);
    setStatusTab("all");
    setCurrentPage(1);
  };

  const addCastToDispatchSlot = async (castId: string, slotIndex: number) => {
    if (dispatchRows.some((row) => row.castId === castId)) {
      alert("このキャストはすでに派遣表に追加されています。");
      return;
    }
    const slotRow = dispatchSlots[slotIndex];
    const orderShop =
      slotRow?.shopId
        ? {
            id: slotRow.shopId,
            name: slotRow.shopName ?? "",
            code: slotRow.shopNumber ?? "",
          }
        : selectedShop && selectedShop.contactStatus === "editing"
        ? selectedShop
        : null;
    const displayOrder =
      typeof slotRow?.displayOrder === "number"
        ? slotRow.displayOrder
        : slotIndex;
    const cast =
      todayCasts.find((item) => item.id === castId) ??
      allCasts.find((item) => item.id === castId) ??
      null;
    const targetShopId = slotRow?.shopId ?? orderShop?.id ?? null;
    if (cast && targetShopId) {
      try {
        const shopNgCastIds = await loadShopNgCastIdsForShop(targetShopId);
        const ngMessages = getShopNgBlockMessages(
          cast,
          targetShopId,
          new Set(shopNgCastIds),
        );
        if (ngMessages.length > 0) {
          alert(
            [
              "NG登録されているため、この店舗には割り当てできません。",
              "",
              ...ngMessages.map((message) => `・${message}`),
            ].join("\n"),
          );
          setDragOverDispatchSlotIndex(null);
          return;
        }
      } catch (err) {
        console.warn("[casts/today] failed to check shop NG before assign", {
          shopId: targetShopId,
          castId,
          err,
        });
        alert("NG情報の確認に失敗しました。時間をおいて再度お試しください。");
        setDragOverDispatchSlotIndex(null);
        return;
      }
    }
    const warnings = getDispatchOrderMismatchWarnings(cast, slotRow);
    if (warnings.length > 0) {
      const confirmed = window.confirm(
        [
          "オーダー条件に対して不足している可能性があります。",
          "",
          ...warnings.map((warning) => `・${warning}`),
          "",
          "このまま派遣表にセットしますか？",
        ].join("\n"),
      );
      if (!confirmed) {
        setDragOverDispatchSlotIndex(null);
        return;
      }
    }

    let savedToOrder = false;
    if (orderShop) {
      if (slotRow?.isOrderSlot && slotRow.orderId && slotRow.shopId) {
        try {
          const res = await upsertDispatchSheetRow({
            date: todayKey(),
            castId,
            orderId: slotRow.orderId,
            shopId: slotRow.shopId,
            startTime: "00:00",
            endTime: null,
            castHourly: cast?.desiredHourly ?? null,
            shopFee: null,
            note: slotRow.note ?? null,
            displayOrder,
          });
          setDispatchRows(res.rows ?? []);
          setDispatchShops(res.shops ?? dispatchShops);
          savedToOrder = true;
        } catch (err) {
          console.warn("[casts/today] failed to assign cast to order slot", err);
          await loadDispatchSheet();
          const message = err instanceof Error ? err.message : "";
          alert(
            message.includes("409")
              ? "他スタッフの操作と競合しました。このキャストは既に別の派遣表へ割り当てられている可能性があります。最新状態を再読み込みしました。"
              : "オーダー枠へのキャスト割当保存に失敗しました。最新状態を再読み込みしました。",
          );
          setDragOverDispatchSlotIndex(null);
          return;
        }
      }
      setDispatchRows((prev) =>
        prev.map((row) =>
          row.castId === castId
            ? {
                ...row,
                shopId: orderShop.id,
                shopName: orderShop.name,
                shopNumber: orderShop.code,
                orderId: slotRow?.orderId ?? row.orderId,
                orderNo: slotRow?.orderNo ?? row.orderNo,
              }
            : row,
        ),
      );
    }
    if (!orderShop || savedToOrder) {
      await markAttendanceRequest(castId, "added", displayOrder);
    }
    setPendingDispatchSlotIndex(null);
    setDragOverDispatchSlotIndex(null);
    setStatusTab("today");
  };

  const addSelectedCastToDispatchSlot = async () => {
    if (!selectedCast) return;
    if (pendingDispatchSlotIndex === null) {
      alert("追加先の派遣表枠を選択してください。");
      return;
    }
    await addCastToDispatchSlot(selectedCast.id, pendingDispatchSlotIndex);
    closeCastDetail();
  };

  const confirmOneDispatchRow = async (row: DispatchSheetRow) => {
    if (!row.castId) {
      alert("先にキャストを選択してください。");
      return;
    }
    if (!row.shopId) {
      alert("派遣先を選択してください。");
      return;
    }
    if (!normalizeDispatchTimeForSave(row.startTime)) {
      alert("時間を入力してください。");
      return;
    }
    const savedRows =
      row.status !== "confirmed"
        ? await saveDispatchRow(row)
        : null;
    const latest =
      savedRows?.find((item) => item.castId === row.castId) ??
      dispatchRows.find((item) => item.castId === row.castId) ??
      row;
    const assignmentId = latest.assignmentId ?? row.assignmentId;
    if (!assignmentId) {
      alert("派遣表の保存後に確定IDを取得できませんでした。再度お試しください。");
      return;
    }
    await confirmDispatchSheetRow(assignmentId);
    await loadDispatchSheet();
  };

  const cancelOneDispatchRow = async (row: DispatchSheetRow) => {
    if (!row.castId) return;
    if (!row.assignmentId) return;
    setCancelDialogRow(row);
    setCancelDialogType("cast");
    setCancelDialogReason(row.cancellationReason || "当日欠勤");
  };

  const closeCancelDialog = () => {
    setCancelDialogRow(null);
    setCancelDialogType("cast");
    setCancelDialogReason("");
  };

  const executeDispatchCancel = async () => {
    const row = cancelDialogRow;
    if (!row?.castId || !row.assignmentId) return;
    const trimmed = cancelDialogReason.trim();
    if (!trimmed) return;
    const typeLabel =
      cancelDialogType === "shop" ? "店舗都合キャンセル" : "キャスト都合キャンセル";
    setDispatchSavingKey(row.castId);
    try {
      await cancelDispatchSheetRow(
        row.assignmentId,
        trimmed || typeLabel,
        cancelDialogType,
      );
      closeCancelDialog();
      await loadDispatchSheet();
    } catch (err) {
      console.warn("[casts/today] failed to cancel dispatch row", err);
      alert("派遣表のキャンセルに失敗しました。時間をおいて再度お試しください。");
    } finally {
      setDispatchSavingKey(null);
    }
  };

  const removeManualDispatchRow = async (row: DispatchSheetRow) => {
    if (!row.castId) return;
    if (!row.manualAdded || row.status !== "draft") return;
    if (
      !window.confirm(
        `${row.displayName} を派遣表から外しますか？入力ミス扱いのため、キャンセル履歴には含めません。`,
      )
    ) {
      return;
    }
    setDispatchSavingKey(row.castId);
    try {
      const res = await upsertAttendanceRequest({
        date: todayKey(),
        castId: row.castId,
        status: "removed",
        displayOrder: row.displayOrder ?? null,
      });
      setAttendanceRequests(res.items ?? []);
      await loadDispatchSheet();
    } catch (err) {
      console.warn("[casts/today] failed to remove manual dispatch row", err);
      alert("派遣表から外す処理に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setDispatchSavingKey(null);
    }
  };

  const confirmAllDispatchRows = async () => {
    const targetIds = filteredDispatchRows
      .filter(
        (row) =>
          row.assignmentId &&
          row.shopId &&
          row.status !== "confirmed" &&
          row.status !== "canceled",
      )
      .map((row) => row.assignmentId as string);
    if (targetIds.length === 0) {
      alert("確定できる派遣行がありません。");
      return;
    }
    await confirmDispatchSheet({ date: todayKey(), assignmentIds: targetIds });
    await loadDispatchSheet();
  };

  const printDispatchSheet = useCallback(() => {
    if (typeof window === "undefined") return;
    const slots = dispatchPrintSlots.map((row) => {
      const shopName = row?.shopName
        ? `${row.shopNumber ? `${row.shopNumber} / ` : ""}${row.shopName}`
        : "";
      return `
        <div class="slot">
          <table>
            <tbody>
              <tr>
                <th>源氏名</th>
                <td><div class="name-cell"><strong>${escapeHtml(row?.displayName)}</strong><span>${escapeHtml(row?.managementNumber)}</span></div></td>
              </tr>
              <tr>
                <th>派遣先</th>
                <td>${escapeHtml(shopName)}</td>
              </tr>
              <tr>
                <th>時給・手数料</th>
                <td><div class="two-col"><span>${escapeHtml(row?.castHourly)}</span><span>${escapeHtml(row?.shopFee)}</span></div></td>
              </tr>
              <tr>
                <th>時間</th>
                <td>${escapeHtml(row?.startTime)}</td>
              </tr>
              <tr>
                <th>メモ</th>
                <td>${escapeHtml(row?.note)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      `;
    }).join("");

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      window.print();
      return;
    }
    printWindow.document.open();
    printWindow.document.write(`<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${escapeHtml(printDateLabel)} 派遣表</title>
          <style>
            @page { size: A4 landscape; margin: 8mm; }
            * { box-sizing: border-box; }
            body {
              margin: 0;
              color: #020617;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            h1 {
              margin: 0 0 5mm;
              text-align: center;
              font-size: 12px;
              line-height: 1.2;
            }
            .grid {
              display: grid;
              grid-template-columns: repeat(4, minmax(0, 1fr));
              gap: 0;
              background: #020617;
            }
            .slot {
              border: 1.5px solid #020617;
              background: #fff;
              break-inside: avoid;
              page-break-inside: avoid;
            }
            table {
              width: 100%;
              table-layout: fixed;
              border-collapse: collapse;
              font-size: 9px;
              line-height: 1.15;
            }
            th {
              width: 15mm;
              border-right: 1px solid #94a3b8;
              border-bottom: 1px solid #94a3b8;
              background: #f1f5f9;
              padding: 1.1mm 1mm;
              text-align: left;
              font-weight: 700;
            }
            td {
              min-height: 4.4mm;
              border-bottom: 1px solid #94a3b8;
              padding: 1.1mm 1mm;
              vertical-align: middle;
              overflow: hidden;
              white-space: nowrap;
              text-overflow: ellipsis;
            }
            tr:last-child th,
            tr:last-child td {
              border-bottom: 0;
            }
            .name-cell,
            .two-col {
              display: grid;
              grid-template-columns: minmax(0, 1fr) auto;
              gap: 1mm;
              align-items: center;
            }
            .name-cell span {
              color: #64748b;
              font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
              font-size: 8px;
            }
            .two-col span {
              min-height: 3mm;
              text-align: right;
            }
          </style>
        </head>
        <body>
          <h1>${escapeHtml(printDateLabel)} 派遣表</h1>
          <div class="grid">${slots}</div>
          <script>
            window.addEventListener("load", () => {
              window.focus();
              window.print();
            });
          </script>
        </body>
      </html>`);
    printWindow.document.close();
  }, [dispatchPrintSlots, printDateLabel]);

  const handleSelectShop = (shop: Shop) => {
    setSelectedShopId(shop.id);
    setShopModalOpen(false);

    // 割当候補は、選択した店舗条件に合わないものを除外
    setStaged((prev: Cast[]) =>
      prev.filter((c: Cast) =>
        matchesShopConditions(
          c,
          shop,
          selectedShopNgCastIdSet,
          selectedShopFixedCastIdSet,
        ),
      ),
    );
  };

  useEffect(() => {
    if (!selectedShop) return;
    setStaged((prev: Cast[]) =>
      prev.filter((c: Cast) =>
        matchesShopConditions(
          c,
          selectedShop,
          selectedShopNgCastIdSet,
          selectedShopFixedCastIdSet,
        ),
      ),
    );
  }, [selectedShop, selectedShopNgCastIdSet]);

  const ensureCastDetail = useCallback(
    async (castId: string) => {
      if (castDetailById[castId]) return;
      if (castDetailFetchRef.current.has(castId)) return;
      castDetailFetchRef.current.add(castId);
      try {
        const detail = await getCast(castId);
        setCastDetailById((prev) =>
          prev[castId] ? prev : { ...prev, [castId]: detail },
        );
        const rawUrl = resolvePhotoUrl(detail);
        const detailPhotoUrl = rawUrl
          ? await resolveCastPhotoDisplayUrl({
              castId,
              purpose: "profile",
              urlOrPath: rawUrl,
            })
          : null;
        const detailPhotoFallback =
          resolveLegacyPhotoFallbackUrl(detail) ?? undefined;
        if (detailPhotoUrl) {
          setPhotoByCastId((prev) =>
            prev[castId] ? prev : { ...prev, [castId]: detailPhotoUrl },
          );
        }
        if (detailPhotoFallback) {
          setPhotoFallbackByCastId((prev) =>
            prev[castId] ? prev : { ...prev, [castId]: detailPhotoFallback },
          );
        }
        const drinkLevel = getDrinkLevelFromDetail(detail);
        const hasExclusive = getCastExclusiveFlag(detail);
        const hasNominated = getCastNominatedFlag(detail);
        const heightCm = getHeightFromDetail(detail);
        const bodyType = getBodyTypeFromDetail(detail);
        const genres = getGenresFromDetail(detail);
        setAllCasts((prev) =>
          prev.map((c) =>
            c.id === castId
              ? {
                  ...c,
                  drinkLevel,
                  hasExclusive,
                  hasNominated,
                  heightCm,
                  bodyType,
                  genres,
                  photoUrl: detailPhotoUrl ?? c.photoUrl,
                  photoUrlRaw: detailPhotoFallback ?? c.photoUrlRaw,
                }
              : c,
          ),
        );
        setTodayCasts((prev) =>
          prev.map((c) =>
            c.id === castId
              ? {
                  ...c,
                  drinkLevel,
                  hasExclusive,
                  hasNominated,
                  heightCm,
                  bodyType,
                  genres,
                  photoUrl: detailPhotoUrl ?? c.photoUrl,
                  photoUrlRaw: detailPhotoFallback ?? c.photoUrlRaw,
                }
              : c,
          ),
        );
        setSelectedCast((prev) =>
          prev && prev.id === castId
            ? {
                ...prev,
                drinkLevel,
                hasExclusive,
                hasNominated,
                heightCm,
                bodyType,
                genres,
                photoUrl: detailPhotoUrl ?? prev.photoUrl,
                photoUrlRaw: detailPhotoFallback ?? prev.photoUrlRaw,
              }
            : prev,
        );
      } catch {
        // ignore detail fetch errors
      } finally {
        castDetailFetchRef.current.delete(castId);
      }
    },
    [castDetailById],
  );

  const openCastDetail = (
    cast: Cast,
    source: "cast-list" | "dispatch-sheet" = "cast-list",
  ) => {
    setCastDetailSource(source);
    setSelectedCast(cast);
    setCastDetailModalOpen(true);
    void ensureCastDetail(cast.id);
  };

  const openDispatchCastDetail = (row: DispatchSheetRow) => {
    if (!row.castId) return;
    const existing =
      todayCasts.find((cast) => cast.id === row.castId) ??
      allCasts.find((cast) => cast.id === row.castId);
    openCastDetail(
      existing ?? {
        id: row.castId,
        code: row.castCode ?? row.managementNumber,
        name: row.displayName,
        age: row.age ?? 0,
        desiredHourly: row.desiredHourly ?? row.castHourly ?? 0,
        drinkLevel: null,
      },
      "dispatch-sheet",
    );
  };

  const closeCastDetail = () => {
    setCastDetailModalOpen(false);
    setSelectedCast(null);
    setCastDetailSource("cast-list");
  };

  const closeNgModal = () => {
    setNgModalOpen(false);
  };

  const toggleNgShopSelection = (shopId: string) => {
    setNgSelectedShopIds((prev) =>
      prev.includes(shopId)
        ? prev.filter((id) => id !== shopId)
        : [...prev, shopId],
    );
  };

  const handleNgSave = () => {
    if (!selectedCast) return;
    const uniqueIds = Array.from(new Set(ngSelectedShopIds));

    setAllCasts((prev) =>
      prev.map((c) =>
        c.id === selectedCast.id ? { ...c, ngShopIds: uniqueIds } : c,
      ),
    );
    setTodayCasts((prev) =>
      prev.map((c) =>
        c.id === selectedCast.id ? { ...c, ngShopIds: uniqueIds } : c,
      ),
    );
    setSelectedCast((prev) =>
      prev ? { ...prev, ngShopIds: uniqueIds } : prev,
    );
    setNgModalOpen(false);
  };

  const assignCastToOrder = (orderId: string, cast: Cast) => {
    setOrderAssignments((prev) => {
      const current = prev[orderId] ?? [];
      if (current.some((c) => c.id === cast.id)) return prev;
      return { ...prev, [orderId]: [...current, cast] };
    });
    setStaged((prev: Cast[]) =>
      prev.some((x) => x.id === cast.id) ? prev : [...prev, cast],
    );
  };

  const handleOrderDrop = (cast: Cast) => {
    if (orderItems.length === 0) {
      const headcount = Number(dispatchCount);
      const safeHeadcount = Number.isFinite(headcount) ? headcount : undefined;
      const newOrder = createLocalOrderItem(safeHeadcount, entryTime);
      if (!newOrder) return;
      assignCastToOrder(newOrder.id, cast);
      return;
    }
    if (orderItems.length === 1) {
      assignCastToOrder(orderItems[0].id, cast);
      return;
    }
    setPendingCast(cast);
    setOrderSelectOpen(true);
  };

  const buildOrderDetail = (headcount?: number, startTime?: string) => {
    const countLabel =
      typeof headcount === "number" && !Number.isNaN(headcount)
        ? headcount
        : Number(dispatchCount);
    const timeLabel = startTime ?? entryTime;
    return `${countLabel}名　${timeLabel}〜`;
  };

  const createLocalOrderItem = (
    headcount?: number,
    startTime?: string,
  ) => {
    if (!selectedShopId) {
      alert("店舗が未選択です。");
      return null;
    }
    const detail = buildOrderDetail(headcount, startTime);
    const seq = orderSeqRef.current++;
    const newOrder = {
      id: `order-${seq}`,
      name: `オーダー${seq}`,
      detail,
      shopId: selectedShopId,
      headcount,
      startTime,
      apiOrderId: null,
    };
    setOrderItems((prev) => [...prev, newOrder]);
    return newOrder;
  };

  const ensureShopRequestId = async (
    shopId: string,
    date: string,
    headcount?: number,
  ) => {
    const res = await listShopRequests({
      date,
      shopId,
      take: 1,
      offset: 0,
    });
    if (res.items.length > 0) return res.items[0].id;
    const safeHeadcount =
      typeof headcount === "number" && Number.isFinite(headcount)
        ? Math.max(1, headcount)
        : 1;
    const created = await createShopRequest({
      shopId,
      requestDate: date,
      requestedHeadcount: safeHeadcount,
      requireDrinkOk: selectedShop?.requireDrinkOk ?? false,
      note: null,
    });
    return created.id;
  };

  const resolveShopRequestId = async (
    shopId: string,
    date: string,
  ): Promise<string | null> => {
    const cached = todayShops.find((s) => s.id === shopId)?.requestId ?? null;
    if (cached) return cached;
    try {
      const res = await listShopRequests({
        date,
        shopId,
        take: 1,
        offset: 0,
      });
      return res.items[0]?.id ?? null;
    } catch {
      return null;
    }
  };

  const updateLocalContactStatus = (
    shopId: string,
    status: string | null,
    requestId?: string | null,
  ) => {
    setTodayShops((prev) =>
      prev.map((shop) =>
        shop.id === shopId
          ? {
              ...shop,
              requestId: requestId ?? shop.requestId,
              contactStatus: status ?? null,
            }
          : shop,
      ),
    );
    setFallbackShops((prev) =>
      prev.map((shop) =>
        shop.id === shopId
          ? {
              ...shop,
              requestId: requestId ?? shop.requestId,
              contactStatus: status ?? null,
            }
          : shop,
      ),
    );
  };

  const getContactStatus = (shopId: string): string | null => {
    return (
      todayShops.find((s) => s.id === shopId)?.contactStatus ??
      fallbackShops.find((s) => s.id === shopId)?.contactStatus ??
      null
    );
  };

  const setContactStatus = async (
    shopId: string,
    status: string | null,
    options?: { force?: boolean },
  ) => {
    const current = getContactStatus(shopId);
    if (!options?.force && current === status) return;
    if (!options?.force) {
      if (
        status === "editing" &&
        (current === "confirmed" || current === "rejected" || current === "ordered")
      ) {
        return;
      }
      if (status === null && current && current !== "editing") {
        return;
      }
    }

    const date = todayKey();
    const requestId = await resolveShopRequestId(shopId, date);
    updateLocalContactStatus(shopId, status, requestId);
    if (!requestId) {
      console.warn("[casts/today] contactStatus pending (requestId not found)", {
        shopId,
        status,
      });
      return;
    }
    try {
      await updateShopRequest(requestId, {
        contactStatus: status ?? null,
        force: options?.force ?? false,
      });
    } catch (err) {
      console.warn("[casts/today] update contactStatus failed", {
        shopId,
        status,
        err,
      });
      await loadDispatchSheet();
      alert("他スタッフの操作と競合しました。最新状態を再読み込みしました。");
    }
  };

  const ensureApiOrderId = async (
    orderId: string,
    allowCreate: boolean,
  ): Promise<string | null> => {
    const targetOrder = orderItems.find((order) => order.id === orderId);
    const shopId = targetOrder?.shopId ?? selectedShopId;
    if (!shopId) {
      alert("店舗が未選択です。");
      return null;
    }
    if (targetOrder?.apiOrderId) return targetOrder.apiOrderId;

    const date = todayKey();
    let orders: any[] = [];
    try {
      orders = await listShopOrders(date);
    } catch (err) {
      console.warn("[casts/today] listShopOrders failed", {
        date,
        shopId,
        err,
      });
    }

    const matches = orders.filter(
      (order) => order?.shopId === shopId || order?.shop?.id === shopId,
    );
    if (matches.length === 1) {
      const apiOrderId = matches[0]?.id ?? null;
      if (apiOrderId) {
        setOrderItems((prev) =>
          prev.map((order) =>
            order.id === orderId ? { ...order, apiOrderId } : order,
          ),
        );
        return apiOrderId;
      }
    }

    if (!allowCreate) return null;

    const parsedHeadcount = targetOrder?.headcount ?? Number(dispatchCount);
    const headcount = Number.isFinite(parsedHeadcount)
      ? parsedHeadcount
      : undefined;
    const startTime = targetOrder?.startTime ?? entryTime ?? undefined;
    const shopRequestId = await ensureShopRequestId(
      shopId,
      date,
      headcount,
    );
    const maxOrderNo = matches.reduce((max, order) => {
      const orderNo = Number(order?.orderNo ?? order?.order_no ?? 0);
      return orderNo > max ? orderNo : max;
    }, 0);
    const created = await createShopOrder({
      shopRequestId,
      orderNo: maxOrderNo + 1 || 1,
      headcount,
      startTime,
      status: "draft",
    });
    const apiOrderId = created.id;
    setOrderItems((prev) =>
      prev.map((order) =>
        order.id === orderId ? { ...order, apiOrderId } : order,
      ),
    );
    return apiOrderId;
  };

  const createOrderItemFromSelection = async () => {
    if (!selectedShopId) {
      alert("店舗が未選択です。");
      return null;
    }
    const parsedHeadcount = Number(dispatchCount);
    const headcount = Number.isFinite(parsedHeadcount)
      ? parsedHeadcount
      : undefined;
    const startTime = entryTime ?? undefined;
    const detail = buildOrderDetail(headcount, startTime);

    const date = todayKey();
    let orders: any[] = [];
    try {
      orders = await listShopOrders(date);
    } catch (err) {
      console.warn("[casts/today] listShopOrders failed", {
        date,
        selectedShopId,
        err,
      });
    }
    const matches = orders.filter(
      (order) =>
        order?.shopId === selectedShopId ||
        order?.shop?.id === selectedShopId,
    );
    const maxOrderNo = matches.reduce((max, order) => {
      const orderNo = Number(order?.orderNo ?? order?.order_no ?? 0);
      return orderNo > max ? orderNo : max;
    }, 0);
    const shopRequestId = await ensureShopRequestId(
      selectedShopId,
      date,
      headcount,
    );
    const created = await createShopOrder({
      shopRequestId,
      orderNo: maxOrderNo + 1 || 1,
      headcount,
      startTime,
      status: "draft",
    });

    const newOrder = createLocalOrderItem(headcount, startTime);
    if (!newOrder) return null;
    setOrderItems((prev) =>
      prev.map((order) =>
        order.id === newOrder.id
          ? { ...order, apiOrderId: created.id }
          : order,
      ),
    );
    return { ...newOrder, apiOrderId: created.id };
  };

  const createDispatchOrderSlotsFromSelectedShop = async () => {
    if (!selectedShopId || !selectedShop) {
      alert("店舗一覧で稼働中の店舗を選択してください。");
      return;
    }
    const headcount = Math.max(1, Math.min(20, proposalOrderHeadcount || 1));
    const effectiveHairSet = proposalOrderHairSet || selectedShop.hairSet || "";
    const orderNote = [
      proposalOrderWage ? `時給: ${proposalOrderWage}円` : "",
      proposalOrderAlcohol
        ? `お酒: ${formatDrinkLevelShort(proposalOrderAlcohol)}`
        : "",
      effectiveHairSet
        ? `ヘアセット: ${formatHairSetLabel(effectiveHairSet)}`
        : "",
    ]
      .filter(Boolean)
      .join(" / ");
    setProposalOrderSaving(true);
    try {
      const date = todayKey();
      const orders = await listShopOrders(date).catch((err) => {
        console.warn("[casts/today] listShopOrders failed", {
          date,
          selectedShopId,
          err,
        });
        return [] as any[];
      });
      const matches = orders.filter(
        (order) =>
          order?.shopId === selectedShopId ||
          order?.shop?.id === selectedShopId,
      );
      const shopRequestId = await ensureShopRequestId(
        selectedShopId,
        date,
        headcount,
      );
      const activeMatches = matches
        .filter((order) => order?.status !== "canceled")
        .sort((a, b) => {
          const aCreated = Date.parse(String(a?.createdAt ?? ""));
          const bCreated = Date.parse(String(b?.createdAt ?? ""));
          if (Number.isFinite(aCreated) && Number.isFinite(bCreated)) {
            return aCreated - bCreated;
          }
          const aNo = Number(a?.orderNo ?? a?.order_no ?? 0);
          const bNo = Number(b?.orderNo ?? b?.order_no ?? 0);
          return aNo - bNo;
        });
      const primaryOrder = activeMatches[0] ?? null;
      if (primaryOrder?.id) {
        await updateShopOrder(primaryOrder.id, {
          shopRequestId,
          headcount,
          status: "draft",
          note: orderNote || null,
        });
        await Promise.all(
          activeMatches.slice(1).map((order) =>
            order?.id
              ? updateShopOrder(order.id, { status: "canceled" }).catch(
                  (err) => {
                    console.warn("[casts/today] failed to cancel duplicate order", {
                      orderId: order.id,
                      err,
                    });
                  },
                )
              : Promise.resolve(),
          ),
        );
      } else {
        const maxOrderNo = matches.reduce((max, order) => {
          const orderNo = Number(order?.orderNo ?? order?.order_no ?? 0);
          return Number.isFinite(orderNo) && orderNo > max ? orderNo : max;
        }, 0);
        await createShopOrder({
          shopRequestId,
          orderNo: maxOrderNo + 1 || 1,
          headcount,
          status: "draft",
          note: orderNote || null,
        });
      }
      await setContactStatus(selectedShopId, "ordered", { force: true });
      setSelectedShopId("");
      setProposalOrderHeadcount(1);
      setProposalOrderWage("");
      setProposalOrderAlcohol("");
      setProposalOrderHairSet("");
      await loadDispatchSheet();
    } catch (err) {
      console.warn("[casts/today] failed to create dispatch order slots", err);
      alert("オーダー枠の作成に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setProposalOrderSaving(false);
    }
  };

  const rejectSelectedShopFromProposal = async () => {
    if (!selectedShopId || !selectedShop) {
      alert("店舗一覧で稼働中の店舗を選択してください。");
      return;
    }
    if (!window.confirm(`${selectedShop.name} を本日オーダーNGでクローズしますか？`)) {
      return;
    }
    setProposalOrderSaving(true);
    try {
      await setContactStatus(selectedShopId, "rejected", { force: true });
      setSelectedShopId("");
    } finally {
      setProposalOrderSaving(false);
    }
  };

  const resetOrderState = () => {
    setOrderAssignments({});
    setOrderItems([]);
    setStaged([]);
    setSelectedShopId("");
    setOrderShopQuery("");
    setOrderShopOpen(false);
    setOrderSelectOpen(false);
    setPendingCast(null);
    setConfirmOrderSelectOpen(false);
    setConfirmOrderCandidates([]);
    setRejectOrderSelectOpen(false);
    setRejectOrderCandidates([]);
    setFloatMinimized(true);
  };

  const finalizeOrderConfirm = async (
    orderId: string,
    options?: { allowCreate?: boolean },
  ) => {
    console.warn("[casts/today] finalize start", {
      orderId,
      selectedShopId,
    });
    const casts = orderAssignments?.[orderId] ?? [];
    if (casts.length === 0) {
      alert("割当候補がありません。");
      return;
    }
    const targetOrder = orderItems.find((order) => order.id === orderId);
    console.warn("[casts/today] finalize targetOrder", {
      targetOrder,
      apiOrderId: targetOrder?.apiOrderId ?? null,
    });
    const apiOrderId = await ensureApiOrderId(
      orderId,
      options?.allowCreate ?? false,
    );
    if (!apiOrderId) {
      if (options?.allowCreate) {
        alert("オーダー作成に失敗しました。時間をおいて再度お試しください。");
        return;
      }
      setMissingOrderTargetId(orderId);
      setMissingOrderConfirmOpen(true);
      return;
    }
    const assignedTime = targetOrder?.startTime ?? entryTime ?? "00:00";
    const assignedFrom = `${todayKey()}T${assignedTime}:00+09:00`;
    const payloads = casts.map((c: Cast) => ({
      castId: c.id,
      assignedFrom,
      assignedTo: null,
      priority: 0,
      reasonOverride: null,
    }));
    console.warn("[casts/today] replaceOrderAssignments start", {
      apiOrderId,
      payloadCount: payloads.length,
    });
    try {
      await replaceOrderAssignments(apiOrderId, payloads);
      console.warn("[casts/today] replaceOrderAssignments success", {
        apiOrderId,
      });
    } catch (err) {
      console.warn("[casts/today] replaceOrderAssignments failed", {
        orderId: apiOrderId,
        err,
      });
      alert("保存に失敗しました。時間をおいて再度お試しください。");
      return;
    }
    await fetchMatchedCastIds();
    if (selectedShop) {
      alert(
        `${selectedShop.name} への割当を確定（デモ）\n\n` +
          orderItems
            .flatMap((order) =>
              (orderAssignments[order.id] ?? []).map(
                (c: Cast) =>
                  `${order.name} ${c.code} ${c.name}（¥${c.desiredHourly.toLocaleString()}）`,
              ),
            )
            .join("\n"),
      );
    }
    if (selectedShopId) {
      await setContactStatus(selectedShopId, "confirmed", { force: true });
    }
    resetOrderState();
  };

  const rejectOrder = async (orderId: string) => {
    console.warn("[casts/today] reject start", { orderId, selectedShopId });
    const apiOrderId = await ensureApiOrderId(orderId, false);
    if (!apiOrderId) {
      if (selectedShopId) {
        await setContactStatus(selectedShopId, "rejected", { force: true });
      }
      resetOrderState();
      return;
    }
    try {
      await replaceOrderAssignments(apiOrderId, []);
      await updateShopOrder(apiOrderId, { status: "canceled" });
    } catch (err) {
      console.warn("[casts/today] reject failed", { apiOrderId, err });
      alert("不承処理に失敗しました。時間をおいて再度お試しください。");
      return;
    }
    await fetchMatchedCastIds();
    if (selectedShopId) {
      await setContactStatus(selectedShopId, "rejected", { force: true });
    }
    resetOrderState();
  };

  useEffect(() => {
    let cancelled = false;
    const targets = filteredCasts.filter(
      (c) => !photoByCastId[c.id] && resolvePhotoUrl(c),
    );
    if (targets.length === 0) return;
    const run = async () => {
      await Promise.all(
        targets.map(async (c) => {
          const rawUrl = resolvePhotoUrl(c);
          if (!rawUrl) return;
          const fallbackUrl = resolveLegacyPhotoFallbackUrl(c);
          const finalUrl = await resolveCastPhotoDisplayUrl({
            castId: c.id,
            purpose: "profile",
            urlOrPath: rawUrl,
          });
          if (finalUrl && !cancelled) {
            setPhotoByCastId((prev) =>
              prev[c.id] ? prev : { ...prev, [c.id]: finalUrl },
            );
          }
          if (fallbackUrl && !cancelled) {
            setPhotoFallbackByCastId((prev) =>
              prev[c.id] ? prev : { ...prev, [c.id]: fallbackUrl },
            );
          }
        }),
      );
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [filteredCasts, photoByCastId]);

  useEffect(() => {
    const urls: string[] = [];
    for (const cast of filteredCasts) {
      const url = photoByCastId[cast.id];
      if (url) urls.push(url);
      if (urls.length >= 48) break;
    }
    if (urls.length === 0) return;
    urls.forEach((url) => {
      if (prefetchedImageUrlsRef.current.has(url)) return;
      prefetchedImageUrlsRef.current.add(url);
      const img = new Image();
      img.src = url;
    });
  }, [filteredCasts, photoByCastId]);

  useEffect(() => {
    const targets = filteredCasts;
    if (targets.length === 0) return;
    targets.forEach((cast) => {
      if (castDetailById[cast.id]) return;
      void ensureCastDetail(cast.id);
    });
  }, [filteredCasts, castDetailById, ensureCastDetail]);

  useEffect(() => {
    if (floatPos) return;
    if (typeof window === "undefined") return;
    const width = 360;
    const height = 420;
    const x = Math.max(16, window.innerWidth - width - 24);
    const y = Math.max(16, window.innerHeight - height - 24);
    setFloatPos({ x, y });
  }, [floatPos]);

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e: MouseEvent) => {
      setFloatPos((prev) => {
        if (!prev) return prev;
        return { x: e.clientX - dragOffset.x, y: e.clientY - dragOffset.y };
      });
    };
    const handleUp = () => setDragging(false);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [dragging, dragOffset]);

  const handleRejectClick = async () => {
    if (!selectedShopId) {
      alert("店舗が未選択です。");
      return;
    }
    const shopOrders = orderItems.filter((o) => {
      const shopId = (o as any)?.shopId ?? (o as any)?.shop?.id ?? "";
      return shopId ? shopId === selectedShopId : true;
    });
    if (shopOrders.length === 0) {
      await setContactStatus(selectedShopId, "rejected", { force: true });
      resetOrderState();
      return;
    }
    if (shopOrders.length > 1) {
      setRejectOrderCandidates(shopOrders);
      setRejectOrderSelectOpen(true);
      return;
    }
    await rejectOrder(shopOrders[0].id);
  };

  return (
    <AppShell>
      <div className="casts-today h-full flex flex-col gap-3">
        <section
          className={
            "tiara-panel rounded-none p-2 flex flex-col gap-2 relative " +
            (supportMode ? "support-mode-active" : "")
          }
          style={{ borderRadius: 0 }}
        >
          {supportMode && (
            <div className="support-mode-overlay" aria-hidden="true" />
          )}
          {tutorialMessage && (
            <div className="support-callout">
              <div className="text-[11px] font-bold text-amber-900">
                {tutorialMessage.title}
              </div>
              <div className="mt-0.5 text-[10px] leading-snug text-slate-800">
                {tutorialMessage.body}
              </div>
            </div>
          )}
          {panelTab === "shops" ? (
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <div className="inline-flex bg-white border border-slate-200 overflow-visible text-xs shadow-sm flex-none">
                  <button
                    type="button"
                    className={
                      "px-4 h-8 bg-transparent text-gray-700 relative overflow-visible " +
                      (tutorialTarget === "cast-tab"
                        ? "support-focus"
                        : "")
                    }
                    onClick={() => setPanelTab("casts")}
                  >
                    キャスト一覧
                  </button>
                  <button
                    type="button"
                    className="px-4 h-8 border-l border-slate-200 bg-sky-600 text-white"
                    onClick={() => setPanelTab("shops")}
                  >
                    店舗一覧
                  </button>
                </div>
                <select
                  className="tiara-input rounded-none h-8 !w-[120px] !py-1 text-[10px] leading-tight flex-none"
                  value={shopFilterExclusive}
                  onChange={(e) =>
                    setShopFilterExclusive(e.target.value as YesNoFilter)
                  }
                >
                  <option value="">専属</option>
                  <option value="yes">専属：あり</option>
                  <option value="no">専属：なし</option>
                </select>
                <select
                  className="tiara-input rounded-none h-8 !w-[120px] !py-1 text-[10px] leading-tight flex-none"
                  value={shopFilterNominated}
                  onChange={(e) =>
                    setShopFilterNominated(e.target.value as YesNoFilter)
                  }
                >
                  <option value="">指名</option>
                  <option value="yes">指名：あり</option>
                  <option value="no">指名：なし</option>
                </select>
                <select
                  className="tiara-input rounded-none h-8 !w-[120px] !py-1 text-[10px] leading-tight flex-none"
                  value={shopFilterWage}
                  onChange={(e) =>
                    setShopFilterWage(e.target.value as WageFilter)
                  }
                >
                  <option value="">時給</option>
                  {shopWageOptions.map((v) => (
                    <option key={v} value={v}>
                      時給：{v}円
                    </option>
                  ))}
                </select>
                <select
                  className="tiara-input rounded-none h-8 !w-[120px] !py-1 text-[10px] leading-tight flex-none"
                  value={shopFilterIdReq}
                  onChange={(e) => setShopFilterIdReq(e.target.value)}
                >
                  <option value="">身分証</option>
                  <option value="none">身分証：不要</option>
                  <option value="photo_only">身分証：写真のみ</option>
                  <option value="address_only">身分証：住所のみ</option>
                  <option value="both">身分証：両方</option>
                </select>
                <select
                  className="tiara-input rounded-none h-8 !w-[120px] !py-1 text-[10px] leading-tight flex-none"
                  value={shopFilterGenre}
                  onChange={(e) =>
                    setShopFilterGenre(
                      (e.target.value || "") as ShopGenre | "",
                    )
                  }
                >
                  <option value="">ジャンル</option>
                  <option value="club">クラブ</option>
                  <option value="cabaret">キャバ</option>
                  <option value="snack">スナック</option>
                  <option value="gb">ガルバ</option>
                </select>
                <select
                  className="tiara-input rounded-none h-8 !w-[120px] !py-1 text-[10px] leading-tight flex-none"
                  value={shopFilterContact}
                  onChange={(e) =>
                    setShopFilterContact(e.target.value as ContactMethodFilter)
                  }
                >
                  <option value="">連絡方法</option>
                  <option value="line">LINE</option>
                  <option value="sms">SMS</option>
                  <option value="tel">TEL</option>
                </select>
                <select
                  className="tiara-input rounded-none h-8 !w-[125px] !py-1 text-[10px] leading-tight flex-none"
                  value={shopSortKey}
                  onChange={(e) => setShopSortKey(e.target.value as ShopSortKey)}
                >
                  <option value="number">店舗番号順</option>
                  <option value="kana">50音順</option>
                  <option value="favorite">注文実績順</option>
                </select>
                <button
                  type="button"
                  className="border border-slate-300 bg-white px-3 h-8 text-xs flex-none"
                  onClick={() => {
                    setShopFilterExclusive("");
                    setShopFilterNominated("");
                    setShopFilterWage("");
                    setShopFilterIdReq("");
                    setShopFilterGenre("");
                    setShopFilterContact("");
                    setShopSortKey("number");
                  }}
                >
                  クリア
                </button>
                <div className="ml-auto text-[11px] text-muted">
                  表示中: {sortedTodayShops.length} 店舗
                </div>
              </div>

              <div
                className={
                  "border border-slate-200 bg-white text-xs overflow-auto " +
                  (tutorialTarget === "shop-list" ? "support-focus" : "")
                }
              >
                <table className="min-w-[1150px] w-full border-collapse">
                  <thead className="bg-slate-100">
                    <tr>
                      {shopTableColumns.map((col) => (
                        <th
                          key={col.key}
                          className="border border-slate-200 px-2 py-1 text-left font-semibold whitespace-nowrap"
                          style={{ width: col.width }}
                        >
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedTodayShops.length === 0 ? (
                      <tr>
                        <td
                          colSpan={shopTableColumns.length}
                          className="border border-slate-200 px-3 py-6 text-center text-muted"
                        >
                          本日の店舗がありません。
                        </td>
                      </tr>
                    ) : (
                      sortedTodayShops.map((shop) => {
                        const isSelected = shop.id === selectedShopId;
                        const isClosed = isClosedContactStatus(
                          shop.contactStatus,
                        );
                        return (
                          <tr
                            key={shop.id}
                            className={`${
                              isSelected ? "bg-sky-100" : ""
                            } ${
                              isClosed
                                ? "bg-slate-100 text-slate-400 cursor-pointer hover:bg-slate-200"
                                : "hover:bg-slate-50 cursor-pointer"
                            }`}
                            onClick={async () => {
                              if (isClosed) {
                                const ok = window.confirm(
                                  "この店舗は連絡完了済みです。再度選択しますか？",
                                );
                                if (!ok) return;
                                await setContactStatus(shop.id, "editing", {
                                  force: true,
                                });
                                setSelectedShopId(shop.id);
                                return;
                              }
                              setSelectedShopId((prev) => {
                                const next = prev === shop.id ? "" : shop.id;
                                return next;
                              });
                            }}
                          >
                          {shopTableColumns.map((col, idx) => {
                            const isEditing = shop.contactStatus === "editing";
                            const isNameCell = col.key === "name";
                            return (
                              <td
                                key={col.key}
                                className={`border border-slate-200 px-2 py-1 whitespace-nowrap ${
                                  isSelected && idx === 0
                                    ? "border-l-4 border-l-sky-500"
                                    : ""
                                } ${isEditing && isNameCell ? "bg-red-100 text-red-700" : ""}`}
                              >
                                {renderShopCell(shop, col.key)}
                              </td>
                            );
                          })}
                        </tr>
                      )})
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <>
              {/* キャスト一覧：ソート/フィルタ（シンプル配置） */}
              <div className="flex flex-col gap-1.5 text-xs">
                <div className="flex items-center gap-1.5 overflow-visible">
                  <div className="inline-flex bg-white border border-slate-200 overflow-visible text-xs shadow-sm flex-none">
                    <button
                      type="button"
                      className={
                        "px-3 h-8 bg-sky-600 text-white relative overflow-visible " +
                        (tutorialTarget === "cast-tab" ? "support-focus" : "")
                      }
                      onClick={() => setPanelTab("casts")}
                    >
                      キャスト一覧
                    </button>
                    <button
                      type="button"
                      className={
                        "px-3 h-8 border-l border-slate-200 bg-transparent text-gray-700 relative overflow-visible " +
                        (tutorialTarget === "shop-tab"
                          ? "support-focus"
                          : "")
                      }
                      onClick={() => setPanelTab("shops")}
                    >
                      店舗一覧
                    </button>
                  </div>
                  <input
                    className="tiara-input rounded-none h-8 !w-[170px] text-[10px] leading-tight flex-none"
                    placeholder="管理番号・名前・旧ID"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                  />
                  <div className="inline-flex h-8 overflow-hidden border border-slate-900 bg-white text-[10px] font-semibold flex-none">
                    <button
                      type="button"
                      className={
                        "px-3 " +
                        (castListMode === "proposal"
                          ? "bg-slate-900 text-white"
                          : "bg-white text-slate-700 hover:bg-slate-50")
                      }
                      onClick={() => {
                        setCastListMode("proposal");
                        setAttendanceRequestFilter("");
                        set担当者("all");
                      }}
                    >
                      マッチング提案
                    </button>
                    <button
                      type="button"
                      className={
                        "border-l border-slate-900 px-3 " +
                        (castListMode === "request"
                          ? "bg-slate-900 text-white"
                          : "bg-white text-slate-700 hover:bg-slate-50")
                      }
                      onClick={() => {
                        setCastListMode("request");
                        setDispatchStatusFilter("");
                      }}
                    >
                      出勤依頼
                    </button>
                  </div>
                  {castListMode === "proposal" ? (
                    <select
                      className="h-8 w-[130px] flex-none border-2 border-sky-600 bg-sky-50 px-2 text-[10px] font-semibold text-sky-900"
                      value={dispatchStatusFilter}
                      onChange={(e) =>
                        setDispatchStatusFilter(
                          e.target.value as DispatchStatusFilter,
                        )
                      }
                    >
                      <option value="">本日出勤すべて</option>
                      <option value="unassigned">未割当のみ</option>
                      <option value="matched">マッチ済み</option>
                    </select>
                  ) : (
                    <div
                      className={
                        "relative flex-none overflow-visible " +
                        (tutorialTarget === "request-status-filter"
                          ? "support-focus"
                          : "")
                      }
                    >
                      <select
                        className="h-8 w-[130px] border-2 border-amber-500 bg-amber-50 px-2 text-[10px] font-semibold text-amber-900"
                        value={attendanceRequestFilter}
                        onChange={(e) =>
                          setAttendanceRequestFilter(
                            e.target.value as AttendanceRequestFilter,
                          )
                        }
                      >
                        <option value="">依頼状態すべて</option>
                        <option value="none">未依頼</option>
                        <option value="requested">依頼済み</option>
                        <option value="ok">出勤OK</option>
                        <option value="ng">出勤NG</option>
                        <option value="no_show">当日欠勤</option>
                      </select>
                    </div>
                  )}
                  <button
                    type="button"
                    className={
                      "h-8 flex-none border px-3 text-[10px] font-semibold " +
                      (supportMode
                        ? "border-amber-600 bg-amber-500 text-white"
                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50")
                    }
                    onClick={() => setSupportMode((prev) => !prev)}
                    title="マッチング作業の流れを画面上で案内します"
                  >
                    サポートモード {supportMode ? "ON" : "OFF"}
                  </button>
                  {castListMode === "request" && statusTab === "all" && (
                    <button
                      type="button"
                      className={
                        "h-8 flex-none border-2 border-amber-500 bg-amber-50 px-3 text-[10px] font-semibold text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 relative overflow-visible " +
                        (tutorialTarget === "bulk-request"
                          ? "support-focus"
                          : "")
                      }
                      onClick={openBulkRequestModal}
                      disabled={
                        bulkRequestSending || bulkRequestTargets.length === 0
                      }
                      title="現在の絞り込み条件に該当する未送信キャスト全員に出勤依頼チャットを送信します"
                    >
                      {bulkRequestSending
                        ? "一括送信中..."
                        : `条件内の未送信${bulkRequestTargets.length}名に一括送信`}
                    </button>
                  )}
                  <div className="ml-auto flex w-[180px] flex-none flex-col gap-0.5">
                    <button
                      type="button"
                      className="h-[15px] border border-gray-300 bg-gray-100 px-1.5 text-[9px] leading-none text-gray-600 hover:bg-gray-200"
                      onClick={() => {
                        setSettingsDraft(effectiveMatchingSettings);
                        setSettingsError(null);
                        setSettingsOpen(true);
                      }}
                    >
                      build: {buildStamp}
                    </button>
                    <div className="flex h-[15px] items-center justify-between gap-1">
                      <label className="inline-flex items-center gap-0.5 text-[10px] leading-none">
                        <input
                          type="checkbox"
                          className="h-3 w-3"
                          checked={sortKana}
                          onChange={(e) => setSortKana(e.target.checked)}
                        />
                        50音
                      </label>
                      <label className="inline-flex items-center gap-0.5 text-[10px] leading-none">
                        <input
                          type="checkbox"
                          className="h-3 w-3"
                          checked={sortNumberSmallFirst}
                          onChange={(e) =>
                            setSortNumberSmallFirst(e.target.checked)
                          }
                        />
                        番号↑
                      </label>
                      <label className="inline-flex items-center gap-0.5 text-[10px] leading-none">
                        <input
                          type="checkbox"
                          className="h-3 w-3"
                          checked={sortNumberLargeFirst}
                          onChange={(e) =>
                            setSortNumberLargeFirst(e.target.checked)
                          }
                        />
                        番号↓
                      </label>
                    </div>
                  </div>
                </div>

                <div
                  className={
                    "flex flex-wrap items-center gap-1.5 border border-slate-200 bg-slate-50 px-2 py-1 " +
                    (tutorialTarget === "proposal-filters" ||
                    tutorialTarget === "request-filters"
                      ? "support-focus"
                      : tutorialTarget === "active-shop-order" ||
                          tutorialTarget === "dispatch-tab"
                        ? "support-visible"
                        : "")
                  }
                >
                  <span className="mr-1 text-[10px] font-semibold text-slate-500">
                    補助フィルター
                  </span>
                  <select
                    className="tiara-input matching-filter-select rounded-none h-8 !w-[100px] text-[10px] flex-none bg-white"
                    value={castWageFilter}
                    onChange={(e) =>
                      setCastWageFilter(e.target.value as WageFilter)
                    }
                  >
                    <option value="">時給</option>
                    {shopWageOptions.map((v) => (
                      <option key={v} value={v}>
                        {v}円帯
                      </option>
                    ))}
                  </select>
                  <select
                    className="tiara-input matching-filter-select rounded-none h-8 !w-[115px] text-[10px] flex-none bg-white"
                    value={castNominationFilter}
                    onChange={(e) =>
                      setCastNominationFilter(
                        e.target.value as CastNominationFilter,
                      )
                    }
                  >
                    <option value="">指名</option>
                    <option value="exclusive">専属指名あり</option>
                    <option value="nominated">指名あり</option>
                    <option value="free">フリー</option>
                  </select>
                  <select
                    className="tiara-input matching-filter-select rounded-none h-8 !w-[105px] text-[10px] flex-none bg-white"
                    value={drinkLevelFilter}
                    onChange={(e) =>
                      setDrinkLevelFilter(e.target.value as DrinkLevelFilter)
                    }
                  >
                    <option value="">飲酒</option>
                    <option value="strong">強い</option>
                    <option value="normal">普通</option>
                    <option value="weak">弱い</option>
                    <option value="ng">NG</option>
                  </select>
                  <select
                    className="tiara-input matching-filter-select rounded-none h-8 !w-[105px] text-[10px] flex-none bg-white"
                    value={castGenreFilter}
                    onChange={(e) =>
                      setCastGenreFilter(
                        (e.target.value || "") as CastGenre | "",
                      )
                    }
                  >
                    <option value="">ジャンル</option>
                    <option value="club">クラブ</option>
                    <option value="cabaret">キャバ</option>
                    <option value="snack">スナック</option>
                    <option value="gb">ガルバ</option>
                  </select>
                  <select
                    className="tiara-input matching-filter-select rounded-none h-8 !w-[115px] text-[10px] flex-none bg-white"
                    value={ageRangeFilter}
                    onChange={(e) =>
                      setAgeRangeFilter(e.target.value as AgeRangeFilter)
                    }
                  >
                    <option value="">年齢レンジ</option>
                    <option value="18-19">18〜19歳</option>
                    <option value="20-24">20〜24歳</option>
                    <option value="25-29">25〜29歳</option>
                    <option value="30-34">30〜34歳</option>
                    <option value="35-39">35〜39歳</option>
                    <option value="40-49">40〜49歳</option>
                    <option value="50-">50歳以上</option>
                  </select>
                  {castListMode === "request" && (
                    <select
                      className="tiara-input matching-filter-select rounded-none h-8 !w-[125px] text-[10px] flex-none bg-white"
                      value={担当者}
                      onChange={(e) => set担当者(e.target.value)}
                    >
                      <option value="all">担当者：すべて</option>
                      {ownerStaffOptions.map((name) => (
                        <option key={name} value={name}>
                          {name}
                          {name === currentStaffName ? "（自分）" : ""}
                        </option>
                      ))}
                    </select>
                  )}
                  <select
                    className="tiara-input matching-filter-select rounded-none h-8 !w-[120px] text-[10px] flex-none bg-white"
                    value={sortKey}
                    onChange={(e) => setSortKey(e.target.value as SortKey)}
                  >
                    <option value="default">並び替え</option>
                    <option value="hourlyDesc">時給が高い順</option>
                    <option value="ageAsc">年齢が若い順</option>
                    <option value="ageDesc">年齢が高い順</option>
                  </select>
                </div>

                {castListMode === "proposal" && selectedShop ? (
                  <div
                    className={
                      "flex flex-wrap items-center gap-2 border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] text-sky-950 " +
                      (tutorialTarget === "active-shop-order"
                        ? "support-focus"
                        : "")
                    }
                  >
                    <span className="font-semibold">稼働中店舗</span>
                    <span className="max-w-[260px] truncate">
                      {selectedShop.code ? `${selectedShop.code} / ` : ""}
                      {selectedShop.name}
                    </span>
                    <select
                      className="h-7 w-[88px] border border-sky-300 bg-white px-2 text-[11px]"
                      value={proposalOrderHeadcount}
                      onChange={(e) =>
                        setProposalOrderHeadcount(Number(e.target.value))
                      }
                      disabled={proposalOrderSaving}
                    >
                      {Array.from({ length: 10 }, (_, i) => i + 1).map(
                        (count) => (
                          <option key={count} value={count}>
                            {count}人
                          </option>
                        ),
                      )}
                    </select>
                    <select
                      className="h-7 w-[105px] border border-sky-300 bg-white px-2 text-[11px]"
                      value={proposalOrderWage}
                      onChange={(e) =>
                        setProposalOrderWage(e.target.value as WageFilter)
                      }
                      disabled={proposalOrderSaving}
                    >
                      <option value="">時給</option>
                      {shopWageOptions.map((wage) => (
                        <option key={`proposal-order-wage-${wage}`} value={wage}>
                          {wage}円
                        </option>
                      ))}
                    </select>
                    <select
                      className="h-7 w-[105px] border border-sky-300 bg-white px-2 text-[11px]"
                      value={proposalOrderAlcohol}
                      onChange={(e) =>
                        setProposalOrderAlcohol(
                          e.target.value as DrinkLevelOption | "",
                        )
                      }
                      disabled={proposalOrderSaving}
                    >
                      <option value="">お酒</option>
                      <option value="strong">強い</option>
                      <option value="normal">普通</option>
                      <option value="weak">弱い</option>
                      <option value="ng">NG</option>
                    </select>
                    <select
                      className="h-7 w-[112px] border border-sky-300 bg-white px-2 text-[11px]"
                      value={proposalOrderHairSet}
                      onChange={(e) => setProposalOrderHairSet(e.target.value)}
                      disabled={proposalOrderSaving}
                    >
                      <option value="">
                        {selectedShop.hairSet
                          ? `店舗設定: ${formatHairSetLabel(selectedShop.hairSet)}`
                          : "ヘアセット"}
                      </option>
                      <option value="none">不要</option>
                      <option value="need">必要</option>
                    </select>
                    <button
                      type="button"
                      className="h-7 border border-sky-700 bg-sky-600 px-3 text-[11px] font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                      onClick={() => void createDispatchOrderSlotsFromSelectedShop()}
                      disabled={proposalOrderSaving}
                    >
                      セット
                    </button>
                    <button
                      type="button"
                      className="h-7 border border-rose-700 bg-white px-3 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                      onClick={() => void rejectSelectedShopFromProposal()}
                      disabled={proposalOrderSaving}
                    >
                      オーダーNG
                    </button>
                    <button
                      type="button"
                      className="h-7 border border-slate-300 bg-white px-2 text-[11px] text-slate-600 hover:bg-slate-50"
                      onClick={() => setSelectedShopId("")}
                      disabled={proposalOrderSaving}
                    >
                      選択解除
                    </button>
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center gap-1.5">
                  {pendingDispatchSlotIndex !== null && (
                    <div className="flex h-7 items-center gap-2 border border-amber-300 bg-amber-50 px-2 text-[11px] text-amber-900">
                      <span className="font-semibold">
                        派遣表 {pendingDispatchSlotIndex + 1}枠目に追加
                      </span>
                      <button
                        type="button"
                        className="border border-amber-400 bg-white px-2 py-0.5"
                        onClick={() => {
                          setPendingDispatchSlotIndex(null);
                          setStatusTab("today");
                        }}
                      >
                        解除
                      </button>
                    </div>
                  )}
                  <div className="flex flex-none items-center gap-1.5">
                    {[
                      { id: "today", label: "派遣表" },
                      { id: "all", label: "全キャスト" },
                      { id: "dormant", label: "休眠キャスト" },
                    ].map((tab) => {
                      const active = statusTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          className={
                            "px-3 h-7 border text-xs relative overflow-visible " +
                            (active
                              ? "bg-sky-600 text-white border-sky-600"
                              : "bg-white text-slate-700 border-slate-200") +
                            (tab.id === "today" &&
                            tutorialTarget === "dispatch-tab"
                              ? " support-focus"
                              : "") +
                            (tab.id === "all" &&
                            tutorialTarget === "all-casts-tab"
                              ? " support-focus"
                              : "")
                          }
                          onClick={() =>
                            setStatusTab(tab.id as CastStatusTab)
                          }
                          onDragEnter={(e) => {
                            if (tab.id !== "today") return;
                            if (!e.dataTransfer.types.includes("text/plain")) {
                              return;
                            }
                            e.preventDefault();
                            setStatusTab("today");
                            setPendingDispatchSlotIndex(null);
                          }}
                          onDragOver={(e) => {
                            if (tab.id !== "today") return;
                            if (!e.dataTransfer.types.includes("text/plain")) {
                              return;
                            }
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "move";
                          }}
                        >
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>

                  <div className="ml-1 inline-flex h-7 flex-none items-center gap-2 border border-gray-300 bg-gray-100 px-2 text-gray-800">
                    <button
                      type="button"
                      className="text-xs px-2 h-5 border border-gray-300 disabled:opacity-40"
                      onClick={() =>
                        setCurrentPage((p) => Math.max(1, p - 1))
                      }
                      disabled={effectivePage <= 1}
                    >
                      ←
                    </button>
                    <span className="text-xs">
                      {effectivePage} / {totalPages}　全 {filteredTotal} 名
                    </span>
                    <button
                      type="button"
                      className="text-xs px-2 h-5 border border-gray-300 disabled:opacity-40"
                      onClick={() =>
                        setCurrentPage((p) => Math.min(totalPages, p + 1))
                      }
                      disabled={effectivePage >= totalPages}
                    >
                      →
                    </button>
                  </div>

                  <div className="flex min-w-0 flex-1 items-stretch gap-1.5 text-[10px]">
                    <div className="grid flex-none grid-rows-2 border border-slate-200 bg-white">
                      <div className="border-b border-slate-200 px-1.5 py-0.5 leading-tight">
                        <span className="font-semibold">オーダー数</span>
                        <span className="ml-2">{orderSummary.count} 件</span>
                      </div>
                      <div className="px-1.5 py-0.5 leading-tight">
                        <span className="font-semibold">オーダー人数</span>
                        <span className="ml-2">{orderSummary.headcount} 人</span>
                      </div>
                    </div>
                    <div
                      className={
                        "flex-none border border-slate-200 bg-white px-1.5 py-0.5 " +
                        (tutorialTarget === "shop-tab" ||
                        tutorialTarget === "active-shop-order" ||
                        tutorialTarget === "dispatch-tab" ||
                        tutorialTarget === "request-filters"
                          ? "support-visible"
                          : "")
                      }
                    >
                      <div className="mb-0.5 font-semibold leading-none">
                        時給別（本日出勤予定）
                      </div>
                      <div className="grid grid-cols-4 gap-x-2 gap-y-0.5 leading-tight text-muted">
                        {WAGE_BUCKETS.map((wage) => (
                          <span key={`today-wage-summary-${wage}`}>
                            {wage}円 {todayWageCounts[wage] ?? 0}名
                          </span>
                        ))}
                      </div>
                    </div>
                    <div
                      className={
                        "flex min-w-0 flex-1 items-center gap-2 overflow-hidden border border-indigo-200 bg-indigo-50 px-2 py-1 text-[10px] text-indigo-950 " +
                        (tutorialTarget ? "support-visible" : "")
                      }
                    >
                      <div className="flex h-full w-8 flex-none items-center justify-center text-indigo-700">
                        <Bot className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="grid max-h-[48px] gap-0.5 overflow-hidden">
                          {matchingAdvices.slice(0, 2).map((advice, index) => (
                            <div
                              key={`${advice.tone}-${index}`}
                              className="leading-snug"
                            >
                              <span
                                className={
                                  "mr-1 inline-block border px-1 py-px font-semibold " +
                                  (advice.tone === "shortage"
                                    ? "border-rose-300 bg-rose-50 text-rose-700"
                                    : advice.tone === "surplus"
                                      ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                                      : "border-slate-300 bg-white text-slate-600")
                                }
                              >
                                {advice.title}
                              </span>
                              <span>{advice.body}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {loading && (
                  <p className="text-xs text-muted">
                    本日出勤キャストを読込中...
                  </p>
                )}
                {error && !loading && (
                  <p className="text-xs text-red-500">
                    データ取得エラー: {error}
                  </p>
                )}
              </div>

              {statusTab === "today" ? (
                <div
                  className={
                    "dispatch-sheet-section rounded-none border border-slate-900 bg-white " +
                    (tutorialTarget === "dispatch-sheet"
                      ? "support-focus"
                      : "")
                  }
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-900 bg-slate-100 px-2 py-1">
                    <div className="text-xs font-semibold text-slate-900">
                      本日出勤 派遣表
                      {dispatchLoading ? (
                        <span className="ml-2 text-[11px] font-normal text-slate-500">
                          読み込み中...
                        </span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="rounded-none border border-slate-900 bg-white px-3 h-7 text-[11px] font-semibold text-slate-900 hover:bg-slate-50"
                        onClick={loadDispatchSheet}
                      >
                        再読込
                      </button>
                      <button
                        type="button"
                        className="rounded-none border border-slate-900 bg-white px-3 h-7 text-[11px] font-semibold text-slate-900 hover:bg-slate-50"
                        onClick={printDispatchSheet}
                      >
                        印刷
                      </button>
                      <button
                        type="button"
                        className="rounded-none border border-slate-900 bg-white px-3 h-7 text-[11px] font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-60"
                        onClick={() => void openIdDocPrintModal()}
                        disabled={idDocPrintLoading}
                      >
                        {idDocPrintLoading ? "準備中..." : "身分証印刷"}
                      </button>
                      <button
                        type="button"
                        className="rounded-none border border-emerald-700 bg-emerald-600 px-3 h-7 text-[11px] font-semibold text-white hover:bg-emerald-700"
                        onClick={confirmAllDispatchRows}
                      >
                        まとめて確定
                      </button>
                    </div>
                  </div>

                  <datalist id={DISPATCH_TIME_DATALIST_ID}>
                    {DISPATCH_TIME_OPTIONS.map((time) => (
                      <option key={time} value={time} />
                    ))}
                  </datalist>

                  <div className="dispatch-sheet-print hidden">
                    <div className="mb-2 text-center text-sm font-semibold text-slate-950">
                      {printDateLabel} 派遣表
                    </div>
                    <div className="grid grid-cols-4 gap-0 bg-slate-950">
                      {dispatchPrintSlots.map((row, slotIndex) => {
                        return (
                          <div
                            key={`dispatch-print-${row?.castId ?? slotIndex}`}
                            className="border-2 border-slate-950 bg-white"
                          >
                            <table className="w-full table-fixed border-collapse text-[11px] leading-tight text-slate-950">
                              <tbody>
                                <tr>
                                  <th className="w-[58px] border-b border-r border-slate-400 bg-slate-100 px-1 py-1 text-left font-semibold">
                                    源氏名
                                  </th>
                                  <td className="border-b border-slate-400 px-1 py-1">
                                    <div className="flex min-w-0 items-center justify-between gap-1">
                                      <span className="truncate font-semibold">
                                        {row?.displayName ?? ""}
                                      </span>
                                      <span className="shrink-0 font-mono text-[10px] text-slate-500">
                                        {row?.managementNumber ?? ""}
                                      </span>
                                    </div>
                                  </td>
                                </tr>
                                <tr>
                                  <th className="border-b border-r border-slate-400 bg-slate-100 px-1 py-1 text-left font-semibold">
                                    派遣先
                                  </th>
                                  <td className="border-b border-slate-400 px-1 py-1">
                                    <div className="min-h-4 truncate">
                                      {row?.shopName
                                        ? `${row.shopNumber ? `${row.shopNumber} / ` : ""}${row.shopName}`
                                        : ""}
                                    </div>
                                  </td>
                                </tr>
                                <tr>
                                  <th className="border-b border-r border-slate-400 bg-slate-100 px-1 py-1 text-left font-semibold">
                                    時給・手数料
                                  </th>
                                  <td className="border-b border-slate-400 px-1 py-1">
                                    <div className="grid grid-cols-2 gap-1">
                                      <div className="min-h-4 text-right">
                                        {row?.castHourly ?? ""}
                                      </div>
                                      <div className="min-h-4 text-right">
                                        {row?.shopFee ?? ""}
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                                <tr>
                                  <th className="border-b border-r border-slate-400 bg-slate-100 px-1 py-1 text-left font-semibold">
                                    時間
                                  </th>
                                  <td className="border-b border-slate-400 px-1 py-1">
                                    <div className="min-h-4">
                                      {row?.startTime ?? ""}
                                    </div>
                                  </td>
                                </tr>
                                <tr>
                                  <th className="border-r border-slate-400 bg-slate-100 px-1 py-1 text-left font-semibold">
                                    メモ
                                  </th>
                                  <td className="px-1 py-1">
                                    <div className="min-h-4 truncate">
                                      {row?.note ?? ""}
                                    </div>
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="dispatch-sheet-screen grid grid-cols-1 gap-0 bg-slate-950 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {dispatchSlots.map(
                      (row, slotIndex) => {
                        if (!row) {
                          return (
                            <div
                              key={`dispatch-empty-${slotIndex}`}
                              className={
                                "border-2 border-slate-950 bg-white " +
                                (dragOverDispatchSlotIndex === slotIndex
                                  ? "outline outline-3 outline-amber-400"
                                  : "")
                              }
                              onDragOver={(e) => {
                                if (!e.dataTransfer.types.includes("text/plain")) {
                                  return;
                                }
                                e.preventDefault();
                                e.dataTransfer.dropEffect = "move";
                                setDragOverDispatchSlotIndex(slotIndex);
                              }}
                              onDragLeave={() => {
                                setDragOverDispatchSlotIndex((prev) =>
                                  prev === slotIndex ? null : prev,
                                );
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
                                const castId =
                                  e.dataTransfer.getData("text/plain");
                                if (!castId) return;
                                void addCastToDispatchSlot(castId, slotIndex);
                              }}
                            >
                              <table className="w-full table-fixed border-collapse text-[11px] leading-tight text-slate-950">
                                <tbody>
                                  <tr>
                                    <th className="w-[58px] border-b border-r border-slate-400 bg-slate-100 px-1 py-1 text-left font-semibold">
                                      源氏名
                                    </th>
                                    <td className="border-b border-slate-400 px-1 py-1">
                                      <button
                                        type="button"
                                        className="h-4 w-full text-left text-[10px] text-slate-400 hover:bg-amber-50 hover:text-amber-700"
                                        onClick={() =>
                                          startManualDispatchPick(slotIndex)
                                        }
                                      >
                                        キャスト選択
                                      </button>
                                    </td>
                                  </tr>
                                  <tr>
                                    <th className="border-b border-r border-slate-400 bg-slate-100 px-1 py-1 text-left font-semibold">
                                      派遣先
                                    </th>
                                    <td className="border-b border-slate-400 p-0.5">
                                      <div className="h-7 border border-slate-200 bg-white" />
                                    </td>
                                  </tr>
                                  <tr>
                                    <th className="border-b border-r border-slate-400 bg-slate-100 px-1 py-1 text-left font-semibold">
                                      時給・手数料
                                    </th>
                                    <td className="border-b border-slate-400 p-0.5">
                                      <div className="grid grid-cols-2 gap-1">
                                        <div className="h-7 border border-slate-200 bg-white" />
                                        <div className="h-7 border border-slate-200 bg-white" />
                                      </div>
                                    </td>
                                  </tr>
                                  <tr>
                                    <th className="border-b border-r border-slate-400 bg-slate-100 px-1 py-1 text-left font-semibold">
                                      時間
                                    </th>
                                    <td className="border-b border-slate-400 p-0.5">
                                      <div className="h-7 border border-slate-200 bg-white" />
                                    </td>
                                  </tr>
                                  <tr>
                                    <th className="border-r border-slate-400 bg-slate-100 px-1 py-1 text-left font-semibold">
                                      メモ
                                    </th>
                                    <td className="p-0.5">
                                      <div className="grid grid-cols-[1fr_74px] gap-1">
                                        <div className="h-7 border border-slate-200 bg-white" />
                                        <div className="h-7 border border-slate-200 bg-white" />
                                      </div>
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          );
                        }
                        if (!row.castId) {
                          return (
                            <div
                              key={`dispatch-order-slot-${row.orderId ?? slotIndex}-${slotIndex}`}
                              className={
                                "border-2 border-slate-950 bg-amber-50 " +
                                (dragOverDispatchSlotIndex === slotIndex
                                  ? "outline outline-3 outline-amber-400"
                                  : "")
                              }
                              onDragOver={(e) => {
                                if (!e.dataTransfer.types.includes("text/plain")) {
                                  return;
                                }
                                e.preventDefault();
                                e.dataTransfer.dropEffect = "move";
                                setDragOverDispatchSlotIndex(slotIndex);
                              }}
                              onDragLeave={() => {
                                setDragOverDispatchSlotIndex((prev) =>
                                  prev === slotIndex ? null : prev,
                                );
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
                                const castId =
                                  e.dataTransfer.getData("text/plain");
                                if (!castId) return;
                                void addCastToDispatchSlot(castId, slotIndex);
                              }}
                            >
                              <table className="w-full table-fixed border-collapse text-[11px] leading-tight text-slate-950">
                                <tbody>
                                  <tr>
                                    <th className="w-[58px] border-b border-r border-slate-400 bg-slate-100 px-1 py-1 text-left font-semibold">
                                      源氏名
                                    </th>
                                    <td className="border-b border-slate-400 px-1 py-1">
                                      <button
                                        type="button"
                                        className="h-4 w-full text-left text-[10px] font-semibold text-amber-700 hover:bg-amber-100"
                                        onClick={() =>
                                          startManualDispatchPick(slotIndex)
                                        }
                                      >
                                        キャスト選択
                                      </button>
                                    </td>
                                  </tr>
                                  <tr>
                                    <th className="border-b border-r border-slate-400 bg-slate-100 px-1 py-1 text-left font-semibold">
                                      派遣先
                                    </th>
                                    <td className="border-b border-slate-400 p-0.5">
                                      <div className="h-7 border border-amber-300 bg-white px-1.5 text-[11px] leading-7">
                                        <span className="block truncate">
                                          {row.shopNumber
                                            ? `${row.shopNumber} / `
                                            : ""}
                                          {row.shopName ?? ""}
                                        </span>
                                      </div>
                                    </td>
                                  </tr>
                                  <tr>
                                    <th className="border-b border-r border-slate-400 bg-slate-100 px-1 py-1 text-left font-semibold">
                                      時給・手数料
                                    </th>
                                    <td className="border-b border-slate-400 p-0.5">
                                      <div className="grid grid-cols-2 gap-1">
                                        <div className="h-7 border border-slate-200 bg-white" />
                                        <div className="h-7 border border-slate-200 bg-white" />
                                      </div>
                                    </td>
                                  </tr>
                                  <tr>
                                    <th className="border-b border-r border-slate-400 bg-slate-100 px-1 py-1 text-left font-semibold">
                                      時間
                                    </th>
                                    <td className="border-b border-slate-400 p-0.5">
                                      <div className="h-7 border border-slate-200 bg-white" />
                                    </td>
                                  </tr>
                                  <tr>
                                    <th className="border-r border-slate-400 bg-slate-100 px-1 py-1 text-left font-semibold">
                                      メモ
                                    </th>
                                    <td className="p-0.5">
                                      <div className="grid grid-cols-[1fr_74px] gap-1">
                                        <div className="h-7 border border-slate-200 bg-white px-1.5 text-[11px] leading-7 text-slate-700">
                                          <span className="block truncate">
                                            {row.note ?? ""}
                                          </span>
                                        </div>
                                        <div className="h-7 border border-slate-200 bg-white text-center text-[10px] leading-7 text-amber-700">
                                          注文枠
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          );
                        }
                        const castId = row.castId;
                        const saving = dispatchSavingKey === castId;
                        const isCanceledRow = row.status === "canceled";
                        return (
                          <div
                            key={castId}
                            className={
                              "border-2 border-slate-950 " +
                              (row.status === "confirmed"
                                ? "bg-emerald-50"
                                : row.status === "canceled"
                                  ? "bg-slate-200 text-slate-600"
                                : row.isExclusiveInitial
                                  ? "bg-amber-50"
                                  : "bg-white")
                            }
                          >
                            <table className="w-full table-fixed border-collapse text-[11px] leading-tight text-slate-950">
                              <tbody>
                                <tr>
                                  <th className="w-[58px] border-b border-r border-slate-400 bg-slate-100 px-1 py-1 text-left font-semibold">
                                    源氏名
                                  </th>
                                  <td className="border-b border-slate-400 px-1 py-1">
                                    <button
                                      type="button"
                                      className={
                                        "flex w-full min-w-0 items-center justify-between gap-1 text-left " +
                                        (isCanceledRow
                                          ? "text-slate-500 hover:bg-slate-300"
                                          : "hover:bg-sky-50")
                                      }
                                      onClick={() => openDispatchCastDetail(row)}
                                    >
                                      <span className="truncate font-semibold">
                                        {row.displayName}
                                      </span>
                                      <span className="shrink-0 font-mono text-[10px] text-slate-500">
                                        {row.managementNumber}
                                      </span>
                                    </button>
                                  </td>
                                </tr>
                                <tr>
                                  <th className="border-b border-r border-slate-400 bg-slate-100 px-1 py-1 text-left font-semibold">
                                    派遣先
                                  </th>
                                  <td className="border-b border-slate-400 p-0.5">
                                    <button
                                      type="button"
                                      className={
                                        "h-7 w-full border px-1.5 text-left text-[11px] leading-tight hover:bg-slate-50 " +
                                        (isCanceledRow
                                          ? "border-slate-400 bg-slate-100 text-slate-500"
                                          : "border-slate-300 bg-white")
                                      }
                                      onClick={() => {
                                        setDispatchShopPickerCastId(castId);
                                        setDispatchShopQuery("");
                                      }}
                                    >
                                      {row.shopName ? (
                                        <span className="block truncate">
                                          {row.shopNumber
                                            ? `${row.shopNumber} / `
                                            : ""}
                                          {row.shopName}
                                        </span>
                                      ) : (
                                        <span className="text-slate-400">
                                          店舗を選択
                                        </span>
                                      )}
                                    </button>
                                  </td>
                                </tr>
                                <tr>
                                  <th className="border-b border-r border-slate-400 bg-slate-100 px-1 py-1 text-left font-semibold">
                                    時給・手数料
                                  </th>
                                  <td className="border-b border-slate-400 p-0.5">
                                    <div className="grid grid-cols-2 gap-1">
                                      <input
                                        type="number"
                                        className={
                                          "h-7 w-full border px-1 text-right text-[11px] " +
                                          (isCanceledRow
                                            ? "border-slate-400 bg-slate-100 text-slate-500"
                                            : "border-slate-300 bg-white")
                                        }
                                        placeholder="時給"
                                        value={row.castHourly ?? ""}
                                        onChange={(e) =>
                                          updateDispatchRowLocal(castId, {
                                            castHourly: e.target.value
                                              ? Number(e.target.value)
                                              : null,
                                          })
                                        }
                                        onBlur={() =>
                                          void saveDispatchRow(
                                            dispatchRows.find(
                                              (item) =>
                                                item.castId === castId,
                                            ) ?? row,
                                          )
                                        }
                                      />
                                      <input
                                        type="number"
                                        className={
                                          "h-7 w-full border px-1 text-right text-[11px] " +
                                          (isCanceledRow
                                            ? "border-slate-400 bg-slate-100 text-slate-500"
                                            : "border-slate-300 bg-white")
                                        }
                                        placeholder="手数料"
                                        value={row.shopFee ?? ""}
                                        onChange={(e) =>
                                          updateDispatchRowLocal(castId, {
                                            shopFee: e.target.value
                                              ? Number(e.target.value)
                                              : null,
                                          })
                                        }
                                        onBlur={() =>
                                          void saveDispatchRow(
                                            dispatchRows.find(
                                              (item) =>
                                                item.castId === castId,
                                            ) ?? row,
                                          )
                                        }
                                      />
                                    </div>
                                  </td>
                                </tr>
                                <tr>
                                  <th className="border-b border-r border-slate-400 bg-slate-100 px-1 py-1 text-left font-semibold">
                                    時間
                                  </th>
                                  <td className="border-b border-slate-400 p-0.5">
                                    <input
                                      type="text"
                                      list={DISPATCH_TIME_DATALIST_ID}
                                      className={
                                        "h-7 w-full border px-1 text-[11px] " +
                                        (isCanceledRow
                                          ? "border-slate-400 bg-slate-100 text-slate-500"
                                          : "border-slate-300 bg-white")
                                      }
                                      placeholder="21:00~"
                                      value={row.startTime || ""}
                                      onChange={(e) =>
                                        updateDispatchRowLocal(castId, {
                                          startTime: e.target.value,
                                        })
                                      }
                                      onBlur={() =>
                                        void saveDispatchRow(
                                          dispatchRows.find(
                                            (item) =>
                                              item.castId === castId,
                                          ) ?? row,
                                        )
                                      }
                                    />
                                  </td>
                                </tr>
                                <tr>
                                  <th className="border-r border-slate-400 bg-slate-100 px-1 py-1 text-left font-semibold">
                                    メモ
                                  </th>
                                  <td className="p-0.5">
                                    <div
                                      className={
                                        row.manualAdded && row.status === "draft"
                                          ? "grid grid-cols-[1fr_58px_48px] gap-1"
                                          : "grid grid-cols-[1fr_74px] gap-1"
                                      }
                                    >
                                      <input
                                        className={
                                          "h-7 w-full border px-1.5 text-[11px] " +
                                          (isCanceledRow
                                            ? "border-slate-400 bg-slate-100 text-slate-500"
                                            : "border-slate-300 bg-white")
                                        }
                                        value={row.note ?? ""}
                                        onChange={(e) =>
                                          updateDispatchRowLocal(castId, {
                                            note: e.target.value,
                                          })
                                        }
                                        onBlur={() =>
                                          void saveDispatchRow(
                                            dispatchRows.find(
                                              (item) =>
                                                item.castId === castId,
                                            ) ?? row,
                                          )
                                        }
                                      />
                                      <button
                                        type="button"
                                        className={
                                          "h-7 border px-1 text-[10px] font-semibold " +
                                          (row.status === "confirmed"
                                            ? "border-emerald-700 bg-emerald-100 text-emerald-800"
                                            : row.status === "canceled"
                                              ? "border-rose-700 bg-rose-100 text-rose-800 hover:bg-rose-50"
                                            : "border-slate-900 bg-white text-slate-900 hover:bg-slate-50")
                                        }
                                        disabled={saving}
                                        title={
                                          row.status === "confirmed"
                                            ? "確定済み派遣をキャンセル"
                                            : row.status === "canceled"
                                              ? row.cancellationReason
                                                ? `キャンセル: ${row.cancellationReason}`
                                                : "キャンセル済み。編集後に再確定できます"
                                              : "派遣を確定"
                                        }
                                        onClick={() => {
                                          if (row.status === "confirmed") {
                                            void cancelOneDispatchRow(row);
                                            return;
                                          }
                                          void confirmOneDispatchRow(row);
                                        }}
                                      >
                                        {saving
                                          ? "保存中"
                                          : row.status === "confirmed"
                                            ? "キャンセル"
                                            : row.status === "canceled"
                                              ? "再確定"
                                              : "確定"}
                                      </button>
                                      {row.manualAdded && row.status === "draft" ? (
                                        <button
                                          type="button"
                                          className="h-7 border border-amber-700 bg-amber-50 px-1 text-[10px] font-semibold text-amber-800 hover:bg-amber-100"
                                          disabled={saving}
                                          title="入力ミス扱いで派遣表から外す"
                                          onClick={() => {
                                            void removeManualDispatchRow(row);
                                          }}
                                        >
                                          外す
                                        </button>
                                      ) : null}
                                    </div>
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        );
                      },
                    )}
                  </div>
                </div>
              ) : (
              <div
                className={
                  "grid gap-3 " +
                  (tutorialTarget === "cast-list"
                    ? "support-focus"
                    : tutorialTarget === "active-shop-order" ||
                  tutorialTarget === "dispatch-tab" ||
                  tutorialTarget === "request-filters"
                    ? "support-visible"
                    : "")
                }
                style={{ gridTemplateColumns: "repeat(14, minmax(0, 1fr))" }}
              >
              {!loading &&
                filteredCasts.map((cast: Cast, index: number) => {
                  const detail = castDetailById[cast.id];
                  const photoUrl =
                    photoByCastId[cast.id] ??
                    cast.photoUrl ??
                    resolveImmediateDisplayPhotoUrl(detail) ??
                    "";
                  const photoFallbackUrl =
                    photoFallbackByCastId[cast.id] ??
                    cast.photoUrlRaw ??
                    resolveLegacyPhotoFallbackUrl(detail) ??
                    "";
                  const displayPhotoUrl = photoUrl || photoFallbackUrl;
                  const shouldShowDebugCard = debugMatchingCard && index < 5;
                  const badgeIcons = getCastBadgeIcons(cast);
                  const requestStatus =
                    getEffectiveAttendanceStatus(cast.id);
                  const dispatchRow = dispatchRows.find(
                    (row) => row.castId === cast.id,
                  );
                  const attendanceBadgeLabel =
                    dispatchRow
                      ? "割当済み"
                      : requestStatus === "requested"
                      ? "依頼済み"
                      : requestStatus === "no_show"
                        ? "当日欠勤"
                      : requestStatus === "ng"
                        ? "出勤NG"
                        : requestStatus === "ok" ||
                            requestStatus === "added" ||
                            castListMode === "proposal"
                          ? "出勤OK"
                          : null;
                  const attendanceBadgeClass =
                    dispatchRow
                      ? "bg-blue-100 text-blue-800"
                      : requestStatus === "requested"
                      ? "bg-amber-100 text-amber-800"
                      : requestStatus === "no_show"
                        ? "bg-slate-700 text-white"
                      : requestStatus === "ng"
                        ? "bg-rose-100 text-rose-800"
                        : attendanceBadgeLabel === "出勤OK"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-slate-100 text-slate-700";
                  const isFixed =
                    !!selectedShop &&
                    selectedShopFixedCastIdSet.has(cast.id);
                  const selectedShopNgFlags = selectedShop
                    ? getShopNgFlags(cast, selectedShop.id, selectedShopNgCastIdSet)
                    : { shopNg: false, castNg: false };
                  const ngBadges = [
                    selectedShopNgFlags.shopNg ? "店舗NG" : "",
                    selectedShopNgFlags.castNg ? "キャストNG" : "",
                  ].filter(Boolean);
                  const cardName = getCastCardName(cast);
                  return (
                    <div
                      key={cast.id}
                      className={`shadow-sm border overflow-hidden flex flex-col cursor-grab active:cursor-grabbing select-none ${
                        isFixed
                          ? "bg-amber-50 border-amber-300"
                          : "bg-white border-slate-200"
                      }`}
                      draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", cast.id);
                          e.dataTransfer.effectAllowed = "move";
                          setCastCardDragging(true);
                        }}
                        onDragEnd={() => {
                          setCastCardDragging(false);
                          setDragOverDispatchSlotIndex(null);
                        }}
                        onClick={() => openCastDetail(cast)}
                      >
                      <div className="w-full aspect-[4/3] bg-gray-200 overflow-hidden relative">
                        {displayPhotoUrl ? (
                          <CastPhotoImage
                            src={displayPhotoUrl}
                            fallbackSrc={photoFallbackUrl || undefined}
                            alt={cardName}
                            className="w-full h-full object-cover"
                            debugPhoto={shouldShowDebugCard}
                            fallback={
                              <div className="w-full h-full flex items-center justify-center text-xs text-slate-500">
                                PHOTO
                              </div>
                            }
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs text-slate-500">
                            PHOTO
                          </div>
                        )}
                        {badgeIcons.length > 0 && (
                          <div className="absolute left-1 top-1 z-10 flex flex-col gap-1">
                            {badgeIcons.map((icon) => (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                key={icon.src}
                                src={icon.src}
                                alt={icon.alt}
                                className="w-4 h-4"
                              />
                            ))}
                          </div>
                        )}
                        {(attendanceBadgeLabel || ngBadges.length > 0) && (
                          <div className="absolute right-1 top-1 z-10 flex flex-col items-end gap-1">
                            {attendanceBadgeLabel && (
                              <div
                                className={`px-1.5 py-0.5 text-[10px] font-semibold ${attendanceBadgeClass}`}
                              >
                                {attendanceBadgeLabel}
                              </div>
                            )}
                            {ngBadges.map((label) => (
                              <div
                                key={label}
                                className="px-1.5 py-0.5 text-[10px] font-semibold bg-rose-600 text-white"
                              >
                                {label}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                        <div className="px-3 pt-1.5 pb-2.5 flex flex-col gap-0.5">
                          <div className="font-semibold text-[13px] leading-tight truncate">
                            {cardName}
                          </div>
                          <div className="text-[11px] leading-tight">
                            <span className="text-slate-500 mr-1">時給</span>
                            <span className="font-semibold">
                              ¥{cast.desiredHourly.toLocaleString()}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 leading-tight">
                            年齢{" "}
                            <span className="font-medium text-slate-700">
                              {cast.age} 歳
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400 leading-tight">
                            {formatDrinkLabel(cast)}
                          </div>
                          {shouldShowDebugCard &&
                            renderMatchingPhotoDebug("list", {
                              id: cast.id,
                              castId: cast.id,
                              userId: cast.id,
                              photoUrl: cast.photoUrl ?? null,
                              photoUrlRaw: cast.photoUrlRaw ?? null,
                              mapPhotoUrl: photoByCastId[cast.id] ?? null,
                              mapPhotoFallback:
                                photoFallbackByCastId[cast.id] ?? null,
                              detail,
                              detailDisplayUrl:
                                resolveImmediateDisplayPhotoUrl(detail) ?? null,
                              detailFallbackUrl:
                                resolveLegacyPhotoFallbackUrl(detail) ?? null,
                              finalSrc: displayPhotoUrl || null,
                              finalFallbackSrc: photoFallbackUrl || null,
                            })}
                        </div>
                      </div>
                    );
                  })}
              </div>
              )}

            </>
        )}
        </section>
      </div>

      {settingsOpen && settingsDraft && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setSettingsOpen(false)}
          />
          <div className="relative z-10 w-full max-w-2xl bg-white border border-gray-200 shadow-2xl flex flex-col">
            <header className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <div className="font-semibold text-sm">マッチング設定（全体）</div>
              <button
                type="button"
                className="text-xs border border-gray-300 px-2 py-1"
                onClick={() => setSettingsOpen(false)}
              >
                閉じる
              </button>
            </header>

            <div className="p-4 space-y-4 text-xs">
              <div className="text-[11px] text-muted">
                ※ 変更内容は全員に即時反映されます。
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex items-center justify-between border border-gray-200 px-3 py-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={settingsDraft.enableGenre}
                      onChange={(e) =>
                        updateSettingsDraft({ enableGenre: e.target.checked })
                      }
                    />
                    ジャンル一致
                  </label>
                  <input
                    type="number"
                    className="tiara-input h-8 w-20 text-xs"
                    value={settingsDraft.weightGenre}
                    onChange={(e) =>
                      updateSettingsDraft({
                        weightGenre: Number(e.target.value) || 0,
                      })
                    }
                  />
                </div>

                <div className="flex items-center justify-between border border-gray-200 px-3 py-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={settingsDraft.enableHourly}
                      onChange={(e) =>
                        updateSettingsDraft({ enableHourly: e.target.checked })
                      }
                    />
                    時給レンジ
                  </label>
                  <input
                    type="number"
                    className="tiara-input h-8 w-20 text-xs"
                    value={settingsDraft.weightHourly}
                    onChange={(e) =>
                      updateSettingsDraft({
                        weightHourly: Number(e.target.value) || 0,
                      })
                    }
                  />
                </div>

                <div className="flex items-center justify-between border border-gray-200 px-3 py-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={settingsDraft.enableDrink}
                      onChange={(e) =>
                        updateSettingsDraft({ enableDrink: e.target.checked })
                      }
                    />
                    飲酒条件
                  </label>
                  <input
                    type="number"
                    className="tiara-input h-8 w-20 text-xs"
                    value={settingsDraft.weightDrink}
                    onChange={(e) =>
                      updateSettingsDraft({
                        weightDrink: Number(e.target.value) || 0,
                      })
                    }
                  />
                </div>

                <div className="flex items-center justify-between border border-gray-200 px-3 py-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={settingsDraft.enableHeight}
                      onChange={(e) =>
                        updateSettingsDraft({ enableHeight: e.target.checked })
                      }
                    />
                    身長
                  </label>
                  <input
                    type="number"
                    className="tiara-input h-8 w-20 text-xs"
                    value={settingsDraft.weightHeight}
                    onChange={(e) =>
                      updateSettingsDraft({
                        weightHeight: Number(e.target.value) || 0,
                      })
                    }
                  />
                </div>

                <div className="flex items-center justify-between border border-gray-200 px-3 py-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={settingsDraft.enableBodyType}
                      onChange={(e) =>
                        updateSettingsDraft({
                          enableBodyType: e.target.checked,
                        })
                      }
                    />
                    体型
                  </label>
                  <input
                    type="number"
                    className="tiara-input h-8 w-20 text-xs"
                    value={settingsDraft.weightBodyType}
                    onChange={(e) =>
                      updateSettingsDraft({
                        weightBodyType: Number(e.target.value) || 0,
                      })
                    }
                  />
                </div>

                <div className="flex items-center justify-between border border-gray-200 px-3 py-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={settingsDraft.fixedCastAlwaysTop}
                      onChange={(e) =>
                        updateSettingsDraft({
                          fixedCastAlwaysTop: e.target.checked,
                        })
                      }
                    />
                    専属は常に最上位
                  </label>
                  <span className="text-[11px] text-muted">
                    ※重みなし
                  </span>
                </div>
              </div>

              {settingsError && (
                <div className="text-xs text-red-500">{settingsError}</div>
              )}
            </div>

            <footer className="px-4 py-3 border-t border-gray-200 flex items-center justify-end gap-2">
              <button
                type="button"
                className="px-3 py-1.5 border border-gray-300 bg-white text-gray-800"
                onClick={() => setSettingsOpen(false)}
                disabled={settingsSaving}
              >
                キャンセル
              </button>
              <button
                type="button"
                className="px-4 py-1.5 bg-ink text-white disabled:opacity-60"
                onClick={() => void handleSaveMatchingSettings()}
                disabled={settingsSaving}
              >
                {settingsSaving ? "保存中..." : "保存"}
              </button>
            </footer>
          </div>
        </div>
      )}

      {idDocPrintOpen && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setIdDocPrintOpen(false)}
          />
          <div className="relative z-10 flex max-h-[86vh] w-full max-w-5xl flex-col border border-slate-900 bg-white shadow-2xl">
            <header className="flex items-center justify-between border-b border-slate-900 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  身分証印刷対象
                </h2>
                <div className="mt-1 text-[11px] text-slate-500">
                  確定済み派遣から印刷対象を確認して選択します。
                </div>
              </div>
              <button
                type="button"
                className="border border-slate-300 px-2 py-1 text-xs"
                onClick={() => setIdDocPrintOpen(false)}
              >
                閉じる
              </button>
            </header>

            <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3 text-xs">
              <select
                className="tiara-input h-9 min-w-[230px] text-xs"
                value={idDocPrintMode}
                onChange={(e) =>
                  changeIdDocPrintMode(e.target.value as IdDocPrintMode)
                }
              >
                <option value="shop_required">店舗が身分証必要なキャストのみ</option>
                <option value="all_with_id">
                  身分証データがある確定キャスト全員
                </option>
                <option value="manual">手動選択</option>
              </select>
              <button
                type="button"
                className="border border-slate-300 bg-white px-3 py-2 text-[11px] hover:bg-slate-50"
                onClick={() =>
                  setSelectedIdDocPrintKeys(
                    idDocPrintTargets
                      .filter((target) => target.hasIdDocs)
                      .map((target) => target.key),
                  )
                }
              >
                印刷可能を全選択
              </button>
              <button
                type="button"
                className="border border-slate-300 bg-white px-3 py-2 text-[11px] hover:bg-slate-50"
                onClick={() => setSelectedIdDocPrintKeys([])}
              >
                選択解除
              </button>
              <div className="ml-auto text-[11px] text-slate-600">
                選択 {selectedIdDocPrintKeys.length}件 / 候補{" "}
                {idDocPrintTargets.length}件
              </div>
            </div>

            <div className="overflow-auto">
              <table className="w-full border-collapse text-xs">
                <thead className="sticky top-0 bg-slate-100">
                  <tr>
                    <th className="w-12 border border-slate-300 px-2 py-2 text-center">
                      印刷
                    </th>
                    <th className="border border-slate-300 px-2 py-2 text-left">
                      キャスト
                    </th>
                    <th className="border border-slate-300 px-2 py-2 text-left">
                      派遣先
                    </th>
                    <th className="w-[110px] border border-slate-300 px-2 py-2 text-left">
                      店舗身分証
                    </th>
                    <th className="w-[120px] border border-slate-300 px-2 py-2 text-left">
                      登録状況
                    </th>
                    <th className="w-[130px] border border-slate-300 px-2 py-2 text-left">
                      判定
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {idDocPrintLoading ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="border border-slate-300 px-3 py-6 text-center text-slate-500"
                      >
                        印刷対象を取得中...
                      </td>
                    </tr>
                  ) : idDocPrintTargets.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="border border-slate-300 px-3 py-6 text-center text-slate-500"
                      >
                        印刷候補がありません。
                      </td>
                    </tr>
                  ) : (
                    idDocPrintTargets.map((target) => {
                      const checked = selectedIdDocPrintKeys.includes(
                        target.key,
                      );
                      return (
                        <tr key={target.key}>
                          <td className="border border-slate-300 px-2 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={!target.hasIdDocs}
                              onChange={() => toggleIdDocPrintTarget(target.key)}
                            />
                          </td>
                          <td className="border border-slate-300 px-2 py-2">
                            <div className="font-semibold">
                              {target.castName}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {target.castCode ?? target.castId}
                            </div>
                          </td>
                          <td className="border border-slate-300 px-2 py-2">
                            {target.shopNumber
                              ? `${target.shopNumber} / `
                              : ""}
                            {target.shopName || "-"}
                          </td>
                          <td className="border border-slate-300 px-2 py-2">
                            {target.requirementLabel}
                          </td>
                          <td className="border border-slate-300 px-2 py-2">
                            {target.hasIdDocs ? (
                              <span className="font-semibold text-emerald-700">
                                登録済み
                              </span>
                            ) : (
                              <span className="font-semibold text-rose-600">
                                未登録
                              </span>
                            )}
                          </td>
                          <td className="border border-slate-300 px-2 py-2">
                            <span
                              className={
                                target.recommended
                                  ? "font-semibold text-emerald-700"
                                  : target.hasIdDocs
                                    ? "text-slate-600"
                                    : "font-semibold text-rose-600"
                              }
                            >
                              {target.reason}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <footer className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3">
              <button
                type="button"
                className="border border-slate-300 bg-white px-4 py-2 text-xs"
                onClick={() => setIdDocPrintOpen(false)}
              >
                閉じる
              </button>
              <button
                type="button"
                className="border border-slate-900 bg-slate-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                onClick={() => void printSelectedIdDocs()}
                disabled={
                  idDocPrinting ||
                  idDocPrintLoading ||
                  selectedIdDocPrintKeys.length === 0
                }
              >
                {idDocPrinting ? "印刷準備中..." : "選択分を印刷"}
              </button>
            </footer>
          </div>
        </div>
      )}

      {dispatchShopPickerCastId && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setDispatchShopPickerCastId(null)}
          />
          <div className="relative z-10 flex max-h-[82vh] w-full max-w-4xl flex-col border border-slate-900 bg-white shadow-2xl">
            <header className="flex items-center justify-between border-b border-slate-900 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-900">
                派遣先店舗を選択
              </h2>
              <button
                type="button"
                className="border border-slate-300 px-2 py-1 text-xs"
                onClick={() => setDispatchShopPickerCastId(null)}
              >
                閉じる
              </button>
            </header>

            <div className="grid grid-cols-1 gap-2 border-b border-slate-200 p-3 md:grid-cols-[1fr_180px_160px]">
              <input
                className="tiara-input h-9 text-xs"
                placeholder="店舗名・店舗番号・住所で検索"
                value={dispatchShopQuery}
                onChange={(e) => setDispatchShopQuery(e.target.value)}
              />
              <select
                className="tiara-input h-9 text-xs"
                value={dispatchOwnerFilter}
                onChange={(e) => setDispatchOwnerFilter(e.target.value)}
              >
                <option value="">担当者：すべて</option>
                {dispatchOwnerOptions.map((owner) => (
                  <option key={owner} value={owner}>
                    {owner}
                  </option>
                ))}
              </select>
              <select
                className="tiara-input h-9 text-xs"
                value={dispatchGenreFilter}
                onChange={(e) => setDispatchGenreFilter(e.target.value)}
              >
                <option value="">ジャンル：すべて</option>
                <option value="club">クラブ</option>
                <option value="cabaret">キャバ</option>
                <option value="snack">スナック</option>
                <option value="gb">ガルバ</option>
              </select>
            </div>

            <div className="overflow-auto">
              <table className="w-full border-collapse text-xs">
                <thead className="sticky top-0 bg-slate-100">
                  <tr>
                    <th className="border border-slate-300 px-2 py-2 text-left w-[90px]">
                      番号
                    </th>
                    <th className="border border-slate-300 px-2 py-2 text-left">
                      店舗名
                    </th>
                    <th className="border border-slate-300 px-2 py-2 text-left w-[120px]">
                      担当者
                    </th>
                    <th className="border border-slate-300 px-2 py-2 text-left w-[100px]">
                      ジャンル
                    </th>
                    <th className="border border-slate-300 px-2 py-2 text-left">
                      住所
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {dispatchShopCandidates.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="border border-slate-300 px-3 py-5 text-center text-slate-500"
                      >
                        条件に一致する店舗がありません。
                      </td>
                    </tr>
                  ) : (
                    dispatchShopCandidates.map((shop) => (
                      <tr
                        key={shop.id}
                        className="cursor-pointer hover:bg-sky-50"
                        onClick={() => void selectDispatchShop(shop)}
                      >
                        <td className="border border-slate-300 px-2 py-2 font-mono">
                          {shop.code ?? "-"}
                        </td>
                        <td className="border border-slate-300 px-2 py-2 font-semibold">
                          {shop.name}
                        </td>
                        <td className="border border-slate-300 px-2 py-2">
                          {shop.ownerStaff ?? "-"}
                        </td>
                        <td className="border border-slate-300 px-2 py-2">
                          {(shop.genre &&
                            SHOP_GENRE_LABEL[shop.genre as ShopGenre]) ||
                            shop.genre ||
                            "-"}
                        </td>
                        <td className="border border-slate-300 px-2 py-2">
                          {[shop.addressLine, shop.buildingName]
                            .filter(Boolean)
                            .join(" ") || "-"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 店舗選択モーダル */}
      {shopModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShopModalOpen(false)}
          />
          <div className="relative z-10 w-full max-w-3xl max-h-[80vh] bg-white border border-gray-200 shadow-2xl flex flex-col">
            <header className="px-4 py-3 border-b border-gray-200 flex items-center justify-between bg-gray-50">
              <h2 className="text-sm font-semibold text-gray-900">店舗を選択</h2>
              <button
                type="button"
                className="text-xs text-muted hover:text-gray-900"
                onClick={() => setShopModalOpen(false)}
              >
                ✕
              </button>
            </header>

            <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2 text-xs bg-white">
              <label className="text-muted whitespace-nowrap">
                店舗番号・店舗名
              </label>
              <input
                className="tiara-input rounded-none h-8 text-xs flex-1"
                placeholder="例）001 / ティアラ本店"
                value={shopSearch}
                onChange={(e) => setShopSearch(e.target.value)}
              />
            </div>

            <div className="flex-1 overflow-auto p-4 bg-white">
              {filteredShops.length === 0 ? (
                todayShops.length === 0 ? (
                  <p className="text-xs text-muted">
                    本日のスケジュール登録がありません。
                    スケジュール画面から店舗リクエストを登録してください。
                  </p>
                ) : (
                  <p className="text-xs text-muted">
                    条件に一致する店舗がありません。
                  </p>
                )
              ) : (
                <div
                  className="grid gap-3"
                  style={{
                    gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                  }}
                >
                  {filteredShops.map((shop: Shop) => {
                    const active = shop.id === selectedShopId;
                    return (
                      <button
                        key={shop.id}
                        type="button"
                        onClick={() => handleSelectShop(shop)}
                        className={
                          "text左 border px-3 py-2 text-xs transition-colors " +
                          (active
                            ? "bg-sky-600/10 border-sky-400 text-ink"
                            : "bg-white border-gray-200 text-gray-900 hover:border-sky-400")
                        }
                      >
                        <div className="text-[11px] text-muted">
                          店舗番号
                          <span className="ml-1 font-mono text-gray-900">
                            {shop.code}
                          </span>
                        </div>
                        <div className="mt-1 text-sm font-semibold truncate">
                          {shop.name}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* キャスト詳細モーダル */}
      {castDetailModalOpen && selectedCast && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={closeCastDetail}
          />
          <div className="relative z-10 w-full max-w-3xl max-h-[80vh] bg-white border border-gray-200 shadow-2xl flex flex-col overflow-hidden">
            <header className="px-4 py-3 border-b border-gray-200 flex items-center justify-between bg-gray-50">
              <h2 className="text-sm font-semibold text-gray-900">キャスト詳細</h2>
              <button
                type="button"
                className="text-xs text-muted hover:text-gray-900"
                onClick={closeCastDetail}
              >
                ✕
              </button>
            </header>

            <div className="flex-1 overflow-auto p-4 flex gap-4 bg-white">
              <div className="w-40 shrink-0">
                {(() => {
                  const detail = selectedCast
                    ? castDetailById[selectedCast.id]
                    : null;
                  const drinkLevel = detail
                    ? mapDrinkLevel(
                        detail?.attributes?.drinkLevel ??
                          detail?.drinkLevel ??
                          detail?.drinkOk,
                      )
                    : selectedCast?.drinkLevel ?? null;
                  const hasExclusive = detail
                    ? getCastExclusiveFlag(detail)
                    : selectedCast?.hasExclusive ?? false;
                  const hasNominated = detail
                    ? getCastNominatedFlag(detail)
                    : selectedCast?.hasNominated ?? false;
                  const icons = getCastBadgeIcons({
                    ...selectedCast,
                    drinkLevel,
                    hasExclusive,
                    hasNominated,
                  } as Cast);
                  const photoUrl =
                    photoByCastId[selectedCast.id] ??
                    selectedCast.photoUrl ??
                    resolveImmediateDisplayPhotoUrl(detail) ??
                    "";
                  const photoFallbackUrl =
                    photoFallbackByCastId[selectedCast.id] ??
                    selectedCast.photoUrlRaw ??
                    resolveLegacyPhotoFallbackUrl(detail) ??
                    "";
                  const displayPhotoUrl = photoUrl || photoFallbackUrl;
                  return (
                    <>
                      <div className="w-full aspect-[3/4] overflow-hidden bg-gray-200 flex items-center justify-center">
                        {displayPhotoUrl ? (
                          <CastPhotoImage
                            src={displayPhotoUrl}
                            fallbackSrc={photoFallbackUrl || undefined}
                            alt={selectedCast.name}
                            className="w-full h-full object-cover"
                            debugPhoto={debugMatchingCard}
                            fallback={<span className="text-xs text-gray-500">NO PHOTO</span>}
                          />
                        ) : (
                          <span className="text-xs text-gray-500">NO PHOTO</span>
                        )}
                      </div>
                      {renderMatchingPhotoDebug("detail", {
                        id: selectedCast.id,
                        castId: selectedCast.id,
                        userId: selectedCast.id,
                        photoUrl: selectedCast.photoUrl ?? null,
                        photoUrlRaw: selectedCast.photoUrlRaw ?? null,
                        mapPhotoUrl: photoByCastId[selectedCast.id] ?? null,
                        mapPhotoFallback:
                          photoFallbackByCastId[selectedCast.id] ?? null,
                        detail,
                        detailDisplayUrl:
                          resolveImmediateDisplayPhotoUrl(detail) ?? null,
                        detailFallbackUrl:
                          resolveLegacyPhotoFallbackUrl(detail) ?? null,
                        finalSrc: displayPhotoUrl || null,
                        finalFallbackSrc: photoFallbackUrl || null,
                      })}
                      {icons.length > 0 && (
                        <div className="mt-2 flex flex-wrap items-center gap-1">
                          {icons.map((icon) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              key={icon.src}
                              src={icon.src}
                              alt={icon.alt}
                              className="w-5 h-5"
                            />
                          ))}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>

              <div className="flex-1 flex flex-col gap-3 text-xs text-gray-900">
                {(() => {
                  const detail = selectedCast
                    ? castDetailById[selectedCast.id]
                    : null;
                  const desiredHourlyRaw =
                    detail?.preferences?.desiredHourly ??
                    detail?.desiredHourly ??
                    selectedCast?.desiredHourly;
                  const desiredHourly =
                    typeof desiredHourlyRaw === "number"
                      ? desiredHourlyRaw
                      : Number.isFinite(Number(desiredHourlyRaw))
                        ? Number(desiredHourlyRaw)
                        : null;
                  const drinkLevel = detail
                    ? mapDrinkLevel(
                        detail?.attributes?.drinkLevel ??
                          detail?.drinkLevel ??
                          detail?.drinkOk,
                      )
                    : selectedCast?.drinkLevel ?? null;
                  const genres: CastGenre[] =
                    detail?.background?.genres ??
                    detail?.genres ??
                    selectedCast?.genres ??
                    [];
                  return (
                    <>
                <div>
                  <div className="text-[11px] text-muted">
                    管理番号 / ID / 旧ID
                  </div>
                  <div className="mt-0.5 text-sm font-semibold">
                    {selectedCast.code} / {selectedCast.id}
                    {selectedCast.oldId ? (
                      <span className="ml-2 text-[11px] text-gray-500">
                        旧ID: {selectedCast.oldId}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-[11px] text-muted">名前</div>
                    <div className="mt-0.5 text-sm font-semibold">
                      {selectedCast.name}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-muted">年齢</div>
                    <div className="mt-0.5 text-sm font-semibold">
                      {selectedCast.age} 歳
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] text-muted">希望時給</div>
                    <div className="mt-0.5 text-sm font-semibold">
                      {desiredHourly !== null
                        ? `¥${desiredHourly.toLocaleString()}`
                        : "未登録"}
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] text-muted">飲酒</div>
                    <div className="mt-0.5 text-xs">
                      {formatDrinkLabel({ drinkLevel } as Cast)}
                    </div>
                  </div>

                  {/* キャストジャンル（複数登録可能） */}
                  <div className="col-span-2">
                    <div className="text-[11px] text-muted">ジャンル</div>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {genres.length > 0 ? (
                        genres.map((g) => (
                          <span
                            key={g}
                            className="px-2 py-0.5 bg-sky-50 text-sky-700 border border-sky-200 text-[11px]"
                          >
                            {CAST_GENRE_LABEL[g] ?? g}
                          </span>
                        ))
                      ) : (
                        <span className="text-[11px] text-gray-400">
                          未設定
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                    </>
                  );
                })()}
                <div className="mt-2">
                  {castDetailSource !== "dispatch-sheet" &&
                    (() => {
                      const requestStatus =
                        getEffectiveAttendanceStatus(selectedCast.id);
                      return (
                        <div className="mb-2 flex flex-wrap items-center gap-2 border border-slate-200 bg-slate-50 px-2 py-1.5">
                          <span className="text-[11px] font-semibold text-slate-700">
                            出勤依頼:
                            <span className="ml-1 text-slate-900">
                              {requestStatus === "requested"
                                ? "依頼済み"
                                : requestStatus === "ok"
                                  ? "出勤OK"
                                  : requestStatus === "ng"
                                    ? "出勤NG"
                                    : requestStatus === "no_show"
                                      ? "当日欠勤"
                                    : requestStatus === "added"
                                      ? "派遣表追加済み"
                                      : "未依頼"}
                            </span>
                          </span>
                          {[
                            { status: "requested", label: "依頼済みにする" },
                            { status: "ok", label: "OK" },
                            { status: "ng", label: "NG" },
                          ].map((item) => (
                            <button
                              key={item.status}
                              type="button"
                              className="border border-slate-300 bg-white px-2 py-1 text-[11px] hover:bg-slate-100"
                              onClick={() =>
                                void markAttendanceRequest(
                                  selectedCast.id,
                                  item.status as AttendanceRequestStatus,
                                  pendingDispatchSlotIndex,
                                )
                              }
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>
                      );
                    })()}
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    {castDetailSource !== "dispatch-sheet" && (
                      <button
                        type="button"
                        className="px-3 py-1.5 text-[11px] border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                        onMouseDown={() =>
                          startChatTemplateLongPress("request")
                        }
                        onMouseUp={stopChatTemplateLongPress}
                        onMouseLeave={stopChatTemplateLongPress}
                        onTouchStart={() =>
                          startChatTemplateLongPress("request")
                        }
                        onTouchEnd={stopChatTemplateLongPress}
                        onClick={() => {
                          if (chatTemplateLongPressFiredRef.current) {
                            chatTemplateLongPressFiredRef.current = false;
                            return;
                          }
                          insertChatTemplate(chatTemplates.request);
                        }}
                      >
                        出勤依頼
                      </button>
                    )}
                    <button
                      type="button"
                      className="px-3 py-1.5 text-[11px] border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                      onMouseDown={() => startChatTemplateLongPress("confirm")}
                      onMouseUp={stopChatTemplateLongPress}
                      onMouseLeave={stopChatTemplateLongPress}
                      onTouchStart={() => startChatTemplateLongPress("confirm")}
                      onTouchEnd={stopChatTemplateLongPress}
                      onClick={() => {
                        if (chatTemplateLongPressFiredRef.current) {
                          chatTemplateLongPressFiredRef.current = false;
                          return;
                        }
                        insertChatTemplate(chatTemplates.confirm);
                      }}
                    >
                      出勤確認
                    </button>
                    <span className="text-[10px] text-gray-400">
                      長押しで定型文を編集
                    </span>
                  </div>
                  <div className="relative">
                    <textarea
                      className="w-full h-28 px-3 py-2 border border-gray-200 text-xs resize-none"
                      placeholder="チャットを入力"
                      value={chatDraft}
                      onChange={(e) => setChatDraft(e.target.value)}
                    />
                    <button
                      type="button"
                      className="absolute right-2 bottom-2 px-4 py-1.5 border border-slate-300 bg-white text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                      onClick={handleSendChat}
                      disabled={
                        chatSending || !chatDraft.trim() || !!chatDisabledUntil
                      }
                    >
                      {chatSending ? "送信中..." : "送信"}
                    </button>
                  </div>
                  {chatDisabledUntil && (
                    <div className="mt-1 text-[11px] text-rose-600">
                      本日は送信不可（解除: {chatDisabledUntil.toLocaleString()}
                      ）
                    </div>
                  )}
                </div>
                {(() => {
                  const detail = castDetailById[selectedCast.id] ?? null;
                  const lastWorkDate =
                    typeof detail?.lastWorkDate === "string" &&
                    detail.lastWorkDate.trim()
                      ? detail.lastWorkDate.slice(0, 10)
                      : null;
                  const workCountRaw = detail?.workCount;
                  const workCount =
                    typeof workCountRaw === "number"
                      ? workCountRaw
                      : typeof workCountRaw === "string" &&
                          workCountRaw.trim() !== ""
                        ? Number(workCountRaw)
                        : null;
                  const cancelCountRaw = detail?.cancelCount;
                  const cancelCount =
                    typeof cancelCountRaw === "number"
                      ? cancelCountRaw
                      : typeof cancelCountRaw === "string" &&
                          cancelCountRaw.trim() !== ""
                        ? Number(cancelCountRaw)
                        : null;
                  return (
                    <div className="mt-2 flex items-center gap-6 text-sm text-gray-700 justify-start">
                      <div>
                        <span className="text-muted">最終出勤日</span>{" "}
                        <span className="font-semibold text-gray-800">
                          {detail
                            ? lastWorkDate
                              ? lastWorkDate
                              : "未登録"
                            : "読込中..."}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted">出勤回数</span>{" "}
                        <span className="font-semibold text-gray-800">
                          {detail && Number.isFinite(workCount)
                            ? `${workCount} 回`
                            : detail
                              ? "0 回"
                              : "読込中..."}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted">キャンセル回数</span>{" "}
                        <span className="font-semibold text-gray-800">
                          {detail && Number.isFinite(cancelCount)
                            ? `${cancelCount} 回`
                            : detail
                              ? "0 回"
                              : "読込中..."}
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            <footer className="px-4 py-3 border-t border-gray-200 flex items-center justify-end gap-2 bg-white">
              {pendingDispatchSlotIndex !== null && (
                <button
                  type="button"
                  className="border border-amber-500 bg-amber-100 text-amber-900 px-4 py-1.5 text-xs font-semibold hover:bg-amber-200"
                  onClick={() => void addSelectedCastToDispatchSlot()}
                >
                  派遣表 {pendingDispatchSlotIndex + 1}枠目に追加
                </button>
              )}
              <button
                type="button"
                className="border border-gray-300 bg-white text-ink px-4 py-1.5 text-xs"
                onClick={closeCastDetail}
              >
                閉じる
              </button>
              {pickMode && (
                <button
                  type="button"
                  className="tiara-btn text-xs"
                  onClick={async () => {
                    if (!selectedCast) return;
                    if (!pickShopId) {
                      alert("対象店舗が特定できません。");
                      return;
                    }
                    const detail = castDetailById[selectedCast.id] ?? null;
                    const castCode =
                      detail?.castCode ??
                      detail?.managementNumber ??
                      selectedCast.code ??
                      "";
                    const castName =
                      detail?.displayName ??
                      detail?.name ??
                      selectedCast.name ??
                      "";
                    const agreedHourlyRaw =
                      detail?.preferences?.desiredHourly ??
                      detail?.desiredHourly ??
                      selectedCast.desiredHourly ??
                      0;
                    const payload = {
                      shopId: pickShopId,
                      orderId: pickOrderId || null,
                      orderStartTime: pickOrderStartTime || null,
                      castId: selectedCast.id,
                      castCode,
                      castName,
                      agreedHourly: Number.isFinite(Number(agreedHourlyRaw))
                        ? Number(agreedHourlyRaw)
                        : 0,
                    };
                    try {
                      window.localStorage.setItem(
                        assignmentPickStorageKey,
                        JSON.stringify(payload),
                      );
                    } catch {}
                    const next =
                      pickReturnTo +
                      (pickReturnTo.includes("?") ? "&" : "?") +
                      "pick=1";
                    router.push(next);
                    closeCastDetail();
                  }}
                >
                  割当候補に追加
                </button>
              )}
            </footer>
          </div>
        </div>
      )}

      {bulkRequestModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => {
              if (!bulkRequestSending) setBulkRequestModalOpen(false);
            }}
          />
          <div className="relative z-10 w-full max-w-xl bg-white border border-gray-200 shadow-xl">
            <header className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">
                  出勤依頼の一括送信
                </h2>
                <p className="mt-1 text-[11px] text-muted">
                  条件内の未送信 {bulkRequestTargets.length} 名に送信します。
                  {allFilteredCasts.length - bulkRequestTargets.length > 0
                    ? ` 送信済み等の ${allFilteredCasts.length - bulkRequestTargets.length} 名は除外されます。`
                    : ""}
                </p>
              </div>
              <button
                type="button"
                className="text-xs text-muted hover:text-gray-900 disabled:opacity-50"
                onClick={() => setBulkRequestModalOpen(false)}
                disabled={bulkRequestSending}
              >
                ✕
              </button>
            </header>
            <div className="p-4">
              <label className="text-[11px] font-semibold text-gray-700">
                送信本文
              </label>
              <textarea
                className="mt-2 h-40 w-full resize-none border border-gray-200 px-3 py-2 text-xs leading-relaxed"
                value={bulkRequestDraft}
                onChange={(e) => setBulkRequestDraft(e.target.value)}
                disabled={bulkRequestSending}
              />
              <p className="mt-2 text-[11px] text-muted">
                ここで編集した本文を、現在の絞り込み条件に該当する未送信キャストへ送信します。
              </p>
            </div>
            <footer className="px-4 py-3 border-t border-gray-200 bg-white flex items-center justify-end gap-2">
              <button
                type="button"
                className="px-3 py-1.5 border border-gray-300 bg-white text-gray-800 text-xs disabled:opacity-50"
                onClick={() => setBulkRequestModalOpen(false)}
                disabled={bulkRequestSending}
              >
                キャンセル
              </button>
              <button
                type="button"
                className="tiara-btn text-xs disabled:opacity-50"
                onClick={submitBulkRequestChat}
                disabled={
                  bulkRequestSending ||
                  bulkRequestTargets.length === 0 ||
                  !bulkRequestDraft.trim()
                }
              >
                {bulkRequestSending
                  ? "送信中..."
                  : `${bulkRequestTargets.length}名に送信`}
              </button>
            </footer>
          </div>
        </div>
      )}

      {chatTemplateEditOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setChatTemplateEditOpen(false)}
          />
          <div className="relative z-10 w-full max-w-md bg-white border border-gray-200 shadow-xl">
            <header className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">
                定型文の編集
              </h2>
              <button
                type="button"
                className="text-xs text-muted hover:text-gray-900"
                onClick={() => setChatTemplateEditOpen(false)}
              >
                ✕
              </button>
            </header>
            <div className="p-4">
              <div className="text-[11px] text-muted">
                {chatTemplateEditingKey === "request"
                  ? "出勤依頼"
                  : "出勤確認"}
              </div>
              <textarea
                className="mt-2 w-full h-28 px-3 py-2 border border-gray-200 text-xs resize-none"
                value={chatTemplateDraft}
                onChange={(e) => setChatTemplateDraft(e.target.value)}
              />
            </div>
            <footer className="px-4 py-3 border-t border-gray-200 bg-white flex items-center justify-end gap-2">
              <button
                type="button"
                className="px-3 py-1.5 border border-gray-300 bg-white text-gray-800 text-xs"
                onClick={() => setChatTemplateEditOpen(false)}
              >
                キャンセル
              </button>
              <button
                type="button"
                className="tiara-btn text-xs"
                onClick={() => {
                  if (!chatTemplateDraft.trim()) {
                    alert("定型文を入力してください。");
                    return;
                  }
                  setChatTemplates((prev) => ({
                    ...prev,
                    [chatTemplateEditingKey]: chatTemplateDraft.trim(),
                  }));
                  setChatTemplateEditOpen(false);
                }}
              >
                保存
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* NG登録モーダル */}
      {ngModalOpen && selectedCast && (
        /* NG登録モーダル：詳細モーダルの上に重ねる（サブモーダル階層） */
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={closeNgModal} />
          <div className="relative z-10 w-full max-w-4xl max-h-[80vh] bg-white border border-gray-200 shadow-2xl flex flex-col overflow-hidden">
            <header className="px-4 py-3 border-b border-gray-200 flex items-center justify-between bg-gray-50">
              <h2 className="text-sm font-semibold text-gray-900">
                NG登録（{selectedCast.name}）
              </h2>
              <button
                type="button"
                className="text-xs text-muted hover:text-gray-900"
                onClick={closeNgModal}
              >
                ✕
              </button>
            </header>

            {/* 上部: NG種別 + 絞り込み */}
            <div className="px-4 py-3 border-b border-gray-200 bg-white flex flex-col gap-3 text-xs">
              {/* NG種別 */}
              <div className="flex items-center gap-3">
                <span className="text-muted whitespace-nowrap">NG種別</span>
                <div className="inline-flex bg-gray-100 border border-gray-300 overflow-hidden">
                  <button
                    type="button"
                    className={
                      "px-3 py-1 " +
                      (ngMode === "shopToCast"
                        ? "bg-red-600 text-white"
                        : "bg-transparent text-gray-700")
                    }
                    onClick={() => setNgMode("shopToCast")}
                  >
                    店舗からNG
                  </button>
                  <button
                    type="button"
                    className={
                      "px-3 py-1 border-l border-gray-300 " +
                      (ngMode === "castToShop"
                        ? "bg-red-600 text-white"
                        : "bg-transparent text-gray-700")
                    }
                    onClick={() => setNgMode("castToShop")}
                  >
                    キャストからNG
                  </button>
                </div>
              </div>

              {/* 絞り込み（ジャンル / 名前 / ID / 並び替え） */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1">
                  <span className="text-muted whitespace-nowrap">ジャンル</span>
                  <select
                    className="tiara-input rounded-none h-8 w-[140px] text-xs"
                    value={ngFilterGenre}
                    onChange={(e) =>
                      setNgFilterGenre(
                        (e.target.value || "") as ShopGenre | "",
                      )
                    }
                  >
                    <option value="">すべて</option>
                    <option value="club">クラブ</option>
                    <option value="cabaret">キャバ</option>
                    <option value="snack">スナック</option>
                    <option value="gb">ガルバ</option>
                  </select>
                </div>

                <div className="flex items-center gap-1">
                  <span className="text-muted whitespace-nowrap">店舗名</span>
                  <input
                    className="tiara-input rounded-none h-8 w-[200px] text-xs"
                    placeholder="店舗名で検索"
                    value={ngFilterName}
                    onChange={(e) => setNgFilterName(e.target.value)}
                  />
                </div>

                <div className="flex items-center gap-1">
                  <span className="text-muted whitespace-nowrap">店舗番号</span>
                  <input
                    className="tiara-input rounded-none h-8 w-[140px] text-xs"
                    placeholder="店舗番号で検索"
                    value={ngFilterCode}
                    onChange={(e) => setNgFilterCode(e.target.value)}
                  />
                </div>

                <div className="flex items-center gap-1">
                  <span className="text-muted whitespace-nowrap">並び替え</span>
                  <select
                    className="tiara-input rounded-none h-8 w-[160px] text-xs"
                    value={ngSortKey}
                    onChange={(e) =>
                      setNgSortKey(e.target.value as "number" | "kana")
                    }
                  >
                    <option value="number">番号順</option>
                    <option value="kana">50音順</option>
                  </select>
                </div>
              </div>
            </div>

            {/* 店舗一覧 */}
            <div className="flex-1 overflow-auto bg-white">
              {ngCandidateShops.length === 0 ? (
                <div className="p-4 text-xs text-muted">
                  対象店舗がありません。
                  本日のスケジュールに店舗が登録されていない可能性があります。
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="p-2 w-10 text-center">NG</th>
                      <th className="p-2 w-24 text-left">店舗番号</th>
                      <th className="p-2 text-left">店舗名</th>
                      <th className="p-2 w-24 text-left">ジャンル</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ngCandidateShops.map((shop) => {
                      const checked = ngSelectedShopIds.includes(shop.id);
                      return (
                        <tr
                          key={shop.id}
                          className="border-b border-gray-100 hover:bg-sky-50/60"
                          onClick={() => toggleNgShopSelection(shop.id)}
                        >
                          <td className="p-2 text-center">
                            <input
                              type="checkbox"
                              className="h-3 w-3"
                              checked={checked}
                              onChange={() => toggleNgShopSelection(shop.id)}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </td>
                          <td className="p-2 font-mono">{shop.code}</td>
                          <td className="p-2">{shop.name}</td>
                          <td className="p-2">
                            {shop.genre
                              ? SHOP_GENRE_LABEL[shop.genre] ?? shop.genre
                              : "-"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <footer className="px-4 py-3 border-t border-gray-200 bg-white flex items-center justify-between text-[11px] text-gray-600">
              <div>
                ・上記一覧からNG店舗を選択して「登録」ボタンで保存します。
                <br />
                ・現在はフロント側の一時保持のみで、API連携は今後の実装予定です。
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="px-3 py-1.5 border border-gray-300 bg-white text-gray-800"
                  onClick={closeNgModal}
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  className="px-4 py-1.5 bg-red-600 text-white"
                  onClick={handleNgSave}
                >
                  登録
                </button>
              </div>
            </footer>
          </div>
        </div>
      )}

      {floatPos && !floatMinimized && (
        <div
          className="fixed border border-gray-300 bg-white shadow-lg"
          style={{ left: floatPos.x, top: floatPos.y, width: 360, zIndex: floatZ }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
          }}
          onDrop={(e) => {
            e.preventDefault();
            const castId = e.dataTransfer.getData("text/plain");
            if (!castId) return;
            const cast =
              allCasts.find((c: Cast) => c.id === castId) ?? null;
            if (!cast) return;

            if (
              selectedShop &&
              !matchesShopConditions(
                cast,
                selectedShop,
                selectedShopNgCastIdSet,
                selectedShopFixedCastIdSet,
              )
            ) {
              alert(
                "このキャストは、選択中の店舗条件／NGにより割当不可です。",
              );
              return;
            }

            handleOrderDrop(cast);
          }}
        >
          <div
            className="cursor-move bg-gray-100 px-3 py-2 text-xs font-semibold border-b border-gray-300 flex items-center justify-between"
            onMouseDown={(e) => {
              if (!floatPos) return;
              setDragging(true);
              setDragOffset({
                x: e.clientX - floatPos.x,
                y: e.clientY - floatPos.y,
              });
              setFloatZ((z) => z + 1);
            }}
          >
            <span>オーダー画面</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="border border-gray-300 bg-white px-2 py-0.5 text-[10px]"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleRejectClick();
                }}
              >
                不承
              </button>
              <button
                type="button"
                className="border border-gray-300 bg-white px-2 py-0.5 text-[10px]"
                onClick={(e) => {
                  e.stopPropagation();
                  setFloatMinimized(true);
                }}
              >
                最小化
              </button>
            </div>
          </div>
          <div className="p-3 flex flex-col gap-3">
            <div className="flex flex-col gap-1 text-[11px] text-muted">
              <div className="flex items-center gap-1">
                <input
                  className="tiara-input rounded-none h-8 text-[11px] leading-snug flex-1"
                  placeholder="店舗名・店舗番号で検索"
                  value={orderShopQuery}
                  onChange={(e) => {
                    const q = e.target.value;
                    setOrderShopQuery(q);
                    setOrderShopOpen(true);
                    if (!q.trim()) {
                      setSelectedShopId("");
                    }
                  }}
                  onFocus={() => {
                    if (orderShopQuery.trim()) setOrderShopOpen(true);
                  }}
                  onKeyDown={(e) => {
                    if (!orderShopMatches.length) return;
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setOrderShopActiveIndex((i) =>
                        Math.min(i + 1, orderShopMatches.length - 1),
                      );
                      return;
                    }
                    if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setOrderShopActiveIndex((i) => Math.max(i - 1, 0));
                      return;
                    }
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const hit = orderShopMatches[orderShopActiveIndex];
                      if (!hit) return;
                      setSelectedShopId(hit.id);
                      setOrderShopQuery(`${hit.code} ${hit.name}`);
                      setOrderShopOpen(false);
                      setFloatMinimized(false);
                      setFloatZ((z) => z + 1);
                    }
                  }}
                />
                {orderShopOpen && (
                  <button
                    type="button"
                    className="border border-gray-300 bg-white text-ink px-2 h-8 text-[11px]"
                    onClick={() => setOrderShopOpen(false)}
                  >
                    ×
                  </button>
                )}
              </div>
              {orderShopOpen && orderShopMatches.length > 0 && (
                <div className="border border-gray-200 bg-white text-[11px] max-h-40 overflow-auto">
                  {orderShopMatches.map((shop, idx) => (
                    <button
                      key={shop.id}
                      type="button"
                      className={`w-full text-left px-2 py-1 border-b border-gray-100 last:border-b-0 ${
                        idx === orderShopActiveIndex ? "bg-slate-100" : "hover:bg-slate-50"
                      }`}
                      onClick={() => {
                        setSelectedShopId(shop.id);
                        setOrderShopQuery(`${shop.code} ${shop.name}`);
                        setOrderShopOpen(false);
                        setFloatMinimized(false);
                        setFloatZ((z) => z + 1);
                        setOrderShopActiveIndex(idx);
                      }}
                    >
                      {shop.code} / {shop.name}
                      {shop.nameKana ? `（${shop.nameKana}）` : ""}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-1 text-[11px] text-muted">
              <div className="flex items-center justify-between">
                <span>店舗：</span>
                <span className="font-medium text-ink">
                  {selectedShop
                    ? `${selectedShop.code} / ${selectedShop.name}`
                    : "未選択"}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="tiara-input rounded-none h-9 !w-[110px] py-1 text-[11px] leading-normal flex-none"
                  value={dispatchCount}
                  onChange={(e) => setDispatchCount(e.target.value)}
                >
                  {["1", "2", "3", "4", "5"].map((n) => (
                    <option key={n} value={n}>
                      派遣人数 {n}
                    </option>
                  ))}
                </select>
                <select
                  className="tiara-input rounded-none h-9 !w-[110px] py-1 text-[11px] leading-normal flex-none"
                  value={entryTime}
                  onChange={(e) => setEntryTime(e.target.value)}
                >
                  {["00:00", "20:00", "21:00", "22:00", "23:00"].map((t) => (
                    <option key={t} value={t}>
                      入店時間 {t}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="border border-gray-300 bg-white text-ink px-3 h-8 text-xs flex-none"
                  onClick={async () => {
                    try {
                      await createOrderItemFromSelection();
                    } catch (err) {
                      console.warn("[casts/today] create order failed", err);
                      alert(
                        "オーダー作成に失敗しました。時間をおいて再度お試しください。",
                      );
                    }
                  }}
                >
                  追加
                </button>
              </div>
              <div className="flex flex-col gap-1 text-[11px] text-muted">
                {orderItems.length === 0 ? (
                  <span>オーダー（{dispatchCount}名　{entryTime}〜）</span>
                ) : (
                  orderItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-2"
                    >
                      <span>
                        {item.name}（{item.detail}）
                      </span>
                      <button
                        type="button"
                        className="border border-gray-300 bg-white text-ink px-2 py-0.5 text-[10px]"
                        onClick={async () => {
                          if (item.apiOrderId) {
                            try {
                              await replaceOrderAssignments(item.apiOrderId, []);
                            } catch (err) {
                              console.warn(
                                "[casts/today] clearOrderAssignments failed",
                                { apiOrderId: item.apiOrderId, err },
                              );
                            }
                          }
                          setOrderItems((prev) =>
                            prev.filter((x) => x.id !== item.id),
                          );
                          setOrderAssignments((prev) => {
                            const next = { ...prev };
                            delete next[item.id];
                            const remaining = new Set(
                              Object.values(next)
                                .flat()
                                .map((c) => c.id),
                            );
                            setStaged((prevStaged: Cast[]) =>
                              prevStaged.filter((c) => remaining.has(c.id)),
                            );
                            return next;
                          });
                        }}
                      >
                        削除
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="border-2 border-dashed border-gray-300 bg-gray-50 h-[220px] flex flex-col">
              <div className="px-3 py-2 border-b border-gray-200">
                <p className="text-xs text-muted">
                  ここにキャストカードをドラッグ＆ドロップ
                </p>
              </div>
              <div className="flex-1 overflow-auto px-2 py-2 space-y-2">
                {Object.keys(orderAssignments).length === 0 ? (
                  <div className="text-xs text-muted">
                    割当候補はまだ選択されていません。
                  </div>
                ) : (
                  orderItems.flatMap((order) =>
                    (orderAssignments[order.id] ?? []).map((c: Cast) => {
                      const detail = castDetailById[c.id];
                      const photoUrl =
                        photoByCastId[c.id] ??
                        c.photoUrl ??
                        resolveImmediateDisplayPhotoUrl(detail) ??
                        "";
                      const photoFallbackUrl =
                        photoFallbackByCastId[c.id] ??
                        c.photoUrlRaw ??
                        resolveLegacyPhotoFallbackUrl(detail) ??
                        "";
                      const displayPhotoUrl = photoUrl || photoFallbackUrl;
                      const shouldShowDebugCard = debugMatchingCard;
                      return (
                      <div
                        key={`${order.id}-${c.id}`}
                        className="border border-gray-200 bg-white px-2 py-1.5 text-xs flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-9 h-9 overflow-hidden bg-gray-200 flex items-center justify-center">
                            {displayPhotoUrl ? (
                              <CastPhotoImage
                                src={displayPhotoUrl}
                                fallbackSrc={photoFallbackUrl || undefined}
                                alt={c.name}
                                className="w-full h-full object-cover"
                                debugPhoto={shouldShowDebugCard}
                                fallback={
                                  <span className="text-[10px] text-ink/80">
                                    {c.name.slice(0, 2)}
                                  </span>
                                }
                              />
                            ) : (
                              <span className="text-[10px] text-ink/80">
                                {c.name.slice(0, 2)}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="font-semibold truncate">
                              {c.name}
                            </span>
                            <span className="text-[10px] text-muted">
                              {order.name} / {c.code} / {c.age}歳 / ¥
                              {c.desiredHourly.toLocaleString()}
                            </span>
                          </div>
                          {shouldShowDebugCard &&
                            renderMatchingPhotoDebug("assigned", {
                              id: c.id,
                              castId: c.id,
                              userId: c.id,
                              photoUrl: c.photoUrl ?? null,
                              photoUrlRaw: c.photoUrlRaw ?? null,
                              mapPhotoUrl: photoByCastId[c.id] ?? null,
                              mapPhotoFallback:
                                photoFallbackByCastId[c.id] ?? null,
                              detail,
                              detailDisplayUrl:
                                resolveImmediateDisplayPhotoUrl(detail) ?? null,
                              detailFallbackUrl:
                                resolveLegacyPhotoFallbackUrl(detail) ?? null,
                              finalSrc: displayPhotoUrl || null,
                              finalFallbackSrc: photoFallbackUrl || null,
                            })}
                        </div>
                      </div>
                      );
                    }),
                  )
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className="border border-gray-300 bg-white text-ink px-4 py-2 text-sm"
                onClick={() => {
                  setOrderAssignments({});
                  setStaged([]);
                }}
                disabled={Object.keys(orderAssignments).length === 0}
              >
                クリア
              </button>
              <button
                type="button"
                className={`tiara-btn text-sm ${
                  Object.keys(orderAssignments).length === 0
                    ? "opacity-40 cursor-not-allowed"
                    : ""
                }`}
                onClick={async () => {
                  console.warn("[casts/today] confirm click", {
                    selectedShopId,
                    selectedShop,
                    orderItemsLength: orderItems.length,
                    assignmentsCount: Object.keys(orderAssignments).length,
                  });
                  if (!selectedShop) {
                    alert("店舗が未選択です。");
                    return;
                  }
                  if (Object.keys(orderAssignments).length === 0) {
                    alert("割当候補がありません。");
                    return;
                  }
                  const shopOrders = orderItems.filter((o) => {
                    const shopId = (o as any)?.shopId ?? (o as any)?.shop?.id ?? "";
                    return shopId ? shopId === selectedShopId : true;
                  });
                  console.warn("[casts/today] confirm shopOrders", {
                    shopOrdersLength: shopOrders.length,
                  });
                  if (shopOrders.length === 0) {
                    const firstOrderId = orderItems[0]?.id ?? null;
                    setMissingOrderTargetId(firstOrderId);
                    setMissingOrderConfirmOpen(true);
                    return;
                  }
                  if (shopOrders.length > 1) {
                    setConfirmOrderCandidates(shopOrders);
                    setConfirmOrderSelectOpen(true);
                    return;
                  }
                  await finalizeOrderConfirm(shopOrders[0].id);
                }}
                disabled={Object.keys(orderAssignments).length === 0}
              >
                確定
              </button>
            </div>
          </div>
        </div>
      )}

      {orderSelectOpen && pendingCast && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => {
              setOrderSelectOpen(false);
              setPendingCast(null);
            }}
          />
          <div className="relative z-10 w-full max-w-sm bg-white border border-gray-200 shadow-xl p-4">
            <div className="text-sm font-semibold">オーダー選択</div>
            <div className="mt-2 text-xs text-muted">
              割り当てるオーダーを選択してください。
            </div>
            <div className="mt-3 flex flex-col gap-2">
              {orderItems.map((order) => (
                <button
                  key={order.id}
                  type="button"
                  className="border border-gray-300 bg-white text-left px-3 py-2 text-xs hover:bg-slate-50"
                  onClick={() => {
                    assignCastToOrder(order.id, pendingCast);
                    setOrderSelectOpen(false);
                    setPendingCast(null);
                  }}
                >
                  {order.name}（{order.detail}）
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {confirmOrderSelectOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => {
              setConfirmOrderSelectOpen(false);
              setConfirmOrderCandidates([]);
            }}
          />
          <div className="relative z-10 w-full max-w-sm bg-white border border-gray-200 shadow-xl p-4">
            <div className="text-sm font-semibold">オーダー選択（確定）</div>
            <div className="mt-2 text-xs text-muted">
              確定するオーダーを選択してください。
            </div>
            <div className="mt-3 flex flex-col gap-2">
              {confirmOrderCandidates.map((order) => (
                <button
                  key={order.id}
                  type="button"
                  className="border border-gray-300 bg-white text-left px-3 py-2 text-xs hover:bg-slate-50"
                  onClick={() => {
                    setConfirmOrderSelectOpen(false);
                    setConfirmOrderCandidates([]);
                    void finalizeOrderConfirm(order.id);
                  }}
                >
                  {order.name}（{order.detail}）
                </button>
              ))}
            </div>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                className="border border-gray-300 bg-white px-3 py-1 text-xs"
                onClick={() => {
                  setConfirmOrderSelectOpen(false);
                  setConfirmOrderCandidates([]);
                }}
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {rejectOrderSelectOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => {
              setRejectOrderSelectOpen(false);
              setRejectOrderCandidates([]);
            }}
          />
          <div className="relative z-10 w-full max-w-sm bg-white border border-gray-200 shadow-xl p-4">
            <div className="text-sm font-semibold">オーダー選択（不承）</div>
            <div className="mt-2 text-xs text-muted">
              不承にするオーダーを選択してください。
            </div>
            <div className="mt-3 flex flex-col gap-2">
              {rejectOrderCandidates.map((order) => (
                <button
                  key={order.id}
                  type="button"
                  className="border border-gray-300 bg-white text-left px-3 py-2 text-xs hover:bg-slate-50"
                  onClick={() => {
                    setRejectOrderSelectOpen(false);
                    setRejectOrderCandidates([]);
                    void rejectOrder(order.id);
                  }}
                >
                  {order.name}（{order.detail}）
                </button>
              ))}
            </div>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                className="border border-gray-300 bg-white px-3 py-1 text-xs"
                onClick={() => {
                  setRejectOrderSelectOpen(false);
                  setRejectOrderCandidates([]);
                }}
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {missingOrderConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => {
              setMissingOrderConfirmOpen(false);
              setMissingOrderTargetId(null);
            }}
          />
          <div className="relative z-10 w-full max-w-sm bg-white border border-gray-200 shadow-xl p-4">
            <div className="text-sm font-semibold">オーダー未作成</div>
            <div className="mt-2 text-xs text-muted">
              オーダー未作成（派遣人数 or 入店時間 or 両方）ですが割当リストへ送りますか？
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="border border-gray-300 bg-white px-3 py-1 text-xs"
                onClick={() => {
                  setMissingOrderConfirmOpen(false);
                  setMissingOrderTargetId(null);
                }}
              >
                戻る
              </button>
              <button
                type="button"
                className="tiara-btn text-xs"
                onClick={async () => {
                  const targetId = missingOrderTargetId;
                  setMissingOrderConfirmOpen(false);
                  setMissingOrderTargetId(null);
                  if (!targetId) return;
                  await finalizeOrderConfirm(targetId, { allowCreate: true });
                }}
              >
                送る
              </button>
            </div>
          </div>
        </div>
      )}

      {cancelDialogRow && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/45"
            onClick={closeCancelDialog}
          />
          <div className="relative z-10 w-full max-w-md border border-gray-200 bg-white shadow-2xl">
            <header className="border-b border-gray-200 bg-gray-50 px-4 py-3">
              <div className="text-sm font-semibold text-gray-900">
                キャンセル種別を選択
              </div>
              <div className="mt-1 text-xs text-gray-500">
                {cancelDialogRow.displayName} の確定済み派遣をキャンセルします。
              </div>
            </header>
            <div className="space-y-3 p-4 text-xs">
              <label
                className={
                  "flex cursor-pointer gap-3 border p-3 " +
                  (cancelDialogType === "cast"
                    ? "border-rose-500 bg-rose-50"
                    : "border-gray-200 bg-white")
                }
              >
                <input
                  type="radio"
                  className="mt-0.5"
                  name="dispatch-cancel-type"
                  checked={cancelDialogType === "cast"}
                  onChange={() => {
                    setCancelDialogType("cast");
                    if (
                      !cancelDialogReason.trim() ||
                      cancelDialogReason === "店舗都合キャンセル"
                    ) {
                      setCancelDialogReason("当日欠勤");
                    }
                  }}
                />
                <span>
                  <span className="block font-semibold text-gray-900">
                    キャスト都合
                  </span>
                  <span className="mt-1 block text-gray-500">
                    キャストだけ外し、店舗オーダー枠は残します。
                    キャストのキャンセル回数に加算されます。
                  </span>
                </span>
              </label>
              <label
                className={
                  "flex cursor-pointer gap-3 border p-3 " +
                  (cancelDialogType === "shop"
                    ? "border-rose-500 bg-rose-50"
                    : "border-gray-200 bg-white")
                }
              >
                <input
                  type="radio"
                  className="mt-0.5"
                  name="dispatch-cancel-type"
                  checked={cancelDialogType === "shop"}
                  onChange={() => {
                    setCancelDialogType("shop");
                    if (
                      !cancelDialogReason.trim() ||
                      cancelDialogReason === "当日欠勤"
                    ) {
                      setCancelDialogReason("店舗都合キャンセル");
                    }
                  }}
                />
                <span>
                  <span className="block font-semibold text-gray-900">
                    店舗都合
                  </span>
                  <span className="mt-1 block text-gray-500">
                    店舗オーダーごとキャンセルします。
                    店舗側のキャンセルとして記録されます。
                  </span>
                </span>
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-gray-600">
                  キャンセル理由
                </span>
                <input
                  className="h-9 w-full border border-gray-300 px-3 text-xs outline-none focus:border-rose-500"
                  value={cancelDialogReason}
                  onChange={(e) => setCancelDialogReason(e.target.value)}
                />
              </label>
            </div>
            <footer className="flex items-center justify-end gap-2 border-t border-gray-200 px-4 py-3">
              <button
                type="button"
                className="border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-800"
                onClick={closeCancelDialog}
              >
                キャンセル
              </button>
              <button
                type="button"
                className="bg-rose-600 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                disabled={!cancelDialogReason.trim() || Boolean(dispatchSavingKey)}
                onClick={() => void executeDispatchCancel()}
              >
                OK
              </button>
            </footer>
          </div>
        </div>
      )}

      <style jsx>{`
        :global(.tiara-input) {
          border-radius: 0 !important;
        }
        :global(.matching-filter-select) {
          height: 32px !important;
          min-height: 32px !important;
          padding-top: 0 !important;
          padding-bottom: 0 !important;
          line-height: 30px !important;
          vertical-align: middle;
        }
        .support-mode-overlay {
          position: absolute;
          inset: 0;
          z-index: 10;
          pointer-events: none;
          background: rgba(15, 23, 42, 0.46);
          backdrop-filter: grayscale(0.8);
        }
        .support-callout {
          position: absolute;
          left: 12px;
          top: 132px;
          z-index: 40;
          max-width: 430px;
          border: 2px solid #f59e0b;
          background: #fff7ed;
          padding: 8px 10px;
          box-shadow: 0 12px 24px rgba(15, 23, 42, 0.22);
        }
        :global(.support-visible) {
          position: relative;
          z-index: 30 !important;
          filter: none !important;
          opacity: 1 !important;
        }
        :global(.support-focus) {
          position: relative;
          z-index: 30 !important;
          filter: none !important;
          opacity: 1 !important;
          box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.9) !important;
        }
        :global(.support-focus::after) {
          content: "ここを操作";
          position: absolute;
          top: calc(100% + 9px);
          left: 8px;
          z-index: 41;
          white-space: nowrap;
          border: 1px solid #f59e0b;
          background: #f59e0b;
          color: white;
          font-size: 10px;
          font-weight: 700;
          line-height: 1;
          padding: 5px 7px;
          pointer-events: none;
          animation: supportNudge 0.9s ease-in-out infinite alternate;
        }
        :global(.support-focus::before) {
          content: "";
          position: absolute;
          top: calc(100% + 2px);
          left: 18px;
          z-index: 41;
          border-left: 6px solid transparent;
          border-right: 6px solid transparent;
          border-bottom: 7px solid #f59e0b;
          pointer-events: none;
          animation: supportNudge 0.9s ease-in-out infinite alternate;
        }
        @keyframes supportNudge {
          from {
            transform: translateY(0);
          }
          to {
            transform: translateY(4px);
          }
        }
        @media print {
          @page {
            size: A4 landscape;
            margin: 8mm;
          }

          :global(body *) {
            visibility: hidden !important;
          }

          :global(.dispatch-sheet-section),
          :global(.dispatch-sheet-section *) {
            visibility: visible !important;
          }

          :global(.dispatch-sheet-section) {
            position: absolute !important;
            inset: 0 auto auto 0 !important;
            width: 100% !important;
            border: 0 !important;
            background: white !important;
          }

          :global(.dispatch-sheet-section > div:first-child),
          :global(.dispatch-sheet-screen),
          :global(datalist) {
            display: none !important;
          }

          :global(.dispatch-sheet-print) {
            display: block !important;
          }

          :global(.dispatch-sheet-print *) {
            color: #020617 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>
    </AppShell>
  );
}
