'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { API_BASE, apiFetch } from '@/lib/api';

type ShopRow = {
  id: string;
  name: string;
  shopNumber?: string | null;
  phone?: string | null;
  genre?: string | null;
};

export default function ShopsIndexPage() {
  const [rows, setRows] = useState<ShopRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // 仮の一覧取得（API未実装でも404許容）
  useEffect(() => {
    (async () => {
      try {
        // 例: /shops?limit=100 を想定（未実装なら握りつぶして空表示）
        const data = await apiFetch<{ items: ShopRow[] }>('/shops?limit=100').catch(() => ({ items: [] }));
        setRows(data.items ?? []);
      } catch (e: any) {
        setErr(e?.message ?? 'failed to load');
        setRows([]);
      }
    })();
  }, []);

  const onUpload = async () => {
    const f = fileRef.current?.files?.[0];
    if (!f) return;
    setUploading(true);
    setErr(null);
    try {
      const form = new FormData();
      form.append('file', f);
      const res = await fetch(`${API_BASE}/shops/import-excel`, { method: 'POST', body: form });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const j = await res.json();
      alert(`Import done: total=${j.total}, created=${j.created}, updated=${j.updated}, skipped=${j.skipped}`);
      // 取り込み後に一覧リロード
      const data = await apiFetch<{ items: ShopRow[] }>('/shops?limit=100').catch(() => ({ items: [] }));
      setRows(data.items ?? []);
    } catch (e: any) {
      setErr(e?.message ?? 'upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* ヘッダー操作部 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold">店舗一覧</h1>
        <div className="flex flex-wrap gap-2">
          <input type="file" ref={fileRef} accept=".xlsx,.xls" className="block" />
          <button
            onClick={onUpload}
            disabled={uploading}
            className="px-3 py-2 rounded-lg shadow text-sm border hover:bg-gray-50 disabled:opacity-50"
            title={API_BASE + '/shops/import-excel'}
          >
            {uploading ? 'アップロード中…' : 'Excel一括アップロード'}
          </button>

          <Link
            href="/shops/new"
            className="px-3 py-2 rounded-lg shadow text-sm border bg-blue-600 text-white hover:opacity-90"
          >
            新規店舗登録
          </Link>
        </div>
      </div>

      {/* エラー表示 */}
      {err && (
        <div className="text-sm text-red-600 border border-red-200 rounded p-3 bg-red-50">
          {err}
        </div>
      )}

      {/* 一覧 */}
      <div className="overflow-x-auto">
        <table className="min-w-[760px] w-full border-separate border-spacing-y-2">
          <thead>
            <tr className="text-left text-sm text-gray-500">
              <th className="px-3 py-1">店舗名</th>
              <th className="px-3 py-1">呼出番号</th>
              <th className="px-3 py-1">電話</th>
              <th className="px-3 py-1">ジャンル</th>
              <th className="px-3 py-1"></th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((r) => (
              <tr key={r.id} className="bg-white/60 backdrop-blur rounded-lg shadow-sm">
                <td className="px-3 py-2 font-medium">{r.name}</td>
                <td className="px-3 py-2">{r.shopNumber ?? ''}</td>
                <td className="px-3 py-2">{r.phone ?? ''}</td>
                <td className="px-3 py-2">{r.genre ?? ''}</td>
                <td className="px-3 py-2 text-right">
                  {/* TODO: クリックで編集モーダル（次ステップ） */}
                  <button className="px-2 py-1 text-sm rounded border hover:bg-gray-50">編集</button>
                </td>
              </tr>
            ))}
            {rows && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-sm text-gray-500">
                  データがありません（APIが未実装 or 空の場合に表示）
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400">
        API_BASE: <code>{API_BASE}</code>
      </p>
    </div>
  );
}
