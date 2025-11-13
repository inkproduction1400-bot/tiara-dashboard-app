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

export default function ShopsPage() {
  const [items, setItems] = useState<ShopListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<ShopListItem | null>(null);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement | null>(null);

  const page = useMemo(() => Math.floor(offset / limit) + 1, [offset, limit]);
  const maxPage = useMemo(
    () => Math.max(1, Math.ceil(total / Math.max(1, limit))),
    [total, limit],
  );

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listShops({
        q: q.trim() || undefined,
        limit,
        offset,
      });
      const nextItems = res.items ?? [];
      const nextTotal =
        res.total ?? (Array.isArray(res.items) ? res.items.length : 0);

      setItems(nextItems);
      setTotal(nextTotal);
      setMessage(null);
    } catch (e: any) {
      setMessage(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [q, limit, offset]);

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

  return (
    <div className="p-6 space-y-4">
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

      <div className="flex items-center gap-2">
        <input
          id="shopSearch"
          name="q"
          value={q}
          onChange={(e) => {
            setOffset(0);
            setQ(e.target.value);
          }}
          placeholder="店舗名・市区・キーワードで検索"
          className="w-full md:w-80 px-3 py-2 rounded-xl bg-slate-800 text-white placeholder-slate-400"
        />
        <select
          id="perPage"
          name="perPage"
          value={limit}
          onChange={(e) => {
            setOffset(0);
            setLimit(Number(e.target.value));
          }}
          className="px-2 py-2 rounded-xl bg-slate-800 text-white"
        >
          {[10, 20, 50].map((n) => (
            <option key={n} value={n}>
              {n}/page
            </option>
          ))}
        </select>
      </div>

      {message && (
        <div className="rounded-xl bg-slate-800/60 text-slate-100 px-4 py-3">
          {message}
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-700">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-800 text-slate-300">
            <tr>
              <th className="text-left p-3">番号</th>
              <th className="text-left p-3">店舗名</th>
              <th className="text-left p-3">ジャンル</th>
              <th className="text-left p-3">電話</th>
              <th className="text-left p-3">更新</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="p-6 text-center text-slate-400">
                  読み込み中…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-6 text-center text-slate-400">
                  該当データがありません
                </td>
              </tr>
            ) : (
              items.map((r) => (
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

      {/* ページネーション */}
      <div className="flex items-center justify-between">
        <div className="text-slate-400">
          {total}件 / {page} / {maxPage}
        </div>
        <div className="flex gap-2">
          <button
            className="px-3 py-1 rounded-lg bg-slate-800 text-white disabled:opacity-40"
            onClick={() => setOffset(Math.max(0, offset - limit))}
            disabled={offset === 0}
          >
            ← Prev
          </button>
          <button
            className="px-3 py-1 rounded-lg bg-slate-800 text-white disabled:opacity-40"
            onClick={() =>
              setOffset(Math.min((maxPage - 1) * limit, offset + limit))
            }
            disabled={page >= maxPage}
          >
            Next →
          </button>
        </div>
      </div>

      {/* 編集モーダル */}
      {editing && (
        <EditModal
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await reload();
          }}
        />
      )}
    </div>
  );
}

function EditModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: ShopListItem;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [name, setName] = useState(initial.name);
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [genre, setGenre] = useState<string>(initial.genre ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      await updateShop(initial.id, {
        name,
        phone,
        genre: (genre || null) as any, // 空なら null
      });
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

        <div className="space-y-3">
          <label className="block">
            <div className="text-sm text-slate-300 mb-1">店舗名</div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-800 text-white"
            />
          </label>

          <label className="block">
            <div className="text-sm text-slate-300 mb-1">電話</div>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-800 text-white"
              placeholder="090-xxxx-xxxx"
            />
          </label>

          <label className="block">
            <div className="text-sm text-slate-300 mb-1">ジャンル</div>
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

          {err && <div className="text-red-400 text-sm">{err}</div>}

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
