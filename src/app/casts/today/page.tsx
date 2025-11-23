// src/app/casts/today/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import {
  listTodayCasts,
  listCasts as fetchCastList,
} from "@/lib/api.casts";

type Cast = {
  id: string;
  code: string;
  name: string;
  age: number;
  desiredHourly: number;
  drinkOk: boolean;
  photoUrl?: string;
  /** このキャストがNGの店舗ID一覧（将来APIから付与） */
  ngShopIds?: string[];
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
  /** true の場合は飲酒OKキャストのみマッチ */
  requireDrinkOk?: boolean;
};

// ★ 店舗はひとまずダミーのまま（あとで /shops API につなぐ）
const TODAY_SHOPS: Shop[] = [
  {
    id: "s1",
    code: "001",
    name: "クラブ ティアラ本店",
    minHourly: 4500,
    minAge: 20,
    maxAge: 35,
    requireDrinkOk: true,
  },
  {
    id: "s2",
    code: "002",
    name: "スナック フラワー",
    minHourly: 3500,
    minAge: 18,
    maxAge: 40,
    requireDrinkOk: false,
  },
  {
    id: "s3",
    code: "003",
    name: "ラウンジ プリマ",
    minHourly: 4000,
    minAge: 21,
    maxAge: 32,
    requireDrinkOk: true,
  },
];

type SortKey = "default" | "hourlyDesc" | "ageAsc" | "ageDesc";
type DrinkSort = "none" | "okFirst" | "ngFirst";

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

  if (shop.requireDrinkOk && !cast.drinkOk) return false;

  return true;
};

