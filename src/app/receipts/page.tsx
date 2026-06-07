"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import {
  fetchReceiptTargets,
  recordReceiptIssued,
  updateReceiptFee,
  updateReceiptStatus,
} from "@/lib/receipts/fetchReceiptTargets";
import styles from "./ReceiptPreview.module.css";
import { subscribeReceiptUpdates } from "@/lib/socket";
import type {
  AssignmentRow,
  ReceiptPayload,
} from "@/lib/receipts/types";

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
  row.assignmentId ?? `${row.businessDate}|${row.castId}|${row.shopId}`;

const parseNumber = (value: string) => {
  const raw = value.trim();
  if (!raw) return undefined;
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : undefined;
};

const formatAmount = (value?: number) => {
  if (value === undefined || value === null || Number.isNaN(value)) return "";
  return value.toLocaleString("ja-JP");
};

const receiptDisplayPriority = (row: AssignmentRow, businessDate: string) => {
  if (row.assignmentStatus === "canceled") return 2;
  const isPastOpen = row.businessDate !== businessDate;
  if (isPastOpen) return 1;
  return 0;
};

const shouldCountAttendanceNumber = (
  row: AssignmentRow,
  businessDate: string,
) => row.businessDate === businessDate && row.assignmentStatus !== "canceled";

const formatCancelTypeLabel = (row: AssignmentRow) => {
  if (row.cancelType === "shop") return "店舗都合";
  if (row.cancelType === "cast") return "キャスト都合";
  return row.cancellationReason?.includes("店舗") ? "店舗都合" : "キャスト都合";
};

type ReceiptFormState = {
  businessDate: string;
  receiptDate: string;
  castId: string;
  castName: string;
  shopId: string;
  shopName: string;
  shopAddress: string;
  startTime: string;
  endTime: string;
  hourly: string;
  daily: string;
  fee: string;
};

const buildFormState = (
  row: AssignmentRow,
  businessDate: string,
): ReceiptFormState => ({
  businessDate,
  receiptDate: businessDate,
  castId: row.castId,
  castName: row.castName,
  shopId: row.shopId,
  shopName: row.shopName,
  shopAddress: row.shopAddress ?? "",
  startTime: row.startTime ?? "",
  endTime: row.endTime ?? "",
  hourly: row.hourly ? String(row.hourly) : "",
  daily: row.daily ? String(row.daily) : "",
  fee: row.fee ? String(row.fee) : "",
});

const toPayload = (form: ReceiptFormState): ReceiptPayload => ({
  businessDate: form.businessDate,
  receiptDate: form.receiptDate,
  castId: form.castId,
  castName: form.castName,
  shopId: form.shopId,
  shopName: form.shopName,
  shopAddress: form.shopAddress || undefined,
  startTime: form.startTime || undefined,
  endTime: form.endTime || undefined,
  hourly: parseNumber(form.hourly),
  daily: parseNumber(form.daily),
  fee: parseNumber(form.fee),
});

