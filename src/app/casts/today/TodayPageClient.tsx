// src/app/casts/today/TodayPageClient.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import {
  listTodayCasts,
  listCasts as fetchCastList,
  getCast,
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
import { listShops } from "@/lib/api.shops";
import {
  type ScheduleShopRequest,
  loadScheduleShopRequests,
} from "@/lib/schedule.store";

// ====== 追加: 型定義 ======

type DrinkLevel = "ng" | "weak" | "normal" | "strong" | null;

// キャストのジャンル（複数選択用）
type CastGenre = "club" | "cabaret" | "snack" | "gb";

// 店舗ジャンル（NG登録モーダルの絞り込み用）
type ShopGenre = "club" | "cabaret" | "snack" | "gb";
type YesNoFilter = "" | "yes" | "no";
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
  age: number;
  desiredHourly: number;
  /** 飲酒レベル: NG / 弱い / 普通 / 強い / 未登録(null) */
  drinkLevel: DrinkLevel;
  photoUrl?: string;
  hasExclusive?: boolean;
  hasNominated?: boolean;
  /** このキャストがNGの店舗ID一覧（将来APIから付与 or 更新） */
  ngShopIds?: string[];
  /** 旧ID（既存仕様：管理番号・名前・旧IDで検索できる想定） */
  oldId?: string;
  /** キャストのジャンル（クラブ / キャバ / スナック / ガルバ など複数） */
  genres?: CastGenre[];
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
  /** 連絡方法（店舗管理の情報） */
  contactMethod?: string | null;
  /** 連絡ステータス（入力中/済/確定など） */
  contactStatus?: string | null;
  /** 時給ラベル（店舗管理の情報） */
  wageLabel?: string | null;
  /** 身分証要件（店舗管理の情報） */
  idDocumentRequirement?: string | null;
  [key: string]: any;
};

// ===== スケジュール連携: 本日分の店舗を取得 =====

