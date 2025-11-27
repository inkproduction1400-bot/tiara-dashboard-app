// src/app/(dashboard)/shops/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  importShopsExcel,
  listShops,
  updateShop,
  getShop,
  type ShopListItem,
  type ShopGenre,
  type ShopRank,
  type ShopIdRequirement,
  type ShopFixedCastItem,
  type ShopNgCastItem,
  type ShopDetail,
  // ★ 専属指名 / NGキャスト用 API（表示専用）
  listShopFixedCasts,
  listShopNgCasts,
} from "@/lib/api.shops";

type PerPage = number | "all";

// フロント側で削除フラグ・新規フラグを持たせるための拡張型（今回は表示のみだが型はそのまま）
type FixedRow = ShopFixedCastItem & {
  _deleted?: boolean;
  _isNew?: boolean;
};

type NgRow = ShopNgCastItem & {
  _deleted?: boolean;
  _isNew?: boolean;
};

// ジャンル表示用ラベル
const GENRE_LABELS: Record<string, string> = {
  club: "クラブ",
  cabaret: "キャバ",
  snack: "スナック",
  gb: "ガルバ",
};

function getGenreLabel(genre?: ShopGenre | null): string {
  if (!genre) return "-";
  return GENRE_LABELS[genre] ?? genre;
}

