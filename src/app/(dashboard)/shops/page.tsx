// src/app/(dashboard)/shops/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
} from "react";
import Link from "next/link";
import {
  listShops,
  updateShop,
  getShop,
  deleteShop,
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

function mapHeightToOption(value?: string | number | null): string {
  if (value === null || value === undefined) return "";
  const raw = String(value).trim();
  if (!raw) return "";
  if (raw === "〜150") return "〜150";
  const rangeMatch = raw.match(/^(\d{2,3})〜(\d{2,3})$/);
  if (rangeMatch) return raw;
  const num = Number(raw);
  if (!Number.isFinite(num)) return "";
  if (num <= 150) return "〜150";
  if (num <= 155) return "151〜155";
  if (num <= 160) return "156〜160";
  if (num <= 165) return "161〜165";
  if (num <= 170) return "166〜170";
  return "171〜";
}

function parseHeightToString(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed === "〜150") return "150";
  const rangeMatch = trimmed.match(/^(\d{2,3})〜(\d{2,3})$/);
  if (rangeMatch) return String(Number(rangeMatch[2]));
  const num = Number(trimmed);
  return Number.isFinite(num) ? String(num) : null;
}

// JST 기준 YYYY-MM-DD（API バリデーション用）
function formatDateYYYYMMDD_JST(date = new Date()): string {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
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
  const [sortMode, setSortMode] =
    useState<"kana" | "number" | "favorite">("kana");

  // ★ 追加：Excelレイアウトに合わせたフィルタ（一覧）
  const [exclusiveFilter, setExclusiveFilter] = useState<YesNoFilter>(""); // 専属（あり/なし）
  const [nominatedFilter, setNominatedFilter] = useState<YesNoFilter>(""); // 指名（あり/なし）
  const [wageFilter, setWageFilter] = useState<WageFilter>(""); // 2500..6500
  const [contactFilter, setContactFilter] =
    useState<ContactMethodFilter>(""); // LINE/SMS/TEL

  // === 店舗詳細モーダル用の状態 ===
  const [selectedShop, setSelectedShop] = useState<ShopListItem | null>(null);
  const [shopDetail, setShopDetail] = useState<ShopDetail | null>(null);
  const [shopDetailLoading, setShopDetailLoading] = useState(false);
  const [shopDetailError, setShopDetailError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ShopListItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteShop(deleteTarget.id);
      if (selectedShop?.id === deleteTarget.id) {
        handleCloseModal();
      }
      setDeleteTarget(null);
      await reload();
    } catch (e: any) {
      setDeleteError(e?.message ?? "削除に失敗しました");
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, selectedShop, handleCloseModal]);

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
                    <th className="px-3 py-2 text-left text-slate-50 font-semibold w-[110px]">
                      削除
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

                        <td className="px-3 py-2 text-slate-900">
                          {getGenreLabel(r.genre ?? null)}
                        </td>

                        <td className="px-3 py-2 text-slate-900">
                          {getContactLabel(contact)}
                        </td>

                        <td className="px-3 py-2 text-slate-700">
                          {r.updatedAt ? new Date(r.updatedAt).toLocaleString() : "-"}
                        </td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            className="px-3 py-1 text-[11px] border border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget(r);
                              setDeleteError(null);
                            }}
                          >
                            削除
                          </button>
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
          onSaved={async (updated) => {
            // 一覧の items を即時反映
            setItems((prev) =>
              prev.map((item) =>
                item.id === updated.id ? { ...item, ...updated } : item,
              ),
            );

            // ★ 追加：モーダル内の base / detail も更新して「再表示ズレ」を防ぐ
            setSelectedShop((prev) =>
              prev && prev.id === updated.id ? { ...prev, ...updated } : prev,
            );
            setShopDetail((prev) =>
              prev && prev.id === updated.id ? { ...prev, ...updated } : prev,
            );

            // ★ 最小修正：保存後に一覧を再取得（select完全一致の結果を反映）
            await reload();
          }}
        />
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => (deleting ? null : setDeleteTarget(null))}
          />
          <div className="relative z-10 w-full max-w-md bg-white border border-gray-200 shadow-2xl p-5">
            <h3 className="text-sm font-semibold text-gray-900">
              店舗削除の確認
            </h3>
            <p className="mt-3 text-xs text-gray-700 leading-relaxed">
              データベースから完全に
              <span className="font-semibold">「{deleteTarget.name}」</span>
              の情報を削除します。復元はできませんが本当に削除していいですか？
            </p>
            {deleteError && (
              <p className="mt-3 text-xs text-red-600">{deleteError}</p>
            )}
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                className="px-3 py-2 text-xs border border-gray-300 bg-white"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
              >
                キャンセル
              </button>
              <button
                type="button"
                className="px-3 py-2 text-xs border border-red-400 bg-red-500 text-white disabled:opacity-60"
                onClick={handleDeleteConfirm}
                disabled={deleting}
              >
                DBから削除する
              </button>
            </div>
          </div>
        </div>
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