export default function ReceiptsPage() {
  const [businessDate, setBusinessDate] = useState(() => getBusinessDate());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [rows, setRows] = useState<AssignmentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [formState, setFormState] = useState<ReceiptFormState | null>(null);
  const [activeRow, setActiveRow] = useState<AssignmentRow | null>(null);
  const [printing, setPrinting] = useState(false);
  const [savingFeeKey, setSavingFeeKey] = useState<string | null>(null);
  const feeNumber = useMemo(
    () => (formState ? parseNumber(formState.fee) : undefined),
    [formState?.fee],
  );
  const feeBaseDisplay = useMemo(
    () => formatAmount(feeNumber),
    [feeNumber],
  );
  const feeTaxDisplay = useMemo(
    () =>
      feeNumber !== undefined ? formatAmount(Math.round(feeNumber * 0.1)) : "",
    [feeNumber],
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchReceiptTargets(businessDate, { includeOpen: true })
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
    return subscribeReceiptUpdates(() => {
      fetchReceiptTargets(businessDate, { includeOpen: true })
        .then(setRows)
        .catch(() => setRows([]));
    });
  }, [businessDate]);

  const visibleRows = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const priorityDiff =
          receiptDisplayPriority(a, businessDate) -
          receiptDisplayPriority(b, businessDate);
        if (priorityDiff !== 0) return priorityDiff;
        const dateDiff = a.businessDate.localeCompare(b.businessDate);
        if (dateDiff !== 0) return dateDiff;
        return rowKey(a).localeCompare(rowKey(b));
      }),
    [businessDate, rows],
  );
  const attendanceNumberByKey = useMemo(() => {
    const map = new Map<string, number>();
    let count = 0;
    for (const row of visibleRows) {
      if (!shouldCountAttendanceNumber(row, businessDate)) continue;
      count += 1;
      map.set(rowKey(row), count);
    }
    return map;
  }, [businessDate, visibleRows]);

  const reiwa = useMemo(() => formatReiwa(businessDate), [businessDate]);
  const weekday = useMemo(() => formatWeekday(businessDate), [businessDate]);

  const handleOpenModal = (row: AssignmentRow) => {
    setFormState(buildFormState(row, businessDate));
    setActiveRow(row);
    setModalOpen(true);
  };

  const handleCollectionChange = async (
    row: AssignmentRow,
    value: "uncollected" | "collected",
  ) => {
    if (!row.assignmentId) return;
    if (value === "collected" && row.receiptRevisionStatus === "needs_reissue") {
      alert("領収書の内容が最新ではありません。再発行後に回収済みにしてください。");
      return;
    }
    const previous = row.receiptStatus ?? "uncollected";
    setRows((current) =>
      current.map((item) =>
        rowKey(item) === rowKey(row) ? { ...item, receiptStatus: value } : item,
      ),
    );
    try {
      await updateReceiptStatus(row.assignmentId, value);
    } catch (err) {
      console.error("[Receipts] receipt status update failed", err);
      setRows((current) =>
        current.map((item) =>
          rowKey(item) === rowKey(row)
            ? { ...item, receiptStatus: previous }
            : item,
        ),
      );
    }
  };

  const handleFeeBlur = async (row: AssignmentRow, value: string) => {
    if (!row.assignmentId || row.assignmentStatus === "canceled") return false;
    const parsed = parseNumber(value);
    const nextFee = parsed ?? null;
    const previousFee = row.fee ?? null;
    if (previousFee === nextFee) return true;

    const message =
      previousFee == null
        ? `手数料を ${nextFee == null ? "空欄" : `${formatAmount(nextFee)} 円`}で保存します。この変更はマッチング・日報にも反映され、変更履歴に記録されます。`
        : `手数料を ${formatAmount(previousFee)} 円から ${
            nextFee == null ? "空欄" : `${formatAmount(nextFee)} 円`
          }に変更します。この変更はマッチング・日報にも反映され、変更履歴に記録されます。`;
    if (!window.confirm(message)) {
      return false;
    }

    const key = rowKey(row);
    setSavingFeeKey(key);
    setRows((current) =>
      current.map((item) =>
        rowKey(item) === key
          ? {
              ...item,
              fee: nextFee ?? undefined,
              receiptRevisionStatus:
                item.receiptRevisionStatus === "issued"
                  ? "needs_reissue"
                  : item.receiptRevisionStatus,
            }
          : item,
      ),
    );
    try {
      await updateReceiptFee(row.assignmentId, nextFee);
      return true;
    } catch (err) {
      console.error("[Receipts] fee update failed", err);
      setRows((current) =>
        current.map((item) =>
          rowKey(item) === key
            ? { ...item, fee: previousFee ?? undefined }
            : item,
        ),
      );
      alert("手数料の保存に失敗しました。時間をおいて再度お試しください。");
      return false;
    } finally {
      setSavingFeeKey(null);
    }
  };

  const handlePrint = async () => {
    if (!formState || !activeRow?.assignmentId) return;
    const payload = toPayload(formState);
    setPrinting(true);
    try {
      await recordReceiptIssued(activeRow.assignmentId, {
        receiptDate: payload.receiptDate,
        fee: payload.fee ?? null,
        hourly: payload.hourly ?? null,
        daily: payload.daily ?? null,
        startTime: payload.startTime ?? null,
        endTime: payload.endTime ?? null,
      });
      setRows((current) =>
        current.map((item) =>
          rowKey(item) === rowKey(activeRow)
            ? {
                ...item,
                receiptIssuedFee: payload.fee ?? null,
                receiptRevisionStatus: "issued",
                receiptPrintedAt: new Date().toISOString(),
              }
            : item,
        ),
      );
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
  const formPanelInput =
    "w-full border border-slate-500 bg-white px-2 py-1 text-sm";
  const formPanelLabel = "text-xs text-slate-600";

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

        <div className="border border-slate-700 bg-white px-2 py-2 receipt-table-print">
          <div className="relative mb-1 flex items-end justify-center">
            <div className="text-xl font-semibold tracking-[0.16em]">ティアラ</div>
            <div className="absolute right-0 bottom-0 text-xs font-semibold">
              {businessDate.split("-")[0]} 年 {Number(businessDate.split("-")[1])} 月{" "}
              {Number(businessDate.split("-")[2])} 日 {weekday} 入力
            </div>
          </div>
          <div className="mb-2 flex justify-end print:hidden">
            <button
              type="button"
              className="border border-slate-700 bg-white px-3 py-1 text-xs font-semibold hover:bg-slate-100"
              onClick={() => window.print()}
            >
              印刷
            </button>
          </div>
          <div className="overflow-x-hidden">
            <table className="w-full table-fixed border-collapse text-[10px] leading-tight">
              <colgroup>
                <col className="w-[3.2%]" />
                <col className="w-[4.2%]" />
                <col className="w-[7%]" />
                <col className="w-[3.5%]" />
                <col className="w-[3.2%]" />
                <col className="w-[6%]" />
                <col className="w-[10%]" />
                <col className="w-[13%]" />
                <col className="w-[6.5%]" />
                <col className="w-[5%]" />
                <col className="w-[4.5%]" />
                <col className="w-[5.5%]" />
                <col className="w-[6.5%]" />
                <col className="w-[5.5%]" />
                <col className="w-[3.2%]" />
              </colgroup>
              <thead>
                <tr className="bg-slate-100">
                  <th className="border border-slate-700 px-0.5 py-1 text-center text-[9px]">
                    出勤人数
                  </th>
                  <th className="border border-slate-700 px-0.5 py-1 text-center text-[9px]">
                    女子NO
                  </th>
                  <th className="border border-slate-700 px-1 py-1 text-left text-[11px]">
                    名前
                  </th>
                  <th className="border border-slate-700 px-0.5 py-1 text-center text-[8px]">
                    確定/<br />未確定
                  </th>
                  <th className="border border-slate-700 px-0.5 py-1 text-center text-[9px]">
                    送迎
                  </th>
                  <th className="border border-slate-700 px-0.5 py-1 text-center text-[8px]">
                    送迎先
                  </th>
                  <th className="border border-slate-700 px-1 py-1 text-left text-[11px]">
                    派遣先(店名)
                  </th>
                  <th className="border border-slate-700 px-1 py-1 text-left text-[11px]">
                    派遣先住所
                  </th>
                  <th className="border border-slate-700 px-1 py-1 text-center text-[11px]">
                    出勤時間
                  </th>
                  <th className="border border-slate-700 px-1 py-1 text-center text-[11px]">
                    時給
                  </th>
                  <th className="border border-slate-700 px-1 py-1 text-center text-[11px]">
                    日給
                  </th>
                  <th className="border border-slate-700 px-1 py-1 text-center text-[11px]">
                    時間(実際)
                  </th>
                  <th className="border border-slate-700 px-1 py-1 text-center text-[10px]">
                    領収書
                  </th>
                  <th className="border border-slate-700 px-1 py-1 text-center text-[11px]">
                    手数料
                  </th>
                  <th className="border border-slate-700 px-0.5 py-1 text-center text-[10px]">
                    回収
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => {
                  const key = rowKey(row);
                  const isCanceled = row.assignmentStatus === "canceled";
                  const isPastOpen = row.businessDate !== businessDate;
                  const attendanceNumber = attendanceNumberByKey.get(key) ?? "";
                  const needsReissue =
                    row.receiptRevisionStatus === "needs_reissue";
                  const collectionValue =
                    row.receiptStatus === "collected"
                      ? "collected"
                      : "uncollected";
                  const rowClass =
                    isCanceled
                      ? "bg-rose-50 text-slate-500"
                      : row.businessDate !== businessDate
                        ? "bg-amber-50"
                      : collectionValue === "collected"
                        ? "bg-emerald-50"
                        : "";
                  const startTime = row.startTime ? `${row.startTime} ～` : "～";

                  return (
                    <tr key={key} className={rowClass}>
                      <td className="border border-slate-700 px-0.5 py-0.5 text-center">
                        {isCanceled || isPastOpen ? "" : attendanceNumber}
                      </td>
                      <td className="border border-slate-700 px-0.5 py-0.5 text-center font-semibold text-red-700">
                        {row.castManagementNumber ?? row.castCode ?? row.castId}
                      </td>
                      <td className="break-words border border-slate-700 px-1 py-0.5 text-[11px] font-semibold">
                        {row.castName}
                        {needsReissue && (
                          <div className="text-[8px] font-bold text-rose-700">
                            要再発行
                          </div>
                        )}
                        {row.businessDate !== businessDate && (
                          <div className="text-[8px] font-normal text-amber-700">
                            未回収: {row.businessDate}
                          </div>
                        )}
                      </td>
                      <td className="border border-slate-700 px-0.5 py-0.5 text-center text-[9px]">
                        {isCanceled ? (
                          <>
                            <div>キャンセル</div>
                            <div className="text-[8px] leading-tight text-rose-700">
                              {formatCancelTypeLabel(row)}
                            </div>
                          </>
                        ) : (
                          "確定"
                        )}
                      </td>
                      <td className="border border-slate-700 px-0.5 py-0.5 text-center text-[10px] font-semibold">
                        {row.rideRequested ? "あり" : "なし"}
                      </td>
                      <td className="break-words border border-slate-700 px-0.5 py-0.5 text-center text-[9px]">
                        {row.rideRequested ? row.rideDestination ?? "" : ""}
                      </td>
                      <td className="break-words border border-slate-700 px-1 py-0.5 font-semibold">
                        {row.shopName}
                      </td>
                      <td className="break-words border border-slate-700 px-1 py-0.5 text-[9px]">
                        {row.shopAddress ?? ""}
                      </td>
                      <td className="border border-slate-700 px-1 py-0.5 text-center text-[11px]">
                        {startTime}
                      </td>
                      <td className="border border-slate-700 px-1 py-0.5 text-right text-[11px]">
                        {formatAmount(row.hourly)}
                      </td>
                      <td className="border border-slate-700 px-0.5 py-0.5 text-right" />
                      <td className="border border-slate-700 px-0.5 py-0.5 text-center" />
                      <td className="border border-slate-700 px-0.5 py-0.5 text-center">
                        <button
                          type="button"
                          className="w-full border border-slate-700 bg-white px-0.5 py-0.5 text-[9px] font-semibold hover:bg-slate-100"
                          onClick={() => handleOpenModal(row)}
                          disabled={isCanceled}
                        >
                          {isCanceled
                            ? "-"
                            : needsReissue
                              ? "再発行"
                              : row.receiptRevisionStatus === "issued"
                                ? "再発行"
                                : "発行"}
                        </button>
                      </td>
                      <td className="border border-slate-700 px-0.5 py-0.5 text-right text-[11px]">
                        <input
                          key={`${key}:${row.fee ?? ""}`}
                          type="text"
                          inputMode="numeric"
                          defaultValue={formatAmount(row.fee)}
                          disabled={isCanceled || savingFeeKey === key}
                          onBlur={(event) => {
                            const originalValue = formatAmount(row.fee);
                            void handleFeeBlur(row, event.target.value).then((ok) => {
                              if (!ok) event.target.value = originalValue;
                            });
                          }}
                          className="h-6 w-full border border-slate-400 bg-white px-1 text-right text-[11px] disabled:bg-slate-100 disabled:text-slate-400"
                          aria-label={`${row.castName}の手数料`}
                        />
                        {row.receiptIssuedFee != null && (
                          <div className="mt-0.5 text-[8px] leading-none text-slate-500">
                            発行:{formatAmount(row.receiptIssuedFee)}
                          </div>
                        )}
                      </td>
                      <td className="border border-slate-700 px-0.5 py-0.5 text-center">
                        <select
                          className="h-6 w-full border border-slate-500 bg-white text-center text-sm leading-none"
                          value={collectionValue}
                          disabled={isCanceled || needsReissue}
                          onChange={(event) =>
                            handleCollectionChange(
                              row,
                              event.target.value as "uncollected" | "collected",
                            )
                          }
                          aria-label={`${row.castName}の回収状態`}
                        >
                          <option value="uncollected">○</option>
                          <option value="collected">✓</option>
                        </select>
                      </td>
                    </tr>
                  );
                })}
                {visibleRows.length === 0 && !loading && (
                  <tr>
                    <td
                      colSpan={15}
                      className="border border-slate-700 px-4 py-8 text-center text-sm text-slate-500"
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
          <div className="w-[min(1800px,98vw)] overflow-visible bg-white border border-slate-600">
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

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6">
              <div className={styles.previewCard}>
                  <div className={styles.previewTitle}>領収書</div>
                  <div className={styles.nameRow}>
                    <div className={styles.nameLine} />
                    <span className={styles.nameValue}>{formState.shopName}</span>
                    <span className={styles.nameSuffix}>様</span>
                  </div>
                  <div className={styles.amountBlock}>
                    <div className={styles.amountBox}>
                      <span className={styles.amountSymbol}>¥</span>
                      <div className={styles.amountLine}>
                        <span className={styles.amountValue}>
                          {feeBaseDisplay || formState.fee}
                        </span>
                      </div>
                    </div>
                    <div className={styles.verticalNote}>迄の手取り額として</div>
                  </div>
                  <div className={styles.wageRow}>
                    <div className={styles.label}>時給</div>
                    <div className={styles.lineLong}>
                      <span className={styles.lineValue}>{formState.hourly}</span>
                    </div>
                    <div className={styles.label}>日給</div>
                    <div className={styles.lineLong}>
                      <span className={styles.lineValue}>{formState.daily}</span>
                    </div>
                  </div>
                  <div className={styles.butRow}>
                    <div className={styles.butLine}>
                      <span className={styles.butLabel}>但</span>
                      <span className={styles.timeValue}>
                        {formState.startTime || "20:00"}
                      </span>
                      <span className={styles.clock} aria-hidden />
                      <span className={styles.timeValue}>
                        {formState.endTime || "01:00"}
                      </span>
                    </div>
                  </div>
                  <div className={styles.footerText}>上記正に領収致しました</div>
                  <div className={styles.signRow}>
                    <div className={styles.signField}>
                      <span className={styles.signLabel}>源氏名</span>
                      <div className={styles.signLine} />
                    </div>
                    <div className={styles.signField}>
                      <span className={styles.signLabel}>氏名</span>
                      <div className={styles.signLine} />
                    </div>
                    <div className={styles.signField}>
                      <span className={styles.signLabel}>印</span>
                      <div className={styles.signLine} />
                    </div>
                  </div>
                  <div className={styles.addressLabel}>住所</div>
                  <div className={styles.longLine} />
              </div>

              <div className={styles.previewCard}>
                  <div className={styles.previewTitle}>領収書</div>
                  <div className={styles.nameRow}>
                    <div className={styles.nameLine} />
                    <span className={styles.nameValue}>{formState.castName}</span>
                    <span className={styles.nameSuffix}>様</span>
                  </div>
                  <div className={styles.feeCaption}>手数料として</div>
                  <div className={styles.amountBox}>
                    <span className={styles.amountSymbol}>¥</span>
                    <div className={styles.amountLine}>
                      <span className={styles.amountValue}>
                        {feeBaseDisplay || formState.fee}
                      </span>
                    </div>
                  </div>
                  <div className={styles.taxRow}>
                    <span className={styles.taxLabel}>税　抜(10%)</span>
                    <div className={styles.longLine}>
                      <span className={styles.lineValue}>{feeBaseDisplay}</span>
                    </div>
                  </div>
                  <div className={styles.taxRow}>
                    <span className={styles.taxLabel}>消費税(10%)</span>
                    <div className={styles.longLine}>
                      <span className={styles.lineValue}>{feeTaxDisplay}</span>
                    </div>
                  </div>
                  <div className={styles.dateRowCenter}>
                    <div className={styles.dateLine}>
                      <span className={styles.lineValue}>
                        {receiptDateParts.month}
                      </span>
                    </div>
                    <span className={styles.dateLabel}>月</span>
                    <div className={styles.dateLine}>
                      <span className={styles.lineValue}>{receiptDateParts.day}</span>
                    </div>
                    <span className={styles.dateLabel}>日</span>
                  </div>
                  <div className={styles.footerText}>上記正に領収致しました</div>
                  <div className={styles.companyBlock}>
                    <div className={styles.companyName}>株式会社Tiara</div>
                    <div className={styles.companyAddress}>
                      福岡市博多区中洲２丁目１-１８
                      <br />
                      しんばし別館６F
                      <br />
                      Tel:0120-000-602
                      <br />
                      T3290001096246
                    </div>
                  </div>
              </div>

              <div className={styles.previewCard}>
                  <div className={styles.previewTitleSmall}>就業条件明示書</div>
                  <div className={styles.fieldRow}>
                    <span className={styles.fieldLabel}>求人者名：</span>
                    <div className={styles.longLine} />
                    <span className={styles.fieldLabel}>会社名：</span>
                    <div className={styles.longLine} />
                  </div>
                  <div className={styles.fieldRow}>
                    <span className={styles.fieldLabel}>就業場所：</span>
                    <div className={styles.longLine} />
                  </div>
                  <div className={styles.fieldRow}>
                    <span className={styles.fieldLabel}>従事する仕事内容</span>
                    <div className={styles.longLine}>
                      <span className={styles.circledText}>派遣給仕の職</span>
                    </div>
                    <span className={styles.fieldLabel}>・その他（　　）</span>
                  </div>
                  <div className={styles.fieldRow}>
                    <span className={styles.fieldLabel}>雇用期間：令和</span>
                    <div className={styles.dateLine} />
                    <span className={styles.fieldLabel}>年</span>
                    <div className={styles.dateLine} />
                    <span className={styles.fieldLabel}>月</span>
                    <div className={styles.dateLine} />
                    <span className={styles.fieldLabel}>日から 令和</span>
                    <div className={styles.dateLine} />
                    <span className={styles.fieldLabel}>年</span>
                    <div className={styles.dateLine} />
                    <span className={styles.fieldLabel}>月</span>
                    <div className={styles.dateLine} />
                    <span className={styles.fieldLabel}>日</span>
                  </div>
                  <div className={styles.fieldRow}>
                    <span className={styles.fieldLabel}>就業時間：</span>
                    <div className={styles.longLine} />
                    <span className={styles.fieldLabel}>から</span>
                    <span className={styles.fieldLabel}>(うち休憩時間</span>
                    <div className={styles.longLine} />
                    <span className={styles.fieldLabel}>から )</span>
                  </div>
                  <div className={styles.fieldRow}>
                    <span className={styles.fieldLabel}>所定時間外労働の有無：</span>
                    <span className={styles.fieldLabel}>有り（　　）</span>
                    <span className={styles.fieldLabel}>・</span>
                    <span className={styles.circledText}>無し</span>
                  </div>
                  <div className={styles.fieldRow}>
                    <div className={styles.smallBlock}>
                      <div className={styles.blockTitle}>賃金</div>
                      <div>①月給（　　円）</div>
                      <div>②日給（　　円）</div>
                      <div>③時給（　　円）</div>
                      <div>④その他（　　円）</div>
                    </div>
                    <div className={styles.smallBlock}>
                      <div className={styles.blockTitle}>休日に関する事項</div>
                      <div>月・火・水・木・金・土・日・祝休日</div>
                      <div>その他（　　　）</div>
                    </div>
                  </div>
                  <div className={styles.insuranceRow}>
                    <div>
                      <div className={styles.blockTitle}>労働・社会保険の適用</div>
                      <div>イ　労働保険（有・無）</div>
                      <div>ロ　健康保険（有・無）</div>
                      <div>ハ　厚生年金保険（有・無）</div>
                    </div>
                    <div>
                      <div>口　雇用保険（有・無）</div>
                      <div>ニ　厚生年金保険（有・無）</div>
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
      <style jsx global>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 7mm;
          }

          body * {
            visibility: hidden !important;
          }

          .receipt-table-print,
          .receipt-table-print * {
            visibility: visible !important;
          }

          .receipt-table-print {
            position: absolute !important;
            inset: 0 auto auto 0 !important;
            width: 100% !important;
            border: 0 !important;
            padding: 0 !important;
            background: #fff !important;
          }

          .receipt-table-print table {
            page-break-inside: auto;
          }

          .receipt-table-print tr {
            page-break-inside: avoid;
            page-break-after: auto;
          }
        }
      `}</style>
    </AppShell>
  );
}