// 本日の日付キー（YYYY-MM-DD）
const todayKey = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const dd = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${dd}`;
};

type SortKey = "default" | "hourlyDesc" | "ageAsc" | "ageDesc";
type DrinkSort = "none" | "okFirst" | "ngFirst";

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
  return cast.name ?? "";
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

const resolvePhotoUrl = (item: any): string | undefined => {
  const direct =
    item?.profilePhotoUrl ??
    item?.profile_photo_url ??
    item?.photoUrl ??
    item?.photo_url ??
    item?.imageUrl ??
    item?.image_url ??
    null;
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  const arrays = [
    item?.profilePhotos,
    item?.profile_photos,
    item?.photoUrls,
    item?.photo_urls,
    item?.images,
    item?.image_urls,
  ];
  for (const arr of arrays) {
    if (Array.isArray(arr) && arr.length > 0) {
      const first = arr.find((u: any) => typeof u === "string" && u.trim());
      if (first) return String(first).trim();
    }
  }
  return undefined;
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

/**
 * 店舗条件・NG情報を元に「この店舗にマッチするキャストか？」を判定
 */
const matchesShopConditions = (cast: Cast, shop: Shop | null): boolean => {
  if (!shop) return true;

  if (cast.ngShopIds?.includes(shop.id)) return false;

  if (shop.minHourly != null && cast.desiredHourly < shop.minHourly) return false;
  if (shop.maxHourly != null && cast.desiredHourly > shop.maxHourly) return false;

  if (shop.minAge != null && cast.age < shop.minAge) return false;
  if (shop.maxAge != null && cast.age > shop.maxAge) return false;

  // 「飲酒OKのみ」は NG 以外（弱い / 普通 / 強い）を許可
  if (shop.requireDrinkOk) {
    const canDrink =
      cast.drinkLevel === "weak" ||
      cast.drinkLevel === "normal" ||
      cast.drinkLevel === "strong";
    if (!canDrink) return false;
  }

  return true;
};

export default function Page() {
  // 本日出勤キャスト一覧（/casts/today）
  const [todayCasts, setTodayCasts] = useState<Cast[]>([]);
  // 全キャスト（シフトに関係なく /casts から取得）
  const [allCasts, setAllCasts] = useState<Cast[]>([]);

  // 本日分の店舗（スケジュールAPI連携）
  const [todayShops, setTodayShops] = useState<Shop[]>([]);
  const [fallbackShops, setFallbackShops] = useState<Shop[]>([]);

  const [staged, setStaged] = useState<Cast[]>([]);
  const [selectedShopId, setSelectedShopId] = useState<string>("");
  const [keyword, setKeyword] = useState("");
  const [担当者, set担当者] = useState<string>("all");
  const [itemsPerPage, setItemsPerPage] = useState<50 | 56 | 100>(56);
  const [statusTab, setStatusTab] = useState<
    "today" | "all" | "matched" | "unassigned"
  >("today");

  // 既存ソート（年齢・時給など）
  const [sortKey, setSortKey] = useState<SortKey>("default");
  const [drinkSort, setDrinkSort] = useState<DrinkSort>("none");

  // 追加: 複数選択可能な並び順（50音順 / 番号小さい順 / 番号大きい順）
  const [sortKana, setSortKana] = useState<boolean>(false);
  const [sortNumberSmallFirst, setSortNumberSmallFirst] =
    useState<boolean>(false);
  const [sortNumberLargeFirst, setSortNumberLargeFirst] =
    useState<boolean>(false);

  // 追加: キャストジャンル・年齢レンジでの絞り込み
  const [castGenreFilter, setCastGenreFilter] = useState<CastGenre | "">("");
  const [ageRangeFilter, setAgeRangeFilter] = useState<AgeRangeFilter>("");

  const [currentPage, setCurrentPage] = useState<number>(1);

  // ローディング・エラー表示用
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 店舗選択モーダル用
  const [shopModalOpen, setShopModalOpen] = useState(false);
  const [shopSearch, setShopSearch] = useState("");

  // キャスト詳細モーダル用
  const [castDetailModalOpen, setCastDetailModalOpen] = useState(false);
  const [selectedCast, setSelectedCast] = useState<Cast | null>(null);

  // NG登録モーダル用
  const [ngModalOpen, setNgModalOpen] = useState(false);
  const [ngMode, setNgMode] = useState<NgMode>("shopToCast");
  const [ngFilterGenre, setNgFilterGenre] = useState<ShopGenre | "">("");
  const [ngFilterName, setNgFilterName] = useState("");
  const [ngFilterCode, setNgFilterCode] = useState("");
  const [ngSortKey, setNgSortKey] = useState<"number" | "kana">("number");
  const [ngSelectedShopIds, setNgSelectedShopIds] = useState<string[]>([]);

  const [panelTab, setPanelTab] = useState<"casts" | "shops">("shops");
  const [shopSortKey, setShopSortKey] = useState<"number" | "kana">("number");
  const [floatPos, setFloatPos] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [dragging, setDragging] = useState(false);
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
  const backgroundFetchIndexRef = useRef(0);
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

  const buildStamp = useMemo(() => new Date().toLocaleString(), []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem("tiara:cast-photo-cache-v1");
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        setPhotoByCastId(parsed as Record<string, string>);
      }
    } catch {
      // ignore cache parse errors
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (photoCacheSaveTimer.current) {
      window.clearTimeout(photoCacheSaveTimer.current);
    }
    photoCacheSaveTimer.current = window.setTimeout(() => {
      const entries = Object.entries(photoByCastId);
      const limited = entries.slice(0, 800);
      const next = Object.fromEntries(limited);
      window.localStorage.setItem(
        "tiara:cast-photo-cache-v1",
        JSON.stringify(next),
      );
    }, 300);
  }, [photoByCastId]);

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
      case "confirmed":
        return "◯済";
      case "rejected":
        return "済";
      default:
        return "-";
    }
  };

  const renderShopCell = (
    shop: Shop,
    key: (typeof shopTableColumns)[number]["key"],
  ) => {
    switch (key) {
      case "code":
        return shop.code || "-";
      case "name":
        return shop.name || "-";
      case "hourly": {
        const min = shop.minHourly != null ? `¥${shop.minHourly.toLocaleString()}` : "";
        const max = shop.maxHourly != null ? `¥${shop.maxHourly.toLocaleString()}` : "";
        if (min && max) return `${min}〜${max}`;
        if (min) return `${min}〜`;
        if (max) return `〜${max}`;
        return "-";
      }
      case "genre":
        return shop.genre ? SHOP_GENRE_LABEL[shop.genre] : "-";
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
          contactMethod: (shop as any).contactMethod ?? null,
          wageLabel: (shop as any).wageLabel ?? (shop as any).wage_label ?? null,
          idDocumentRequirement:
            (shop as any).idDocumentRequirement ??
            (shop as any).id_document_requirement ??
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
    if (todayShops.length === 0) return fallbackShops;
    const statusByShop = new Map(
      todayShops.map((shop) => [
        shop.id,
        { contactStatus: shop.contactStatus ?? null, requestId: shop.requestId },
      ]),
    );
    return fallbackShops.map((shop) => {
      const match = statusByShop.get(shop.id);
      return match
        ? {
            ...shop,
            contactStatus: match.contactStatus ?? shop.contactStatus ?? null,
            requestId: match.requestId ?? shop.requestId,
          }
        : shop;
    });
  }, [fallbackShops, todayShops]);

  const selectedShop = useMemo(
    () => effectiveShops.find((s: Shop) => s.id === selectedShopId) ?? null,
    [effectiveShops, selectedShopId],
  );

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
            resolvePhotoUrl(item),
          ]),
        );

        // 本日出勤キャスト
        const todayList: Cast[] = todayResp.items.map((item) => ({
          id: item.castId,
          code: item.managementNumber ?? item.castId.slice(0, 8),
          name: item.displayName,
          age: item.age ?? 0,
          desiredHourly: item.desiredHourly ?? 0,
          drinkLevel: mapDrinkLevel(
            (item as any).drinkLevel ?? (item as any).drinkOk,
          ),
          photoUrl:
            resolvePhotoUrl(item) ?? allPhotoMap.get(item.castId) ?? undefined,
          hasExclusive: getCastExclusiveFlag(item),
          hasNominated: getCastNominatedFlag(item),
          ngShopIds: (item as any).ngShopIds ?? [],
          oldId: (item as any).oldId ?? (item as any).legacyId ?? undefined,
          genres: ((item as any).genres ?? []) as CastGenre[],
        }));

        const todayMap = new Map(todayList.map((c) => [c.id, c]));

        // 全キャスト（/casts）。本日出勤分は todayList を優先し、それ以外はデフォルト値で補完
        const allList: Cast[] = allResp.items.map((item) => {
          const fromToday = todayMap.get(item.userId);
          if (fromToday) return fromToday;

          return {
            id: item.userId,
            code: item.managementNumber ?? item.userId.slice(0, 8),
            name: item.displayName,
            age: item.age ?? 0,
            desiredHourly: 0, // /casts 側では希望時給はまだ無いので 0 で補完
            drinkLevel: mapDrinkLevel(
              (item as any).drinkLevel ?? (item as any).drinkOk,
            ),
            photoUrl: resolvePhotoUrl(item) ?? undefined,
            hasExclusive: getCastExclusiveFlag(item),
            hasNominated: getCastNominatedFlag(item),
            ngShopIds: (item as any).ngShopIds ?? [],
            oldId: (item as any).oldId ?? (item as any).legacyId ?? undefined,
            genres: ((item as any).genres ?? []) as CastGenre[],
          };
        });

        setTodayCasts(todayList);
        setAllCasts(allList);
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
    keyword,
    selectedShopId,
    itemsPerPage,
    sortKey,
    drinkSort,
    sortKana,
    sortNumberSmallFirst,
    sortNumberLargeFirst,
    castGenreFilter,
    ageRangeFilter,
  ]);

  // NGモーダルが開いた時点で、対象キャストの既存NG店舗を初期選択にする
  useEffect(() => {
    if (ngModalOpen && selectedCast) {
      setNgSelectedShopIds(selectedCast.ngShopIds ?? []);
    }
  }, [ngModalOpen, selectedCast]);

  const {
    items: filteredCasts,
    total: filteredTotal,
    totalPages,
    page: effectivePage,
  } = useMemo(() => {
    const todayIds = new Set(todayCasts.map((c) => c.id));
    const matchedIds = new Set(staged.map((c) => c.id));

    // ① ベース集合の選択（タブの役割）
    // - 未配属 / 本日出勤 / マッチ済み：本日出勤キャストのみ
    // - 全キャスト：シフトに関係なく全キャスト
    let base: Cast[];
    if (statusTab === "all") {
      base = allCasts;
    } else {
      base = allCasts.filter((c) => todayIds.has(c.id));
    }

    // ② タブごとの追加フィルタ
    if (statusTab === "unassigned") {
      base = base.filter((c) => !matchedIds.has(c.id));
    } else if (statusTab === "matched") {
      base = base.filter((c) => matchedIds.has(c.id));
    }

    let list: Cast[] = [...base];

    // ③ 店舗条件フィルタ
    if (selectedShop && statusTab !== "all") {
      list = list.filter((c: Cast) => matchesShopConditions(c, selectedShop));
    }

    // ④ キーワード（管理番号・名前・旧ID）
    if (keyword.trim()) {
      const q = keyword.trim();
      list = list.filter((c: Cast) => {
        const inName = c.name?.includes(q);
        const inCode = c.code?.includes(q);
        const inOld = c.oldId?.includes(q);
        return inName || inCode || inOld;
      });
    }

    // ⑤ キャストジャンル絞り込み
    if (castGenreFilter) {
      list = list.filter((c) => c.genres?.includes(castGenreFilter));
    }

    // ⑥ 年齢レンジ絞り込み
    if (ageRangeFilter) {
      list = list.filter((c) => isInAgeRange(c.age, ageRangeFilter));
    }

    // ⑦ 既存ソート（年齢・時給）
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

    // ⑧ 追加ソート（50音 / 番号：複数選択可）
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

    // ⑨ 飲酒ソート（チェックボックスで制御）
    if (drinkSort === "okFirst") {
      // 強い → 普通 → 弱い → NG → 未登録
      list.sort(
        (a: Cast, b: Cast) =>
          drinkScore(b.drinkLevel) - drinkScore(a.drinkLevel),
      );
    } else if (drinkSort === "ngFirst") {
      // NG → 弱い → 普通 → 強い → 未登録
      list.sort(
        (a: Cast, b: Cast) =>
          drinkScore(a.drinkLevel) - drinkScore(b.drinkLevel),
      );
    }

    // ⑩ ページネーション
    const total = list.length;
    const perPage = itemsPerPage || 50;
    const tp = Math.max(1, Math.ceil(total / perPage));
    const page = Math.min(currentPage, tp);
    const start = (page - 1) * perPage;
    const end = start + perPage;
    const paged = list.slice(start, end);

    return {
      items: paged,
      total,
      totalPages: tp,
      page,
    };
  }, [
    allCasts,
    todayCasts,
    staged,
    selectedShop,
    keyword,
    sortKey,
    drinkSort,
    itemsPerPage,
    statusTab,
    currentPage,
    castGenreFilter,
    ageRangeFilter,
    sortKana,
    sortNumberSmallFirst,
    sortNumberLargeFirst,
  ]);

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
    } else {
      list.sort((a, b) => shopKanaKey(a).localeCompare(shopKanaKey(b), "ja"));
    }
    return list;
  }, [filteredShops, shopSortKey]);

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

  const handleSelectShop = (shop: Shop) => {
    setSelectedShopId(shop.id);
    setShopModalOpen(false);

    // 割当候補は、選択した店舗条件に合わないものを除外
    setStaged((prev: Cast[]) =>
      prev.filter((c: Cast) => matchesShopConditions(c, shop)),
    );
  };

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
        const url = resolvePhotoUrl(detail);
        if (url) {
          setPhotoByCastId((prev) =>
            prev[castId] ? prev : { ...prev, [castId]: url },
          );
        }
        const drinkLevel = getDrinkLevelFromDetail(detail);
        const hasExclusive = getCastExclusiveFlag(detail);
        const hasNominated = getCastNominatedFlag(detail);
        setAllCasts((prev) =>
          prev.map((c) =>
            c.id === castId
              ? { ...c, drinkLevel, hasExclusive, hasNominated }
              : c,
          ),
        );
        setTodayCasts((prev) =>
          prev.map((c) =>
            c.id === castId
              ? { ...c, drinkLevel, hasExclusive, hasNominated }
              : c,
          ),
        );
        setSelectedCast((prev) =>
          prev && prev.id === castId
            ? { ...prev, drinkLevel, hasExclusive, hasNominated }
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

  const openCastDetail = (cast: Cast) => {
    setSelectedCast(cast);
    setCastDetailModalOpen(true);
    void ensureCastDetail(cast.id);
  };

  const closeCastDetail = () => {
    setCastDetailModalOpen(false);
    setSelectedCast(null);
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
        (current === "confirmed" || current === "rejected")
      ) {
        return;
      }
      if (status === null && current && current !== "editing") {
        return;
      }
    }

    const date = todayKey();
    const requestId = await resolveShopRequestId(shopId, date);
    if (!requestId) return;

    updateLocalContactStatus(shopId, status, requestId);
    try {
      await updateShopRequest(requestId, { contactStatus: status ?? null });
    } catch (err) {
      console.warn("[casts/today] update contactStatus failed", {
        shopId,
        status,
        err,
      });
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
    if (selectedShopId) {
      await setContactStatus(selectedShopId, "rejected", { force: true });
    }
    resetOrderState();
  };

  useEffect(() => {
    let cancelled = false;
    const targets = filteredCasts.filter(
      (c) => !c.photoUrl && !photoByCastId[c.id],
    );
    if (targets.length === 0) return;
    const run = async () => {
      await Promise.all(
        targets.map(async (c) => {
          try {
            const detail = await getCast(c.id);
            const url = resolvePhotoUrl(detail);
            if (url && !cancelled) {
              setPhotoByCastId((prev) =>
                prev[c.id] ? prev : { ...prev, [c.id]: url },
              );
            }
            if (!cancelled) {
              setCastDetailById((prev) =>
                prev[c.id] ? prev : { ...prev, [c.id]: detail },
              );
              const drinkLevel = getDrinkLevelFromDetail(detail);
              const hasExclusive = getCastExclusiveFlag(detail);
              const hasNominated = getCastNominatedFlag(detail);
              setAllCasts((prev) =>
                prev.map((item) =>
                  item.id === c.id
                    ? { ...item, drinkLevel, hasExclusive, hasNominated }
                    : item,
                ),
              );
              setTodayCasts((prev) =>
                prev.map((item) =>
                  item.id === c.id
                    ? { ...item, drinkLevel, hasExclusive, hasNominated }
                    : item,
                ),
              );
            }
          } catch {
            // ignore photo fetch errors
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
      const url = photoByCastId[cast.id] ?? cast.photoUrl;
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
    const targets = filteredCasts.slice(0, 48);
    if (targets.length === 0) return;
    targets.forEach((cast) => {
      if (castDetailById[cast.id]) return;
      void ensureCastDetail(cast.id);
    });
  }, [filteredCasts, castDetailById, ensureCastDetail]);

  useEffect(() => {
    if (allCasts.length === 0) return;
    let cancelled = false;
    const batchSize = 8;
    const tick = async () => {
      if (cancelled) return;
      let processed = 0;
      while (
        backgroundFetchIndexRef.current < allCasts.length &&
        processed < batchSize
      ) {
        const cast = allCasts[backgroundFetchIndexRef.current];
        backgroundFetchIndexRef.current += 1;
        if (!cast || castDetailById[cast.id]) continue;
        await ensureCastDetail(cast.id);
        processed += 1;
      }
      if (backgroundFetchIndexRef.current < allCasts.length) {
        setTimeout(tick, 300);
      }
    };
    void tick();
    return () => {
      cancelled = true;
    };
  }, [allCasts, castDetailById, ensureCastDetail]);

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
      <div className="h-full flex flex-col gap-3">
        {/* 上部：統計バー & コントロール（タイトル文言は非表示） */}
        <section className="tiara-panel rounded-none p-3 flex flex-col gap-2" style={{ borderRadius: 0 }}>
          <header className="flex items-center justify-between">
            <div />
            <span className="text-[10px] px-2 py-0.5 bg-gray-100 border border-gray-300 text-gray-600">
              build: {buildStamp}
            </span>
          </header>

          <div className="flex flex-wrap items-start gap-3 text-xs">
            <div className="border border-slate-200 bg-white px-3 py-2">
              <div className="font-semibold">オーダー数</div>
              <div className="mt-1 text-[11px]">0 件</div>
            </div>
            <div className="border border-slate-200 bg-white px-3 py-2">
              <div className="font-semibold">オーダー人数</div>
              <div className="mt-1 text-[11px]">0 人</div>
            </div>
            <div className="border border-slate-200 bg-white px-3 py-2 min-w-[320px]">
              <div className="font-semibold">時給別（本日出勤予定）</div>
              <div className="mt-1 grid grid-cols-4 gap-2 text-[11px] text-muted">
                <span>・2500円　・名</span>
                <span>・3000円　・名</span>
                <span>・3500円　・名</span>
                <span>・4500円　・名</span>
                <span>・5000円　・名</span>
                <span>・5500円　・名</span>
                <span>・6000円　・名</span>
                <span>・6500円　・名</span>
              </div>
            </div>
            <div className="border border-slate-200 bg-white px-3 py-2 min-w-[320px]">
              <div className="font-semibold">時給別（システム登録）</div>
              <div className="mt-1 grid grid-cols-4 gap-2 text-[11px] text-muted">
                <span>・2500円　・名</span>
                <span>・3000円　・名</span>
                <span>・3500円　・名</span>
                <span>・4500円　・名</span>
                <span>・5000円　・名</span>
                <span>・5500円　・名</span>
                <span>・6000円　・名</span>
                <span>・6500円　・名</span>
              </div>
            </div>
            {floatMinimized && (
              <button
                type="button"
                className="border border-slate-300 bg-white px-3 py-2 text-[11px] h-[34px] flex items-center"
                onClick={() => setFloatMinimized(false)}
              >
                オーダー画面
              </button>
            )}
          </div>
        </section>

        <section
          className="tiara-panel rounded-none p-3 pt-6 flex flex-col gap-3 relative"
          style={{ borderRadius: 0 }}
        >
          <div className="absolute -top-4 left-3 inline-flex bg-white border border-slate-200 overflow-hidden text-xs shadow-sm">
            <button
              type="button"
              className={`px-4 py-1.5 ${
                panelTab === "shops"
                  ? "bg-sky-600 text-white"
                  : "bg-transparent text-gray-700"
              }`}
              onClick={() => setPanelTab("shops")}
            >
              店舗一覧
            </button>
            <button
              type="button"
              className={`px-4 py-1.5 border-l border-slate-200 ${
                panelTab === "casts"
                  ? "bg-sky-600 text-white"
                  : "bg-transparent text-gray-700"
              }`}
              onClick={() => setPanelTab("casts")}
            >
              キャスト一覧
            </button>
          </div>

          {panelTab === "shops" ? (
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs">
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
                  }}
                >
                  クリア
                </button>
                <div className="ml-auto text-[11px] text-muted">
                  表示中: {sortedTodayShops.length} 店舗
                </div>
              </div>

              <div className="border border-slate-200 bg-white text-xs overflow-auto">
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
                        return (
                          <tr
                            key={shop.id}
                            className={`${
                              isSelected ? "bg-sky-100" : ""
                            } hover:bg-slate-50 cursor-pointer`}
                            onClick={() =>
                              setSelectedShopId((prev) => {
                                const next = prev === shop.id ? "" : shop.id;
                                if (next) {
                                  if (typeof window !== "undefined") {
                                    const width = 360;
                                    const height = 420;
                                    const x = Math.max(
                                      16,
                                      Math.round((window.innerWidth - width) / 2),
                                    );
                                    const y = Math.max(
                                      16,
                                      Math.round(
                                        (window.innerHeight - height) / 2,
                                      ),
                                    );
                                    setFloatPos({ x, y });
                                  }
                                  setFloatMinimized(false);
                                  setFloatZ((z) => z + 1);
                                }
                                return next;
                              })
                            }
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
              <div className="flex flex-col gap-2 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    className="tiara-input rounded-none h-8 !w-[200px] text-[10px] leading-tight flex-none"
                    placeholder="管理番号・名前・旧ID"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                  />
                  <select
                    className="tiara-input rounded-none h-9 !w-[140px] text-[11px] leading-snug flex-none"
                    value={担当者}
                    onChange={(e) => set担当者(e.target.value)}
                  >
                    <option value="all">担当者</option>
                    <option value="nagai">永井</option>
                    <option value="kitamura">北村</option>
                  </select>
                  <select
                    className="tiara-input rounded-none h-9 !w-[130px] text-[11px] leading-snug flex-none"
                    value={itemsPerPage}
                    onChange={(e) =>
                      setItemsPerPage(Number(e.target.value) as 50 | 56 | 100)
                    }
                  >
                    <option value={50}>50件</option>
                    <option value={56}>56件</option>
                    <option value={100}>100件</option>
                  </select>
                  <select
                    className="tiara-input rounded-none h-9 !w-[180px] text-[11px] leading-snug flex-none"
                    value={sortKey}
                    onChange={(e) => setSortKey(e.target.value as SortKey)}
                  >
                    <option value="default">並び替え</option>
                    <option value="hourlyDesc">時給が高い順</option>
                    <option value="ageAsc">年齢が若い順</option>
                    <option value="ageDesc">年齢が高い順</option>
                  </select>
                  <select
                    className="tiara-input rounded-none h-9 !w-[170px] text-[11px] leading-snug flex-none"
                    value={drinkSort}
                    onChange={(e) => setDrinkSort(e.target.value as DrinkSort)}
                  >
                    <option value="none">飲酒</option>
                    <option value="okFirst">飲める順</option>
                    <option value="ngFirst">飲めない順</option>
                  </select>
                  <select
                    className="tiara-input rounded-none h-9 !w-[140px] text-[11px] leading-snug flex-none"
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
                    className="tiara-input rounded-none h-9 !w-[140px] text-[11px] leading-snug flex-none"
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
                  <label className="inline-flex items-center gap-1 text-[10px]">
                    <input
                      type="checkbox"
                      className="h-3 w-3"
                      checked={sortKana}
                      onChange={(e) => setSortKana(e.target.checked)}
                    />
                    50音
                  </label>
                  <label className="inline-flex items-center gap-1 text-[10px]">
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
                  <label className="inline-flex items-center gap-1 text-[10px]">
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

                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {[
                      { id: "unassigned", label: "未配属" },
                      { id: "today", label: "本日出勤" },
                      { id: "matched", label: "マッチ済み" },
                      { id: "all", label: "全キャスト" },
                    ].map((tab) => {
                      const active = statusTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          className={
                            "px-3 py-1 border text-xs " +
                            (active
                              ? "bg-sky-600 text-white border-sky-600"
                              : "bg-white text-slate-700 border-slate-200")
                          }
                          onClick={() =>
                            setStatusTab(tab.id as typeof statusTab)
                          }
                        >
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>

                  <div className="inline-flex items-center bg-gray-100 text-gray-800 border border-gray-300 px-3 py-1 gap-2 ml-2">
                    <button
                      type="button"
                      className="text-xs px-2 py-0.5 border border-gray-300 disabled:opacity-40"
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
                      className="text-xs px-2 py-0.5 border border-gray-300 disabled:opacity-40"
                      onClick={() =>
                        setCurrentPage((p) => Math.min(totalPages, p + 1))
                      }
                      disabled={effectivePage >= totalPages}
                    >
                      →
                    </button>
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

              <div
                className="grid gap-3"
                style={{ gridTemplateColumns: "repeat(14, minmax(0, 1fr))" }}
              >
              {!loading &&
                filteredCasts.map((cast: Cast) => {
                  const photoUrl = photoByCastId[cast.id] ?? cast.photoUrl;
                  const badgeIcons = getCastBadgeIcons(cast);
                  return (
                    <div
                      key={cast.id}
                      className="bg-white shadow-sm border border-slate-200 overflow-hidden flex flex-col cursor-grab active:cursor-grabbing select-none"
                      draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", cast.id);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onClick={() => openCastDetail(cast)}
                      >
                      <div className="w-full aspect-[4/3] bg-gray-200 overflow-hidden relative">
                        {photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={photoUrl}
                            alt={cast.name}
                            className="w-full h-full object-cover"
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
                      </div>

                        <div className="px-3 pt-1.5 pb-2.5 flex flex-col gap-0.5">
                          <div className="font-semibold text-[13px] leading-tight truncate">
                            {cast.name}
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
                        </div>
                      </div>
                    );
                  })}
              </div>

            </>
        )}
        </section>
      </div>

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
                  return (
                    <>
                      <div className="w-full aspect-[3/4] overflow-hidden bg-gray-200 flex items-center justify-center">
                        {(photoByCastId[selectedCast.id] ??
                          selectedCast.photoUrl) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={
                              photoByCastId[selectedCast.id] ??
                              selectedCast.photoUrl
                            }
                            alt={selectedCast.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-xs text-gray-500">NO PHOTO</span>
                        )}
                      </div>
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
                  <div className="relative">
                    <textarea
                      className="w-full h-28 px-3 py-2 border border-gray-200 text-xs resize-none"
                      placeholder="チャットを入力"
                    />
                    <button
                      type="button"
                      className="absolute right-2 bottom-2 px-4 py-1.5 border border-slate-300 bg-white text-xs text-slate-700 hover:bg-slate-50"
                    >
                      送信
                    </button>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-6 text-sm text-gray-700 justify-start">
                  <div>
                    <span className="text-muted">最終出勤日</span>{" "}
                    <span className="font-semibold text-gray-800">未登録</span>
                  </div>
                  <div>
                    <span className="text-muted">出勤回数</span>{" "}
                    <span className="font-semibold text-gray-800">- 回</span>
                  </div>
                </div>
              </div>
            </div>

            <footer className="px-4 py-3 border-t border-gray-200 flex items-center justify-end gap-2 bg-white">
              <button
                type="button"
                className="border border-gray-300 bg-white text-ink px-4 py-1.5 text-xs"
                onClick={closeCastDetail}
              >
                閉じる
              </button>
              <button
                type="button"
                className="tiara-btn text-xs"
                onClick={async () => {
                  if (!selectedCast) return;
                  if (orderItems.length === 0) {
                    const headcount = Number(dispatchCount);
                    const safeHeadcount = Number.isFinite(headcount)
                      ? headcount
                      : undefined;
                    const newOrder = createLocalOrderItem(
                      safeHeadcount,
                      entryTime,
                    );
                    if (!newOrder) return;
                    assignCastToOrder(newOrder.id, selectedCast);
                  } else if (orderItems.length === 1) {
                    assignCastToOrder(orderItems[0].id, selectedCast);
                  } else {
                    setPendingCast(selectedCast);
                    setOrderSelectOpen(true);
                  }
                  setFloatMinimized(false);
                  setFloatZ((z) => z + 1);
                  closeCastDetail();
                }}
              >
                割当候補に追加
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

            if (selectedShop && !matchesShopConditions(cast, selectedShop)) {
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
                    (orderAssignments[order.id] ?? []).map((c: Cast) => (
                      <div
                        key={`${order.id}-${c.id}`}
                        className="border border-gray-200 bg-white px-2 py-1.5 text-xs flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-9 h-9 overflow-hidden bg-gray-200 flex items-center justify-center">
                            {c.photoUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={c.photoUrl}
                                alt={c.name}
                                className="w-full h-full object-cover"
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
                        </div>
                      </div>
                    )),
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

      <style jsx>{`
        :global(.tiara-input) {
          border-radius: 0 !important;
        }
      `}</style>
    </AppShell>
  );
}
