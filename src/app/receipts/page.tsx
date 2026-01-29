"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { fetchReceiptTargets } from "@/lib/receipts/fetchReceiptTargets";
import type {
  AssignmentRow,
  ReceiptPayload,
  ReceiptStatus,
  ReceiptStatusEntry,
} from "@/lib/receipts/types";

const STATUS_STORAGE_KEY = "tiara:receipts:statusMap";

const toDateKey = (d: Date) => {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const dd = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${dd}`;
};

const getBusinessDate = () => {
  const now = new Date();
  if (now.getHours() < 5) now.setDate(now.getDate() - 1);
  return toDateKey(now);
};

const formatReiwa = (dateKey: string) => {
  const [y, m, d] = dateKey.split("-").map((v) => Number(v));
  if (!y || !m || !d) return { era: "", year: "", month: "", day: "" };
  return {
    era: "令和",
    year: String(y - 2018),
    month: String(m),
    day: String(d),
  };
};

const formatWeekday = (dateKey: string) => {
  const [y, m, d] = dateKey.split("-").map((v) => Number(v));
  if (!y || !m || !d) return "";
  return ["日", "月", "火", "水", "木", "金", "土"][
    new Date(y, m - 1, d).getDay()
  ];
};

const rowKey = (row: AssignmentRow) =>
  `${row.businessDate}|${row.castId}|${row.shopId}`;

const parseNumber = (value: string) => {
  const raw = value.trim();
  if (!raw) return undefined;
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : undefined;
};

type ReceiptFormState = {
  businessDate: string;
  receiptDate: string;
  castId: string;
  shopId: string;
  shopName: string;
  shopAddress: string;
  startTime: string;
  endTime: string;
  hourly: string;
  daily: string;
  fee: string;
  memo: string;
};

const buildFormState = (
  row: AssignmentRow,
  businessDate: string,
): ReceiptFormState => ({
  businessDate,
  receiptDate: businessDate,
  castId: row.castId,
  shopId: row.shopId,
  shopName: row.shopName,
  shopAddress: row.shopAddress ?? "",
  startTime: row.startTime ?? "",
  endTime: row.endTime ?? "",
  hourly: row.hourly ? String(row.hourly) : "",
  daily: row.daily ? String(row.daily) : "",
  fee: row.fee ? String(row.fee) : "",
  memo: "",
});

const toPayload = (form: ReceiptFormState): ReceiptPayload => ({
  businessDate: form.businessDate,
  receiptDate: form.receiptDate,
  castId: form.castId,
  shopId: form.shopId,
  shopName: form.shopName,
  shopAddress: form.shopAddress || undefined,
  startTime: form.startTime || undefined,
  endTime: form.endTime || undefined,
  hourly: parseNumber(form.hourly),
  daily: parseNumber(form.daily),
  fee: parseNumber(form.fee),
  memo: form.memo || undefined,
});

const loadStatusMap = (): Record<string, ReceiptStatusEntry> => {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STATUS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, ReceiptStatusEntry>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const saveStatusMap = (map: Record<string, ReceiptStatusEntry>) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(STATUS_STORAGE_KEY, JSON.stringify(map));
};

export default function ReceiptsPage() {
  const [businessDate, setBusinessDate] = useState(() => getBusinessDate());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [rows, setRows] = useState<AssignmentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusMap, setStatusMap] = useState<Record<string, ReceiptStatusEntry>>(
    {},
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [formState, setFormState] = useState<ReceiptFormState | null>(null);
  const [activeRow, setActiveRow] = useState<AssignmentRow | null>(null);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    setStatusMap(loadStatusMap());
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchReceiptTargets(businessDate)
      .then((data) => {
        if (active) setRows(data);
      })
      .catch(() => {
        if (active) setRows([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [businessDate]);

  useEffect(() => {
    saveStatusMap(statusMap);
  }, [statusMap]);

  const mergedRows = useMemo(() => {
    const currentKeys = new Set(rows.map(rowKey));
    const entries = Object.entries(statusMap);

    const storedUncollected = entries
      .filter(([, entry]) => entry.status === "uncollected" && entry.row)
      .map(([, entry]) => entry.row as AssignmentRow)
      .filter((row) => !currentKeys.has(rowKey(row)));

    const storedIssued = entries
      .filter(
        ([, entry]) =>
          entry.status === "issued" &&
          entry.row &&
          entry.row.businessDate === businessDate,
      )
      .map(([, entry]) => entry.row as AssignmentRow)
      .filter((row) => !currentKeys.has(rowKey(row)));

    return [...rows, ...storedUncollected, ...storedIssued];
  }, [rows, statusMap, businessDate]);

  const visibleRows = useMemo(() => {
    return mergedRows.filter((row) => {
      const entry = statusMap[rowKey(row)];
      if (!entry) return true;
      if (entry.status === "issued" && row.businessDate !== businessDate) {
        return false;
      }
      return true;
    });
  }, [mergedRows, statusMap, businessDate]);

  const reiwa = useMemo(() => formatReiwa(businessDate), [businessDate]);
  const weekday = useMemo(() => formatWeekday(businessDate), [businessDate]);

  const updateStatus = (
    key: string,
    status: ReceiptStatus,
    row?: AssignmentRow,
    payload?: ReceiptPayload,
  ) => {
    setStatusMap((prev) => {
      const next = { ...prev };
      if (status === "none") {
        delete next[key];
        return next;
      }
      next[key] = {
        status,
        row,
        payload,
        updatedAt: new Date().toISOString(),
      };
      return next;
    });
  };

  const handleOpenModal = (row: AssignmentRow) => {
    setFormState(buildFormState(row, businessDate));
    setActiveRow(row);
    setModalOpen(true);
  };

  const handleUncollected = (row: AssignmentRow) => {
    updateStatus(rowKey(row), "uncollected", row);
  };

  const handlePrint = async () => {
    if (!formState) return;
    const payload = toPayload(formState);
    setPrinting(true);
    try {
      const res = await fetch("/api/receipts/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `receipt_${payload.businessDate}_${payload.castId}_${payload.shopId}.xlsm`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      updateStatus(
        `${payload.businessDate}|${payload.castId}|${payload.shopId}`,
        "issued",
        activeRow ?? {
          businessDate: payload.businessDate,
          castId: payload.castId,
          castName: "",
          shopId: payload.shopId,
          shopName: payload.shopName,
          shopAddress: payload.shopAddress,
          startTime: payload.startTime,
          endTime: payload.endTime,
          hourly: payload.hourly,
          daily: payload.daily,
          fee: payload.fee,
        },
        payload,
      );
      setModalOpen(false);
      setFormState(null);
      setActiveRow(null);
    } catch (err) {
      console.error("[Receipts] export failed", err);
    } finally {
      setPrinting(false);
    }
  };

  const receiptDateParts = useMemo(() => {
    if (!formState?.receiptDate) return { year: "", month: "", day: "" };
    const [year, month, day] = formState.receiptDate.split("-");
    return {
      year: year ?? "",
      month: month ?? "",
      day: day ?? "",
    };
  }, [formState?.receiptDate]);

  const updateReceiptDateParts = (
    patch: Partial<{ year: string; month: string; day: string }>,
  ) => {
    if (!formState) return;
    const next = { ...receiptDateParts, ...patch };
    const y = next.year.trim();
    const m = next.month.trim().padStart(2, "0");
    const d = next.day.trim().padStart(2, "0");
    if (!y || !m || !d) return;
    setFormState({
      ...formState,
      receiptDate: `${y}-${m}-${d}`,
    });
  };

  const lineInputClass =
    "w-full border-b border-slate-500 bg-transparent text-sm focus:outline-none";
  const tinyLineInputClass =
    "w-full border-b border-slate-500 bg-transparent text-xs focus:outline-none";

  return (
    <AppShell>
      <div className="h-full flex flex-col gap-4">
        <header className="flex flex-wrap items-center justify-between border border-slate-500 bg-white px-3 py-2 gap-2">
          <div className="text-lg font-semibold tracking-wide">領収書</div>
          <div className="flex items-center gap-2 text-sm">
            <span>
              {reiwa.era} {reiwa.year} 年 {reiwa.month} 月 {reiwa.day} 日
              （{weekday}）
            </span>
            <div className="flex items-center gap-2 print:hidden">
              <button
                type="button"
                className="border border-slate-500 bg-white px-2 py-1 text-xs"
                onClick={() => {
                  const [y, m, d] = businessDate.split("-").map(Number);
                  const next = new Date(y, m - 1, d);
                  next.setDate(next.getDate() - 1);
                  setBusinessDate(toDateKey(next));
                }}
              >
                前日
              </button>
              <button
                type="button"
                className="border border-slate-500 bg-white px-2 py-1 text-xs"
                onClick={() => {
                  const [y, m, d] = businessDate.split("-").map(Number);
                  const next = new Date(y, m - 1, d);
                  next.setDate(next.getDate() + 1);
                  setBusinessDate(toDateKey(next));
                }}
              >
                翌日
              </button>
              <button
                type="button"
                className="border border-slate-500 bg-white px-2 py-1 text-xs"
                onClick={() => setCalendarOpen((prev) => !prev)}
              >
                日付選択
              </button>
              {calendarOpen && (
                <input
                  type="date"
                  className="border border-slate-500 bg-white px-2 py-1 text-xs"
                  value={businessDate}
                  onChange={(event) => {
                    setBusinessDate(event.target.value);
                    setCalendarOpen(false);
                  }}
                />
              )}
            </div>
          </div>
        </header>

        <div className="border border-slate-500 bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full text-sm">
              <thead>
                <tr className="border-b border-slate-500">
                  <th className="border-r border-slate-500 px-2 py-2 text-left">
                    日付
                  </th>
                  <th className="border-r border-slate-500 px-2 py-2 text-left">
                    キャスト名
                  </th>
                  <th className="border-r border-slate-500 px-2 py-2 text-left">
                    キャストID
                  </th>
                  <th className="border-r border-slate-500 px-2 py-2 text-left">
                    店舗名
                  </th>
                  <th className="border-r border-slate-500 px-2 py-2 text-left">
                    店舗ID
                  </th>
                  <th className="border-r border-slate-500 px-2 py-2 text-left">
                    状態
                  </th>
                  <th className="px-2 py-2 text-left">操作</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => {
                  const key = rowKey(row);
                  const status = statusMap[key]?.status ?? "none";
                  const rowClass =
                    status === "issued"
                      ? "bg-emerald-50"
                      : status === "uncollected"
                        ? "bg-amber-50"
                        : "";
                  const statusLabel =
                    status === "issued"
                      ? "領収書発行済み"
                      : status === "uncollected"
                        ? "未回収了承済み"
                        : "未処理";

                  return (
                    <tr key={key} className={`border-b border-slate-500 ${rowClass}`}>
                      <td className="border-r border-slate-500 px-2 py-2">
                        {row.businessDate}
                      </td>
                      <td className="border-r border-slate-500 px-2 py-2">
                        {row.castName}
                      </td>
                      <td className="border-r border-slate-500 px-2 py-2">
                        {row.castId}
                      </td>
                      <td className="border-r border-slate-500 px-2 py-2">
                        {row.shopName}
                      </td>
                      <td className="border-r border-slate-500 px-2 py-2">
                        {row.shopId}
                      </td>
                      <td className="border-r border-slate-500 px-2 py-2">
                        <span className="inline-flex items-center border border-slate-500 px-2 py-0.5 text-xs">
                          {statusLabel}
                        </span>
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="border border-slate-500 bg-white px-3 py-1 text-xs"
                            onClick={() => handleOpenModal(row)}
                            disabled={status === "issued"}
                          >
                            {status === "issued" ? "発行済み" : "回収"}
                          </button>
                          <button
                            type="button"
                            className="border border-slate-500 bg-white px-3 py-1 text-xs"
                            onClick={() => handleUncollected(row)}
                            disabled={status === "uncollected"}
                          >
                            {status === "uncollected" ? "未回収済" : "未回収"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {visibleRows.length === 0 && !loading && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-8 text-center text-sm text-slate-500"
                    >
                      表示対象のデータがありません。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {loading && (
          <div className="text-xs text-slate-500">データ取得中...</div>
        )}
      </div>

      {modalOpen && formState && (
        <div
          className="fixed inset-0 bg-black/40 grid place-items-center z-50"
          role="dialog"
          aria-modal
        >
          <div className="w-[min(1000px,94vw)] max-h-[90vh] overflow-auto bg-white border border-slate-600">
            <div className="flex items-center justify-between border-b border-slate-500 px-4 py-2">
              <div className="font-semibold">領収書入力</div>
              <button
                type="button"
                className="border border-slate-500 bg-white px-2 py-1 text-xs"
                onClick={() => {
                  setModalOpen(false);
                  setFormState(null);
                  setActiveRow(null);
                }}
              >
                閉じる
              </button>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr_1.25fr] gap-4 p-4">
              <div className="border border-slate-500 bg-white px-4 py-4">
                <div className="text-center text-lg tracking-[0.35em] font-semibold">
                  領収書
                </div>
                <div className="mt-6 flex items-end gap-2">
                  <input
                    className={`${lineInputClass} text-base`}
                    value={formState.shopName}
                    onChange={(event) =>
                      setFormState({ ...formState, shopName: event.target.value })
                    }
                  />
                  <span className="text-sm">様</span>
                </div>
                <div className="mt-4 border border-slate-500 px-3 py-3">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl font-semibold">¥</span>
                    <input
                      className="w-full text-2xl bg-transparent focus:outline-none"
                      value={formState.fee}
                      onChange={(event) =>
                        setFormState({ ...formState, fee: event.target.value })
                      }
                    />
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-[auto_1fr_auto_1fr] gap-2 items-center text-sm">
                  <span>時給</span>
                  <input
                    className={lineInputClass}
                    value={formState.hourly}
                    onChange={(event) =>
                      setFormState({ ...formState, hourly: event.target.value })
                    }
                  />
                  <span>日給</span>
                  <input
                    className={lineInputClass}
                    value={formState.daily}
                    onChange={(event) =>
                      setFormState({ ...formState, daily: event.target.value })
                    }
                  />
                  <span>但</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      className={lineInputClass}
                      value={formState.startTime}
                      onChange={(event) =>
                        setFormState({
                          ...formState,
                          startTime: event.target.value,
                        })
                      }
                    />
                    <span>〜</span>
                    <input
                      type="time"
                      className={lineInputClass}
                      value={formState.endTime}
                      onChange={(event) =>
                        setFormState({
                          ...formState,
                          endTime: event.target.value,
                        })
                      }
                    />
                  </div>
                  <span>迄の手取り額として</span>
                  <div className="col-span-3" />
                </div>
                <div className="mt-5 flex justify-end items-center gap-2 text-sm">
                  <input
                    className={tinyLineInputClass}
                    value={receiptDateParts.month}
                    onChange={(event) =>
                      updateReceiptDateParts({ month: event.target.value })
                    }
                  />
                  <span>月</span>
                  <input
                    className={tinyLineInputClass}
                    value={receiptDateParts.day}
                    onChange={(event) =>
                      updateReceiptDateParts({ day: event.target.value })
                    }
                  />
                  <span>日</span>
                </div>
                <div className="mt-6 text-xs">上記正に領収致しました</div>
                <div className="mt-6 grid grid-cols-[1fr_1fr_auto] gap-2 items-center text-sm">
                  <input className={lineInputClass} defaultValue="" />
                  <input className={lineInputClass} defaultValue="" />
                  <span>印</span>
                </div>
                <div className="mt-4 text-sm">住所</div>
                <input
                  className={lineInputClass}
                  value={formState.shopAddress}
                  onChange={(event) =>
                    setFormState({ ...formState, shopAddress: event.target.value })
                  }
                />
              </div>

              <div className="border border-slate-500 bg-white px-4 py-4">
                <div className="text-center text-lg tracking-[0.35em] font-semibold">
                  領収書
                </div>
                <div className="mt-6 flex items-end gap-2">
                  <input
                    className={`${lineInputClass} text-base`}
                    value={formState.shopName}
                    onChange={(event) =>
                      setFormState({ ...formState, shopName: event.target.value })
                    }
                  />
                  <span className="text-sm">様</span>
                </div>
                <div className="mt-2 text-center text-xs">手数料として</div>
                <div className="mt-2 border border-slate-500 px-3 py-3">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl font-semibold">¥</span>
                    <input
                      className="w-full text-2xl bg-transparent focus:outline-none"
                      value={formState.fee}
                      onChange={(event) =>
                        setFormState({ ...formState, fee: event.target.value })
                      }
                    />
                  </div>
                </div>
                <div className="mt-3 space-y-2 text-xs">
                  <div className="grid grid-cols-[auto_1fr] gap-2 items-center">
                    <span>税　抜(10%)</span>
                    <div className={lineInputClass} />
                  </div>
                  <div className="grid grid-cols-[auto_1fr] gap-2 items-center">
                    <span>消費税(10%)</span>
                    <div className={lineInputClass} />
                  </div>
                </div>
                <div className="mt-5 flex justify-end items-center gap-2 text-sm">
                  <input
                    className={tinyLineInputClass}
                    value={receiptDateParts.month}
                    onChange={(event) =>
                      updateReceiptDateParts({ month: event.target.value })
                    }
                  />
                  <span>月</span>
                  <input
                    className={tinyLineInputClass}
                    value={receiptDateParts.day}
                    onChange={(event) =>
                      updateReceiptDateParts({ day: event.target.value })
                    }
                  />
                  <span>日</span>
                </div>
                <div className="mt-6 text-xs">上記正に領収致しました</div>
                <div className="mt-6 text-center text-sm font-semibold">株式会社Tiara</div>
                <div className="mt-3 text-xs leading-relaxed">
                  福岡市博多区中洲２丁目１-１８
                  <br />
                  しんばし別館６F
                  <br />
                  Tel:0120-000-602
                  <br />
                  T3290001096246
                </div>
              </div>

              <div className="border border-slate-500 bg-white px-4 py-4 text-xs">
                <div className="text-center text-base tracking-[0.25em] font-semibold">
                  就業条件明示書
                </div>
                <div className="mt-4 space-y-3">
                  <div className="grid grid-cols-[auto_1fr_auto_1fr] gap-2 items-center">
                    <span>求人者名</span>
                    <input className={lineInputClass} defaultValue="" />
                    <span>会社名</span>
                    <input className={lineInputClass} defaultValue="" />
                  </div>
                  <div className="grid grid-cols-[auto_1fr] gap-2 items-center">
                    <span>就業場所</span>
                    <input className={lineInputClass} defaultValue="" />
                  </div>
                  <div className="grid grid-cols-[auto_1fr_auto_1fr] gap-2 items-center">
                    <span>従事する仕事内容</span>
                    <input className={lineInputClass} defaultValue="派遣給仕の職務" />
                    <span>その他</span>
                    <input className={lineInputClass} defaultValue="" />
                  </div>
                  <div className="grid grid-cols-[auto_1fr_auto_1fr] gap-2 items-center">
                    <span>雇用期間</span>
                    <div className="flex items-center gap-1">
                      <span>令和</span>
                      <input
                        className={tinyLineInputClass}
                        value={receiptDateParts.year}
                        onChange={(event) =>
                          updateReceiptDateParts({ year: event.target.value })
                        }
                      />
                      <span>年</span>
                      <input
                        className={tinyLineInputClass}
                        value={receiptDateParts.month}
                        onChange={(event) =>
                          updateReceiptDateParts({ month: event.target.value })
                        }
                      />
                      <span>月</span>
                      <input
                        className={tinyLineInputClass}
                        value={receiptDateParts.day}
                        onChange={(event) =>
                          updateReceiptDateParts({ day: event.target.value })
                        }
                      />
                      <span>日 から</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span>令和</span>
                      <input className={tinyLineInputClass} defaultValue="" />
                      <span>年</span>
                      <input className={tinyLineInputClass} defaultValue="" />
                      <span>月</span>
                      <input className={tinyLineInputClass} defaultValue="" />
                      <span>日</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-[auto_1fr_auto_1fr] gap-2 items-center">
                    <span>就業時間</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="time"
                        className={tinyLineInputClass}
                        value={formState.startTime}
                        onChange={(event) =>
                          setFormState({
                            ...formState,
                            startTime: event.target.value,
                          })
                        }
                      />
                      <span>から</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span>(うち休憩時間</span>
                      <input className={tinyLineInputClass} defaultValue="" />
                      <span>から )</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-[auto_1fr] gap-2 items-center">
                    <span>所定時間外労働の有無</span>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1">
                        <input type="checkbox" />
                        <span>有り</span>
                      </label>
                      <span>・</span>
                      <label className="flex items-center gap-1">
                        <input type="checkbox" defaultChecked />
                        <span>無し</span>
                      </label>
                    </div>
                  </div>
                  <div className="grid grid-cols-[auto_1fr_auto_1fr] gap-2 items-start">
                    <div className="space-y-1">
                      <div>賃金</div>
                      <div>①月給 (　　円)</div>
                      <div>②日給 (　　円)</div>
                      <div>③時給 (　　円)</div>
                      <div>④その他 (　　円)</div>
                    </div>
                    <div className="space-y-1">
                      <div>休日に関する事項</div>
                      <div>月・火・水・木・金・土・日・祝休日</div>
                      <div>その他（　　　　）</div>
                    </div>
                  </div>
                  <div className="border-t border-slate-500 pt-2 grid grid-cols-[1fr_1fr] gap-2">
                    <div className="space-y-1">
                      <div>労働・社会保険の適用</div>
                      <div>イ　労働保険 (有・無)</div>
                      <div>ロ　健康保険 (有・無)</div>
                      <div>ハ　厚生年金保険 (有・無)</div>
                    </div>
                    <div className="space-y-1">
                      <div>口　雇用保険 (有・無)</div>
                      <div>ニ　厚生年金保険 (有・無)</div>
                    </div>
                  </div>
                </div>
                <div className="mt-6 grid grid-cols-[1fr_auto] gap-2 items-center">
                  <div className="space-y-2">
                    <div className="border border-slate-500 px-2 py-1 text-center">
                      営業報告
                    </div>
                    <div className="grid grid-cols-[auto_1fr] gap-2 items-center">
                      <span>件数</span>
                      <input className={lineInputClass} defaultValue="" />
                      <span>交換件数</span>
                      <input className={lineInputClass} defaultValue="" />
                    </div>
                  </div>
                  <div className="border border-slate-500 px-2 py-1 text-center">
                    登録人数
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 px-4 pb-4">
              <button
                type="button"
                className="border border-slate-500 bg-white px-4 py-2 text-sm"
                onClick={() => {
                  setModalOpen(false);
                  setFormState(null);
                  setActiveRow(null);
                }}
              >
                閉じる
              </button>
              <button
                type="button"
                className="border border-slate-500 bg-white px-4 py-2 text-sm"
                onClick={handlePrint}
                disabled={printing}
              >
                {printing ? "印刷中..." : "印刷"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
