"use client";

import { useMemo, useState } from "react";
import AppShell from "@/components/AppShell";

type Cast = { id: string; code: string; name: string; drinkOk: boolean; exp: boolean };

const TODAY_CASTS: Cast[] = [
  { id: "c1", code: "A101", name: "りさ", drinkOk: true,  exp: true },
  { id: "c2", code: "B007", name: "みゆ", drinkOk: false, exp: false },
  { id: "c3", code: "A222", name: "はる", drinkOk: true,  exp: false },
  { id: "c4", code: "C015", name: "ゆい", drinkOk: true,  exp: true },
];

export default function Page() {
  const [casts] = useState(TODAY_CASTS);
  const [staged, setStaged] = useState<Cast[]>([]);
  const buildStamp = useMemo(() => new Date().toLocaleString(), []);

  return (
    <AppShell>
      <div className="h-full flex gap-3">
        {/* 中央：本日出勤キャスト（カード一覧） */}
        <section className="tiara-panel grow p-3 flex flex-col">
          <header className="flex items-center justify-between pb-2 border-b border-white/10">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-extrabold">本日出勤キャスト</h2>
              <span className="text-[10px] px-2 py-0.5 rounded bg-white/15 border border-white/10">
                build: {buildStamp}
              </span>
            </div>
            <p className="text-xs text-muted">PC/タブレット前提・スクロール最小</p>
          </header>

          <div
            className="mt-2 grid gap-3"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}
          >
            {casts.map((cast) => (
              <div
                key={cast.id}
                className="rounded-xl border border-indigo-400/25 bg-white/5 p-3 select-none cursor-grab active:cursor-grabbing"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/plain", cast.id);
                  e.dataTransfer.effectAllowed = "move";
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="font-black">{cast.name}</div>
                  <span className="text-xs text-muted">{cast.code}</span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-1 text-xs text-muted">
                  <div>飲酒: {cast.drinkOk ? "可" : "不可"}</div>
                  <div>経験: {cast.exp ? "あり" : "なし"}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 右：割当候補（D&D受け皿） */}
        <aside
          className="tiara-panel w-[320px] shrink-0 p-3 flex flex-col"
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
          onDrop={(e) => {
            e.preventDefault();
            const castId = e.dataTransfer.getData("text/plain");
            if (!castId) return;
            const cast = casts.find((c) => c.id === castId);
            if (!cast) return;
            setStaged((prev) => (prev.some((x) => x.id === cast.id) ? prev : [...prev, cast]));
          }}
        >
          <header className="pb-2 border-b border-white/10">
            <h3 className="font-bold">割当候補</h3>
            <p className="text-xs text-muted">キャストカードをここへドラッグ</p>
          </header>

          <div className="mt-3 flex-1 overflow-auto space-y-2">
            {staged.length === 0 ? (
              <div className="text-sm text-muted">未選択</div>
            ) : (
              staged.map((c) => (
                <div key={c.id} className="rounded-lg border border-white/10 bg-white/5 p-2">
                  <div className="flex items-center justify-between">
                    <div className="font-bold">{c.name}</div>
                    <span className="text-xs text-muted">{c.code}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              className="tiara-btn"
              onClick={() => { setStaged([]); alert("割当を確定（デモ）"); }}
              disabled={staged.length === 0}
            >
              確定
            </button>
            <button
              className="rounded-xl border border-white/15 bg-white/5 text-ink px-4 py-2.5"
              onClick={() => setStaged([])}
              disabled={staged.length === 0}
            >
              クリア
            </button>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
