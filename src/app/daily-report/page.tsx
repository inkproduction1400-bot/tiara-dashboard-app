// src/app/daily-report/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { listShopOrders, type ShopOrderRecord } from "@/lib/api.shop-orders";

const toDateKey = (d: Date) => {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const dd = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${dd}`;
};

const todayKey = () => {
  const d = new Date();
  if (d.getHours() < 5) d.setDate(d.getDate() - 1);
  return toDateKey(d);
};

const formatReiwa = (dateKey: string) => {
  const [y, m, d] = dateKey.split("-").map((v) => Number(v));
  if (!y || !m || !d) return { era: "", year: "", month: "", day: "" };
  const reiwaYear = y - 2018;
  return {
    era: "令和",
    year: String(reiwaYear),
    month: String(m),
    day: String(d),
  };
};

const formatWeekday = (dateKey: string) => {
  const [y, m, d] = dateKey.split("-").map((v) => Number(v));
  if (!y || !m || !d) return "";
  const dt = new Date(y, m - 1, d);
  return ["日", "月", "火", "水", "木", "金", "土"][dt.getDay()];
};

const countConfirmed = (orders: ShopOrderRecord[]) =>
  orders.filter((o) => o?.status === "confirmed");

const sumConfirmedAssignments = (orders: ShopOrderRecord[]) =>
  orders.reduce((sum, order) => {
    if (order?.status !== "confirmed") return sum;
    if (Array.isArray(order?.assignments)) {
      return sum + order.assignments.length;
    }
    const headcount = Number(order?.headcount ?? 0);
    return sum + (Number.isFinite(headcount) ? headcount : 0);
  }, 0);

const rowCells = (count: number) =>
  Array.from({ length: count }, (_, i) => (
    <div
      key={i}
      className="h-6 border-b border-slate-500 last:border-b-0"
    />
  ));

export default function DailyReportPage() {
  const [dateKey, setDateKey] = useState<string>(() => todayKey());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [orders, setOrders] = useState<ShopOrderRecord[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    listShopOrders(dateKey)
      .then((res) => {
        if (!mounted) return;
        setOrders(res);
      })
      .catch(() => {
        if (!mounted) return;
        setOrders([]);
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [dateKey]);

  const confirmed = useMemo(() => countConfirmed(orders), [orders]);
  const dispatchCount = confirmed.length;
  const dispatchPeople = useMemo(
    () => sumConfirmedAssignments(orders),
    [orders],
  );
  const reiwa = useMemo(() => formatReiwa(dateKey), [dateKey]);
  const weekday = useMemo(() => formatWeekday(dateKey), [dateKey]);

  return (
    <AppShell>
      <div className="h-full flex flex-col gap-4">
        <header className="flex items-center justify-between border border-slate-500 bg-white px-3 py-2">
          <div className="text-lg font-semibold tracking-wide">
            ティアラ　日報
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span>
              {reiwa.era} {reiwa.year} 年 {reiwa.month} 月 {reiwa.day} 日（
              {weekday}）
            </span>
            <div className="flex items-center gap-2 print:hidden">
              <button
                type="button"
                className="border border-slate-500 bg-white px-2 py-1 text-xs"
                onClick={() => {
                  const [y, m, d] = dateKey.split("-").map(Number);
                  const dt = new Date(y, m - 1, d);
                  dt.setDate(dt.getDate() - 1);
                  setDateKey(toDateKey(dt));
                }}
              >
                前日
              </button>
              <button
                type="button"
                className="border border-slate-500 bg-white px-2 py-1 text-xs"
                onClick={() => {
                  const [y, m, d] = dateKey.split("-").map(Number);
                  const dt = new Date(y, m - 1, d);
                  dt.setDate(dt.getDate() + 1);
                  setDateKey(toDateKey(dt));
                }}
              >
                翌日
              </button>
              <button
                type="button"
                className="border border-slate-500 bg-white px-2 py-1 text-xs"
                onClick={() => setCalendarOpen((v) => !v)}
              >
                日付選択
              </button>
              {calendarOpen && (
                <input
                  type="date"
                  className="border border-slate-500 bg-white px-2 py-1 text-xs"
                  value={dateKey}
                  onChange={(e) => {
                    setDateKey(e.target.value);
                    setCalendarOpen(false);
                  }}
                />
              )}
              <button
                type="button"
                className="border border-slate-500 bg-white px-2 py-1 text-xs"
                onClick={() => window.print()}
              >
                印刷
              </button>
            </div>
          </div>
        </header>

        <section className="grid grid-cols-5 border border-slate-500 bg-white text-sm">
          {[
            "派遣件数",
            "派遣人数",
            "手数料計",
            "顧問料",
            "合計",
          ].map((label) => (
            <div
              key={label}
              className="border-r border-slate-500 last:border-r-0"
            >
              <div className="border-b border-slate-500 px-2 py-1 text-center">
                {label}
              </div>
              <div className="h-8 flex items-center justify-center text-lg">
                {label === "派遣件数"
                  ? dispatchCount
                  : label === "派遣人数"
                    ? dispatchPeople
                    : ""}
              </div>
            </div>
          ))}
        </section>

        <div className="grid grid-cols-[1fr_1.2fr] gap-4">
          <section className="space-y-4">
            <div className="border border-slate-500 bg-white">
              <div className="border-b border-slate-500 px-2 py-1 text-sm">
                収支計算
              </div>
              <div className="grid grid-cols-[1fr_1fr] text-sm">
                {[
                  "本日スタート",
                  "手数料未回収",
                  "",
                  "手数料回収",
                  "紹介手数料",
                  "差引現金",
                ].map((label, i) => (
                  <div
                    key={`${label}-${i}`}
                    className="border-b border-slate-500 border-r border-slate-500 last:border-r-0 px-2 py-1 h-7"
                  >
                    {label}
                  </div>
                ))}
              </div>
            </div>

            <div className="border border-slate-500 bg-white">
              <div className="border-b border-slate-500 px-2 py-1 text-sm">
                経費
              </div>
              <div className="grid grid-cols-[1fr_1fr] text-sm">
                {rowCells(8).map((cell, idx) => (
                  <div
                    key={idx}
                    className="border-b border-slate-500 border-r border-slate-500 last:border-r-0 px-2 py-1 h-7"
                  >
                    {cell}
                  </div>
                ))}
                <div className="border-t border-slate-500 border-r border-slate-500 px-2 py-1 h-7">
                  経費合計
                </div>
                <div className="border-t border-slate-500 px-2 py-1 h-7" />
              </div>
            </div>

            <div className="border border-slate-500 bg-white">
              <div className="grid grid-cols-[1fr_1fr] text-sm">
                {[
                  "計算上合計",
                  "",
                  "現金残",
                  "",
                  "差額",
                  "",
                ].map((label, i) => (
                  <div
                    key={`${label}-${i}`}
                    className="border-b border-slate-500 border-r border-slate-500 last:border-r-0 px-2 py-1 h-7"
                  >
                    {label}
                  </div>
                ))}
              </div>
            </div>

            <div className="border border-slate-500 bg-white">
              <div className="border-b border-slate-500 px-2 py-1 text-sm">
                紹介手数料
              </div>
              <div className="grid grid-cols-[1fr_1fr_1fr] text-sm">
                {["紹介者", "女の子", "金額"].map((label) => (
                  <div
                    key={label}
                    className="border-b border-r border-slate-500 last:border-r-0 px-2 py-1 text-center"
                  >
                    {label}
                  </div>
                ))}
                {rowCells(10).map((_, idx) => (
                  <div
                    key={idx}
                    className="border-b border-r border-slate-500 last:border-r-0 px-2 py-1 h-7"
                  />
                ))}
                <div className="border-t border-slate-500 border-r border-slate-500 px-2 py-1 text-center">
                  合計
                </div>
                <div className="border-t border-slate-500 border-r border-slate-500 px-2 py-1" />
                <div className="border-t border-slate-500 px-2 py-1" />
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <div className="border border-slate-500 bg-white">
              <div className="border-b border-slate-500 px-2 py-1 text-sm">
                手数料未回収
              </div>
              <div className="grid grid-cols-[1fr_1fr_1fr] text-sm">
                {["氏名", "店名", "金額"].map((label) => (
                  <div
                    key={label}
                    className="border-b border-r border-slate-500 last:border-r-0 px-2 py-1 text-center"
                  >
                    {label}
                  </div>
                ))}
                {rowCells(12).map((_, idx) => (
                  <div
                    key={idx}
                    className="border-b border-r border-slate-500 last:border-r-0 px-2 py-1 h-7"
                  />
                ))}
              </div>
            </div>

            <div className="border border-slate-500 bg-white">
              <div className="border-b border-slate-500 px-2 py-1 text-sm">
                手数料回収
              </div>
              <div className="grid grid-cols-[1fr_1fr_1fr] text-sm">
                {["氏名", "店名", "金額"].map((label) => (
                  <div
                    key={label}
                    className="border-b border-r border-slate-500 last:border-r-0 px-2 py-1 text-center"
                  >
                    {label}
                  </div>
                ))}
                {rowCells(12).map((_, idx) => (
                  <div
                    key={idx}
                    className="border-b border-r border-slate-500 last:border-r-0 px-2 py-1 h-7"
                  />
                ))}
              </div>
            </div>

            <div className="grid grid-cols-[1fr_1fr] gap-4">
              <div className="border border-slate-500 bg-white">
                <div className="border-b border-slate-500 px-2 py-1 text-sm">
                  営業報告
                </div>
                <div className="grid grid-cols-[1fr_1fr] text-sm">
                  {["件数", "", "交換件数", ""].map((label, i) => (
                    <div
                      key={`${label}-${i}`}
                      className="border-b border-r border-slate-500 last:border-r-0 px-2 py-1 h-7"
                    >
                      {label}
                    </div>
                  ))}
                </div>
              </div>

              <div className="border border-slate-500 bg-white">
                <div className="border-b border-slate-500 px-2 py-1 text-sm">
                  登録人数
                </div>
                <div className="grid grid-cols-[1fr_1fr] text-sm">
                  {["HP", "", "まとめサイト", "", "スカウト", "", "女の子紹介", "", "合計", ""].map(
                    (label, i) => (
                      <div
                        key={`${label}-${i}`}
                        className="border-b border-r border-slate-500 last:border-r-0 px-2 py-1 h-7"
                      >
                        {label}
                      </div>
                    ),
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>

        <section className="border border-slate-500 bg-white">
          <div className="border-b border-slate-500 px-2 py-1 text-sm">
            営業について
          </div>
          <div className="h-24 border-b border-slate-500" />
          <div className="h-24 border-b border-slate-500" />
          <div className="h-24" />
        </section>

        {loading && (
          <div className="text-xs text-gray-500">
            データ取得中...
          </div>
        )}
      </div>
    </AppShell>
  );
}
