// src/app/(dashboard)/shops/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  listShops,
  updateShop,
  getShop,
  type ShopListItem,
  type ShopGenre,
  type ShopRank,
  type ShopIdRequirement,
  type ShopDrinkPreference,
  type ShopFixedCastItem,
  type ShopNgCastItem,
  type ShopDetail,
  // ★ 専属指名 / NGキャスト用 API（表示専用）
  listShopFixedCasts,
  listShopNgCasts,
} from "@/lib/api.shops";

type PerPage = number | "all";
type YesNoFilter = "" | "yes" | "no";
type ContactMethodFilter = "" | "line" | "sms" | "tel";
type WageFilter = "" | number;

// フロント側で削除フラグ・新規フラグを持たせるための拡張型（今回は表示のみだが型はそのまま）
type FixedRow = ShopFixedCastItem & {
  _deleted?: boolean;
  _isNew?: boolean;
};

type NgRow = ShopNgCastItem & {
  _deleted?: boolean;
  _isNew?: boolean;
};

// ジャンル表示用ラベル（一覧は「キャバクラ」表記に統一）
const GENRE_LABELS: Record<string, string> = {
  club: "クラブ",
  cabaret: "キャバクラ",
  snack: "スナック",
  gb: "GB",
};

function getGenreLabel(genre?: ShopGenre | null): string {
  if (!genre) return "-";
  return GENRE_LABELS[genre] ?? genre;
}

function formatShopNumber(n?: string | null) {
  if (!n) return "-";
  const s = String(n);
  if (/^\d{1,4}$/.test(s)) return s.padStart(4, "0");
  return s;
}

function parseWageMinFromLabel(label?: string | null): number | null {
  if (!label) return null;
  const m = String(label).match(/(\d{4})/); // "2500円〜..." の最初の数値
  if (!m) return null;
  const v = Number(m[1]);
  return Number.isFinite(v) ? v : null;
}

function normalizeContactMethod(item: ShopListItem): ContactMethodFilter {
  const v =
    ((item as any).contactMethod ??
      (item as any).contact_method ??
      (item as any).preferredContactMethod ??
      (item as any).preferred_contact_method ??
      (item as any).contact ??
      "") as string;

  const s = String(v).toLowerCase().trim();
  if (!s) return "";

  if (s.includes("line")) return "line";
  if (s.includes("sms")) return "sms";
  if (s.includes("tel") || s.includes("phone")) return "tel";

  // 日本語が混ざるケース
  if (s.includes("ライン")) return "line";
  if (s.includes("ショート") || s.includes("sms")) return "sms";
  if (s.includes("電話") || s.includes("tel")) return "tel";

  return "";
}

function getContactLabel(method: ContactMethodFilter): string {
  if (method === "line") return "LINE";
  if (method === "sms") return "SMS";
  if (method === "tel") return "TEL";
  return "-";
}

function hasExclusive(item: ShopListItem): boolean {
  const candidates = [
    (item as any).fixedCastCount,
    (item as any).fixed_cast_count,
    (item as any).exclusiveCount,
    (item as any).exclusive_count,
    (item as any).hasFixedCasts,
    (item as any).has_fixed_casts,
    (item as any).hasExclusive,
    (item as any).has_exclusive,
  ];

  for (const c of candidates) {
    if (typeof c === "number") return c > 0;
    if (typeof c === "boolean") return c;
  }

  const arrCandidates = [
    (item as any).fixedCasts,
    (item as any).fixed_casts,
    (item as any).exclusiveCasts,
    (item as any).exclusive_casts,
  ];
  for (const a of arrCandidates) {
    if (Array.isArray(a)) return a.length > 0;
  }

  return false;
}

function hasNominated(item: ShopListItem): boolean {
  const candidates = [
    (item as any).nominatedCastCount,
    (item as any).nominated_cast_count,
    (item as any).nominationCount,
    (item as any).nomination_count,
    (item as any).hasNominatedCasts,
    (item as any).has_nominated_casts,
    (item as any).hasNomination,
    (item as any).has_nomination,
  ];

  for (const c of candidates) {
    if (typeof c === "number") return c > 0;
    if (typeof c === "boolean") return c;
  }

  const arrCandidates = [
    (item as any).nominatedCasts,
    (item as any).nominated_casts,
    (item as any).nominations,
    (item as any).nomination_ids,
  ];
  for (const a of arrCandidates) {
    if (Array.isArray(a)) return a.length > 0;
  }

  return false;
}