export default function Page() {
  // 本日出勤キャスト一覧（/casts/today）
  const [todayCasts, setTodayCasts] = useState<Cast[]>([]);
  // 全キャスト（シフトに関係なく /casts から取得）
  const [allCasts, setAllCasts] = useState<Cast[]>([]);

  const [staged, setStaged] = useState<Cast[]>([]);
  const [selectedShopId, setSelectedShopId] = useState<string>("");
  const [keyword, setKeyword] = useState("");
  const [担当者, set担当者] = useState<string>("all");
  const [itemsPerPage, setItemsPerPage] = useState<50 | 100>(50);
  const [statusTab, setStatusTab] = useState<
    "today" | "all" | "matched" | "unassigned"
  >("today");
  const [sortKey, setSortKey] = useState<SortKey>("default");
  const [drinkSort, setDrinkSort] = useState<DrinkSort>("none");
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

  const buildStamp = useMemo(() => new Date().toLocaleString(), []);
  const selectedShop = useMemo(
    () => TODAY_SHOPS.find((s: Shop) => s.id === selectedShopId) ?? null,
    [selectedShopId],
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
          drinkOk: item.drinkOk ?? false,
          photoUrl: "/images/sample-cast.jpg",
          ngShopIds: [],
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
            drinkOk: item.drinkOk ?? false,
            photoUrl: "/images/sample-cast.jpg",
            ngShopIds: [],
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

    run();

    return () => {
      cancelled = true;
    };
  }, []);

  // 絞り込み条件が変わったら 1 ページ目に戻す
  useEffect(() => {
    setCurrentPage(1);
  }, [statusTab, keyword, selectedShopId, itemsPerPage, sortKey, drinkSort]);

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
    // - 未配属：本日出勤かつ未マッチ（staged に含まれていない）
    // - マッチ済み：本日出勤かつマッチ済み（staged に含まれている）
    if (statusTab === "unassigned") {
      base = base.filter((c) => !matchedIds.has(c.id));
    } else if (statusTab === "matched") {
      base = base.filter((c) => matchedIds.has(c.id));
    }

    let list: Cast[] = [...base];

    // ③ 店舗条件フィルタ
    // - 「全キャスト」タブのときはシフトに関係なく全表示したいので、店舗条件は適用しない
    if (selectedShop && statusTab !== "all") {
      list = list.filter((c: Cast) => matchesShopConditions(c, selectedShop));
    }

    // ④ キーワード（名前 or 管理番号）
    if (keyword.trim()) {
      const q = keyword.trim();
      list = list.filter(
        (c: Cast) => c.name.includes(q) || c.code.includes(q),
      );
    }

    // TODO: 担当者・ステータス条件が入ったらここでさらに絞り込み

    // ⑤ ソート（年齢・時給）
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

    // ⑥ 飲酒ソート（チェックボックスで制御）
    if (drinkSort === "okFirst") {
      list.sort((a: Cast, b: Cast) => {
        const av = a.drinkOk ? 1 : 0;
        const bv = b.drinkOk ? 1 : 0;
        return bv - av; // true(OK) が先
      });
    } else if (drinkSort === "ngFirst") {
      list.sort((a: Cast, b: Cast) => {
        const av = a.drinkOk ? 1 : 0;
        const bv = b.drinkOk ? 1 : 0;
        return av - bv; // false(NG) が先
      });
    }

    // ⑦ ページネーション
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
  ]);

  const formatDrinkLabel = (cast: Cast) =>
    cast.drinkOk ? "飲酒: 普通（可）" : "飲酒: NG";

  const filteredShops = useMemo(() => {
    const q = shopSearch.trim().toLowerCase();
    if (!q) return TODAY_SHOPS;
    return TODAY_SHOPS.filter(
      (s: Shop) =>
        s.code.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q),
    );
  }, [shopSearch]);

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

  return (
    <AppShell>
      <div className="h-full flex flex-col gap-3">
        {/* 上部：統計バー & コントロール（タイトル文言は非表示） */}
        <section className="tiara-panel p-3 flex flex-col gap-2">
          <header className="flex items-center justify-between">
            <div />
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/15 border border-white/10">
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

            {/* ページ情報 & ページ送り */}
            <div className="inline-flex items-center rounded-full bg-slate-900 text-ink px-3 py-1 ml-auto gap-2">
              <button
                type="button"
                className="text-xs px-2 py-0.5 rounded-full border border-white/20 disabled:opacity-40"
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
                className="text-xs px-2 py-0.5 rounded-full border border-white/20 disabled:opacity-40"
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                disabled={effectivePage >= totalPages}
              >
                →
              </button>
            </div>
          </div>

          {/* 検索・担当者・件数・並び替え・飲酒ソート */}
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            <div className="flex items-center gap-1">
              <span className="text-muted whitespace-nowrap">
                キーワード（名前）
              </span>
              <input
                className="tiara-input h-8 w-[220px] text-xs"
                placeholder="名前・IDで検索"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
            </div>

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

            <div className="flex items-center gap-1">
              <span className="text-muted whitespace-nowrap">表示件数</span>
              <div className="inline-flex rounded-full bg-white/70 border border-slate-200 overflow-hidden">
                <button
                  type="button"
                  className={`px-3 py-1 ${
                    itemsPerPage === 50
                      ? "bg-slate-900 text-ink"
                      : "bg-transparent text-slate-700"
                  } text-[11px]`}
                  onClick={() => setItemsPerPage(50)}
                >
                  50件
                </button>
                <button
                  type="button"
                  className={`px-3 py-1 ${
                    itemsPerPage === 100
                      ? "bg-slate-900 text-ink"
                      : "bg-transparent text-slate-700"
                  } text-[11px]`}
                  onClick={() => setItemsPerPage(100)}
                >
                  100件
                </button>
              </div>
            </div>

            {/* 並び替え（年齢・時給） */}
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

            {/* 飲酒ソート（チェックボックス） */}
            <div className="flex items-center gap-2">
              <span className="text-muted whitespace-nowrap">飲酒</span>
              <label className="inline-flex items-center gap-1">
                <input
                  type="checkbox"
                  className="h-3 w-3"
                  checked={drinkSort === "okFirst"}
                  onChange={(e) =>
                    setDrinkSort(e.target.checked ? "okFirst" : "none")
                  }
                />
                <span>OKを優先</span>
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
                <span>NGを優先</span>
              </label>
            </div>
          </div>

          {/* ステータスタブ */}
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
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

          {/* ローディング・エラー表示 */}
          {loading && (
            <p className="mt-1 text-xs text-muted">本日出勤キャストを読込中...</p>
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
                    <div className="w-full aspect-[4/3] bg-slate-200 overflow-hidden">
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
                alert("このキャストは、選択中の店舗条件／NGにより割当不可です。");
                return;
              }

              setStaged((prev: Cast[]) =>
                prev.some((x: Cast) => x.id === cast.id) ? prev : [...prev, cast],
              );
            }}
          >
            <header className="pb-2 border-b border-white/10 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm">店舗セット</h3>
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
                <div className="flex items-center justify-between">
                  <span>更新：</span>
                  <span>-</span>
                </div>
              </div>

              <div className="flex items-center gap-2 mt-1">
                <button
                  type="button"
                  className="tiara-btn text-xs w-full"
                  onClick={() => setShopModalOpen(true)}
                >
                  店舗をセット
                </button>
              </div>
            </header>

            {/* D&D 受け皿 */}
            <div className="mt-3 flex-1 min-h-0">
              <div className="rounded-xl border-2 border-dashed border-white/20 bg-white/5 h-full flex flex-col">
                <div className="px-3 py-2 border-b border-white/10">
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
                        className="rounded-lg border border-white/10 bg-white/10 px-2 py-1.5 text-xs flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-9 h-9 rounded-md overflow-hidden bg-slate-800 flex items-center justify-center">
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
                className="rounded-xl border border-white/20 bg-white/5 text-ink px-4 py-2 text-sm"
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
          <div className="relative z-10 w-full max-w-3xl max-h-[80vh] rounded-2xl bg-slate-950 border border-white/10 shadow-xl flex flex-col">
            <header className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">店舗を選択</h2>
              <button
                type="button"
                className="text-xs text-muted hover:text-ink"
                onClick={() => setShopModalOpen(false)}
              >
                ✕
              </button>
            </header>

            <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2 text-xs">
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

            <div className="flex-1 overflow-auto p-4">
              {filteredShops.length === 0 ? (
                <p className="text-xs text-muted">
                  条件に一致する店舗がありません。
                </p>
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
                          "text-left rounded-xl border px-3 py-2 text-xs transition-colors " +
                          (active
                            ? "bg-sky-600/20 border-sky-400 text-ink"
                            : "bg-slate-900 border-white/10 text-ink hover:border-sky-400")
                        }
                      >
                        <div className="text-[11px] text-muted">
                          店舗番号
                          <span className="ml-1 font-mono text-ink">
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
          <div className="relative z-10 w-full max-w-xl max-h-[80vh] rounded-2xl bg-slate-950 border border-white/10 shadow-xl flex flex-col overflow-hidden">
            <header className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">キャスト詳細</h2>
              <button
                type="button"
                className="text-xs text-muted hover:text-ink"
                onClick={closeCastDetail}
              >
                ✕
              </button>
            </header>

            <div className="flex-1 overflow-auto p-4 flex gap-4">
              <div className="w-40 shrink-0">
                <div className="w-full aspect-[3/4] rounded-xl overflow-hidden bg-slate-800 flex items-center justify-center">
                  {selectedCast.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={selectedCast.photoUrl}
                      alt={selectedCast.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-xs text-ink/70">NO PHOTO</span>
                  )}
                </div>
              </div>

              <div className="flex-1 flex flex-col gap-3 text-xs text-ink">
                <div>
                  <div className="text-[11px] text-muted">
                    管理番号 / ID
                  </div>
                  <div className="mt-0.5 text-sm font-semibold">
                    {selectedCast.code} / {selectedCast.id}
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
                </div>

                <div className="mt-2 p-3 rounded-xl bg-white/5 border border-white/10">
                  <div className="text-[11px] text-muted">
                    備考（将来拡張用）
                  </div>
                  <p className="mt-1 text-[11px] text-ink/80">
                    ここに査定情報・NG詳細・希望シフト・メモなどを表示する想定です。
                  </p>
                </div>
              </div>
            </div>

            <footer className="px-4 py-3 border-t border-white/10 flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-xl border border-white/20 bg-white/5 text-ink px-4 py-1.5 text-xs"
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
    </AppShell>
  );
}
