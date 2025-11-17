// src/app/casts/page.tsx
"use client";

import { useMemo, useState } from "react";
import AppShell from "@/components/AppShell";

/**
 * キャスト一覧用の最小情報
 * （後でAPIと接続するときは、この形に合わせて CastListItem を返す想定）
 */
type CastRow = {
  id: string;
  managementNumber: string;     // 管理番号（0001〜の数字）
  displayName: string;         // 氏名
  kana?: string;               // ふりがな（50音ソート用）
  age?: number;                // 年齢
  desiredHourly?: number;      // 希望時給
  ownerStaffName?: string;     // 担当スタッフ名
};

type SortKey = "staff" | "kana" | "wage" | "age";

const MOCK_ROWS: CastRow[] = [
  {
    id: "c1",
    managementNumber: "0001",
    displayName: "りさ",
    kana: "リサ",
    age: 24,
    desiredHourly: 3500,
    ownerStaffName: "山田",
  },
  {
    id: "c2",
    managementNumber: "0002",
    displayName: "みゆ",
    kana: "ミユ",
    age: 22,
    desiredHourly: 3000,
    ownerStaffName: "佐藤",
  },
  {
    id: "c3",
    managementNumber: "0003",
    displayName: "はる",
    kana: "ハル",
    age: 25,
    desiredHourly: 4000,
    ownerStaffName: "山田",
  },
  {
    id: "c4",
    managementNumber: "0004",
    displayName: "ゆい",
    kana: "ユイ",
    age: 27,
    desiredHourly: 4500,
    ownerStaffName: "高橋",
  },
];