export default function ShopsPage() {
  const [items, setItems] = useState<ShopListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [shopNumber, setShopNumber] = useState("");
  const [limit, setLimit] = useState<PerPage>(20);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // ★ ジャンルフィルタ & 並び替えモード
  const [genreFilter, setGenreFilter] = useState<ShopGenre | "">("");
  const [sortMode, setSortMode] = useState<"kana" | "number" | "favorite">("kana");

  // ★ 追加：Excelレイアウトに合わせたフィルタ（一覧）
  const [exclusiveFilter, setExclusiveFilter] = useState<YesNoFilter>(""); // 専属（あり/なし）
  const [nominatedFilter, setNominatedFilter] = useState<YesNoFilter>(""); // 指名（あり/なし）
  const [wageFilter, setWageFilter] = useState<WageFilter>(""); // 2500..6500
  const [contactFilter, setContactFilter] = useState<ContactMethodFilter>(""); // LINE/SMS/TEL

  // === 店舗詳細モーダル用の状態 ===
  const [selectedShop, setSelectedShop] = useState<ShopListItem | null>(null);
  const [shopDetail, setShopDetail] = useState<ShopDetail | null>(null);
  const [shopDetailLoading, setShopDetailLoading] = useState(false);
  const [shopDetailError, setShopDetailError] = useState<string | null>(null);

  // キーワード・店舗番号・ジャンルでのフィルタ & 並び替え
  const filteredItems = useMemo(() => {
    let arr = [...items];

    // 店舗番号フィルタ
    const num = shopNumber.trim();
    if (num) {
      arr = arr.filter((item) => {
        if (!item.shopNumber) return false;
        return item.shopNumber.includes(num);
      });
    }

    // ジャンルフィルタ
    if (genreFilter) {
      arr = arr.filter((item) => item.genre === genreFilter);
    }

    // ★ 専属（あり/なし）
    if (exclusiveFilter) {
      arr = arr.filter((item) => {
        const v = hasExclusive(item);
        return exclusiveFilter === "yes" ? v : !v;
      });
    }

    // ★ 指名（あり/なし）
    if (nominatedFilter) {
      arr = arr.filter((item) => {
        const v = hasNominated(item);
        return nominatedFilter === "yes" ? v : !v;
      });
    }

    // ★ 時給（2500〜6500）
    if (wageFilter !== "") {
      const w = Number(wageFilter);
      arr = arr.filter((item) => {
        const label = (item as any).wageLabel ?? (item as any).wage_label ?? "";
        const min = parseWageMinFromLabel(label);
        return min === w;
      });
    }

    // ★ 連絡方法（LINE/SMS/TEL）
    if (contactFilter) {
      arr = arr.filter((item) => normalizeContactMethod(item) === contactFilter);
    }

    // 並び替え
    const sorted = [...arr];
    sorted.sort((a, b) => {
      if (sortMode === "kana") {
        const ak = (a.nameKana ?? (a as any).kana ?? a.name ?? "").toString();
        const bk = (b.nameKana ?? (b as any).kana ?? b.name ?? "").toString();
        return ak.localeCompare(bk, "ja");
      }
      if (sortMode === "number") {
        const an = (a.shopNumber ?? "").padStart(4, "0");
        const bn = (b.shopNumber ?? "").padStart(4, "0");
        return an.localeCompare(bn, "ja");
      }
      // "よく使う店舗順" → 現状は updatedAt の新しい順（疑似）
      const ad = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bd = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return bd - ad;
    });

    return sorted;
  }, [
    items,
    shopNumber,
    genreFilter,
    sortMode,
    exclusiveFilter,
    nominatedFilter,
    wageFilter,
    contactFilter,
  ]);

  const perPage = useMemo(() => {
    if (limit === "all") {
      return Math.max(filteredItems.length || 1, 1);
    }
    return limit;
  }, [limit, filteredItems.length]);

  const page = useMemo(() => Math.floor(offset / perPage) + 1, [offset, perPage]);

  const maxPage = useMemo(
    () => Math.max(1, Math.ceil(filteredItems.length / Math.max(1, perPage))),
    [filteredItems.length, perPage],
  );

  const pagedItems = useMemo(() => {
    if (filteredItems.length === 0) return [];
    if (limit === "all") return filteredItems;
    return filteredItems.slice(offset, offset + perPage);
  }, [filteredItems, offset, perPage, limit]);

  // offset が範囲外になった場合に自動補正
  useEffect(() => {
    const maxOffset = perPage === 0 ? 0 : Math.max(0, perPage * (maxPage - 1));
    if (offset > maxOffset) {
      setOffset(0);
    }
  }, [perPage, maxPage, offset]);

  // API からは「q (+ genre/orderBy)」で一覧を取得 → ページング＆一部並び替えはフロント側
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listShops({
        q: q.trim() || undefined,
        genre: genreFilter ? (genreFilter as ShopGenre) : undefined,
        orderBy: sortMode,
      });
      const nextItems = res.items ?? [];
      setItems(nextItems);
      setTotal(nextItems.length);
      setMessage(null);
    } catch (e: any) {
      setMessage(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [q, genreFilter, sortMode]);

  useEffect(() => {
    reload();
  }, [reload]);

  // 店舗カードクリック → 詳細取得 → モーダル表示
  const handleOpenShop = useCallback(async (row: ShopListItem) => {
    setSelectedShop(row);
    setShopDetail(null);
    setShopDetailError(null);
    setShopDetailLoading(true);
    try {
      const detail = await getShop(row.id);
      setShopDetail(detail);
    } catch (e: any) {
      setShopDetailError(e?.message ?? "店舗詳細の取得に失敗しました");
    } finally {
      setShopDetailLoading(false);
    }
  }, []);

  const handleCloseModal = useCallback(() => {
    setSelectedShop(null);
    setShopDetail(null);
    setShopDetailError(null);
    setShopDetailLoading(false);
  }, []);

  const wageSteps = useMemo(() => {
    const arr: number[] = [];
    for (let v = 2500; v <= 6500; v += 500) arr.push(v);
    return arr;
  }, []);

  return (
    <div className="space-y-2">
      {/* 検索・フィルタ：1パネルに圧縮 */}
      <section className="tiara-panel p-3">
        <div className="flex flex-col gap-2">
          {/* 検索（上段） */}
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              id="shopSearch"
              name="q"
              value={q}
              onChange={(e) => {
                setOffset(0);
                setQ(e.target.value);
              }}
              placeholder="店舗名・市区町村・キーワードで検索"
              className="tiara-input w-full sm:w-[420px]"
            />
            <input
              id="shopNumber"
              name="shopNumber"
              value={shopNumber}
              onChange={(e) => {
                setOffset(0);
                setShopNumber(e.target.value);
              }}
              placeholder="店舗番号で検索"
              className="tiara-input w-full sm:w-44"
            />
            <div className="flex-1" />

            <div className="flex items-center gap-2">
              <button
                type="button"
                className="h-10 px-3 rounded-full border border-slate-300 bg-white/80 text-[11px] text-slate-700 hover:bg-white"
                onClick={() => {
                  setOffset(0);
                  setQ("");
                  setShopNumber("");
                  setExclusiveFilter("");
                  setNominatedFilter("");
                  setWageFilter("");
                  setGenreFilter("");
                  setContactFilter("");
                  setSortMode("kana");
                  setLimit(20);
                }}
              >
                絞り込みリセット
              </button>

              <Link href="/shops/new" className="tiara-btn h-10">
                新規店舗登録
              </Link>
            </div>
          </div>

          {/* フィルタ（中段）：詰めるため grid で折返し管理 */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-xs">
            <select
              value={exclusiveFilter}
              onChange={(e) => {
                setOffset(0);
                setExclusiveFilter((e.target.value || "") as YesNoFilter);
              }}
              className="tiara-input h-9 text-[11px]"
              title="専属"
            >
              <option value="">専属：すべて</option>
              <option value="yes">専属：あり</option>
              <option value="no">専属：なし</option>
            </select>

            <select
              value={nominatedFilter}
              onChange={(e) => {
                setOffset(0);
                setNominatedFilter((e.target.value || "") as YesNoFilter);
              }}
              className="tiara-input h-9 text-[11px]"
              title="指名"
            >
              <option value="">指名：すべて</option>
              <option value="yes">指名：あり</option>
              <option value="no">指名：なし</option>
            </select>

            <select
              value={wageFilter === "" ? "" : String(wageFilter)}
              onChange={(e) => {
                setOffset(0);
                const v = e.target.value;
                setWageFilter(v ? Number(v) : "");
              }}
              className="tiara-input h-9 text-[11px]"
              title="時給"
            >
              <option value="">時給：すべて</option>
              {wageSteps.map((v) => (
                <option key={v} value={v}>
                  時給：{v}円
                </option>
              ))}
            </select>

            <select
              value={genreFilter}
              onChange={(e) => {
                setOffset(0);
                setGenreFilter((e.target.value || "") as ShopGenre | "");
              }}
              className="tiara-input h-9 text-[11px]"
              title="ジャンル"
            >
              <option value="">ジャンル：すべて</option>
              <option value="club">ジャンル：クラブ</option>
              <option value="snack">ジャンル：スナック</option>
              <option value="cabaret">ジャンル：キャバクラ</option>
              <option value="gb">ジャンル：GB</option>
            </select>

            <select
              value={contactFilter}
              onChange={(e) => {
                setOffset(0);
                setContactFilter((e.target.value || "") as ContactMethodFilter);
              }}
              className="tiara-input h-9 text-[11px]"
              title="連絡方法"
            >
              <option value="">連絡：すべて</option>
              <option value="line">連絡：LINE</option>
              <option value="sms">連絡：SMS</option>
              <option value="tel">連絡：TEL</option>
            </select>

            <select
              value={sortMode}
              onChange={(e) => {
                setOffset(0);
                setSortMode(e.target.value as "kana" | "number" | "favorite");
              }}
              className="tiara-input h-9 text-[11px]"
              title="並び替え"
            >
              <option value="kana">並び：50音順</option>
              <option value="number">並び：店舗番号順</option>
              <option value="favorite">並び：よく使う店舗順</option>
            </select>
          </div>

          {/* 下段：表示件数＋件数表示（右寄せで詰める） */}
          <div className="flex flex-wrap items-center gap-2">
            <DisplayCountControl
              limit={limit}
              total={filteredItems.length}
              onChange={(next) => {
                setOffset(0);
                setLimit(next);
              }}
            />
            <div className="flex-1" />
            <span className="text-[11px] text-muted">
              該当店舗:{" "}
              <span className="font-semibold text-ink">{filteredItems.length}</span> 件（全{" "}
              {total} 件中）
            </span>
          </div>
        </div>

        {message && (
          <div className="mt-2 text-[11px] px-3 py-2 rounded-lg border border-amber-200 bg-amber-50 text-amber-800">
            {message}
          </div>
        )}
      </section>

      {/* 一覧 + ページング（上・下） */}
      <section className="tiara-panel flex-1 p-2 flex flex-col overflow-hidden">
        <PaginationBar
          page={page}
          maxPage={maxPage}
          perPage={perPage}
          total={filteredItems.length}
          onPrev={() => setOffset((prev) => Math.max(0, prev - perPage))}
          onNext={() =>
            setOffset((prev) =>
              Math.min(prev + perPage, Math.max(0, perPage * (maxPage - 1))),
            )
          }
        />

        {/* テーブル（ライト固定：dark:系を排除＋薄さ解消） */}
        <div className="flex-1 overflow-auto rounded-lg border border-slate-200 bg-white">
          {loading ? (
            <div className="h-full flex items-center justify-center text-[11px] text-muted p-4">
              読み込み中…
            </div>
          ) : pagedItems.length === 0 ? (
            <div className="h-full flex items-center justify-center text-[11px] text-muted p-4">
              該当データがありません
            </div>
          ) : (
            <div className="min-w-[1100px]">
              <table className="w-full border-collapse text-[12px] text-slate-900">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-800 border-b border-slate-200">
                    <th className="px-3 py-2 text-left text-slate-50 font-semibold w-[90px]">
                      店番号
                    </th>
                    <th className="px-3 py-2 text-left text-slate-50 font-semibold w-[280px]">
                      店舗名
                    </th>
                    <th className="px-3 py-2 text-left text-slate-50 font-semibold w-[140px]">
                      TEL
                    </th>
                    <th className="px-3 py-2 text-left text-slate-50 font-semibold w-[90px]">
                      専属
                    </th>
                    <th className="px-3 py-2 text-left text-slate-50 font-semibold w-[90px]">
                      指名
                    </th>
                    <th className="px-3 py-2 text-left text-slate-50 font-semibold w-[120px]">
                      時給
                    </th>
                    <th className="px-3 py-2 text-left text-slate-50 font-semibold w-[140px]">
                      ジャンル
                    </th>
                    <th className="px-3 py-2 text-left text-slate-50 font-semibold w-[140px]">
                      連絡方法
                    </th>
                    <th className="px-3 py-2 text-left text-slate-50 font-semibold w-[170px]">
                      最終更新
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {pagedItems.map((r, idx) => {
                    const zebra = idx % 2 === 0;
                    const exclusive = hasExclusive(r);
                    const nominated = hasNominated(r);
                    const wageLabel =
                      ((r as any).wageLabel ?? (r as any).wage_label ?? "-") as
                        | string
                        | null
                        | undefined;
                    const contact = normalizeContactMethod(r);

                    return (
                      <tr
                        key={r.id}
                        className={
                          "border-b border-slate-200 cursor-pointer " +
                          (zebra ? "bg-slate-50" : "bg-white") +
                          " hover:bg-sky-50"
                        }
                        onClick={() => handleOpenShop(r)}
                      >
                        <td className="px-3 py-2 font-mono text-slate-900">
                          {formatShopNumber(r.shopNumber)}
                        </td>

                        <td className="px-3 py-2">
                          <div className="text-slate-900 font-semibold truncate">
                            {r.name}
                          </div>
                          <div className="text-[10px] text-slate-500 truncate">
                            {(r.nameKana ?? (r as any).kana ?? "") || "—"}
                          </div>
                        </td>

                        <td className="px-3 py-2 text-slate-900">{r.phone ?? "-"}</td>

                        <td className="px-3 py-2">
                          <span
                            className={
                              "inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] " +
                              (exclusive
                                ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                                : "border-slate-300 bg-slate-50 text-slate-700")
                            }
                          >
                            {exclusive ? "あり" : "なし"}
                          </span>
                        </td>

                        <td className="px-3 py-2">
                          <span
                            className={
                              "inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] " +
                              (nominated
                                ? "border-violet-300 bg-violet-50 text-violet-800"
                                : "border-slate-300 bg-slate-50 text-slate-700")
                            }
                          >
                            {nominated ? "あり" : "なし"}
                          </span>
                        </td>

                        <td className="px-3 py-2 text-slate-900">
                          <span className="truncate inline-block max-w-[110px]">
                            {wageLabel || "-"}
                          </span>
                        </td>

                        <td className="px-3 py-2 text-slate-900">{getGenreLabel(r.genre ?? null)}</td>

                        <td className="px-3 py-2 text-slate-900">{getContactLabel(contact)}</td>

                        <td className="px-3 py-2 text-slate-700">
                          {r.updatedAt ? new Date(r.updatedAt).toLocaleString() : "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 下部にもページングバーを複製 */}
        <PaginationBar
          page={page}
          maxPage={maxPage}
          perPage={perPage}
          total={filteredItems.length}
          onPrev={() => setOffset((prev) => Math.max(0, prev - perPage))}
          onNext={() =>
            setOffset((prev) =>
              Math.min(prev + perPage, Math.max(0, perPage * (maxPage - 1))),
            )
          }
          bottom
        />
      </section>

      {selectedShop && (
        <ShopDetailModal
          base={selectedShop}
          detail={shopDetail}
          loading={shopDetailLoading}
          error={shopDetailError}
          onClose={handleCloseModal}
          onSaved={(updated) => {
            // 一覧の items を即時反映
            setItems((prev) =>
              prev.map((item) =>
                item.id === updated.id ? { ...item, ...updated } : item,
              ),
            );
            handleCloseModal();
          }}
        />
      )}
    </div>
  );
}

type PaginationBarProps = {
  page: number;
  maxPage: number;
  perPage: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  bottom?: boolean;
};

function PaginationBar({
  page,
  maxPage,
  perPage,
  total,
  onPrev,
  onNext,
  bottom,
}: PaginationBarProps) {
  const startIndex = total === 0 ? 0 : (page - 1) * perPage + 1;
  const endIndex = total === 0 ? 0 : Math.min(page * perPage, total);

  return (
    <div
      className={`flex items-center justify-between px-3 py-1.5 text-[11px] text-muted bg-white/10 ${
        bottom ? "border-t border-white/10" : "border-b border-white/10"
      }`}
    >
      <div className="whitespace-nowrap">
        全 {total} 件中 {startIndex === 0 ? 0 : startIndex} - {endIndex} 件
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={onPrev}
          className="px-2 py-1 rounded-full border border-slate-300 bg-white/80 text-[11px] text-slate-700 disabled:opacity-40"
        >
          前へ
        </button>
        <span className="text-[11px] whitespace-nowrap">
          {page} / {maxPage}
        </span>
        <button
          type="button"
          disabled={page >= maxPage}
          onClick={onNext}
          className="px-2 py-1 rounded-full border border-slate-300 bg-white/80 text-[11px] text-slate-700 disabled:opacity-40"
        >
          次へ
        </button>
      </div>
    </div>
  );
}

type DisplayCountControlProps = {
  limit: PerPage;
  total: number;
  onChange: (next: PerPage) => void;
};

function DisplayCountControl({ limit, total, onChange }: DisplayCountControlProps) {
  const options: (number | "all")[] = [10, 20, 50, 100, 150, 200, "all"];

  const isActive = (opt: number | "all") =>
    (opt === "all" && limit === "all") ||
    (typeof opt === "number" && limit !== "all" && limit === opt);

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-muted whitespace-nowrap">表示件数</span>
      <div className="inline-flex rounded-full bg-white/70 border border-slate-200 overflow-hidden">
        {options.map((opt, idx) => (
          <button
            key={String(opt)}
            type="button"
            onClick={() => onChange(opt === "all" ? "all" : opt)}
            className={
              "px-2.5 py-1 text-[11px] " +
              (idx === 0 ? "" : "border-l border-slate-200") +
              " " +
              (isActive(opt)
                ? "bg-slate-200 text-slate-900"
                : "bg-transparent text-slate-700")
            }
          >
            {opt === "all" ? "全件" : opt}
          </button>
        ))}
      </div>
      <span className="text-[10px] text-muted whitespace-nowrap">（全{total}件）</span>
    </div>
  );
}

type ShopDetailModalProps = {
  base: ShopListItem;
  detail: ShopDetail | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onSaved: (updated: ShopDetail) => void | Promise<void>;
};

function ShopDetailModal({
  base,
  detail,
  loading,
  error,
  onClose,
  onSaved,
}: ShopDetailModalProps) {
  // 詳細レスポンスがあればそちらを優先、なければ一覧からの base を使う
  const shop: ShopDetail | ShopListItem = detail || base;

  // ---- 必須 1〜8項目＋追加項目の state ----
  const [shopNumber, setShopNumber] = useState<string>(shop?.shopNumber ?? ""); // ①店舗番号
  const [name, setName] = useState<string>(shop?.name ?? ""); // ②店名

  // API から来ている nameKana / kana を初期表示
  const [kana, setKana] = useState<string>(
    (shop as ShopDetail).nameKana ?? (shop as any).kana ?? "",
  ); // ③カナ

  const [rank, setRank] = useState<ShopRank | "">((shop?.rank as ShopRank | null) ?? ""); // ④ランク

  const [addressLine, setAddressLine] = useState<string>(shop?.addressLine ?? ""); // ⑤店住所
  const [buildingName, setBuildingName] = useState<string>((shop as ShopDetail).buildingName ?? ""); // ⑥ビル名

  const [hourlyRate, setHourlyRate] = useState<string>((shop as ShopDetail).wageLabel ?? ""); // ⑦時給カテゴリ
  const [phone, setPhone] = useState<string>(shop?.phone ?? ""); // ⑧電話
  const [phoneChecked, setPhoneChecked] = useState<boolean>(false); // 電話チェック（現状はUIのみ）

  // 既存項目：ジャンル
  const [genre, setGenre] = useState<ShopGenre | "">((shop?.genre as ShopGenre | null) ?? "");

  // 飲酒希望（店舗側）
  const [drinkPreference, setDrinkPreference] = useState<ShopDrinkPreference | "">(
    ((shop as ShopDetail).drinkPreference as ShopDrinkPreference | null) ?? "",
  );

  // ★ 専属指名キャスト / NGキャスト（表示のみ）
  const [fixedCasts, setFixedCasts] = useState<FixedRow[]>([]);
  const [ngCasts, setNgCasts] = useState<NgRow[]>([]);
  const [fixedLoading, setFixedLoading] = useState(false);
  const [ngLoadingState, setNgLoadingState] = useState(false);

  // 身分証・担当
  const [idDocument, setIdDocument] = useState<ShopIdRequirement | "">(
    (shop as ShopDetail).idDocumentRequirement ?? "",
  );
  const [ownerStaff, setOwnerStaff] = useState<string>((shop as any).ownerStaff ?? "");

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [shopNumberError, setShopNumberError] = useState<string | null>(null);

  const drinkOptions: { value: ShopDrinkPreference; label: string }[] = [
    { value: "none", label: "NG" },
    { value: "weak", label: "弱い" },
    { value: "normal", label: "普通" },
    { value: "strong", label: "強い" },
  ];

  const wageOptions = [
    "2500円",
    "2500円〜3000円",
    "3000円",
    "3000円〜3500円",
    "3500円",
    "3500円〜4000円",
    "4000円",
    "4000円〜4500円",
    "4500円",
    "4500円〜5000円",
    "5000円",
    "5000円〜5500円",
    "5500円",
    "5500円〜6000円",
    "6000円以上",
  ];

  // 担当スタッフ候補（ログインできるスタッフ）
  const staffOptions = ["北村", "北村2", "川上", "馬場崎", "長谷川", "陣内", "梶原", "宮崎"];

  // ---- 専属 / NG 初期ロード（表示用）----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setFixedLoading(true);
        setNgLoadingState(true);
        const [fixed, ng] = await Promise.all([
          listShopFixedCasts(base.id),
          listShopNgCasts(base.id),
        ]);
        if (cancelled) return;
        setFixedCasts(
          fixed.map((row) => ({
            ...row,
            _deleted: false,
            _isNew: false,
          })),
        );
        setNgCasts(
          ng.map((row) => ({
            ...row,
            _deleted: false,
            _isNew: false,
          })),
        );
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("[ShopDetailModal] failed to load casts", e);
      } finally {
        if (!cancelled) {
          setFixedLoading(false);
          setNgLoadingState(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [base.id]);

  const save = async () => {
    setSaving(true);
    setErr(null);
    setShopNumberError(null);

    // 店舗番号バリデーション（空 or 3〜4桁の半角数字）
    const trimmedNumber = shopNumber.trim();
    if (trimmedNumber && !/^\d{3,4}$/.test(trimmedNumber)) {
      setShopNumberError("店舗番号は3〜4桁の半角数字で入力してください（例: 001, 0701）");
      setSaving(false);
      return;
    }

    const payload = {
      name: name.trim(),
      addressLine: addressLine.trim(),
      phone: phone.trim(),
    } as Parameters<typeof updateShop>[1];

    if (trimmedNumber) {
      payload.shopNumber = trimmedNumber;
    }

    const kanaTrimmed = kana.trim();
    if (kanaTrimmed) {
      payload.nameKana = kanaTrimmed;
    }

    if (buildingName.trim()) {
      payload.buildingName = buildingName.trim();
    }

    // ジャンル
    payload.genre = genre ? (genre as ShopGenre) : null;

    // ランク
    payload.rank = rank ? (rank as ShopRank) : null;

    // 飲酒希望
    payload.drinkPreference = drinkPreference ? (drinkPreference as ShopDrinkPreference) : null;

    // 時給
    payload.wageLabel = hourlyRate.trim() ? hourlyRate.trim() : null;

    // 身分証
    payload.idDocumentRequirement = idDocument ? (idDocument as ShopIdRequirement) : null;

    try {
      // 店舗本体のみ更新（専属/NGキャストはキャスト管理側で編集）
      const updated = await updateShop(base.id, payload);
      await onSaved(updated);
    } catch (e: any) {
      setErr(e?.message ?? "更新に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50">
        <div className="absolute inset-0 bg-black/50" onClick={onClose} />
        <div className="absolute right-0 top-0 h-full w-full max-w-3xl bg-slate-900 shadow-2xl p-6 overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-ink">店舗詳細・編集</h2>
            {loading && (
              <span className="text-[11px] text-slate-400">詳細を読み込み中…</span>
            )}
          </div>

          {error && (
            <div className="mb-3 text-[11px] px-3 py-2 rounded-lg border border-red-300 bg-red-50 text-red-700">
              {error}
            </div>
          )}

          <div className="space-y-6 text-sm text-ink">
            {/* 基本情報 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 店舗番号 */}
              <label className="block">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-slate-300 text-sm">店舗番号</span>
                  <span className="text-[11px] text-slate-500">3〜4桁の半角数字</span>
                </div>
                <input
                  value={shopNumber}
                  onChange={(e) => {
                    setShopNumber(e.target.value);
                    setShopNumberError(null);
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 text-white font-mono"
                  placeholder="657 など"
                />
                {shopNumberError && (
                  <div className="mt-1 text-xs text-red-400">{shopNumberError}</div>
                )}
              </label>

              {/* 店舗名 */}
              <label className="block">
                <div className="text-sm text-slate-300 mb-1">店舗名</div>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 text-white"
                  placeholder="クラブ ○○ など"
                />
              </label>

              {/* カナ */}
              <label className="block">
                <div className="text-sm text-slate-300 mb-1">カナ（読み方）</div>
                <input
                  value={kana}
                  onChange={(e) => setKana(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 text-white"
                  placeholder="クラブ アリア など"
                />
              </label>

              {/* ランク */}
              <label className="block">
                <div className="text-sm text-slate-300 mb-1">ランク</div>
                <select
                  value={rank}
                  onChange={(e) => setRank((e.target.value || "") as ShopRank | "")}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 text-white"
                >
                  <option value="">（未設定）</option>
                  <option value="S">S</option>
                  <option value="A">A</option>
                  <option value="B">B</option>
                  <option value="C">C</option>
                </select>
              </label>
            </div>

            {/* 住所系 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="block">
                <div className="text-sm text-slate-300 mb-1">店住所</div>
                <input
                  value={addressLine}
                  onChange={(e) => setAddressLine(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 text-white"
                  placeholder="福岡県福岡市博多区中洲1-2-3 など"
                />
              </label>

              <label className="block">
                <div className="text-sm text-slate-300 mb-1">ビル名</div>
                <input
                  value={buildingName}
                  onChange={(e) => setBuildingName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 text-white"
                  placeholder="○○ビル 3F など"
                />
              </label>
            </div>

            {/* 時給・電話・ジャンル */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* 時給 */}
              <label className="block">
                <div className="text-sm text-slate-300 mb-1">時給</div>
                <select
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 text-white"
                >
                  <option value="">（未設定）</option>
                  {wageOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </label>

              {/* 電話 */}
              <label className="block">
                <div className="text-sm text-slate-300 mb-1">電話</div>
                <div className="flex gap-2 items-center">
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 text-white"
                    placeholder="090-xxxx-xxxx"
                  />
                  <label className="flex items-center gap-1 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={phoneChecked}
                      onChange={(e) => setPhoneChecked(e.target.checked)}
                    />
                    <span>電話チェック済み</span>
                  </label>
                </div>
              </label>

              {/* ジャンル（表示はカタカナ） */}
              <label className="block">
                <div className="text-sm text-slate-300 mb-1">ジャンル</div>
                <select
                  value={genre}
                  onChange={(e) => setGenre((e.target.value || "") as ShopGenre | "")}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 text-white"
                >
                  <option value="">（未設定）</option>
                  <option value="club">クラブ</option>
                  <option value="cabaret">キャバクラ</option>
                  <option value="snack">スナック</option>
                  <option value="gb">GB</option>
                </select>
              </label>
            </div>

            {/* キャスト関連（専属 / NG：表示のみ） */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 専属指名キャスト */}
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-sm text-slate-300">専属指名キャスト</div>
                  <div className="text-[11px] text-slate-500">（編集はキャスト管理ページから）</div>
                </div>

                <div className="rounded-xl border border-slate-700/60 bg-slate-800/40 p-2 max-h-56 overflow-y-auto text-xs">
                  {fixedLoading ? (
                    <div className="text-slate-400">読み込み中…</div>
                  ) : fixedCasts.length === 0 ? (
                    <div className="text-slate-500">登録なし</div>
                  ) : (
                    <ul className="space-y-2">
                      {fixedCasts.map((row) => {
                        const labelName = row.cast.displayName || "(名前未登録)";
                        const mng = row.cast.managementNumber || row.cast.castCode || "-";
                        return (
                          <li
                            key={row.castId}
                            className="flex items-start gap-2 rounded-lg px-2 py-1 bg-slate-900/60"
                          >
                            <div className="w-20">
                              <div className="text-[10px] text-slate-400">管理番号</div>
                              <div className="font-mono text-xs text-slate-50">{mng}</div>
                            </div>
                            <div className="flex-1">
                              <div className="text-xs text-slate-50">{labelName}</div>
                              {row.note && (
                                <div className="mt-0.5 text-[10px] text-slate-400">
                                  メモ: {row.note}
                                </div>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>

              {/* NGキャスト */}
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-sm text-slate-300">NGキャスト</div>
                  <div className="text-[11px] text-slate-500">（編集はキャスト管理ページから）</div>
                </div>

                <div className="rounded-xl border border-slate-700/60 bg-slate-800/40 p-2 max-h-56 overflow-y-auto text-xs">
                  {ngLoadingState ? (
                    <div className="text-slate-400">読み込み中…</div>
                  ) : ngCasts.length === 0 ? (
                    <div className="text-slate-500">登録なし</div>
                  ) : (
                    <ul className="space-y-2">
                      {ngCasts.map((row) => {
                        const labelName = row.cast.displayName || "(名前未登録)";
                        const mng = row.cast.managementNumber || row.cast.castCode || "-";
                        return (
                          <li
                            key={row.castId}
                            className="flex items-start gap-2 rounded-lg px-2 py-1 bg-slate-900/60"
                          >
                            <div className="w-20">
                              <div className="text-[10px] text-slate-400">管理番号</div>
                              <div className="font-mono text-xs text-slate-50">{mng}</div>
                            </div>
                            <div className="flex-1">
                              <div className="text-xs text-slate-50">{labelName}</div>
                              {row.reason && (
                                <div className="mt-0.5 text-[10px] text-slate-400">
                                  NG理由: {row.reason}
                                </div>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            </div>

            {/* 条件系：身分証・飲酒希望・担当 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 身分証 */}
              <label className="block">
                <div className="text-sm text-slate-300 mb-1">身分証</div>
                <select
                  value={idDocument}
                  onChange={(e) =>
                    setIdDocument((e.target.value || "") as ShopIdRequirement | "")
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 text-white"
                >
                  <option value="">（未設定）</option>
                  <option value="none">条件なし</option>
                  <option value="photo_only">顔写真</option>
                  <option value="address_only">本籍地</option>
                  <option value="both">どちらも必要</option>
                </select>
              </label>

              {/* 飲酒希望 */}
              <label className="block">
                <div className="text-sm text-slate-300 mb-1">飲酒希望</div>
                <select
                  value={drinkPreference}
                  onChange={(e) =>
                    setDrinkPreference((e.target.value || "") as ShopDrinkPreference | "")
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 text-white"
                >
                  <option value="">（未設定）</option>
                  {drinkOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-slate-500">
                  キャスト側の飲酒設定と組み合わせてマッチングに利用予定です。
                </p>
              </label>

              {/* 担当（UIのみ：スタッフ候補ドロップダウン） */}
              <label className="block md:col-span-2">
                <div className="text-sm text-slate-300 mb-1">担当</div>
                <select
                  value={ownerStaff}
                  onChange={(e) => setOwnerStaff(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 text-white"
                >
                  <option value="">（未設定）</option>
                  {staffOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-slate-500">
                  現在はUIのみ（後日スタッフマスタとの連携を実装予定）。
                </p>
              </label>
            </div>

            {err && <div className="text-red-400 text-sm">{err}</div>}

            <div className="flex gap-2 pt-2 justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-slate-700 text-white"
                disabled={saving}
              >
                閉じる
              </button>
              <button
                onClick={save}
                className="px-4 py-2 rounded-xl bg-blue-600 text-white disabled:opacity-50"
                disabled={saving}
              >
                {saving ? "保存中…" : "保存"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