export default function ShopsPage() {
  const [items, setItems] = useState<ShopListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [shopNumber, setShopNumber] = useState("");
  const [limit, setLimit] = useState<PerPage>(20);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // ★ ジャンルフィルタ & 並び替えモード
  const [genreFilter, setGenreFilter] = useState<ShopGenre | "">("");
  const [sortMode, setSortMode] = useState<"kana" | "number" | "favorite">(
    "kana",
  );

  const fileRef = useRef<HTMLInputElement | null>(null);

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

    // 並び替え
    const sorted = [...arr];
    sorted.sort((a, b) => {
      if (sortMode === "kana") {
        const ak = (a.nameKana ?? a.kana ?? a.name ?? "").toString();
        const bk = (b.nameKana ?? b.kana ?? b.name ?? "").toString();
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
  }, [items, shopNumber, genreFilter, sortMode]);

  const perPage = useMemo(() => {
    if (limit === "all") {
      return Math.max(filteredItems.length || 1, 1);
    }
    return limit;
  }, [limit, filteredItems.length]);

  const page = useMemo(
    () => Math.floor(offset / perPage) + 1,
    [offset, perPage],
  );

  const maxPage = useMemo(
    () =>
      Math.max(
        1,
        Math.ceil(filteredItems.length / Math.max(1, perPage)),
      ),
    [filteredItems.length, perPage],
  );

  const pagedItems = useMemo(() => {
    if (filteredItems.length === 0) return [];
    if (limit === "all") return filteredItems;
    return filteredItems.slice(offset, offset + perPage);
  }, [filteredItems, offset, perPage, limit]);

  // offset が範囲外になった場合に自動補正
  useEffect(() => {
    const maxOffset =
      perPage === 0
        ? 0
        : Math.max(0, perPage * (maxPage - 1));
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

  const onUpload = useCallback(
    async (file: File | null) => {
      if (!file) return;
      setImporting(true);
      setMessage(null);
      try {
        const res = await importShopsExcel(file);
        setMessage(
          `取り込み完了: total ${res.total} / created ${res.created} / updated ${res.updated} / skipped ${res.skipped}`,
        );
        await reload();
      } catch (e: any) {
        setMessage(e?.message ?? "Import failed");
      } finally {
        setImporting(false);
        if (fileRef.current) fileRef.current.value = "";
      }
    },
    [reload],
  );

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
      setShopDetailError(
        e?.message ?? "店舗詳細の取得に失敗しました",
      );
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

  return (
    <div className="space-y-4">
      <header className="flex flex-col md:flex-row md:items-center gap-3 justify-between">
        <h1 className="text-2xl font-semibold text-ink">店舗一覧</h1>
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex items-center tiara-btn cursor-pointer">
            <input
              ref={fileRef}
              id="excelInput"
              name="excelInput"
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => onUpload(e.target.files?.[0] ?? null)}
              disabled={importing}
            />
            {importing ? "アップロード中…" : "Excel一括アップロード"}
          </label>
          <Link href="/shops/new" className="tiara-btn">
            新規店舗登録
          </Link>
        </div>
      </header>

      {/* 検索まわり：キーワード ＋ 店舗番号 ＋ ジャンル絞り込み ＋ 並び替え ＋ 表示件数 */}
      <div className="flex flex-col gap-3">
        {/* 上段: キーワード / 店舗番号 */}
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
            className="tiara-input w-full sm:w-72"
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
            className="tiara-input w-full sm:w-40"
          />
        </div>

        {/* 下段: ジャンル + 並び替え + 表示件数（横一列で並べる） */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-1">
            <span className="text-muted whitespace-nowrap">ジャンル</span>
            <select
              value={genreFilter}
              onChange={(e) => {
                setOffset(0);
                setGenreFilter(
                  (e.target.value || "") as ShopGenre | "",
                );
              }}
              className="tiara-input h-9 min-w-[140px] text-[11px]"
            >
              <option value="">すべて</option>
              <option value="club">クラブ</option>
              <option value="cabaret">キャバ</option>
              <option value="snack">スナック</option>
              <option value="gb">ガルバ</option>
            </select>
          </div>

          <div className="flex items-center gap-1">
            <span className="text-muted whitespace-nowrap">並び替え</span>
            <select
              value={sortMode}
              onChange={(e) => {
                setOffset(0);
                setSortMode(
                  e.target.value as "kana" | "number" | "favorite",
                );
              }}
              className="tiara-input h-9 min-w-[160px] text-[11px]"
            >
              <option value="kana">50音順</option>
              <option value="number">店舗番号順</option>
              <option value="favorite">よく使う店舗順</option>
            </select>
          </div>

          {/* 並び替えのすぐ右隣に表示件数コントロール */}
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
            <span className="font-semibold text-ink">
              {filteredItems.length}
            </span>{" "}
            件（全 {total} 件中）
          </span>
        </div>
      </div>

      {message && (
        <div className="text-[11px] px-3 py-2 rounded-full border border-amber-200 bg-amber-50 text-amber-800">
          {message}
        </div>
      )}

      {/* 一覧 + ページング（上・下） */}
      <section className="tiara-panel flex-1 p-3 flex flex-col overflow-hidden">
        <PaginationBar
          page={page}
          maxPage={maxPage}
          perPage={perPage}
          total={filteredItems.length}
          onPrev={() =>
            setOffset((prev) => Math.max(0, prev - perPage))
          }
          onNext={() =>
            setOffset((prev) =>
              Math.min(
                prev + perPage,
                Math.max(0, perPage * (maxPage - 1)),
              ),
            )
          }
        />

        {/* 店舗カード グリッドレイアウト（md:2列 / xl:4列） */}
        <div className="flex-1 overflow-auto rounded-xl border border-white/10 bg-white/5 p-3">
          {loading ? (
            <div className="h-full flex items-center justify-center text-[11px] text-muted">
              読み込み中…
            </div>
          ) : pagedItems.length === 0 ? (
            <div className="h-full flex items-center justify-center text-[11px] text-muted">
              該当データがありません
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              {pagedItems.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="text-left rounded-xl border border-slate-200 bg-white/90 hover:border-sky-400 hover:shadow-md transition-colors px-3 py-2"
                  onClick={() => handleOpenShop(r)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-[11px] text-muted">
                        店舗番号
                      </div>
                      <div className="font-mono text-sm text-slate-900">
                        {r.shopNumber ?? "-"}
                      </div>
                    </div>
                    <div className="text-right text-[10px] text-slate-500">
                      最終更新
                      <br />
                      {r.updatedAt
                        ? new Date(r.updatedAt).toLocaleString()
                        : "-"}
                    </div>
                  </div>

                  <div className="mt-1">
                    <div className="text-sm font-semibold text-slate-900 line-clamp-1">
                      {r.name}
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-600">
                      {getGenreLabel(r.genre ?? null)} /{" "}
                      {r.phone ?? "-"}
                    </div>
                    {/* dev shopId 表示は削除 */}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 下部にもページングバーを複製 */}
        <PaginationBar
          page={page}
          maxPage={maxPage}
          perPage={perPage}
          total={filteredItems.length}
          onPrev={() =>
            setOffset((prev) => Math.max(0, prev - perPage))
          }
          onNext={() =>
            setOffset((prev) =>
              Math.min(
                prev + perPage,
                Math.max(0, perPage * (maxPage - 1)),
              ),
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
                item.id === updated.id
                  ? { ...item, ...updated }
                  : item,
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
  const endIndex =
    total === 0 ? 0 : Math.min(page * perPage, total);

  return (
    <div
      className={`flex items-center justify-between px-4 py-2 text-[11px] text-muted bg-white/10 ${
        bottom ? "border-t border-white/10" : "border-b border-white/10"
      }`}
    >
      <div>
        全 {total} 件中 {startIndex === 0 ? 0 : startIndex} - {endIndex}
        件を表示
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
        <span className="text-[11px]">
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

function DisplayCountControl({
  limit,
  total,
  onChange,
}: DisplayCountControlProps) {
  const options: (number | "all")[] = [10, 20, 50, 100, 150, 200, "all"];

  const isActive = (opt: number | "all") =>
    (opt === "all" && limit === "all") ||
    (typeof opt === "number" && limit !== "all" && limit === opt);

  return (
    <div className="flex items-center gap-1 text-xs">
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
      <span className="text-[10px] text-muted">（全{total}件）</span>
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
  const [shopNumber, setShopNumber] = useState<string>(
    shop?.shopNumber ?? "",
  ); // ①店舗番号
  const [name, setName] = useState<string>(shop?.name ?? ""); // ②店名

  // API から来ている nameKana / kana を初期表示
  const [kana, setKana] = useState<string>(
    (shop as ShopDetail).nameKana ?? (shop as any).kana ?? "",
  ); // ③カナ

  const [rank, setRank] = useState<ShopRank | "">(
    (shop?.rank as ShopRank | null) ?? "",
  ); // ④ランク

  const [addressLine, setAddressLine] = useState<string>(
    shop?.addressLine ?? "",
  ); // ⑤店住所
  const [buildingName, setBuildingName] = useState<string>(
    shop?.buildingName ?? "",
  ); // ⑥ビル名

  const [hourlyRate, setHourlyRate] = useState<string>(
    (shop as ShopDetail).wageLabel ?? "",
  ); // ⑦時給カテゴリ
  const [phone, setPhone] = useState<string>(shop?.phone ?? ""); // ⑧電話
  const [phoneChecked, setPhoneChecked] = useState<boolean>(false); // 電話チェック（現状はUIのみ）

  // 既存項目：ジャンル
  const [genre, setGenre] = useState<ShopGenre | "">(
    (shop?.genre as ShopGenre | null) ?? "",
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
  const [ownerStaff, setOwnerStaff] = useState<string>("");

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [shopNumberError, setShopNumberError] =
    useState<string | null>(null);

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
      setShopNumberError(
        "店舗番号は3〜4桁の半角数字で入力してください（例: 001, 0701）",
      );
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

    // 時給
    payload.wageLabel = hourlyRate.trim() ? hourlyRate.trim() : null;

    // 身分証
    payload.idDocumentRequirement = idDocument
      ? (idDocument as ShopIdRequirement)
      : null;

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
            <h2 className="text-xl font-semibold text-ink">
              店舗詳細・編集
            </h2>
            {loading && (
              <span className="text-[11px] text-slate-400">
                詳細を読み込み中…
              </span>
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
                <div className="flex itemsセンター justify-between mb-1">
                  <span className="text-slate-300 text-sm">店舗番号</span>
                  <span className="text-[11px] text-slate-500">
                    3〜4桁の半角数字
                  </span>
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
                  <div className="mt-1 text-xs text-red-400">
                    {shopNumberError}
                  </div>
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
                <div className="text-sm text-slate-300 mb-1">
                  カナ（読み方）
                </div>
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
                  onChange={(e) =>
                    setRank((e.target.value || "") as ShopRank | "")
                  }
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
                  onChange={(e) =>
                    setGenre((e.target.value || "") as ShopGenre | "")
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 text-white"
                >
                  <option value="">（未設定）</option>
                  <option value="club">クラブ</option>
                  <option value="cabaret">キャバ</option>
                  <option value="snack">スナック</option>
                  <option value="gb">ガルバ</option>
                </select>
              </label>
            </div>

            {/* キャスト関連（専属 / NG：表示のみ） */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 専属指名キャスト */}
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-sm text-slate-300">
                    専属指名キャスト
                  </div>
                  <div className="text-[11px] text-slate-500">
                    （編集はキャスト管理ページから）
                  </div>
                </div>

                <div className="rounded-xl border border-slate-700/60 bg-slate-800/40 p-2 max-h-56 overflow-y-auto text-xs">
                  {fixedLoading ? (
                    <div className="text-slate-400">読み込み中…</div>
                  ) : fixedCasts.length === 0 ? (
                    <div className="text-slate-500">登録なし</div>
                  ) : (
                    <ul className="space-y-2">
                      {fixedCasts.map((row) => {
                        const labelName =
                          row.cast.displayName || "(名前未登録)";
                        const mng =
                          row.cast.managementNumber ||
                          row.cast.castCode ||
                          "-";
                        return (
                          <li
                            key={row.castId}
                            className="flex items-start gap-2 rounded-lg px-2 py-1 bg-slate-900/60"
                          >
                            <div className="w-20">
                              <div className="text-[10px] text-slate-400">
                                管理番号
                              </div>
                              <div className="font-mono text-xs text-slate-50">
                                {mng}
                              </div>
                            </div>
                            <div className="flex-1">
                              <div className="text-xs text-slate-50">
                                {labelName}
                              </div>
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
                  <div className="text-[11px] text-slate-500">
                    （編集はキャスト管理ページから）
                  </div>
                </div>

                <div className="rounded-xl border border-slate-700/60 bg-slate-800/40 p-2 max-h-56 overflow-y-auto text-xs">
                  {ngLoadingState ? (
                    <div className="text-slate-400">読み込み中…</div>
                  ) : ngCasts.length === 0 ? (
                    <div className="text-slate-500">登録なし</div>
                  ) : (
                    <ul className="space-y-2">
                      {ngCasts.map((row) => {
                        const labelName =
                          row.cast.displayName || "(名前未登録)";
                        const mng =
                          row.cast.managementNumber ||
                          row.cast.castCode ||
                          "-";
                        return (
                          <li
                            key={row.castId}
                            className="flex items-start gap-2 rounded-lg px-2 py-1 bg-slate-900/60"
                          >
                            <div className="w-20">
                              <div className="text-[10px] text-slate-400">
                                管理番号
                              </div>
                              <div className="font-mono text-xs text-slate-50">
                                {mng}
                              </div>
                            </div>
                            <div className="flex-1">
                              <div className="text-xs text-slate-50">
                                {labelName}
                              </div>
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

            {/* 条件系：身分証・担当（飲酒・希望年齢は削除） */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 身分証 */}
              <label className="block">
                <div className="text-sm text-slate-300 mb-1">身分証</div>
                <select
                  value={idDocument}
                  onChange={(e) =>
                    setIdDocument(
                      (e.target.value || "") as ShopIdRequirement | "",
                    )
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 text-white"
                >
                  <option value="">（未設定）</option>
                  <option value="none">条件なし</option>
                  <option value="photo_only">顔写真付きのみ</option>
                  <option value="address_only">住所系のみ</option>
                  <option value="both">どちらも必要</option>
                </select>
              </label>

              {/* 担当（今はUIのみ） */}
              <label className="block">
                <div className="text-sm text-slate-300 mb-1">担当</div>
                <input
                  value={ownerStaff}
                  onChange={(e) => setOwnerStaff(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 text-white"
                  placeholder="ログインできるスタッフ名を入力"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  将来的にスタッフマスタからのドロップダウンに差し替え予定。
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
