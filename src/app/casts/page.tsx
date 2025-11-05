"use client";

import { useMemo, useState } from "react";
import AppShell from "@/components/AppShell";

type CastRow = {
  id: string;
  code: string;
  name: string;
  age: number;
  area: string;
  drinkOk: boolean;
  exp: boolean;
  status: "active" | "paused" | "ng";
};

const MOCK_ROWS: CastRow[] = [
  { id: "c1", code: "A101", name: "りさ", age: 24, area: "博多",   drinkOk: true,  exp: true,  status: "active" },
  { id: "c2", code: "B007", name: "みゆ", age: 22, area: "天神",   drinkOk: false, exp: false, status: "paused" },
  { id: "c3", code: "A222", name: "はる", age: 25, area: "中洲",   drinkOk: true,  exp: false, status: "active" },
  { id: "c4", code: "C015", name: "ゆい", age: 27, area: "大名",   drinkOk: true,  exp: true,  status: "ng" },
];

export default function Page() {
  const [q, setQ] = useState("");
  const [onlyDrinkOk, setOnlyDrinkOk] = useState(false);
  const [onlyExp, setOnlyExp] = useState(false);
  const [status, setStatus] = useState<"" | CastRow["status"]>("");

  const rows = useMemo(() => {
    return MOCK_ROWS.filter((r) => {
      if (q && !`${r.code} ${r.name} ${r.area}`.includes(q)) return false;
      if (onlyDrinkOk && !r.drinkOk) return false;
      if (onlyExp && !r.exp) return false;
      if (status && r.status !== status) return false;
      return true;
    });
  }, [q, onlyDrinkOk, onlyExp, status]);

  return (
    <AppShell>
      <section className="tiara-panel h-full flex flex-col p-3">
        <header className="pb-2 border-b border-white/10">
          <h2 className="text-xl font-extrabold">キャスト管理</h2>
          <p className="text-xs text-muted">検索・フィルタ・一覧／後でAPIに接続</p>
        </header>

        {/* フィルタ行 */}
        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
          <input
            className="tiara-input"
            placeholder="検索（コード/氏名/エリア）"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-sm text-muted">
              <input
                type="checkbox"
                checked={onlyDrinkOk}
                onChange={(e) => setOnlyDrinkOk(e.target.checked)}
              />
              飲酒可のみ
            </label>
            <label className="flex items-center gap-1 text-sm text-muted">
              <input
                type="checkbox"
                checked={onlyExp}
                onChange={(e) => setOnlyExp(e.target.checked)}
              />
              経験ありのみ
            </label>
          </div>
          <div className="flex items-center gap-2">
            <select
              className="tiara-input"
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
            >
              <option value="">ステータス（全て）</option>
              <option value="active">active</option>
              <option value="paused">paused</option>
              <option value="ng">ng</option>
            </select>
            <button
              className="rounded-xl border border-white/15 bg-white/5 text-ink px-4 py-2.5"
              onClick={() => { setQ(""); setOnlyDrinkOk(false); setOnlyExp(false); setStatus(""); }}
            >
              クリア
            </button>
          </div>
        </div>

        {/* テーブル */}
        <div className="mt-3 overflow-auto rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-muted">
              <tr>
                <th className="text-left px-3 py-2">コード</th>
                <th className="text-left px-3 py-2">氏名</th>
                <th className="text-left px-3 py-2">年齢</th>
                <th className="text-left px-3 py-2">エリア</th>
                <th className="text-left px-3 py-2">飲酒</th>
                <th className="text-left px-3 py-2">経験</th>
                <th className="text-left px-3 py-2">ステータス</th>
                <th className="text-left px-3 py-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-white/10">
                  <td className="px-3 py-2 font-mono">{r.code}</td>
                  <td className="px-3 py-2">{r.name}</td>
                  <td className="px-3 py-2">{r.age}</td>
                  <td className="px-3 py-2">{r.area}</td>
                  <td className="px-3 py-2">{r.drinkOk ? "可" : "不可"}</td>
                  <td className="px-3 py-2">{r.exp ? "あり" : "なし"}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`px-2 py-0.5 rounded text-xs ${
                        r.status === "active"
                          ? "bg-green-400/20 text-green-200"
                          : r.status === "paused"
                          ? "bg-yellow-400/20 text-yellow-200"
                          : "bg-red-400/20 text-red-200"
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <button className="tiara-btn px-3 py-1.5">詳細</button>
                      <button className="rounded-xl border border-white/15 bg-white/5 text-ink px-3 py-1.5">編集</button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td className="px-3 py-6 text-center text-muted" colSpan={8}>
                    該当データがありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