export default function Page() {
  // 検索・ソート関連
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("kana");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  // モーダル表示用
  const [selected, setSelected] = useState<CastRow | null>(null);

  // フィルタ（名前＋管理番号で検索）
  const filtered = useMemo(() => {
    const text = q.trim();
    if (!text) return MOCK_ROWS;

    const lower = text.toLowerCase();
    return MOCK_ROWS.filter((r) => {
      const nameHit =
        r.displayName.toLowerCase().includes(lower) ||
        (r.kana ?? "").includes(text);
      const mgmtHit = r.managementNumber.includes(text);
      return nameHit || mgmtHit;
    });
  }, [q]);

  // ソート
  const rows = useMemo(() => {
    const arr = [...filtered];

    arr.sort((a, b) => {
      const dir = sortOrder === "asc" ? 1 : -1;

      if (sortKey === "staff") {
        const av = a.ownerStaffName ?? "";
        const bv = b.ownerStaffName ?? "";
        return av.localeCompare(bv, "ja") * dir;
      }

      if (sortKey === "kana") {
        const av = a.kana ?? a.displayName ?? "";
        const bv = b.kana ?? b.displayName ?? "";
        return av.localeCompare(bv, "ja") * dir;
      }

      if (sortKey === "wage") {
        const av = a.desiredHourly ?? 0;
        const bv = b.desiredHourly ?? 0;
        if (av === bv) return 0;
        return av > bv ? dir : -dir;
      }

      if (sortKey === "age") {
        const av = a.age ?? 0;
        const bv = b.age ?? 0;
        if (av === bv) return 0;
        return av > bv ? dir : -dir;
      }

      return 0;
    });

    return arr;
  }, [filtered, sortKey, sortOrder]);

  return (
    <AppShell>
      <section className="tiara-panel h-full flex flex-col p-3">
        <header className="pb-2 border-b border-white/10 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold">キャスト管理</h2>
            <p className="text-xs text-muted">
              管理番号・名前・希望時給・担当者を一覧表示します（後でAPI接続）
            </p>
          </div>
          <div className="text-xs text-muted">
            全 <span className="font-semibold">{rows.length}</span> 件
          </div>
        </header>

        {/* フィルタ行 */}
        <div className="mt-3 grid grid-cols-1 lg:grid-cols-3 gap-2">
          {/* テキスト検索（名前・管理番号） */}
          <input
            className="tiara-input"
            placeholder="検索（名前・管理番号）"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />

          {/* 並び替え */}
          <div className="flex items-center gap-2">
            <select
              className="tiara-input"
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
            >
              <option value="kana">50音順（名前）</option>
              <option value="wage">希望時給</option>
              <option value="age">年齢</option>
              <option value="staff">担当者</option>
            </select>
            <button
              className="rounded-xl border border-white/15 bg-white/5 text-ink px-3 py-2 text-xs"
              onClick={() =>
                setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"))
              }
            >
              {sortOrder === "asc" ? "昇順" : "降順"}
            </button>
          </div>

          {/* クリアボタン */}
          <div className="flex items-center justify-end">
            <button
              className="rounded-xl border border-white/15 bg-white/5 text-ink px-4 py-2.5 text-sm"
              onClick={() => {
                setQ("");
                setSortKey("kana");
                setSortOrder("asc");
              }}
            >
              条件クリア
            </button>
          </div>
        </div>

        {/* テーブル */}
        <div className="mt-3 overflow-auto rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-muted">
              <tr>
                <th className="text-left px-3 py-2 w-28">管理番号</th>
                <th className="text-left px-3 py-2">名前</th>
                <th className="text-left px-3 py-2 w-32">希望時給</th>
                <th className="text-left px-3 py-2 w-32">担当者</th>
                <th className="text-left px-3 py-2 w-20">年齢</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-t border-white/10 hover:bg-white/5 cursor-pointer"
                  onClick={() => setSelected(r)}
                >
                  <td className="px-3 py-2 font-mono">{r.managementNumber}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col">
                      <span>{r.displayName}</span>
                      {r.kana && (
                        <span className="text-[11px] text-muted">{r.kana}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {r.desiredHourly != null
                      ? `${r.desiredHourly.toLocaleString()} 円`
                      : "-"}
                  </td>
                  <td className="px-3 py-2">{r.ownerStaffName ?? "-"}</td>
                  <td className="px-3 py-2">{r.age ?? "-"}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td className="px-3 py-6 text-center text-muted" colSpan={5}>
                    該当データがありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {selected && (
          <CastDetailModal cast={selected} onClose={() => setSelected(null)} />
        )}
      </section>
    </AppShell>
  );
}

/**
 * 詳細モーダル
 * （今は MOCK_ROWS の情報で表示。後でAPIと連携して項目を増やす前提）
 */
type CastDetailModalProps = {
  cast: CastRow;
  onClose: () => void;
};

function CastDetailModal({ cast, onClose }: CastDetailModalProps) {
  // ここではまだ持っていない項目は "-" でプレースホルダ
  const displayName = cast.displayName;
  const kana = cast.kana ?? "";
  const managementNumber = cast.managementNumber;
  const age = cast.age != null ? `${cast.age}歳` : "-";
  const desiredHourly =
    cast.desiredHourly != null
      ? `${cast.desiredHourly.toLocaleString()} 円`
      : "-";
  const ownerStaffName = cast.ownerStaffName ?? "-";

  // 将来APIから持ってくる予定の項目（今は全部 "-"）
  const phone = "-";
  const email = "-";
  const address = "-";
  const preferredArea = "-";
  const preferredDays = "-";
  const preferredTimeBand = "-";
  const ngShopNotes = "-";
  const notes = "-";

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-4xl bg-slate-900 shadow-2xl p-6 overflow-y-auto">
        {/* ヘッダー */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-xs text-muted">
              管理番号 {managementNumber}
            </div>
            <h2 className="text-xl font-semibold text-ink mt-1">
              {displayName}
            </h2>
            {kana && (
              <div className="text-sm text-muted mt-0.5">{kana}</div>
            )}
            <div className="flex flex-wrap gap-2 mt-2 text-xs">
              <span className="inline-flex px-2 py-1 rounded-full bg-white/5 text-ink">
                年齢: {age}
              </span>
              {ownerStaffName !== "-" && (
                <span className="inline-flex px-2 py-1 rounded-full bg-white/5 text-ink">
                  担当: {ownerStaffName}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-xl border border-white/15 bg-white/5 text-sm text-ink"
          >
            閉じる
          </button>
        </div>

        {/* 本文：スクショ意識の2カラム構成 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-sm">
          {/* 左カラム：基本情報 */}
          <div className="space-y-4">
            <section className="bg-white/5 rounded-xl p-4">
              <h3 className="text-ink font-semibold mb-3">基本情報</h3>
              <dl className="grid grid-cols-[96px,1fr] gap-x-3 gap-y-2">
                <dt className="text-muted">名前</dt>
                <dd className="text-ink">{displayName}</dd>

                <dt className="text-muted">ふりがな</dt>
                <dd className="text-ink">{kana || "-"}</dd>

                <dt className="text-muted">管理番号</dt>
                <dd className="text-ink">{managementNumber}</dd>

                <dt className="text-muted">年齢</dt>
                <dd className="text-ink">{age}</dd>

                <dt className="text-muted">電話番号</dt>
                <dd className="text-ink">{phone}</dd>

                <dt className="text-muted">メール</dt>
                <dd className="text-ink">{email}</dd>

                <dt className="text-muted">住所</dt>
                <dd className="text-ink">{address}</dd>
              </dl>
            </section>
          </div>

          {/* 右カラム：希望条件＋メモ */}
          <div className="space-y-4">
            <section className="bg-white/5 rounded-xl p-4">
              <h3 className="text-ink font-semibold mb-3">希望条件</h3>
              <dl className="grid grid-cols-[96px,1fr] gap-x-3 gap-y-2">
                <dt className="text-muted">希望時給</dt>
                <dd className="text-ink">{desiredHourly}</dd>

                <dt className="text-muted">希望エリア</dt>
                <dd className="text-ink">{preferredArea}</dd>

                <dt className="text-muted">希望出勤日</dt>
                <dd className="text-ink">{preferredDays}</dd>

                <dt className="text-muted">希望時間帯</dt>
                <dd className="text-ink">{preferredTimeBand}</dd>
              </dl>
            </section>

            <section className="bg-white/5 rounded-xl p-4 space-y-3">
              <div>
                <h3 className="text-ink font-semibold mb-1">
                  NG店舗・条件メモ
                </h3>
                <p className="text-ink whitespace-pre-wrap text-xs">
                  {ngShopNotes}
                </p>
              </div>

              <div>
                <h3 className="text-ink font-semibold mb-1">備考メモ</h3>
                <p className="text-ink whitespace-pre-wrap text-xs">
                  {notes}
                </p>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
