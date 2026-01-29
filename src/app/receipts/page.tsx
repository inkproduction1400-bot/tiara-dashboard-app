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

            <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr] gap-4 p-4">
              <div className="space-y-3">
                <div className="grid gap-2">
                  <label className="text-xs text-slate-600">派遣先（店名）</label>
                  <input
                    className="border border-slate-500 px-2 py-1 text-sm"
                    value={formState.shopName}
                    onChange={(event) =>
                      setFormState({
                        ...formState,
                        shopName: event.target.value,
                      })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-xs text-slate-600">派遣先住所</label>
                  <input
                    className="border border-slate-500 px-2 py-1 text-sm"
                    value={formState.shopAddress}
                    onChange={(event) =>
                      setFormState({
                        ...formState,
                        shopAddress: event.target.value,
                      })
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <label className="text-xs text-slate-600">出勤開始</label>
                    <input
                      type="time"
                      className="border border-slate-500 px-2 py-1 text-sm"
                      value={formState.startTime}
                      onChange={(event) =>
                        setFormState({
                          ...formState,
                          startTime: event.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <label className="text-xs text-slate-600">出勤終了</label>
                    <input
                      type="time"
                      className="border border-slate-500 px-2 py-1 text-sm"
                      value={formState.endTime}
                      onChange={(event) =>
                        setFormState({
                          ...formState,
                          endTime: event.target.value,
                        })
                      }
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="grid gap-2">
                    <label className="text-xs text-slate-600">時給</label>
                    <input
                      className="border border-slate-500 px-2 py-1 text-sm"
                      value={formState.hourly}
                      onChange={(event) =>
                        setFormState({
                          ...formState,
                          hourly: event.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <label className="text-xs text-slate-600">日給</label>
                    <input
                      className="border border-slate-500 px-2 py-1 text-sm"
                      value={formState.daily}
                      onChange={(event) =>
                        setFormState({
                          ...formState,
                          daily: event.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <label className="text-xs text-slate-600">手数料</label>
                    <input
                      className="border border-slate-500 px-2 py-1 text-sm"
                      value={formState.fee}
                      onChange={(event) =>
                        setFormState({
                          ...formState,
                          fee: event.target.value,
                        })
                      }
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <label className="text-xs text-slate-600">領収書日付</label>
                  <input
                    type="date"
                    className="border border-slate-500 px-2 py-1 text-sm"
                    value={formState.receiptDate}
                    onChange={(event) =>
                      setFormState({
                        ...formState,
                        receiptDate: event.target.value,
                      })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-xs text-slate-600">備考</label>
                  <textarea
                    className="border border-slate-500 px-2 py-1 text-sm min-h-[80px]"
                    value={formState.memo}
                    onChange={(event) =>
                      setFormState({
                        ...formState,
                        memo: event.target.value,
                      })
                    }
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="border border-slate-500 bg-white px-4 py-3">
                  <div className="text-xs text-slate-500">領収書プレビュー</div>
                  <div className="mt-3 border border-slate-400 bg-white px-4 py-6 text-sm">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold">領収書</div>
                      <div className="text-xs text-slate-500">
                        {formState.receiptDate}
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="text-xs text-slate-500">宛名</div>
                      <div className="border-b border-slate-400 py-1">
                        {formState.shopName}
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <div className="text-slate-500">時給</div>
                        <div>{formState.hourly || "-"}</div>
                      </div>
                      <div>
                        <div className="text-slate-500">日給</div>
                        <div>{formState.daily || "-"}</div>
                      </div>
                      <div>
                        <div className="text-slate-500">手数料</div>
                        <div>{formState.fee || "-"}</div>
                      </div>
                      <div>
                        <div className="text-slate-500">出勤時間</div>
                        <div>
                          {formState.startTime || "--:--"} -
                          {" "}
                          {formState.endTime || "--:--"}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 text-xs text-slate-500">
                      {formState.shopAddress}
                    </div>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
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
          </div>
        </div>
      )}
    </AppShell>
  );
}
