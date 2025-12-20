// src/app/casts/today/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import {
  listTodayCasts,
  listCasts as fetchCastList,
} from "@/lib/api.casts";
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
  /** このキャストがNGの店舗ID一覧（将来APIから付与 or 更新） */
  ngShopIds?: string[];
  /** 旧ID（既存仕様：管理番号・名前・旧IDで検索できる想定） */
  oldId?: string;
  /** キャストのジャンル（クラブ / キャバ / スナック / ガルバ など複数） */
  genres?: CastGenre[];
};

type Shop = {
  id: string;
  code: string;
  name: string;
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

  const [staged, setStaged] = useState<Cast[]>([]);
  const [selectedShopId, setSelectedShopId] = useState<string>("");
  const [keyword, setKeyword] = useState("");
  const [担当者, set担当者] = useState<string>("all");
  const [itemsPerPage, setItemsPerPage] = useState<50 | 100>(50);
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

  const buildStamp = useMemo(() => new Date().toLocaleString(), []);

  // ★ スケジュールで登録された「本日分の店舗」をロード（無ければ空配列）
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const today = todayKey();
        const reqs: ScheduleShopRequest[] =
          await loadScheduleShopRequests(today);

        if (cancelled) return;

        const shops: Shop[] = reqs.map((req) => ({
          id: req.id, // スケジュール側の id を採用
          code: req.code,
          name: req.name,
          minHourly: req.minHourly,
          maxHourly: req.maxHourly,
          minAge: req.minAge,
          maxAge: req.maxAge,
          requireDrinkOk: req.requireDrinkOk,
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

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedShop = useMemo(
    () => todayShops.find((s: Shop) => s.id === selectedShopId) ?? null,
    [todayShops, selectedShopId],
  );

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
          photoUrl: "/images/sample-cast.jpg",
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
            photoUrl: "/images/sample-cast.jpg",
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

  const filteredShops = useMemo(() => {
    const q = shopSearch.trim().toLowerCase();
    if (!q) return todayShops;
    return todayShops.filter(
      (s: Shop) =>
        s.code.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q),
    );
  }, [shopSearch, todayShops]);

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

  const openCastDetail = (cast: Cast) => {
    setSelectedCast(cast);
    setCastDetailModalOpen(true);
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

  return (
    <AppShell>
      <div className="h-full flex flex-col gap-3">
        {/* 上部：統計バー & コントロール（タイトル文言は非表示） */}
        <section className="tiara-panel p-3 flex flex-col gap-2">
          <header className="flex items-center justify-between">
            <div />
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 border border-gray-300 text-gray-600">
              build: {buildStamp}
            </span>
          </header>

          {/* 統計ピル */}
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="inline-flex items-center rounded-full bg-white text-slate-700 px-3 py-1 shadow-sm border border-slate-200">
              本日の出勤：
              <span className="font-semibold ml-1">{todayCasts.length}</span> 名
            </span>
            {/* ここは将来 API 連携で置き換え */}
            <span className="inline-flex items-center rounded-full bg-white text-slate-700 px-3 py-1 shadow-sm border border-slate-200">
              配属済数：
              <span className="font-semibold ml-1">{154}</span> 名
            </span>
            <span className="inline-flex items-center rounded-full bg-white text-slate-700 px-3 py-1 shadow-sm border border-slate-200">
              明日の出勤予定：
              <span className="font-semibold ml-1">{667}</span> 名
            </span>
          </div>

          {/* 検索・担当者・件数・並び替え・飲酒・ジャンル・年齢レンジ */}
          <div className="mt-1 flex flex-wrap items-start gap-3 text-xs">
            {/* キーワード */}
            <div className="flex items-center gap-1">
              <span className="text-muted whitespace-nowrap">
                キーワード（管理番号・名前・旧ID）
              </span>
              <input
                className="tiara-input h-8 w-[260px] text-xs"
                placeholder="管理番号・名前・旧IDで検索"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
            </div>

            {/* 担当者（ダミー） */}
            <div className="flex items-center gap-1">
              <span className="text-muted whitespace-nowrap">担当者</span>
              <select
                className="tiara-input h-8 w-[140px] text-xs"
                value={担当者}
                onChange={(e) => set担当者(e.target.value)}
              >
                <option value="all">（すべて）</option>
                <option value="nagai">永井</option>
                <option value="kitamura">北村</option>
              </select>
            </div>

            {/* 表示件数 */}
            <div className="flex items-center gap-1">
              <span className="text-muted whitespace-nowrap">表示件数</span>
              <div className="inline-flex rounded-full bg-white/70 border border-slate-200 overflow-hidden">
                <button
                  type="button"
                  className={`px-3 py-1 text-[11px] ${
                    itemsPerPage === 50
                      ? "bg-sky-600 text-white"
                      : "bg-transparent text-gray-700"
                  }`}
                  onClick={() => setItemsPerPage(50)}
                >
                  50件
                </button>
                <button
                  type="button"
                  className={`px-3 py-1 text-[11px] ${
                    itemsPerPage === 100
                      ? "bg-sky-600 text-white"
                      : "bg-transparent text-gray-700"
                  }`}
                  onClick={() => setItemsPerPage(100)}
                >
                  100件
                </button>
              </div>
            </div>

            {/* 既存の並び替え（年齢・時給） */}
            <div className="flex items-center gap-1">
              <span className="text-muted whitespace-nowrap">並び替え</span>
              <select
                className="tiara-input h-8 w-[180px] text-xs"
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
              >
                <option value="default">デフォルト</option>
                <option value="hourlyDesc">時給が高い順</option>
                <option value="ageAsc">年齢が若い順</option>
                <option value="ageDesc">年齢が高い順</option>
              </select>
            </div>

            {/* 追加: 並び順（複数選択可） */}
            <div className="flex flex-col gap-1">
              <span className="text-muted whitespace-nowrap">
                並び順（複数選択可）
              </span>
              <div className="flex flex-wrap gap-2">
                <label className="inline-flex items-center gap-1">
                  <input
                    type="checkbox"
                    className="h-3 w-3"
                    checked={sortKana}
                    onChange={(e) => setSortKana(e.target.checked)}
                  />
                  <span>50音順</span>
                </label>
                <label className="inline-flex items-center gap-1">
                  <input
                    type="checkbox"
                    className="h-3 w-3"
                    checked={sortNumberSmallFirst}
                    onChange={(e) =>
                      setSortNumberSmallFirst(e.target.checked)
                    }
                  />
                  <span>番号（小さい順）</span>
                </label>
                <label className="inline-flex items-center gap-1">
                  <input
                    type="checkbox"
                    className="h-3 w-3"
                    checked={sortNumberLargeFirst}
                    onChange={(e) =>
                      setSortNumberLargeFirst(e.target.checked)
                    }
                  />
                  <span>番号（大きい順）</span>
                </label>
              </div>
            </div>

            {/* 飲酒ソート（チェックボックス） */}
            <div className="flex flex-col gap-1">
              <span className="text-muted whitespace-nowrap">飲酒</span>
              <div className="flex flex-wrap gap-2">
                <label className="inline-flex items-center gap-1">
                  <input
                    type="checkbox"
                    className="h-3 w-3"
                    checked={drinkSort === "okFirst"}
                    onChange={(e) =>
                      setDrinkSort(e.target.checked ? "okFirst" : "none")
                    }
                  />
                  <span>飲める順（強い→普通→弱い→NG）</span>
                </label>
                <label className="inline-flex items-center gap-1">
                  <input
                    type="checkbox"
                    className="h-3 w-3"
                    checked={drinkSort === "ngFirst"}
                    onChange={(e) =>
                      setDrinkSort(e.target.checked ? "ngFirst" : "none")
                    }
                  />
                  <span>飲めない順（NG→弱い→普通→強い）</span>
                </label>
              </div>
            </div>

            {/* キャストジャンルフィルタ */}
            <div className="flex items-center gap-1">
              <span className="text-muted whitespace-nowrap">ジャンル</span>
              <select
                className="tiara-input h-8 w-[140px] text-xs"
                value={castGenreFilter}
                onChange={(e) =>
                  setCastGenreFilter(
                    (e.target.value || "") as CastGenre | "",
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

            {/* 年齢レンジフィルタ */}
            <div className="flex items-center gap-1">
              <span className="text-muted whitespace-nowrap">年齢レンジ</span>
              <select
                className="tiara-input h-8 w-[150px] text-xs"
                value={ageRangeFilter}
                onChange={(e) =>
                  setAgeRangeFilter(e.target.value as AgeRangeFilter)
                }
              >
                <option value="">すべて</option>
                <option value="18-19">18〜19歳</option>
                <option value="20-24">20〜24歳</option>
                <option value="25-29">25〜29歳</option>
                <option value="30-34">30〜34歳</option>
                <option value="35-39">35〜39歳</option>
                <option value="40-49">40〜49歳</option>
                <option value="50-">50歳以上</option>
              </select>
            </div>
          </div>

          {/* ステータスタブ + ページ送り */}
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
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
                      "px-3 py-1 rounded-full border text-xs " +
                      (active
                        ? "bg-sky-600 text-white border-sky-600"
                        : "bg-white text-slate-700 border-slate-200")
                    }
                    onClick={() => setStatusTab(tab.id as typeof statusTab)}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* ページ情報 & ページ送り */}
            <div className="inline-flex items-center rounded-full bg-gray-100 text-gray-800 border border-gray-300 px-3 py-1 gap-2 ml-2">
              <button
                type="button"
                className="text-xs px-2 py-0.5 rounded-full border border-gray-300 disabled:opacity-40"
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
                className="text-xs px-2 py-0.5 rounded-full border border-gray-300 disabled:opacity-40"
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                disabled={effectivePage >= totalPages}
              >
                →
              </button>
            </div>
          </div>

          {/* ローディング・エラー表示 */}
          {loading && (
            <p className="mt-1 text-xs text-muted">
              本日出勤キャストを読込中...
            </p>
          )}
          {error && !loading && (
            <p className="mt-1 text-xs text-red-500">
              データ取得エラー: {error}
            </p>
          )}
        </section>

        {/* メイン：左カード一覧 + 右割当パネル */}
        <div className="flex-1 flex gap-3">
          {/* キャストカード一覧 */}
          <section className="tiara-panel grow p-3 flex flex-col">
            <div
              className="mt-1 grid gap-3"
              style={{
                gridTemplateColumns: "repeat(8, minmax(0, 1fr))",
              }}
            >
              {!loading &&
                filteredCasts.map((cast: Cast) => (
                  <div
                    key={cast.id}
                    className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col cursor-grab active:cursor-grabbing select-none"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", cast.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onClick={() => openCastDetail(cast)}
                  >
                    <div className="w-full aspect-[4/3] bg-gray-200 overflow-hidden">
                      {cast.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={cast.photoUrl}
                          alt={cast.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs text-slate-500">
                          PHOTO
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
                ))}
            </div>
          </section>

          {/* 右：店舗セット & D&D 割当 */}
          <aside
            className="tiara-panel w-[320px] shrink-0 p-3 flex flex-col"
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

              setStaged((prev: Cast[]) =>
                prev.some((x: Cast) => x.id === cast.id) ? prev : [...prev, cast],
              );
            }}
          >
            <header className="pb-2 border-b border-gray-200 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm">店舗セット</h3>
              </div>

              {/* 本日のスケジュール有無メッセージ */}
              {todayShops.length === 0 ? (
                <p className="text-[11px] text-red-500">
                  本日のスケジュール登録がありません。
                  スケジュール画面から店舗リクエストを登録してください。
                </p>
              ) : (
                <div className="space-y-1 text-[11px] text-muted">
                  <div className="flex items-center justify-between">
                    <span>店舗：</span>
                    <span className="font-medium text-ink">
                      {selectedShop
                        ? `${selectedShop.code} / ${selectedShop.name}`
                        : "未選択"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>更新：</span>
                    <span>-</span>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 mt-1">
                <button
                  type="button"
                  className="tiara-btn text-xs w-full"
                  onClick={() => setShopModalOpen(true)}
                  disabled={todayShops.length === 0}
                >
                  店舗をセット
                </button>
              </div>
            </header>

            {/* D&D 受け皿 */}
            <div className="mt-3 flex-1 min-h-0">
              <div className="rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 h-full flex flex-col">
                <div className="px-3 py-2 border-b border-gray-200">
                  <p className="text-xs text-muted">
                    ここにキャストカードをドラッグ＆ドロップ
                  </p>
                </div>
                <div className="flex-1 overflow-auto px-2 py-2 space-y-2">
                  {staged.length === 0 ? (
                    <div className="text-xs text-muted">
                      割当候補はまだ選択されていません。
                    </div>
                  ) : (
                    staged.map((c: Cast) => (
                      <div
                        key={c.id}
                        className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-9 h-9 rounded-md overflow-hidden bg-gray-200 flex items-center justify-center">
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
                            <span className="font-semibold truncate">{c.name}</span>
                            <span className="text-[10px] text-muted">
                              {c.code} / {c.age}歳 / ¥
                              {c.desiredHourly.toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* 下：ボタン */}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                className="rounded-xl border border-gray-300 bg-white text-ink px-4 py-2 text-sm"
                onClick={() => setStaged([])}
                disabled={staged.length === 0}
              >
                クリア
              </button>
              <button
                type="button"
                className="tiara-btn text-sm"
                onClick={() => {
                  if (!selectedShop) {
                    alert("店舗が未選択です。");
                    return;
                  }
                  if (staged.length === 0) {
                    alert("割当候補がありません。");
                    return;
                  }
                  alert(
                    `${selectedShop.name} への割当を確定（デモ）\n\n` +
                      staged
                        .map(
                          (c: Cast) =>
                            `${c.code} ${c.name}（¥${c.desiredHourly.toLocaleString()}）`,
                        )
                        .join("\n"),
                  );
                }}
                disabled={staged.length === 0}
              >
                確定
              </button>
            </div>
          </aside>
        </div>
      </div>

      {/* 店舗選択モーダル */}
      {shopModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShopModalOpen(false)}
          />
          <div className="relative z-10 w-full max-w-3xl max-h-[80vh] rounded-2xl bg-white border border-gray-200 shadow-2xl flex flex-col">
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
                className="tiara-input h-8 text-xs flex-1"
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
                          "text左 rounded-xl border px-3 py-2 text-xs transition-colors " +
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
          <div className="relative z-10 w-full max-w-xl max-h-[80vh] rounded-2xl bg-white border border-gray-200 shadow-2xl flex flex-col overflow-hidden">
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
                <div className="w-full aspect-[3/4] rounded-xl overflow-hidden bg-gray-200 flex items-center justify-center">
                  {selectedCast.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={selectedCast.photoUrl}
                      alt={selectedCast.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-xs text-gray-500">NO PHOTO</span>
                  )}
                </div>
              </div>

              <div className="flex-1 flex flex-col gap-3 text-xs text-gray-900">
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
                      ¥{selectedCast.desiredHourly.toLocaleString()}
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] text-muted">飲酒</div>
                    <div className="mt-0.5 text-xs">
                      {formatDrinkLabel(selectedCast)}
                    </div>
                  </div>

                  {/* キャストジャンル（複数登録可能） */}
                  <div className="col-span-2">
                    <div className="text-[11px] text-muted">ジャンル</div>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {selectedCast.genres && selectedCast.genres.length > 0 ? (
                        selectedCast.genres.map((g) => (
                          <span
                            key={g}
                            className="px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200 text-[11px]"
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

                {/* NG登録ボタン */}
                <div className="mt-1 flex justify-end">
                  <button
                    type="button"
                    className="px-3 py-1.5 rounded-full border border-red-300 bg-red-50 text-[11px] text-red-700 hover:bg-red-100"
                    onClick={() => setNgModalOpen(true)}
                  >
                    NG登録
                  </button>
                </div>

                <div className="mt-2 p-3 rounded-xl bg-gray-50 border border-gray-200">
                  <div className="text-[11px] text-muted">
                    備考（将来拡張用）
                  </div>
                  <p className="mt-1 text-[11px] text-gray-700">
                    ここに査定情報・NG詳細・希望シフト・メモなどを表示する想定です。
                  </p>
                </div>
              </div>
            </div>

            <footer className="px-4 py-3 border-t border-gray-200 flex items-center justify-end gap-2 bg-white">
              <button
                type="button"
                className="rounded-xl border border-gray-300 bg-white text-ink px-4 py-1.5 text-xs"
                onClick={closeCastDetail}
              >
                閉じる
              </button>
              <button
                type="button"
                className="tiara-btn text-xs"
                onClick={() => {
                  if (!selectedCast) return;
                  setStaged((prev: Cast[]) =>
                    prev.some((x: Cast) => x.id === selectedCast.id)
                      ? prev
                      : [...prev, selectedCast],
                  );
                  closeCastDetail();
                }}
              >
                割当候補に追加（デモ）
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
          <div className="relative z-10 w-full max-w-4xl max-h-[80vh] rounded-2xl bg-white border border-gray-200 shadow-2xl flex flex-col overflow-hidden">
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
                <div className="inline-flex rounded-full bg-gray-100 border border-gray-300 overflow-hidden">
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
                    className="tiara-input h-8 w-[140px] text-xs"
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
                    className="tiara-input h-8 w-[200px] text-xs"
                    placeholder="店舗名で検索"
                    value={ngFilterName}
                    onChange={(e) => setNgFilterName(e.target.value)}
                  />
                </div>

                <div className="flex items-center gap-1">
                  <span className="text-muted whitespace-nowrap">店舗番号</span>
                  <input
                    className="tiara-input h-8 w-[140px] text-xs"
                    placeholder="店舗番号で検索"
                    value={ngFilterCode}
                    onChange={(e) => setNgFilterCode(e.target.value)}
                  />
                </div>

                <div className="flex items-center gap-1">
                  <span className="text-muted whitespace-nowrap">並び替え</span>
                  <select
                    className="tiara-input h-8 w-[160px] text-xs"
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
                  className="px-3 py-1.5 rounded-xl border border-gray-300 bg-white text-gray-800"
                  onClick={closeNgModal}
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  className="px-4 py-1.5 rounded-xl bg-red-600 text-white"
                  onClick={handleNgSave}
                >
                  登録
                </button>
              </div>
            </footer>
          </div>
        </div>
      )}
    </AppShell>
  );
}
