// src/app/daily-report/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { listShopOrders, type ShopOrderRecord } from "@/lib/api.shop-orders";
import {
  getDailyReport,
  saveDailyReport,
  type DailyReportRecord,
} from "@/lib/api.daily-reports";

type ExpenseRow = { label: string; amount: string };
type FeeRow = { name: string; shop: string; amount: string };
type ReferralRow = { referrer: string; girl: string; amount: string };

const MIN_EXPENSE_ROWS = 8;
const MIN_FEE_ROWS = 12;
const MIN_REFERRAL_ROWS = 10;

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

const padRows = <T,>(rows: T[], target: number, blank: () => T) => {
  if (rows.length >= target) return rows;
  return rows.concat(Array.from({ length: target - rows.length }, blank));
};

const toNumberOrNull = (value: string) => {
  const raw = value.trim();
  if (!raw) return null;
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

export default function DailyReportPage() {
  const [dateKey, setDateKey] = useState<string>(() => todayKey());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [orders, setOrders] = useState<ShopOrderRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [summary, setSummary] = useState({
    feeSubtotal: "",
    advisorFee: "",
    totalAmount: "",
    startAmount: "",
    uncollectedFee: "",
    collectedFee: "",
    referralFee: "",
    cashDiff: "",
    expenseTotal: "",
    calcTotal: "",
    cashBalance: "",
    difference: "",
  });

  const [expenseRows, setExpenseRows] = useState<ExpenseRow[]>(
    Array.from({ length: MIN_EXPENSE_ROWS }, () => ({ label: "", amount: "" })),
  );
  const [uncollectedRows, setUncollectedRows] = useState<FeeRow[]>(
    Array.from({ length: MIN_FEE_ROWS }, () => ({
      name: "",
      shop: "",
      amount: "",
    })),
  );
  const [collectedRows, setCollectedRows] = useState<FeeRow[]>(
    Array.from({ length: MIN_FEE_ROWS }, () => ({
      name: "",
      shop: "",
      amount: "",
    })),
  );
  const [referralRows, setReferralRows] = useState<ReferralRow[]>(
    Array.from({ length: MIN_REFERRAL_ROWS }, () => ({
      referrer: "",
      girl: "",
      amount: "",
    })),
  );
  const [salesReport, setSalesReport] = useState({
    cases: "",
    exchangeCases: "",
  });
  const [registrations, setRegistrations] = useState({
    hp: "",
    portal: "",
    scout: "",
    girlReferral: "",
    total: "",
  });
  const [memo, setMemo] = useState("");

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    Promise.all([listShopOrders(dateKey), getDailyReport(dateKey)])
      .then(([orderRes, report]) => {
        if (!mounted) return;
        setOrders(orderRes);
        if (report) {
          applyReport(report);
        } else {
          resetReportState();
        }
      })
      .catch(() => {
        if (!mounted) return;
        setOrders([]);
        resetReportState();
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateKey]);

  const confirmed = useMemo(() => countConfirmed(orders), [orders]);
  const dispatchCount = confirmed.length;
  const dispatchPeople = useMemo(
    () => sumConfirmedAssignments(orders),
    [orders],
  );
  const reiwa = useMemo(() => formatReiwa(dateKey), [dateKey]);
  const weekday = useMemo(() => formatWeekday(dateKey), [dateKey]);

  const applyReport = (report: DailyReportRecord) => {
    setSummary({
      feeSubtotal: report.feeSubtotal?.toString() ?? "",
      advisorFee: report.advisorFee?.toString() ?? "",
      totalAmount: report.totalAmount?.toString() ?? "",
      startAmount: report.startAmount?.toString() ?? "",
      uncollectedFee: report.uncollectedFee?.toString() ?? "",
      collectedFee: report.collectedFee?.toString() ?? "",
      referralFee: report.referralFee?.toString() ?? "",
      cashDiff: report.cashDiff?.toString() ?? "",
      expenseTotal: report.expenseTotal?.toString() ?? "",
      calcTotal: report.calcTotal?.toString() ?? "",
      cashBalance: report.cashBalance?.toString() ?? "",
      difference: report.difference?.toString() ?? "",
    });
    setExpenseRows(
      padRows(
        Array.isArray(report.expenseItems)
          ? report.expenseItems.map((r: any) => ({
              label: r?.label ?? "",
              amount: r?.amount ?? "",
            }))
          : [],
        MIN_EXPENSE_ROWS,
        () => ({ label: "", amount: "" }),
      ),
    );
    setUncollectedRows(
      padRows(
        Array.isArray(report.uncollectedItems)
          ? report.uncollectedItems.map((r: any) => ({
              name: r?.name ?? "",
              shop: r?.shop ?? "",
              amount: r?.amount ?? "",
            }))
          : [],
        MIN_FEE_ROWS,
        () => ({ name: "", shop: "", amount: "" }),
      ),
    );
    setCollectedRows(
      padRows(
        Array.isArray(report.collectedItems)
          ? report.collectedItems.map((r: any) => ({
              name: r?.name ?? "",
              shop: r?.shop ?? "",
              amount: r?.amount ?? "",
            }))
          : [],
        MIN_FEE_ROWS,
        () => ({ name: "", shop: "", amount: "" }),
      ),
    );
    setReferralRows(
      padRows(
        Array.isArray(report.referralItems)
          ? report.referralItems.map((r: any) => ({
              referrer: r?.referrer ?? "",
              girl: r?.girl ?? "",
              amount: r?.amount ?? "",
            }))
          : [],
        MIN_REFERRAL_ROWS,
        () => ({ referrer: "", girl: "", amount: "" }),
      ),
    );
    setSalesReport({
      cases: report.salesReport?.cases ?? "",
      exchangeCases: report.salesReport?.exchangeCases ?? "",
    });
    setRegistrations({
      hp: report.registrations?.hp ?? "",
      portal: report.registrations?.portal ?? "",
      scout: report.registrations?.scout ?? "",
      girlReferral: report.registrations?.girlReferral ?? "",
      total: report.registrations?.total ?? "",
    });
    setMemo(report.memo ?? "");
  };

  const resetReportState = () => {
    setSummary({
      feeSubtotal: "",
      advisorFee: "",
      totalAmount: "",
      startAmount: "",
      uncollectedFee: "",
      collectedFee: "",
      referralFee: "",
      cashDiff: "",
      expenseTotal: "",
      calcTotal: "",
      cashBalance: "",
      difference: "",
    });
    setExpenseRows(
      Array.from({ length: MIN_EXPENSE_ROWS }, () => ({
        label: "",
        amount: "",
      })),
    );
    setUncollectedRows(
      Array.from({ length: MIN_FEE_ROWS }, () => ({
        name: "",
        shop: "",
        amount: "",
      })),
    );
    setCollectedRows(
      Array.from({ length: MIN_FEE_ROWS }, () => ({
        name: "",
        shop: "",
        amount: "",
      })),
    );
    setReferralRows(
      Array.from({ length: MIN_REFERRAL_ROWS }, () => ({
        referrer: "",
        girl: "",
        amount: "",
      })),
    );
    setSalesReport({ cases: "", exchangeCases: "" });
    setRegistrations({
      hp: "",
      portal: "",
      scout: "",
      girlReferral: "",
      total: "",
    });
    setMemo("");
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveDailyReport({
        date: dateKey,
        dispatchCount,
        dispatchPeople,
        feeSubtotal: toNumberOrNull(summary.feeSubtotal),
        advisorFee: toNumberOrNull(summary.advisorFee),
        totalAmount: toNumberOrNull(summary.totalAmount),
        startAmount: toNumberOrNull(summary.startAmount),
        uncollectedFee: toNumberOrNull(summary.uncollectedFee),
        collectedFee: toNumberOrNull(summary.collectedFee),
        referralFee: toNumberOrNull(summary.referralFee),
        cashDiff: toNumberOrNull(summary.cashDiff),
        expenseTotal: toNumberOrNull(summary.expenseTotal),
        calcTotal: toNumberOrNull(summary.calcTotal),
        cashBalance: toNumberOrNull(summary.cashBalance),
        difference: toNumberOrNull(summary.difference),
        expenseItems: expenseRows,
        uncollectedItems: uncollectedRows,
        collectedItems: collectedRows,
        referralItems: referralRows,
        salesReport,
        registrations,
        memo,
      });
      alert("保存しました。");
    } catch {
      alert("保存に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setSaving(false);
    }
  };

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
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? "保存中..." : "保存"}
              </button>
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
                {label === "派遣件数" ? (
                  dispatchCount
                ) : label === "派遣人数" ? (
                  dispatchPeople
                ) : label === "手数料計" ? (
                  <input
                    className="w-full bg-transparent text-right text-xs px-2"
                    value={summary.feeSubtotal}
                    onChange={(e) =>
                      setSummary((prev) => ({
                        ...prev,
                        feeSubtotal: e.target.value,
                      }))
                    }
                  />
                ) : label === "顧問料" ? (
                  <input
                    className="w-full bg-transparent text-right text-xs px-2"
                    value={summary.advisorFee}
                    onChange={(e) =>
                      setSummary((prev) => ({
                        ...prev,
                        advisorFee: e.target.value,
                      }))
                    }
                  />
                ) : (
                  <input
                    className="w-full bg-transparent text-right text-xs px-2"
                    value={summary.totalAmount}
                    onChange={(e) =>
                      setSummary((prev) => ({
                        ...prev,
                        totalAmount: e.target.value,
                      }))
                    }
                  />
                )}
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
                  { label: "本日スタート", key: "startAmount" },
                  { label: "手数料未回収", key: "uncollectedFee" },
                  { label: "", key: null },
                  { label: "手数料回収", key: "collectedFee" },
                  { label: "紹介手数料", key: "referralFee" },
                  { label: "差引現金", key: "cashDiff" },
                ].map((row, i) => (
                  <div
                    key={`${row.label}-${i}`}
                    className="border-b border-slate-500 border-r border-slate-500 last:border-r-0 px-2 py-1 h-7 flex items-center"
                  >
                    {row.label && <span className="mr-2">{row.label}</span>}
                    {row.key && (
                      <input
                        className="ml-auto w-24 bg-transparent text-right text-xs"
                        value={(summary as any)[row.key]}
                        onChange={(e) =>
                          setSummary((prev) => ({
                            ...prev,
                            [row.key]: e.target.value,
                          }))
                        }
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="border border-slate-500 bg-white">
              <div className="border-b border-slate-500 px-2 py-1 text-sm flex items-center justify-between">
                <span>経費</span>
                <button
                  type="button"
                  className="border border-slate-500 bg-white px-2 py-0.5 text-xs"
                  onClick={() =>
                    setExpenseRows((prev) => [
                      ...prev,
                      { label: "", amount: "" },
                    ])
                  }
                >
                  ＋行追加
                </button>
              </div>
              <div className="grid grid-cols-[1fr_1fr] text-sm">
                {expenseRows.map((row, idx) => (
                  <div
                    key={idx}
                    className="border-b border-slate-500 border-r border-slate-500 last:border-r-0 px-2 py-1 h-7 flex items-center gap-2"
                  >
                    <input
                      className="flex-1 bg-transparent text-xs"
                      value={row.label}
                      onChange={(e) =>
                        setExpenseRows((prev) =>
                          prev.map((r, i) =>
                            i === idx ? { ...r, label: e.target.value } : r,
                          ),
                        )
                      }
                    />
                    <input
                      className="w-24 bg-transparent text-right text-xs"
                      value={row.amount}
                      onChange={(e) =>
                        setExpenseRows((prev) =>
                          prev.map((r, i) =>
                            i === idx ? { ...r, amount: e.target.value } : r,
                          ),
                        )
                      }
                    />
                  </div>
                ))}
                <div className="border-t border-slate-500 border-r border-slate-500 px-2 py-1 h-7 flex items-center">
                  経費合計
                </div>
                <div className="border-t border-slate-500 px-2 py-1 h-7 flex items-center">
                  <input
                    className="w-full bg-transparent text-right text-xs"
                    value={summary.expenseTotal}
                    onChange={(e) =>
                      setSummary((prev) => ({
                        ...prev,
                        expenseTotal: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>
            </div>

            <div className="border border-slate-500 bg-white">
              <div className="grid grid-cols-[1fr_1fr] text-sm">
                {[
                  { label: "計算上合計", key: "calcTotal" },
                  { label: "現金残", key: "cashBalance" },
                  { label: "差額", key: "difference" },
                ].map((row, i) => (
                  <div
                    key={`${row.label}-${i}`}
                    className="border-b border-slate-500 border-r border-slate-500 last:border-r-0 px-2 py-1 h-7 flex items-center"
                  >
                    <span className="mr-2">{row.label}</span>
                    <input
                      className="ml-auto w-24 bg-transparent text-right text-xs"
                      value={(summary as any)[row.key]}
                      onChange={(e) =>
                        setSummary((prev) => ({
                          ...prev,
                          [row.key]: e.target.value,
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="border border-slate-500 bg-white">
              <div className="border-b border-slate-500 px-2 py-1 text-sm flex items-center justify-between">
                <span>紹介手数料</span>
                <button
                  type="button"
                  className="border border-slate-500 bg-white px-2 py-0.5 text-xs"
                  onClick={() =>
                    setReferralRows((prev) => [
                      ...prev,
                      { referrer: "", girl: "", amount: "" },
                    ])
                  }
                >
                  ＋行追加
                </button>
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
                {referralRows.map((row, idx) => (
                  <div
                    key={idx}
                    className="border-b border-r border-slate-500 last:border-r-0 px-2 py-1 h-7"
                  >
                    <input
                      className="w-full bg-transparent text-xs"
                      value={row.referrer}
                      onChange={(e) =>
                        setReferralRows((prev) =>
                          prev.map((r, i) =>
                            i === idx ? { ...r, referrer: e.target.value } : r,
                          ),
                        )
                      }
                    />
                  </div>
                ))}
                {referralRows.map((row, idx) => (
                  <div
                    key={idx}
                    className="border-b border-r border-slate-500 last:border-r-0 px-2 py-1 h-7"
                  >
                    <input
                      className="w-full bg-transparent text-xs"
                      value={row.girl}
                      onChange={(e) =>
                        setReferralRows((prev) =>
                          prev.map((r, i) =>
                            i === idx ? { ...r, girl: e.target.value } : r,
                          ),
                        )
                      }
                    />
                  </div>
                ))}
                {referralRows.map((row, idx) => (
                  <div
                    key={idx}
                    className="border-b border-r border-slate-500 last:border-r-0 px-2 py-1 h-7"
                  >
                    <input
                      className="w-full bg-transparent text-right text-xs"
                      value={row.amount}
                      onChange={(e) =>
                        setReferralRows((prev) =>
                          prev.map((r, i) =>
                            i === idx ? { ...r, amount: e.target.value } : r,
                          ),
                        )
                      }
                    />
                  </div>
                ))}
                <div className="border-t border-slate-500 border-r border-slate-500 px-2 py-1 text-center col-span-2">
                  合計
                </div>
                <div className="border-t border-slate-500 px-2 py-1">
                  <input
                    className="w-full bg-transparent text-right text-xs"
                    value={summary.referralFee}
                    onChange={(e) =>
                      setSummary((prev) => ({
                        ...prev,
                        referralFee: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <div className="border border-slate-500 bg-white">
              <div className="border-b border-slate-500 px-2 py-1 text-sm flex items-center justify-between">
                <span>手数料未回収</span>
                <button
                  type="button"
                  className="border border-slate-500 bg-white px-2 py-0.5 text-xs"
                  onClick={() =>
                    setUncollectedRows((prev) => [
                      ...prev,
                      { name: "", shop: "", amount: "" },
                    ])
                  }
                >
                  ＋行追加
                </button>
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
                {uncollectedRows.map((row, idx) => (
                  <div
                    key={idx}
                    className="border-b border-r border-slate-500 last:border-r-0 px-2 py-1 h-7"
                  >
                    <input
                      className="w-full bg-transparent text-xs"
                      value={row.name}
                      onChange={(e) =>
                        setUncollectedRows((prev) =>
                          prev.map((r, i) =>
                            i === idx ? { ...r, name: e.target.value } : r,
                          ),
                        )
                      }
                    />
                  </div>
                ))}
                {uncollectedRows.map((row, idx) => (
                  <div
                    key={idx}
                    className="border-b border-r border-slate-500 last:border-r-0 px-2 py-1 h-7"
                  >
                    <input
                      className="w-full bg-transparent text-xs"
                      value={row.shop}
                      onChange={(e) =>
                        setUncollectedRows((prev) =>
                          prev.map((r, i) =>
                            i === idx ? { ...r, shop: e.target.value } : r,
                          ),
                        )
                      }
                    />
                  </div>
                ))}
                {uncollectedRows.map((row, idx) => (
                  <div
                    key={idx}
                    className="border-b border-r border-slate-500 last:border-r-0 px-2 py-1 h-7"
                  >
                    <input
                      className="w-full bg-transparent text-right text-xs"
                      value={row.amount}
                      onChange={(e) =>
                        setUncollectedRows((prev) =>
                          prev.map((r, i) =>
                            i === idx ? { ...r, amount: e.target.value } : r,
                          ),
                        )
                      }
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="border border-slate-500 bg-white">
              <div className="border-b border-slate-500 px-2 py-1 text-sm flex items-center justify-between">
                <span>手数料回収</span>
                <button
                  type="button"
                  className="border border-slate-500 bg-white px-2 py-0.5 text-xs"
                  onClick={() =>
                    setCollectedRows((prev) => [
                      ...prev,
                      { name: "", shop: "", amount: "" },
                    ])
                  }
                >
                  ＋行追加
                </button>
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
                {collectedRows.map((row, idx) => (
                  <div
                    key={idx}
                    className="border-b border-r border-slate-500 last:border-r-0 px-2 py-1 h-7"
                  >
                    <input
                      className="w-full bg-transparent text-xs"
                      value={row.name}
                      onChange={(e) =>
                        setCollectedRows((prev) =>
                          prev.map((r, i) =>
                            i === idx ? { ...r, name: e.target.value } : r,
                          ),
                        )
                      }
                    />
                  </div>
                ))}
                {collectedRows.map((row, idx) => (
                  <div
                    key={idx}
                    className="border-b border-r border-slate-500 last:border-r-0 px-2 py-1 h-7"
                  >
                    <input
                      className="w-full bg-transparent text-xs"
                      value={row.shop}
                      onChange={(e) =>
                        setCollectedRows((prev) =>
                          prev.map((r, i) =>
                            i === idx ? { ...r, shop: e.target.value } : r,
                          ),
                        )
                      }
                    />
                  </div>
                ))}
                {collectedRows.map((row, idx) => (
                  <div
                    key={idx}
                    className="border-b border-r border-slate-500 last:border-r-0 px-2 py-1 h-7"
                  >
                    <input
                      className="w-full bg-transparent text-right text-xs"
                      value={row.amount}
                      onChange={(e) =>
                        setCollectedRows((prev) =>
                          prev.map((r, i) =>
                            i === idx ? { ...r, amount: e.target.value } : r,
                          ),
                        )
                      }
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-[1fr_1fr] gap-4">
              <div className="border border-slate-500 bg-white">
                <div className="border-b border-slate-500 px-2 py-1 text-sm">
                  営業報告
                </div>
                <div className="grid grid-cols-[1fr_1fr] text-sm">
                  {[
                    { label: "件数", key: "cases" },
                    { label: "交換件数", key: "exchangeCases" },
                  ].map((row) => (
                    <div
                      key={row.key}
                      className="border-b border-r border-slate-500 last:border-r-0 px-2 py-1 h-7 flex items-center"
                    >
                      <span className="mr-2">{row.label}</span>
                      <input
                        className="ml-auto w-20 bg-transparent text-right text-xs"
                        value={(salesReport as any)[row.key]}
                        onChange={(e) =>
                          setSalesReport((prev) => ({
                            ...prev,
                            [row.key]: e.target.value,
                          }))
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="border border-slate-500 bg-white">
                <div className="border-b border-slate-500 px-2 py-1 text-sm">
                  登録人数
                </div>
                <div className="grid grid-cols-[1fr_1fr] text-sm">
                  {[
                    { label: "HP", key: "hp" },
                    { label: "まとめサイト", key: "portal" },
                    { label: "スカウト", key: "scout" },
                    { label: "女の子紹介", key: "girlReferral" },
                    { label: "合計", key: "total" },
                  ].map((row) => (
                    <div
                      key={row.key}
                      className="border-b border-r border-slate-500 last:border-r-0 px-2 py-1 h-7 flex items-center"
                    >
                      <span className="mr-2">{row.label}</span>
                      <input
                        className="ml-auto w-20 bg-transparent text-right text-xs"
                        value={(registrations as any)[row.key]}
                        onChange={(e) =>
                          setRegistrations((prev) => ({
                            ...prev,
                            [row.key]: e.target.value,
                          }))
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </div>

        <section className="border border-slate-500 bg-white">
          <div className="border-b border-slate-500 px-2 py-1 text-sm">
            営業について
          </div>
          <textarea
            className="w-full h-36 px-3 py-2 text-sm outline-none resize-none"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
          />
        </section>

        {loading && (
          <div className="text-xs text-gray-500">データ取得中...</div>
        )}
      </div>
    </AppShell>
  );
}