const ShopDetailLabel = ({ children }: { children: any }) => (
  <div className="text-sm font-semibold text-slate-900">{children}</div>
);

const ShopDetailField = ({ children }: { children: any }) => (
  <div className="w-full rounded bg-white border border-slate-900/70 px-3 py-2 text-slate-900">
    {children}
  </div>
);

const ShopDetailInput = (props: InputHTMLAttributes<HTMLInputElement>) => (
  <input
    {...props}
    className={
      "w-full bg-transparent outline-none text-slate-900 placeholder:text-slate-400 " +
      (props.className ?? "")
    }
  />
);

const ShopDetailSelect = (props: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select
    {...props}
    className={
      "w-full bg-transparent outline-none text-slate-900 " +
      (props.className ?? "")
    }
  />
);

const ShopDetailChipTitle = ({ children }: { children: any }) => (
  <div className="inline-flex items-center rounded-sm bg-[#3f67b6] px-3 py-2 text-white font-semibold text-sm border border-slate-900/70">
    {children}
  </div>
);

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

  // ★ 追加：detail が後から来ても state が初期化されない問題対策
  // - base.id が変わったら「未反映」状態に戻す
  // - detail が来た時に1回だけフォーム state に反映する
  const lastAppliedDetailRef = useRef<string | null>(null);

  // ---- 必須 1〜8項目＋追加項目の state ----
  const [shopNumber, setShopNumber] = useState<string>(shop?.shopNumber ?? ""); // ①店舗番号
  const [name, setName] = useState<string>(shop?.name ?? ""); // ②店名
  const [kana, setKana] = useState<string>(
    (shop as ShopDetail).nameKana ?? (shop as any).kana ?? "",
  ); // ③カナ
  const [rank, setRank] = useState<ShopRank | "">((shop?.rank as ShopRank | null) ?? ""); // ④ランク
  const [addressLine, setAddressLine] = useState<string>(shop?.addressLine ?? ""); // ⑤店住所
  const [buildingName, setBuildingName] = useState<string>((shop as ShopDetail).buildingName ?? ""); // ⑥ビル名
  const [hourlyRate, setHourlyRate] = useState<string>((shop as ShopDetail).wageLabel ?? ""); // ⑦時給カテゴリ
  const [phone, setPhone] = useState<string>(shop?.phone ?? ""); // ⑧電話
  const [phoneChecked, setPhoneChecked] = useState<boolean>(
    Boolean(
      (shop as any).phoneChecked ??
        (shop as any).phone_checked ??
        false,
    ),
  ); // 電話チェック

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

  // ---- 登録情報①：UI項目（＝保存したい）----
  const [postalCode, setPostalCode] = useState<string>(
    (shop as any).postalCode ?? (shop as any).postal_code ?? "",
  );
  const [heightUi, setHeightUi] = useState<string>(
    mapHeightToOption(
      (shop as any).height ?? (shop as any).dailyOrder?.height ?? "",
    ),
  );
  const [bodyTypeUi, setBodyTypeUi] = useState<string>(
    (shop as any).bodyType ??
      (shop as any).body_type ??
      (shop as any).dailyOrder?.bodyType ??
      (shop as any).dailyOrder?.body_type ??
      "",
  );
  const [cautionUi, setCautionUi] = useState<string>(
    (shop as any).caution ?? "",
  );

  // 登録情報①：左下ドロップ（＝保存したい）
  const [contactMethod, setContactMethod] = useState<ContactMethodFilter>(
    normalizeContactMethod(shop as any),
  );
  // ★ hairSet 衝突回避：登録情報①の hairSet はトップキーで送る
  const [hairSet, setHairSet] = useState<string>(
    String((shop as any).hairSet ?? (shop as any).hair_set ?? ""),
  );

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

  const staffOptions = ["北村", "北村2", "川上", "馬場崎", "長谷川", "陣内", "梶原", "宮崎"];
  const bodyTypeOptions = ["細身", "普通", "グラマー", "ぽっちゃり", "不明"];
  const heightOptions = ["〜150", "151〜155", "156〜160", "161〜165", "166〜170", "171〜"];

  // ★ 追加：base が切り替わったら「未反映」状態に戻す
  useEffect(() => {
    lastAppliedDetailRef.current = null;
  }, [base.id]);

  // ★ 追加：detail が後から来ても state に反映されない問題を解消
  useEffect(() => {
    if (!detail) return;

    const signature = [
      detail.id,
      detail.updatedAt ?? "",
      detail.dailyOrder?.updatedAt ?? "",
    ].join("|");

    // 既にこの detail を反映済みなら何もしない
    if (lastAppliedDetailRef.current === signature) return;

    // detail の内容でフォームを上書き（初回だけ）
    setShopNumber(detail.shopNumber ?? "");
    setName(detail.name ?? "");
    setKana((detail as any).nameKana ?? (detail as any).kana ?? "");
    setRank(((detail as any).rank as ShopRank | null) ?? "");
    setAddressLine((detail as any).addressLine ?? "");
    setBuildingName((detail as any).buildingName ?? "");
    setHourlyRate((detail as any).wageLabel ?? "");
    setPhone((detail as any).phone ?? "");
    setGenre(((detail as any).genre as ShopGenre | null) ?? "");
    setDrinkPreference(((detail as any).drinkPreference as ShopDrinkPreference | null) ?? "");
    setIdDocument((detail as any).idDocumentRequirement ?? "");
    setOwnerStaff((detail as any).ownerStaff ?? "");

    // 登録情報①（保存対象）
    setPostalCode((detail as any).postalCode ?? (detail as any).postal_code ?? "");
    const dailyOrder =
      (detail as any).dailyOrder ??
      (detail as any).daily_order ??
      (detail as any).todayOrder ??
      (detail as any).today_order ??
      null;
    setHeightUi(mapHeightToOption((detail as any).height ?? dailyOrder?.height ?? ""));
    setBodyTypeUi(
      (detail as any).bodyType ??
        (detail as any).body_type ??
        dailyOrder?.bodyType ??
        dailyOrder?.body_type ??
        "",
    );
    setCautionUi((detail as any).caution ?? "");
    setPhoneChecked(Boolean((detail as any).phoneChecked ?? (detail as any).phone_checked ?? false));

    // 連絡方法（保存対象）
    const cm = ((detail as any).contactMethod ?? (detail as any).contact_method ?? "") as string;
    const cmNorm = normalizeContactMethod({ ...(detail as any), contactMethod: cm } as any);
    setContactMethod(cmNorm);

    // 登録情報① hairSet（保存対象）
    setHairSet(String((detail as any).hairSet ?? (detail as any).hair_set ?? ""));

    // 反映済みマーク
    lastAppliedDetailRef.current = signature;
  }, [detail]);

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

    const payload: Parameters<typeof updateShop>[1] = {
      name: name.trim(),
      addressLine: addressLine.trim(),
      phone: phone.trim(),
    };

    if (trimmedNumber) payload.shopNumber = trimmedNumber;

    const kanaTrimmed = kana.trim();
    if (kanaTrimmed) payload.nameKana = kanaTrimmed;

    if (buildingName.trim()) payload.buildingName = buildingName.trim();

    payload.genre = genre ? (genre as ShopGenre) : null;
    payload.rank = rank ? (rank as ShopRank) : null;
    payload.drinkPreference = drinkPreference ? (drinkPreference as ShopDrinkPreference) : null;
    payload.wageLabel = hourlyRate.trim() ? hourlyRate.trim() : null;
    payload.idDocumentRequirement = idDocument ? (idDocument as ShopIdRequirement) : null;

    // ===== 登録情報①：保存対象を網羅 =====
    // postalCode / height / bodyType / caution / ownerStaff / phoneChecked / contactMethod / hairSet
    if (postalCode.trim()) (payload as any).postalCode = postalCode.trim();
    else (payload as any).postalCode = ""; // 空も明示的に送る（API方針に合わせて）

    const heightValue = parseHeightToString(heightUi);
    const bodyTypeValue = bodyTypeUi.trim();
    if (heightValue !== null) {
      (payload as any).height = heightValue;
    } else {
      (payload as any).height = "";
    }
    (payload as any).bodyType = bodyTypeValue;
    if (heightValue !== null || bodyTypeValue || (!heightUi && !bodyTypeUi)) {
      const dailyOrderDate = formatDateYYYYMMDD_JST(new Date());
      (payload as any).dailyOrderDate = dailyOrderDate;
      (payload as any).dailyOrder = {
        date: dailyOrderDate,
        height: heightValue ?? null,
        bodyType: bodyTypeValue || null,
      };
    }
    (payload as any).caution = cautionUi.trim();
    (payload as any).ownerStaff = ownerStaff || "";
    (payload as any).phoneChecked = Boolean(phoneChecked);

    // 連絡方法（line/sms/tel）を保存
    // API側の想定が string のためそのまま入れる（空なら ""）
    (payload as any).contactMethod = contactMethod || "";

    // ★ hairSet 衝突回避：登録情報①の hairSet はトップキーに入れる
    (payload as any).hairSet = hairSet || "";

    try {
      // 1) update
      await updateShop(base.id, payload);

      // 2) 保存直後に再取得して「再表示ズレ」を潰す
      //    ※ updateShop の戻り値でも反映可能だが、確実性優先で refetch
      const refetched = await getShop(base.id);
      await onSaved(refetched);
    } catch (e: any) {
      setErr(e?.message ?? "更新に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  // ---- ここからレイアウト（スクショ寄せ・ライト固定） ----
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      {/* overlay */}
      <div className="absolute inset-0 bg-black/55" onClick={onClose} />

      {/* modal */}
      <div className="relative w-full max-w-[1280px] h-[90vh] overflow-hidden rounded-lg border-2 border-slate-900 shadow-2xl bg-white flex flex-col">
        {/* header */}
        <div className="flex items-center justify-between px-4 py-3 border-b-2 border-slate-900 bg-white">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-slate-900">店舗詳細・編集</h2>
            {loading && <span className="text-xs text-slate-500">詳細を読み込み中…</span>}
          </div>

          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            type="button"
            disabled={saving}
          >
            閉じる
          </button>
        </div>

        {(error || err) && (
          <div className="px-4 py-2 border-b border-slate-200 bg-amber-50 text-amber-900 text-sm">
            {error || err}
          </div>
        )}

        <div className="flex-1 overflow-y-auto pb-8">
          {/* ===== 上段：登録情報 ===== */}
          <section className="px-4 py-4 bg-[#efe2dd] border-b-2 border-slate-900">
            <div className="flex items-start justify-between gap-3 mb-3">
              <ShopDetailChipTitle>登録情報①</ShopDetailChipTitle>

              <div className="flex items-center gap-2">
                <div className="rounded-sm border border-slate-900/70 bg-[#3f67b6] text-white px-3 py-2 text-sm font-semibold">
                  最終オーダー日　●年・月・日
                </div>
                <div className="rounded-sm border border-slate-900/70 bg-[#3f67b6] text-white px-3 py-2 text-sm font-semibold">
                  オーダー回数　●回
                </div>
              </div>
            </div>

            <div className="grid grid-cols-12 gap-4">
              {/* 左：写真＋左下の3ドロップ */}
              <div className="col-span-12 md:col-span-4">
                <div className="rounded border-2 border-slate-900 bg-[#4d73c9] h-[360px] flex items-center justify-center text-white font-bold">
                  写真
                </div>

                <div className="mt-4 space-y-3">
                  <div>
                    <ShopDetailLabel>ランク</ShopDetailLabel>
                    <div className="mt-1">
                      <ShopDetailField>
                        <ShopDetailSelect 
                          value={rank}
                          onChange={(e: any) => setRank((e.target.value || "") as ShopRank | "")}
                        >
                          <option value="">指定なし</option>
                          <option value="S">S</option>
                          <option value="A">A</option>
                          <option value="B">B</option>
                          <option value="C">C</option>
                        </ShopDetailSelect>
                      </ShopDetailField>
                    </div>
                  </div>

                  {/* 連絡方法（保存対象） */}
                  <div>
                    <ShopDetailLabel>連絡方法</ShopDetailLabel>
                    <div className="mt-1">
                      <ShopDetailField>
                        <ShopDetailSelect 
                          value={contactMethod}
                          onChange={(e: any) =>
                            setContactMethod((e.target.value || "") as ContactMethodFilter)
                          }
                        >
                          <option value="">指定なし</option>
                          <option value="line">LINE</option>
                          <option value="sms">SMS</option>
                          <option value="tel">TEL</option>
                        </ShopDetailSelect>
                      </ShopDetailField>
                    </div>
                  </div>

                  {/* ヘアーセット（登録情報①：保存対象 / 当日特別オーダーとは別state） */}
                  <div>
                    <ShopDetailLabel>ヘアーセット</ShopDetailLabel>
                    <div className="mt-1">
                      <ShopDetailField>
                        <ShopDetailSelect 
                          value={hairSet}
                          onChange={(e: any) => setHairSet(e.target.value)}
                        >
                          <option value="">指定なし</option>
                          <option value="none">不要</option>
                          <option value="need">必要</option>
                        </ShopDetailSelect>
                      </ShopDetailField>
                    </div>
                  </div>
                </div>
              </div>

              {/* 右：フォーム群 */}
              <div className="col-span-12 md:col-span-8">
                <div className="grid grid-cols-12 gap-3">
                  <div className="col-span-12">
                    <ShopDetailLabel>店舗番号</ShopDetailLabel>
                    <div className="mt-1">
                      <ShopDetailField>
                        <ShopDetailInput
                          value={shopNumber}
                          onChange={(e: any) => {
                            setShopNumber(e.target.value);
                            setShopNumberError(null);
                          }}
                          placeholder="自由入力"
                        />
                      </ShopDetailField>
                      {shopNumberError && (
                        <div className="mt-1 text-xs text-red-200 font-semibold">{shopNumberError}</div>
                      )}
                    </div>
                  </div>

                  <div className="col-span-12">
                    <ShopDetailLabel>店舗名</ShopDetailLabel>
                    <div className="mt-1">
                      <ShopDetailField>
                        <ShopDetailInput
                          value={name}
                          onChange={(e: any) => setName(e.target.value)}
                          placeholder="自由入力"
                        />
                      </ShopDetailField>
                    </div>
                  </div>

                  <div className="col-span-12">
                    <ShopDetailLabel>仮名（読み方）</ShopDetailLabel>
                    <div className="mt-1">
                      <ShopDetailField>
                        <ShopDetailInput
                          value={kana}
                          onChange={(e: any) => setKana(e.target.value)}
                          placeholder="自由入力"
                        />
                      </ShopDetailField>
                    </div>
                  </div>

                  <div className="col-span-12">
                    <ShopDetailLabel>郵便番号</ShopDetailLabel>
                    <div className="mt-1">
                      <ShopDetailField>
                        <ShopDetailInput
                          value={postalCode}
                          onChange={(e: any) => setPostalCode(e.target.value)}
                          placeholder="自由入力または住所から自動反映"
                        />
                      </ShopDetailField>
                    </div>
                  </div>

                  <div className="col-span-12">
                    <ShopDetailLabel>店住所</ShopDetailLabel>
                    <div className="mt-1">
                      <ShopDetailField>
                        <ShopDetailInput
                          value={addressLine}
                          onChange={(e: any) => setAddressLine(e.target.value)}
                          placeholder="自由入力または郵便番号から自動反映"
                        />
                      </ShopDetailField>
                    </div>
                  </div>

                  <div className="col-span-12">
                    <ShopDetailLabel>ビル名</ShopDetailLabel>
                    <div className="mt-1">
                      <ShopDetailField>
                        <ShopDetailInput
                          value={buildingName}
                          onChange={(e: any) => setBuildingName(e.target.value)}
                          placeholder="自由入力"
                        />
                      </ShopDetailField>
                    </div>
                  </div>

                  <div className="col-span-12">
                    <ShopDetailLabel>電話番号</ShopDetailLabel>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="flex-1">
                        <ShopDetailField>
                          <ShopDetailInput
                            value={phone}
                            onChange={(e: any) => setPhone(e.target.value)}
                            placeholder="自動入力"
                          />
                        </ShopDetailField>
                      </div>
                      <label className="inline-flex items-center gap-2 text-white/95 text-sm font-semibold">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={phoneChecked}
                          onChange={(e: any) => setPhoneChecked(e.target.checked)}
                        />
                        電話チェック済み
                      </label>
                    </div>
                  </div>

                  <div className="col-span-12">
                    <ShopDetailLabel>ジャンル</ShopDetailLabel>
                    <div className="mt-1">
                      <ShopDetailField>
                        <ShopDetailSelect  value={genre} onChange={(e: any) => setGenre((e.target.value || "") as ShopGenre | "")}>
                          <option value="">指定なし</option>
                          <option value="club">クラブ</option>
                          <option value="cabaret">キャバクラ</option>
                          <option value="snack">スナック</option>
                          <option value="gb">GB</option>
                        </ShopDetailSelect>
                      </ShopDetailField>
                    </div>
                  </div>

                  <div className="col-span-12">
                    <ShopDetailLabel>時給</ShopDetailLabel>
                    <div className="mt-1">
                      <ShopDetailField>
                        <ShopDetailSelect  value={hourlyRate} onChange={(e: any) => setHourlyRate(e.target.value)}>
                          <option value="">指定なし</option>
                          {wageOptions.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </ShopDetailSelect>
                      </ShopDetailField>
                    </div>
                  </div>

                  {/* 専属指名 / NG（スクショ右側＋追加ボタン風） */}
                  <div className="col-span-12">
                    <ShopDetailLabel>専属指名</ShopDetailLabel>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="flex-1">
                        <ShopDetailField>
                          <div className="text-slate-500 text-sm">
                            {fixedLoading ? "読み込み中…" : fixedCasts.length ? "女の子情報から自動追加（表示のみ）" : "登録なし"}
                          </div>
                        </ShopDetailField>
                      </div>
                      <button
                        type="button"
                        className="h-10 px-4 rounded-lg border-2 border-slate-900 bg-[#3f67b6] text-white font-semibold"
                        disabled
                        title="編集はキャスト管理ページから（現状は表示のみ）"
                      >
                        +追加
                      </button>
                    </div>
                  </div>

                  <div className="col-span-12">
                    <ShopDetailLabel>NGキャスト</ShopDetailLabel>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="flex-1">
                        <ShopDetailField>
                          <div className="text-slate-500 text-sm">
                            {ngLoadingState ? "読み込み中…" : ngCasts.length ? "女の子情報から自動追加（表示のみ）" : "登録なし"}
                          </div>
                        </ShopDetailField>
                      </div>
                      <button
                        type="button"
                        className="h-10 px-4 rounded-lg border-2 border-slate-900 bg-[#3f67b6] text-white font-semibold"
                        disabled
                        title="編集はキャスト管理ページから（現状は表示のみ）"
                      >
                        +追加
                      </button>
                    </div>
                  </div>

                  <div className="col-span-12">
                    <ShopDetailLabel>身分証</ShopDetailLabel>
                    <div className="mt-1">
                      <ShopDetailField>
                        <ShopDetailSelect 
                          value={idDocument}
                          onChange={(e: any) => setIdDocument((e.target.value || "") as ShopIdRequirement | "")}
                        >
                          <option value="">指定なし</option>
                          <option value="none">条件なし</option>
                          <option value="photo_only">顔写真</option>
                          <option value="address_only">本籍地</option>
                          <option value="both">どちらも必要</option>
                        </ShopDetailSelect>
                      </ShopDetailField>
                    </div>
                  </div>

                  <div className="col-span-12">
                    <ShopDetailLabel>飲酒希望</ShopDetailLabel>
                    <div className="mt-1">
                      <ShopDetailField>
                        <ShopDetailSelect 
                          value={drinkPreference}
                          onChange={(e: any) =>
                            setDrinkPreference((e.target.value || "") as ShopDrinkPreference | "")
                          }
                        >
                          <option value="">指定なし</option>
                          {drinkOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </ShopDetailSelect>
                      </ShopDetailField>
                    </div>
                  </div>

                  <div className="col-span-12">
                    <ShopDetailLabel>身長</ShopDetailLabel>
                    <div className="mt-1">
                      <ShopDetailField>
                        <ShopDetailSelect
                          value={heightUi}
                          onChange={(e: any) => setHeightUi(e.target.value)}
                        >
                          <option value="">指定なし</option>
                          {heightOptions.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </ShopDetailSelect>
                      </ShopDetailField>
                    </div>
                  </div>

                  <div className="col-span-12">
                    <ShopDetailLabel>体型</ShopDetailLabel>
                    <div className="mt-1">
                      <ShopDetailField>
                        <ShopDetailSelect
                          value={bodyTypeUi}
                          onChange={(e: any) => setBodyTypeUi(e.target.value)}
                        >
                          <option value="">指定なし</option>
                          {bodyTypeOptions.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </ShopDetailSelect>
                      </ShopDetailField>
                    </div>
                  </div>

                  <div className="col-span-12">
                    <ShopDetailLabel>注意点</ShopDetailLabel>
                    <div className="mt-1">
                      <ShopDetailField>
                        <ShopDetailInput
                          value={cautionUi}
                          onChange={(e: any) => setCautionUi(e.target.value)}
                          placeholder="自由入力（保存対象）"
                        />
                      </ShopDetailField>
                    </div>
                  </div>

                  <div className="col-span-12">
                    <ShopDetailLabel>担当</ShopDetailLabel>
                    <div className="mt-1">
                      <ShopDetailField>
                        <ShopDetailSelect  value={ownerStaff} onChange={(e: any) => setOwnerStaff(e.target.value)}>
                          <option value="">プルダウン</option>
                          {staffOptions.map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </ShopDetailSelect>
                      </ShopDetailField>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 flex items-center justify-end gap-6">
              <button
                onClick={save}
                className="px-10 py-3 rounded border-2 border-slate-900 bg-[#4d73c9] text-white font-bold hover:brightness-105 disabled:opacity-60"
                disabled={saving}
                type="button"
              >
                {saving ? "保存中…" : "保存"}
              </button>

              <button
                onClick={onClose}
                className="px-10 py-3 rounded border-2 border-slate-900 bg-[#4d73c9] text-white font-bold hover:brightness-105 disabled:opacity-60"
                disabled={saving}
                type="button"
              >
                終了
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
