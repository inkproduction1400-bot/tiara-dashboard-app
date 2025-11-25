// src/app/(dashboard)/shops/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  importShopsExcel,
  listShops,
  updateShop,
  type ShopListItem,
  type UpdateShopPayload,
  type ShopGenre,
  type ShopRank,
  type ShopDrinkPreference,
  type ShopIdRequirement,
  type ShopPreferredAgeRange,
  // ★ 専属指名 / NGキャスト用 API
  listShopFixedCasts,
  listShopNgCasts,
  upsertShopFixedCast,
  deleteShopFixedCast,
  upsertShopNgCast,
  deleteShopNgCast,
  type ShopFixedCastItem,
  type ShopNgCastItem,
} from "@/lib/api.shops";

type PerPage = number | "all";

// フロント側で削除フラグ・新規フラグを持たせるための拡張型
type FixedRow = ShopFixedCastItem & {
  _deleted?: boolean;
  _isNew?: boolean;
};

type NgRow = ShopNgCastItem & {
  _deleted?: boolean;
  _isNew?: boolean;
};

export default function ShopsPage() {
  const [items, setItems] = useState<ShopListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [shopNumber, setShopNumber] = useState("");
  const [limit, setLimit] = useState<PerPage>(20);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<ShopListItem | null>(null);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement | null>(null);

  // 店舗番号でのフロント側フィルタ
  const filteredItems = useMemo(() => {
    const num = shopNumber.trim();
    if (!num) return items;
    return items.filter((item) => {
      if (!item.shopNumber) return false;
      return item.shopNumber.includes(num);
    });
  }, [items, shopNumber]);

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

  // API からは「q だけ」で全件を取得 → ページングはフロント側
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listShops({
        q: q.trim() || undefined,
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
  }, [q]);

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

  const startIndex = filteredItems.length === 0 ? 0 : offset + 1;
  const endIndex =
    limit === "all"
      ? filteredItems.length
      : Math.min(offset + perPage, filteredItems.length);

  return (
    <div className="p-4 space-y-4">
      <header className="flex flex-col md:flex-row md:items-center gap-3 justify-between">
        <h1 className="text-2xl font-semibold">店舗一覧</h1>
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex items-center px-3 py-2 rounded-xl bg-slate-700 text-white cursor-pointer">
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
          <Link
            href="/shops/new"
            className="px-4 py-2 rounded-xl bg-blue-600 text-white"
          >
            新規店舗登録
          </Link>
        </div>
      </header>

      {/* 検索まわり：キーワード ＋ 店舗番号 */}
      <div className="flex flex-col md:flex-row md:items-center gap-2 justify-between">
        <div className="flex flex-1 flex-col sm:flex-row gap-2">
          <input
            id="shopSearch"
            name="q"
            value={q}
            onChange={(e) => {
              setOffset(0);
              setQ(e.target.value);
            }}
            placeholder="店舗名・市区町村・キーワードで検索"
            className="w-full sm:w-72 px-3 py-2 rounded-xl bg-slate-800 text-white placeholder-slate-400"
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
            className="w-full sm:w-40 px-3 py-2 rounded-xl bg-slate-800 text-white placeholder-slate-400"
          />
        </div>

        {/* 1ページあたり件数 + 全件表示 */}
        <div className="flex items-center gap-2">
          <label htmlFor="perPage" className="text-sm text-slate-400">
            表示件数
          </label>
          <select
            id="perPage"
            name="perPage"
            value={limit === "all" ? "all" : String(limit)}
            onChange={(e) => {
              setOffset(0);
              const v = e.target.value;
              if (v === "all") {
                setLimit("all");
              } else {
                const n = Number(v);
                setLimit(Number.isFinite(n) && n > 0 ? n : 20);
              }
            }}
            className="px-2 py-2 rounded-xl bg-slate-800 text-white"
          >
            {[10, 20, 50, 100, 150, 200].map((n) => (
              <option key={n} value={n}>
                {n}/page
              </option>
            ))}
            <option value="all">全件表示</option>
          </select>
        </div>
      </div>

      {message && (
        <div className="text-sm text-slate-300 bg-slate-800/60 px-3 py-2 rounded-xl">
          {message}
        </div>
      )}

      {/* 一覧 + ページング */}
      <div className="bg-slate-900 rounded-xl overflow-hidden border border-slate-700/60">
        <div className="flex items-center justify-between px-4 py-2 text-sm text-slate-300 bg-slate-800/60">
          <div>
            全 {filteredItems.length} 件中{" "}
            {startIndex === 0 ? 0 : startIndex} - {endIndex} 件を表示
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setOffset((prev) => Math.max(0, prev - perPage))}
              className="px-2 py-1 rounded-lg border border-slate-600 text-xs disabled:opacity-40"
            >
              前へ
            </button>
            <span>
              {page} / {maxPage}
            </span>
            <button
              type="button"
              disabled={page >= maxPage}
              onClick={() =>
                setOffset((prev) =>
                  Math.min(
                    prev + perPage,
                    Math.max(0, perPage * (maxPage - 1)),
                  ),
                )
              }
              className="px-2 py-1 rounded-lg border border-slate-600 text-xs disabled:opacity-40"
            >
              次へ
            </button>
          </div>
        </div>

        <table className="w-full text-sm">
          <thead className="bg-slate-800/80 text-slate-300">
            <tr>
              <th className="p-3 text-left font-medium w-32">店舗番号</th>
              <th className="p-3 text-left font-medium">店舗名</th>
              <th className="p-3 text-left font-medium w-40">ジャンル</th>
              <th className="p-3 text-left font-medium w-40">電話</th>
              <th className="p-3 text-left font-medium w-56">最終更新</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="p-6 text-center text-slate-400">
                  読み込み中…
                </td>
              </tr>
            ) : pagedItems.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-6 text-center text-slate-400">
                  該当データがありません
                </td>
              </tr>
            ) : (
              pagedItems.map((r) => (
                <tr
                  key={r.id}
                  className="odd:bg-slate-900 even:bg-slate-900/60 hover:bg-slate-700/40 cursor-pointer"
                  onClick={() => setEditing(r)}
                >
                  <td className="p-3 font-mono">{r.shopNumber ?? "-"}</td>

                  {/* ★ 店舗名 + 開発用 shopId 表示 */}
                  <td className="p-3">
                    <div className="flex flex-col">
                      <span>{r.name}</span>
                      <span className="mt-0.5 text-[10px] text-slate-400 font-mono">
                        dev shopId: {r.id}
                      </span>
                    </div>
                  </td>

                  <td className="p-3">{r.genre ?? "-"}</td>
                  <td className="p-3">{r.phone ?? "-"}</td>
                  <td className="p-3 text-slate-400">
                    {r.updatedAt
                      ? new Date(r.updatedAt).toLocaleString()
                      : "-"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <ShopEditDrawer
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            await reload();
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

type ShopEditDrawerProps = {
  initial: ShopListItem;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
};

function ShopEditDrawer({
  initial,
  onClose,
  onSaved,
}: ShopEditDrawerProps) {
  // ---- 必須 1〜8項目＋追加項目の state ----
  const [shopNumber, setShopNumber] = useState(initial.shopNumber ?? ""); // ①店舗番号
  const [name, setName] = useState(initial.name); // ②店名

  // API から来ている nameKana / kana を初期表示
  const [kana, setKana] = useState(
    initial.nameKana ?? initial.kana ?? "",
  ); // ③カナ

  const [rank, setRank] = useState<ShopRank | "">(initial.rank ?? ""); // ④ランク

  const [addressLine, setAddressLine] = useState(initial.addressLine ?? ""); // ⑤店住所
  const [buildingName, setBuildingName] = useState(
    initial.buildingName ?? "",
  ); // ⑥ビル名

  const [hourlyRate, setHourlyRate] = useState(initial.wageLabel ?? ""); // ⑦時給カテゴリ
  const [phone, setPhone] = useState(initial.phone ?? ""); // ⑧電話
  const [phoneChecked, setPhoneChecked] = useState<boolean>(false); // 電話チェック（現状はUIのみ）

  // 既存項目：ジャンル
  const [genre, setGenre] = useState<ShopGenre | "">(initial.genre ?? "");

  // ★ 専属指名キャスト / NGキャスト（API 連動）
  const [fixedCasts, setFixedCasts] = useState<FixedRow[]>([]);
  const [ngCasts, setNgCasts] = useState<NgRow[]>([]);
  const [fixedLoading, setFixedLoading] = useState(false);
  const [ngLoadingState, setNgLoadingState] = useState(false);

  // 追加用入力欄
  const [fixedInputCastId, setFixedInputCastId] = useState("");
  const [fixedInputNote, setFixedInputNote] = useState("");
  const [ngInputCastId, setNgInputCastId] = useState("");
  const [ngInputReason, setNgInputReason] = useState("");

  // 新規：飲酒の希望 / 身分証 / 希望年齢 / 担当
  const [drinkPreference, setDrinkPreference] = useState<
    ShopDrinkPreference | ""
  >(initial.drinkPreference ?? "");
  const [idDocument, setIdDocument] = useState<ShopIdRequirement | "">(
    initial.idDocumentRequirement ?? "",
  );
  const [preferredAge, setPreferredAge] = useState<
    ShopPreferredAgeRange | ""
  >(initial.preferredAgeRange ?? "");
  const [ownerStaff, setOwnerStaff] = useState<string>("");

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [shopNumberError, setShopNumberError] = useState<string | null>(null);

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

  // ---- 専属 / NG 初期ロード ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setFixedLoading(true);
        setNgLoadingState(true);
        const [fixed, ng] = await Promise.all([
          listShopFixedCasts(initial.id),
          listShopNgCasts(initial.id),
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
        console.error("[ShopEditDrawer] failed to load casts", e);
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
  }, [initial.id]);

  // ---- 専属 / NG の local 操作 ----

  const addFixedLocal = () => {
    const castId = fixedInputCastId.trim();
    if (!castId) return;

    setFixedCasts((prev) => {
      const existing = prev.find((r) => r.castId === castId);
      if (existing) {
        return prev.map((r) =>
          r.castId === castId
            ? {
                ...r,
                note: fixedInputNote.trim() || null,
                _deleted: false,
              }
            : r,
        );
      }
      const now = new Date().toISOString();
      return [
        ...prev,
        {
          id: `temp-fixed-${castId}`,
          shopId: initial.id,
          castId,
          note: fixedInputNote.trim() || null,
          createdAt: now,
          cast: {
            userId: castId,
            displayName: null,
            managementNumber: null,
            castCode: null,
          },
          _deleted: false,
          _isNew: true,
        },
      ];
    });

    setFixedInputCastId("");
    setFixedInputNote("");
  };

  const toggleDeleteFixed = (castId: string) => {
    setFixedCasts((prev) =>
      prev.map((r) =>
        r.castId === castId ? { ...r, _deleted: !r._deleted } : r,
      ),
    );
  };

  const addNgLocal = () => {
    const castId = ngInputCastId.trim();
    if (!castId) return;

    setNgCasts((prev) => {
      const existing = prev.find((r) => r.castId === castId);
      if (existing) {
        return prev.map((r) =>
          r.castId === castId
            ? {
                ...r,
                reason: ngInputReason.trim() || null,
                _deleted: false,
              }
            : r,
        );
      }
      const now = new Date().toISOString();
      return [
        ...prev,
        {
          id: `temp-ng-${castId}`,
          shopId: initial.id,
          castId,
          reason: ngInputReason.trim() || null,
          source: "manual",
          createdAt: now,
          cast: {
            userId: castId,
            displayName: null,
            managementNumber: null,
            castCode: null,
          },
          _deleted: false,
          _isNew: true,
        },
      ];
    });

    setNgInputCastId("");
    setNgInputReason("");
  };

  const toggleDeleteNg = (castId: string) => {
    setNgCasts((prev) =>
      prev.map((r) =>
        r.castId === castId ? { ...r, _deleted: !r._deleted } : r,
      ),
    );
  };

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

    const payload: UpdateShopPayload = {
      name: name.trim(),
      addressLine: addressLine.trim(),
      phone: phone.trim(),
    };

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

    // 飲酒の希望
    payload.drinkPreference = drinkPreference
      ? (drinkPreference as ShopDrinkPreference)
      : null;

    // 身分証
    payload.idDocumentRequirement = idDocument
      ? (idDocument as ShopIdRequirement)
      : null;

    // 希望年齢
    payload.preferredAgeRange = preferredAge
      ? (preferredAge as ShopPreferredAgeRange)
      : null;

    try {
      // 1. 店舗本体の更新
      await updateShop(initial.id, payload);

      // 2. 専属キャストの同期
      const fixedToDelete = fixedCasts.filter(
        (r) => r._deleted && !r._isNew,
      );
      const fixedToUpsert = fixedCasts.filter((r) => !r._deleted);

      await Promise.all([
        ...fixedToDelete.map((r) =>
          deleteShopFixedCast(initial.id, r.castId),
        ),
        ...fixedToUpsert.map((r) =>
          upsertShopFixedCast(initial.id, {
            castId: r.castId,
            note: r.note ?? undefined,
          }),
        ),
      ]);

      // 3. NGキャストの同期
      const ngToDelete = ngCasts.filter((r) => r._deleted && !r._isNew);
      const ngToUpsert = ngCasts.filter((r) => !r._deleted);

      await Promise.all([
        ...ngToDelete.map((r) =>
          deleteShopNgCast(initial.id, r.castId),
        ),
        ...ngToUpsert.map((r) =>
          upsertShopNgCast(initial.id, {
            castId: r.castId,
            reason: r.reason ?? undefined,
            source: r.source ?? "manual",
          }),
        ),
      ]);

      await onSaved();
    } catch (e: any) {
      setErr(e?.message ?? "更新に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-3xl bg-slate-900 shadow-2xl p-6 overflow-y-auto">
        <h2 className="text-xl font-semibold mb-4">店舗編集</h2>

        <div className="space-y-6 text-sm">
          {/* 基本情報 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 店舗番号 */}
            <label className="block">
              <div className="flex items-center justify-between mb-1">
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

            {/* ジャンル */}
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
                <option value="club">club</option>
                <option value="cabaret">cabaret</option>
                <option value="snack">snack</option>
                <option value="gb">gb</option>
              </select>
            </label>
          </div>

          {/* キャスト関連 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 専属指名キャスト */}
            <div className="space-y-2">
              <div className="text-sm text-slate-300 mb-1">
                専属指名キャスト
              </div>

              {/* 既存一覧 */}
              <div className="rounded-xl border border-slate-700/60 bg-slate-800/40 p-2 max-h-48 overflow-y-auto text-xs">
                {fixedLoading ? (
                  <div className="text-slate-400">読み込み中…</div>
                ) : fixedCasts.length === 0 ? (
                  <div className="text-slate-500">登録なし</div>
                ) : (
                  <ul className="space-y-1">
                    {fixedCasts.map((row) => {
                      const label =
                        row.cast.managementNumber ||
                        row.cast.castCode ||
                        row.cast.displayName ||
                        row.cast.userId;
                      return (
                        <li
                          key={row.castId}
                          className={`flex items-center justify-between gap-2 ${
                            row._deleted ? "opacity-50 line-through" : ""
                          }`}
                        >
                          <div className="flex-1">
                            <div className="text-slate-200">
                              {label ?? "(未設定)"}
                            </div>
                            <div className="text-slate-400">
                              castId:{" "}
                              <span className="font-mono">
                                {row.castId}
                              </span>
                              {row.note && (
                                <>
                                  {" "}
                                  / メモ:{" "}
                                  <span className="whitespace-pre-wrap">
                                    {row.note}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleDeleteFixed(row.castId)}
                            className="px-2 py-1 text-[11px] rounded-lg border border-slate-600 text-slate-100"
                          >
                            {row._deleted ? "削除取消" : "削除"}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* 追加フォーム（管理番号ベースの説明に変更） */}
              <div className="space-y-1">
                <div className="text-[11px] text-slate-400">
                  追加したいキャストの
                  <span className="font-semibold">管理番号（4〜5桁の数字）</span>
                  を入力して「リストに追加」を押してください。
                </div>
                <input
                  value={fixedInputCastId}
                  onChange={(e) => setFixedInputCastId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 text-white font-mono text-xs"
                  placeholder="例: 0001, 0234, 1203 など"
                />
                <input
                  value={fixedInputNote}
                  onChange={(e) => setFixedInputNote(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 text-white text-xs"
                  placeholder="メモ（任意）例: 週1で固定勤務"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  入力された管理番号をもとに、将来的にキャスト検索 →
                  専属登録する想定です（現状はID文字列を直接保存）。
                </p>
                <button
                  type="button"
                  onClick={addFixedLocal}
                  className="mt-1 px-3 py-1 rounded-lg bg-slate-700 text-xs text-white disabled:opacity-40"
                  disabled={saving}
                >
                  リストに追加
                </button>
              </div>
            </div>

            {/* NGキャスト */}
            <div className="space-y-2">
              <div className="text-sm text-slate-300 mb-1">NGキャスト</div>

              {/* 既存一覧 */}
              <div className="rounded-xl border border-slate-700/60 bg-slate-800/40 p-2 max-h-48 overflow-y-auto text-xs">
                {ngLoadingState ? (
                  <div className="text-slate-400">読み込み中…</div>
                ) : ngCasts.length === 0 ? (
                  <div className="text-slate-500">登録なし</div>
                ) : (
                  <ul className="space-y-1">
                    {ngCasts.map((row) => {
                      const label =
                        row.cast.managementNumber ||
                        row.cast.castCode ||
                        row.cast.displayName ||
                        row.cast.userId;
                      return (
                        <li
                          key={row.castId}
                          className={`flex items-center justify-between gap-2 ${
                            row._deleted ? "opacity-50 line-through" : ""
                          }`}
                        >
                          <div className="flex-1">
                            <div className="text-slate-200">
                              {label ?? "(未設定)"}
                            </div>
                            <div className="text-slate-400">
                              castId:{" "}
                              <span className="font-mono">
                                {row.castId}
                              </span>
                              {row.reason && (
                                <>
                                  {" "}
                                  / 理由:{" "}
                                  <span className="whitespace-pre-wrap">
                                    {row.reason}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleDeleteNg(row.castId)}
                            className="px-2 py-1 text-[11px] rounded-lg border border-slate-600 text-slate-100"
                          >
                            {row._deleted ? "削除取消" : "削除"}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* 追加フォーム（管理番号ベースの説明に変更） */}
              <div className="space-y-1">
                <div className="text-[11px] text-slate-400">
                  追加したい NGキャストの
                  <span className="font-semibold">管理番号（4〜5桁の数字）</span>
                  を入力し、必要に応じて理由を入力して「リストに追加」を押してください。
                </div>
                <input
                  value={ngInputCastId}
                  onChange={(e) => setNgInputCastId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 text-white font-mono text-xs"
                  placeholder="例: 0001, 0234, 1203 など"
                />
                <input
                  value={ngInputReason}
                  onChange={(e) => setNgInputReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 text-white text-xs"
                  placeholder="NG理由（任意）例: トラブル歴あり"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  入力された管理番号をもとに、将来的にキャスト検索 →
                  NG登録する想定です（現状はID文字列を直接保存）。
                </p>
                <button
                  type="button"
                  onClick={addNgLocal}
                  className="mt-1 px-3 py-1 rounded-lg bg-slate-700 text-xs text-white disabled:opacity-40"
                  disabled={saving}
                >
                  リストに追加
                </button>
              </div>
            </div>
          </div>

          {/* 条件系：飲酒・身分証・年齢・担当 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 飲酒の希望 */}
            <label className="block">
              <div className="text-sm text-slate-300 mb-1">飲酒の希望</div>
              <select
                value={drinkPreference}
                onChange={(e) =>
                  setDrinkPreference(
                    (e.target.value || "") as ShopDrinkPreference | "",
                  )
                }
                className="w-full px-3 py-2 rounded-xl bg-slate-800 text-white"
              >
                <option value="">（未設定）</option>
                <option value="none">飲めない</option>
                <option value="weak">弱い</option>
                <option value="normal">普通</option>
                <option value="strong">強い</option>
              </select>
            </label>

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

            {/* 希望年齢 */}
            <label className="block">
              <div className="text-sm text-slate-300 mb-1">希望年齢</div>
              <select
                value={preferredAge}
                onChange={(e) =>
                  setPreferredAge(
                    (e.target.value || "") as ShopPreferredAgeRange | "",
                  )
                }
                className="w-full px-3 py-2 rounded-xl bg-slate-800 text-white"
              >
                <option value="">（未設定）</option>
                <option value="age_18_19">18〜19</option>
                <option value="age_20_24">20〜24</option>
                <option value="age_25_29">25〜29</option>
                <option value="age_30_34">30〜34</option>
                <option value="age_35_39">35〜39</option>
                <option value="age_40_49">40〜49</option>
                <option value="age_50_plus">50歳以上</option>
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
  );
}
