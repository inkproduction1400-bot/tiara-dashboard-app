// src/app/(dashboard)/shops/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  importShopsExcel,
  listShops,
  updateShop,
  type ShopListItem,
} from "@/lib/api.shops";

type PerPage = number | "all";

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
            全 {total} 件中{" "}
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
                  <td className="p-3">{r.name}</td>
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
  // ---- 必須8項目の state ----
  const [shopNumber, setShopNumber] = useState(initial.shopNumber ?? ""); // ①店舗番号
  const [name, setName] = useState(initial.name);                         // ②店名
  const [nameKana, setNameKana] = useState("");                           // ③カナ（API未連携）
  const [rank, setRank] = useState("");                                   // ④ランク（API未連携）
  const [shopAddress, setShopAddress] = useState(initial.addressLine ?? ""); // ⑤店住所（addressLineにマップ）
  const [buildingName, setBuildingName] = useState("");                   // ⑥ビル名（API未連携）
  const [wageRange, setWageRange] = useState("");                         // ⑦時給レンジ（API未連携）
  const [phone, setPhone] = useState(initial.phone ?? "");                // ⑧電話
  const [phoneChecked, setPhoneChecked] = useState(false);                // 電話チェック（API未連携）

  // 既存項目：ジャンル
  const [genre, setGenre] = useState(initial.genre ?? "");

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [shopNumberError, setShopNumberError] = useState<string | null>(null);

  // 時給ドロップダウンの選択肢
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

    // updateShop の型に合わせて、null は使わず string のみ
    const payload: Partial<{
      name: string;
      shopNumber: string;
      addressLine: string;
      phone: string;
      genre: string;
    }> = {
      name: name.trim(),
      phone: phone.trim(),
      addressLine: shopAddress.trim(),
    };

    if (trimmedNumber) {
      payload.shopNumber = trimmedNumber;
    }
    if (genre.trim()) {
      payload.genre = genre.trim();
    }

    try {
      await updateShop(initial.id, payload);
      // カナ / ランク / ビル名 / 時給 / 電話チェックは
      // 現時点では API 側に項目が無いため保存対象外（UI先行）。
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
      <div className="absolute right-0 top-0 h-full w-full max-w-lg bg-slate-900 shadow-2xl p-6 overflow-y-auto">
        <h2 className="text-xl font-semibold mb-4">店舗編集</h2>

        <div className="space-y-4 text-sm">
          {/* ① 店舗番号 */}
          <label className="block">
            <div className="text-slate-300 mb-1">
              店舗番号{" "}
              <span className="text-xs text-slate-400">(3〜4桁の半角数字)</span>
            </div>
            <input
              value={shopNumber}
              onChange={(e) => {
                setShopNumber(e.target.value);
                setShopNumberError(null);
              }}
              className="w-full px-3 py-2 rounded-xl bg-slate-800 text-white font-mono"
              placeholder="001 / 0701 など"
            />
            {shopNumberError && (
              <div className="mt-1 text-xs text-red-400">{shopNumberError}</div>
            )}
          </label>

          {/* ② 店名 */}
          <label className="block">
            <div className="text-slate-300 mb-1">店名</div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-800 text-white"
            />
          </label>

          {/* ③ カナ */}
          <label className="block">
            <div className="text-slate-300 mb-1">カナ（読み方）</div>
            <input
              value={nameKana}
              onChange={(e) => setNameKana(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-800 text-white"
              placeholder="クラブ ティアラ など"
            />
            <div className="mt-1 text-xs text-slate-400">
              ※ 現時点では表示のみ先行。API拡張後に保存連携予定。
            </div>
          </label>

          {/* ④ ランク */}
          <label className="block">
            <div className="text-slate-300 mb-1">ランク</div>
            <select
              value={rank}
              onChange={(e) => setRank(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-800 text-white"
            >
              <option value="">（未設定）</option>
              <option value="S">S</option>
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
            </select>
            <div className="mt-1 text-xs text-slate-400">
              ※ 現時点ではUIのみ。API拡張後に保存連携予定。
            </div>
          </label>

          {/* ⑤ 店住所 */}
          <label className="block">
            <div className="text-slate-300 mb-1">店住所</div>
            <input
              value={shopAddress}
              onChange={(e) => setShopAddress(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-800 text-white"
              placeholder="福岡県福岡市博多区中洲1-2-3 など"
            />
          </label>

          {/* ⑥ ビル名 */}
          <label className="block">
            <div className="text-slate-300 mb-1">ビル名</div>
            <input
              value={buildingName}
              onChange={(e) => setBuildingName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-800 text-white"
              placeholder="○○ビル 3F など"
            />
            <div className="mt-1 text-xs text-slate-400">
              ※ 現時点ではUIのみ。API拡張後に保存連携予定。
            </div>
          </label>

          {/* ⑦ 時給（ドロップダウン） */}
          <label className="block">
            <div className="text-slate-300 mb-1">時給</div>
            <select
              value={wageRange}
              onChange={(e) => setWageRange(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-800 text-white"
            >
              <option value="">（未設定）</option>
              {wageOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
            <div className="mt-1 text-xs text-slate-400">
              ※ 現時点ではUIのみ。API拡張後に保存連携予定。
            </div>
          </label>

          {/* ⑧ 電話 ＋ 電話チェック */}
          <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-3">
            <label className="block">
              <div className="text-slate-300 mb-1">電話</div>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 text-white"
                placeholder="090-xxxx-xxxx"
              />
            </label>

            <label className="flex items-center gap-2 mt-6 text-slate-200">
              <input
                type="checkbox"
                checked={phoneChecked}
                onChange={(e) => setPhoneChecked(e.target.checked)}
                className="h-4 w-4 rounded border-slate-500 bg-slate-800"
              />
              <span className="text-xs">電話チェック済み</span>
            </label>
          </div>

          {/* ジャンル（既存） */}
          <label className="block">
            <div className="text-slate-300 mb-1">ジャンル</div>
            <select
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-800 text-white"
            >
              <option value="">（未設定）</option>
              <option value="club">club</option>
              <option value="cabaret">cabaret</option>
              <option value="snack">snack</option>
              <option value="gb">gb</option>
            </select>
          </label>

          {/* エラー表示 */}
          {err && <div className="text-red-400 text-sm">{err}</div>}

          {/* アクションボタン */}
          <div className="flex gap-2 pt-2">
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
