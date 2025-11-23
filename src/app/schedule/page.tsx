// src/app/schedule/page.tsx
"use client";

import { useMemo, useState } from "react";
import AppShell from "@/components/AppShell";

type ScheduleShopRequest = {
  id: string;
  date: string; // YYYY-MM-DD
  code: string;
  name: string;
  requestedHeadcount: number;
  minHourly?: number;
  maxHourly?: number;
  minAge?: number;
  maxAge?: number;
  requireDrinkOk: boolean;
  note?: string;
};

const todayKey = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const dd = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${dd}`;
};

const addDays = (base: string, diff: number) => {
  const [y, m, d] = base.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  dt.setDate(dt.getDate() + diff);
  const yy = dt.getFullYear();
  const mm = `${dt.getMonth() + 1}`.padStart(2, "0");
  const dd = `${dt.getDate()}`.padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
};

const TODAY = todayKey();
const TOMORROW = addDays(TODAY, 1);
const DAY_AFTER = addDays(TODAY, 2);

const MOCK_SCHEDULE: ScheduleShopRequest[] = [
  {
    id: "s1-" + TODAY,
    date: TODAY,
    code: "001",
    name: "クラブ ティアラ本店",
    requestedHeadcount: 5,
    minHourly: 4500,
    maxHourly: 6000,
    minAge: 20,
    maxAge: 32,
    requireDrinkOk: true,
    note: "本日のメイン店舗。売上見込み高め。",
  },
  {
    id: "s2-" + TODAY,
    date: TODAY,
    code: "002",
    name: "スナック フラワー",
    requestedHeadcount: 3,
    minHourly: 3500,
    maxHourly: 4500,
    minAge: 25,
    maxAge: 40,
    requireDrinkOk: false,
    note: "落ち着いたお姉さん系。",
  },
  {
    id: "s3-" + TOMORROW,
    date: TOMORROW,
    code: "003",
    name: "ラウンジ プリマ",
    requestedHeadcount: 4,
    minHourly: 4000,
    maxHourly: 5500,
    minAge: 21,
    maxAge: 30,
    requireDrinkOk: true,
    note: "常連さん来店予定。トーク上手め希望。",
  },
  {
    id: "s4-" + DAY_AFTER,
    date: DAY_AFTER,
    code: "004",
    name: "バー ルージュ",
    requestedHeadcount: 2,
    minHourly: 3800,
    maxHourly: 5000,
    minAge: 22,
    maxAge: 35,
    requireDrinkOk: false,
    note: "単価は低め。新人の場数用。",
  },
];

const createEmptyRequestForDate = (date: string): ScheduleShopRequest => ({
  id: `new-${date}-${Date.now()}`,
  date,
  code: "",
  name: "",
  requestedHeadcount: 1,
  minHourly: undefined,
  maxHourly: undefined,
  minAge: undefined,
  maxAge: undefined,
  requireDrinkOk: false,
  note: "",
});

export default function Page() {
  const [items, setItems] = useState<ScheduleShopRequest[]>(MOCK_SCHEDULE);
  const [selectedDate, setSelectedDate] = useState<string>(TODAY);
  const [keyword, setKeyword] = useState("");
  const [rangeView, setRangeView] = useState<"day" | "week">("day");

  const [editing, setEditing] = useState<ScheduleShopRequest | null>(null);
  const [editingIsNew, setEditingIsNew] = useState(false);

  const buildStamp = useMemo(() => new Date().toLocaleString(), []);

  const selectedDateLabel = useMemo(() => {
    if (selectedDate === TODAY) return "本日";
    if (selectedDate === TOMORROW) return "明日";
    return selectedDate;
  }, [selectedDate]);

  const dailyItems = useMemo(() => {
    let list: ScheduleShopRequest[] = items.filter(
      (i: ScheduleShopRequest) => i.date === selectedDate,
    );

    if (keyword.trim()) {
      const q = keyword.trim();
      list = list.filter(
        (i: ScheduleShopRequest) =>
          i.name.includes(q) ||
          i.code.includes(q) ||
          i.note?.includes(q),
      );
    }

    list.sort((a: ScheduleShopRequest, b: ScheduleShopRequest) =>
      a.code.localeCompare(b.code),
    );
    return list;
  }, [items, selectedDate, keyword]);

  const weeklySummary = useMemo(() => {
    const base = selectedDate;
    const range: string[] = [];
    for (let i = 0; i < 7; i += 1) {
      range.push(addDays(base, i));
    }
    const counts: Record<string, number> = {};
    for (const d of range) counts[d] = 0;
    items.forEach((it: ScheduleShopRequest) => {
      if (counts[it.date] != null) {
        counts[it.date] += 1;
      }
    });
    return { range, counts };
  }, [items, selectedDate]);

  const openNew = () => {
    setEditing(createEmptyRequestForDate(selectedDate));
    setEditingIsNew(true);
  };

  const openEdit = (req: ScheduleShopRequest) => {
    setEditing(req);
    setEditingIsNew(false);
  };

  const closeEdit = () => {
    setEditing(null);
    setEditingIsNew(false);
  };

  const saveEdit = () => {
    if (!editing) return;

    setItems((prev: ScheduleShopRequest[]) => {
      const exists = prev.some((i: ScheduleShopRequest) => i.id === editing.id);
      if (exists) {
        return prev.map((i: ScheduleShopRequest) =>
          i.id === editing.id ? editing : i,
        );
      }
      return [...prev, editing];
    });

    closeEdit();
  };

  const deleteItem = (req: ScheduleShopRequest) => {
    if (
      !window.confirm(
        `【${req.date}】店舗番号 ${req.code} / ${req.name} のリクエストを削除しますか？`,
      )
    ) {
      return;
    }
    setItems((prev: ScheduleShopRequest[]) =>
      prev.filter((i: ScheduleShopRequest) => i.id !== req.id),
    );

    if (editing && editing.id === req.id) {
      closeEdit();
    }
  };

  const jumpToToday = () => setSelectedDate(TODAY);
  const jumpToTomorrow = () => setSelectedDate(TOMORROW);
  const moveDate = (diff: number) =>
    setSelectedDate((prev) => addDays(prev, diff));

  return (
    <AppShell>
      <div className="h-full flex flex-col gap-3">
        {/* ヘッダー */}
        <section className="tiara-panel p-3 flex flex-col gap-2">
          <header className="flex items-center justify-between">
            <div className="flex flex-col">
              <h1 className="text-sm font-semibold">
                スケジュール / 店舗リクエスト予定
              </h1>
              <p className="mt-0.5 text-[11px] text-muted">
                日付ごとに「店舗の必要人数・条件」を登録します。
                ここで登録した予定を元に、割当確認・マッチング画面の店舗条件へ反映していく想定です。
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/15 border border-white/10">
                build: {buildStamp}
              </span>
            </div>
          </header>

          {/* 日付選択・フィルタ */}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center gap-1">
              <span className="text-muted whitespace-nowrap">表示日付</span>
              <div className="inline-flex items-center gap-1">
                <button
                  type="button"
                  className="rounded-full border border-white/20 bg-white/10 px-2 py-1 text-[11px]"
                  onClick={() => moveDate(-1)}
                >
                  ← 前日
                </button>
                <input
                  type="date"
                  className="tiara-input h-8 text-xs"
                  value={selectedDate}
                  onChange={(e) => {
                    if (e.target.value) setSelectedDate(e.target.value);
                  }}
                />
                <button
                  type="button"
                  className="rounded-full border border-white/20 bg-white/10 px-2 py-1 text-[11px]"
                  onClick={() => moveDate(1)}
                >
                  翌日 →
                </button>
              </div>
              <span className="ml-2 text-[11px] text-muted">
                ラベル: {selectedDateLabel}
              </span>
            </div>

            <div className="flex items-center gap-1">
              <span className="text-muted whitespace-nowrap">
                ショートカット
              </span>
              <div className="inline-flex rounded-full bg-white/70 border border-slate-200 overflow-hidden">
                <button
                  type="button"
                  className={`px-3 py-1 ${
                    selectedDate === TODAY
                      ? "bg-slate-900 text-ink"
                      : "bg-transparent text-slate-700"
                  } text-[11px]`}
                  onClick={jumpToToday}
                >
                  本日
                </button>
                <button
                  type="button"
                  className={`px-3 py-1 ${
                    selectedDate === TOMORROW
                      ? "bg-slate-900 text-ink"
                      : "bg-transparent text-slate-700"
                  } text-[11px]`}
                  onClick={jumpToTomorrow}
                >
                  明日
                </button>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <span className="text-muted whitespace-nowrap">キーワード</span>
              <input
                className="tiara-input h-8 w-[260px] text-xs"
                placeholder="店舗番号・店舗名・メモで検索"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
            </div>

            <div className="ml-auto flex items-center gap-1">
              <span className="text-muted whitespace-nowrap">表示</span>
              <div className="inline-flex rounded-full bg-white/70 border border-slate-200 overflow-hidden">
                <button
                  type="button"
                  className={`px-3 py-1 ${
                    rangeView === "day"
                      ? "bg-slate-900 text-ink"
                      : "bg-transparent text-slate-700"
                  } text-[11px]`}
                  onClick={() => setRangeView("day")}
                >
                  1日
                </button>
                <button
                  type="button"
                  className={`px-3 py-1 ${
                    rangeView === "week"
                      ? "bg-slate-900 text-ink"
                      : "bg-transparent text-slate-700"
                  } text-[11px]`}
                  onClick={() => setRangeView("week")}
                >
                  選択日から1週間
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* メイン */}
        <div className="flex-1 flex gap-3">
          {/* 左：当日リスト */}
          <section className="tiara-panel flex-1 p-3 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between mb-2 text-[11px] text-muted">
              <span>
                {selectedDateLabel} の店舗リクエスト：
                <span className="font-semibold text-ink">
                  {dailyItems.length}
                </span>{" "}
                件
              </span>
              <button
                type="button"
                className="tiara-btn text-[11px] px-3 py-1"
                onClick={openNew}
              >
                ＋ この日に店舗リクエストを追加
              </button>
            </div>

            <div className="flex-1 overflow-auto rounded-xl border border-white/10 bg-white/5">
              <table className="w-full text-xs">
                <thead className="bg-slate-900/60 text-[11px] text-muted sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-2 text-left w-[80px]">店舗番号</th>
                    <th className="px-3 py-2 text-left">店舗名</th>
                    <th className="px-3 py-2 text-right w-[80px]">希望人数</th>
                    <th className="px-3 py-2 text-right w-[120px]">
                      時給レンジ
                    </th>
                    <th className="px-3 py-2 text-right w-[120px]">
                      年齢レンジ
                    </th>
                    <th className="px-3 py-2 text-center w-[80px]">
                      飲酒条件
                    </th>
                    <th className="px-3 py-2 text-left">メモ</th>
                    <th className="px-3 py-2 text-center w-[120px]">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyItems.length === 0 ? (
                    <tr>
                      <td
                        className="px-3 py-4 text-center text-[11px] text-muted"
                        colSpan={8}
                      >
                        この日付にはまだ店舗リクエストが登録されていません。
                      </td>
                    </tr>
                  ) : (
                    dailyItems.map((req: ScheduleShopRequest) => (
                      <tr
                        key={req.id}
                        className="border-t border-white/5 hover:bg-slate-900/30"
                      >
                        <td className="px-3 py-2 font-mono">{req.code}</td>
                        <td className="px-3 py-2">{req.name}</td>
                        <td className="px-3 py-2 text-right">
                          {req.requestedHeadcount} 名
                        </td>
                        <td className="px-3 py-2 text-right">
                          {req.minHourly
                            ? `¥${req.minHourly.toLocaleString()}`
                            : "-"}
                          {" 〜 "}
                          {req.maxHourly
                            ? `¥${req.maxHourly.toLocaleString()}`
                            : "-"}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {req.minAge ?? "-"}{" 〜 "}
                          {req.maxAge ?? "-"} 歳
                        </td>
                        <td className="px-3 py-2 text-center">
                          {req.requireDrinkOk ? "飲酒OK必須" : "不問"}
                        </td>
                        <td className="px-3 py-2 max-w-[260px]">
                          <span className="line-clamp-2 text-[11px] text-ink/80">
                            {req.note || "-"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              className="tiara-btn text-[11px] px-3 py-1"
                              onClick={() => openEdit(req)}
                            >
                              編集
                            </button>
                            <button
                              type="button"
                              className="rounded-xl border border-red-500/70 bg-red-500/10 text-red-100 px-3 py-1 text-[11px]"
                              onClick={() => deleteItem(req)}
                            >
                              削除
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* 右：1週間サマリー */}
          <aside className="tiara-panel w-[260px] shrink-0 p-3 flex flex-col">
            <header className="pb-2 border-b border-white/10">
              <h2 className="text-xs font-semibold text-ink">
                {selectedDateLabel} から 1 週間の予定
              </h2>
              <p className="mt-0.5 text-[11px] text-muted">
                日付ごとの登録件数のざっくりサマリーです。
                将来的にカレンダー表示に差し替え予定。
              </p>
            </header>

            <div className="mt-2 flex-1 overflow-auto text-xs">
              <ul className="space-y-1.5">
                {weeklySummary.range.map((dKey: string) => {
                  const count = weeklySummary.counts[dKey] ?? 0;
                  const isToday = dKey === TODAY;
                  const isSelected = dKey === selectedDate;

                  const label =
                    dKey === TODAY
                      ? "本日"
                      : dKey === TOMORROW
                      ? "明日"
                      : dKey;

                  return (
                    <li key={dKey}>
                      <button
                        type="button"
                        className={
                          "w-full flex items-center justify-between rounded-lg border px-2 py-1.5 transition-colors " +
                          (isSelected
                            ? "bg-sky-600/30 border-sky-400 text-ink"
                            : "bg-white/5 border-white/10 text-ink/80 hover:border-sky-400")
                        }
                        onClick={() => setSelectedDate(dKey)}
                      >
                        <div className="flex flex-col text-left">
                          <span className="font-mono text-[11px]">
                            {dKey}
                          </span>
                          <span className="text-[10px] text-muted">
                            {label}
                            {isToday ? "（Today）" : ""}
                          </span>
                        </div>
                        <span className="text-[11px]">{count} 件</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </aside>
        </div>
      </div>

      {/* 編集 / 新規追加モーダル */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={closeEdit} />
          <div className="relative z-10 w-full max-w-2xl max-h-[85vh] rounded-2xl bg-slate-950 border border-white/10 shadow-xl flex flex-col overflow-hidden">
            <header className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-ink">
                  {editingIsNew
                    ? "新規店舗リクエストを追加"
                    : "店舗リクエストを編集"}
                </h2>
                <p className="mt-0.5 text-[11px] text-muted">
                  指定日の店舗リクエスト条件を設定します。
                </p>
              </div>
              <button
                type="button"
                className="text-xs text-muted hover:text-ink"
                onClick={closeEdit}
              >
                ✕
              </button>
            </header>

            <div className="flex-1 overflow-auto p-4 space-y-4 text-xs text-ink">
              <div>
                <label className="block text-[11px] text-muted mb-1">
                  日付（変更すると別の日付の予定になります）
                </label>
                <input
                  type="date"
                  className="tiara-input h-8 w-full text-xs"
                  value={editing.date}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      date: e.target.value || editing.date,
                    })
                  }
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-[11px] text-muted mb-1">
                    店舗番号
                  </label>
                  <input
                    className="tiara-input h-8 w-full text-xs"
                    placeholder="例）001"
                    value={editing.code}
                    onChange={(e) =>
                      setEditing({ ...editing, code: e.target.value })
                    }
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-[11px] text-muted mb-1">
                    店舗名
                  </label>
                  <input
                    className="tiara-input h-8 w-full text-xs"
                    placeholder="例）クラブ ティアラ本店"
                    value={editing.name}
                    onChange={(e) =>
                      setEditing({ ...editing, name: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-[11px] text-muted mb-1">
                    希望人数
                  </label>
                  <input
                    type="number"
                    className="tiara-input h-8 w-full text-xs text-right"
                    min={0}
                    value={editing.requestedHeadcount}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        requestedHeadcount: Number(e.target.value || 0),
                      })
                    }
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-muted mb-1">
                    飲酒条件
                  </label>
                  <select
                    className="tiara-input h-8 w-full text-xs"
                    value={editing.requireDrinkOk ? "require" : "any"}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        requireDrinkOk: e.target.value === "require",
                      })
                    }
                  >
                    <option value="any">不問（飲酒NGも可）</option>
                    <option value="require">飲酒OK必須</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] text-muted mb-1">
                    希望時給レンジ（円）
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      className="tiara-input h-8 w-full text-xs text-right"
                      placeholder="min"
                      value={editing.minHourly ?? ""}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          minHourly: e.target.value
                            ? Number(e.target.value)
                            : undefined,
                        })
                      }
                    />
                    <span className="text-muted">〜</span>
                    <input
                      type="number"
                      className="tiara-input h-8 w-full text-xs text-right"
                      placeholder="max"
                      value={editing.maxHourly ?? ""}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          maxHourly: e.target.value
                            ? Number(e.target.value)
                            : undefined,
                        })
                      }
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-muted mb-1">
                    希望年齢レンジ（歳）
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      className="tiara-input h-8 w-full text-xs text-right"
                      placeholder="min"
                      value={editing.minAge ?? ""}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          minAge: e.target.value
                            ? Number(e.target.value)
                            : undefined,
                        })
                      }
                    />
                    <span className="text-muted">〜</span>
                    <input
                      type="number"
                      className="tiara-input h-8 w-full text-xs text-right"
                      placeholder="max"
                      value={editing.maxAge ?? ""}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          maxAge: e.target.value
                            ? Number(e.target.value)
                            : undefined,
                        })
                      }
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-muted mb-1">
                  備考メモ（NG情報・客層など）
                </label>
                <textarea
                  className="tiara-input w-full text-xs min-h-[80px]"
                  value={editing.note ?? ""}
                  onChange={(e) =>
                    setEditing({ ...editing, note: e.target.value })
                  }
                  placeholder="例）NGキャスト: A101 / A205 など。客層・希望タイプ・注意事項などを記載。"
                />
              </div>
            </div>

            <footer className="px-4 py-3 border-t border-white/10 flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-xl border border-white/20 bg-white/5 text-ink px-4 py-1.5 text-xs"
                onClick={closeEdit}
              >
                キャンセル
              </button>
              <button
                type="button"
                className="tiara-btn text-xs"
                onClick={saveEdit}
              >
                {editingIsNew ? "追加（ローカル）" : "保存（ローカル）"}
              </button>
            </footer>
          </div>
        </div>
      )}
    </AppShell>
  );
}
