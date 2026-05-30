"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import {
  fetchReceiptTargets,
  updateReceiptStatus,
} from "@/lib/receipts/fetchReceiptTargets";
import styles from "./ReceiptPreview.module.css";
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

  const visibleRows = rows;

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

        <div className="border border-slate-700 bg-white px-3 py-3">
          <div className="relative mb-2 flex items-end justify-center">
            <div className="text-2xl font-semibold tracking-[0.2em]">ティアラ</div>
            <div className="absolute right-0 bottom-0 text-sm font-semibold">
              {businessDate.split("-")[0]} 年 {Number(businessDate.split("-")[1])} 月{" "}
              {Number(businessDate.split("-")[2])} 日 {weekday} 入力
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[1500px] w-full border-collapse text-[13px] leading-tight">
              <thead>
                <tr className="bg-slate-100">
                  <th className="w-12 border border-slate-700 px-1 py-1 text-center text-[10px]">
                    出勤人数
                  </th>
                  <th className="w-14 border border-slate-700 px-1 py-1 text-center text-[10px]">
                    女子NO
                  </th>
                  <th className="w-28 border border-slate-700 px-2 py-1 text-left text-base">
                    名前
                  </th>
                  <th className="w-10 border border-slate-700 px-1 py-1 text-center text-[10px]">
                    確定/<br />未確定
                  </th>
                  <th className="w-10 border border-slate-700 px-1 py-1 text-center text-[10px]">
                    送迎
                  </th>
                  <th className="w-20 border border-slate-700 px-1 py-1 text-center text-[10px]">
                    呼び出し店名かな
                  </th>
                  <th className="w-36 border border-slate-700 px-2 py-1 text-left text-base">
                    派遣先(店名)
                  </th>
                  <th className="w-40 border border-slate-700 px-2 py-1 text-left text-base">
                    派遣先住所
                  </th>
                  <th className="w-28 border border-slate-700 px-2 py-1 text-center text-base">
                    出勤時間
                  </th>
                  <th className="w-20 border border-slate-700 px-2 py-1 text-center text-base">
                    時給
                  </th>
                  <th className="w-20 border border-slate-700 px-2 py-1 text-center text-base">
                    日給
                  </th>
                  <th className="w-24 border border-slate-700 px-2 py-1 text-center text-base">
                    時間(実際)
                  </th>
                  <th className="w-28 border border-slate-700 px-2 py-1 text-center text-sm">
                    領収書
                  </th>
                  <th className="w-28 border border-slate-700 px-2 py-1 text-center text-base">
                    手数料
                  </th>
                  <th className="w-16 border border-slate-700 px-1 py-1 text-center text-sm">
                    回収
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row, index) => {
                  const key = rowKey(row);
                  const collectionValue =
                    row.receiptStatus === "collected"
                      ? "collected"
                      : "uncollected";
                  const rowClass =
                    collectionValue === "collected" ? "bg-emerald-50" : "";
                  const startTime = row.startTime ? `${row.startTime} ～` : "～";

                  return (
                    <tr key={key} className={rowClass}>
                      <td className="border border-slate-700 px-1 py-1 text-center">
                        {index + 1}
                      </td>
                      <td className="border border-slate-700 px-1 py-1 text-center font-semibold text-red-700">
                        {row.castManagementNumber ?? row.castCode ?? row.castId}
                      </td>
                      <td className="border border-slate-700 px-2 py-1 text-base font-semibold">
                        {row.castName}
                      </td>
                      <td className="border border-slate-700 px-1 py-1 text-center text-[11px]">
                        確定
                      </td>
                      <td className="border border-slate-700 px-1 py-1" />
                      <td className="border border-slate-700 px-1 py-1 text-center text-[11px]">
                        {row.shopNameKana ?? ""}
                      </td>
                      <td className="border border-slate-700 px-2 py-1 font-semibold">
                        {row.shopName}
                      </td>
                      <td className="border border-slate-700 px-2 py-1 text-[11px]">
                        {row.shopAddress ?? ""}
                      </td>
                      <td className="border border-slate-700 px-2 py-1 text-center text-base">
                        {startTime}
                      </td>
                      <td className="border border-slate-700 px-2 py-1 text-right text-base">
                        {formatAmount(row.hourly)}
                      </td>
                      <td className="border border-slate-700 px-2 py-1 text-right" />
                      <td className="border border-slate-700 px-2 py-1 text-center" />
                      <td className="border border-slate-700 px-1 py-1 text-center">
                        <button
                          type="button"
                          className="border border-slate-700 bg-white px-2 py-1 text-xs font-semibold hover:bg-slate-100"
                          onClick={() => handleOpenModal(row)}
                        >
                          発行・印刷
                        </button>
                      </td>
                      <td className="border border-slate-700 px-2 py-1 text-right text-base">
                        {formatAmount(row.fee)}
                      </td>
                      <td className="border border-slate-700 px-1 py-1 text-center">
                        <select
                          className="h-7 w-12 border border-slate-500 bg-white text-center text-lg leading-none"
                          value={collectionValue}
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
    </AppShell>
  );
}
