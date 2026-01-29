"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { fetchReceiptTargets } from "@/lib/receipts/fetchReceiptTargets";
import styles from "./ReceiptPreview.module.css";
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

            <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-4 p-4">
              <div className="border border-slate-500 bg-white p-4 space-y-3">
                <div className="grid gap-1">
                  <label className={formPanelLabel}>派遣先（店名）</label>
                  <input
                    className={formPanelInput}
                    value={formState.shopName}
                    onChange={(event) =>
                      setFormState({
                        ...formState,
                        shopName: event.target.value,
                      })
                    }
                  />
                </div>
                <div className="grid gap-1">
                  <label className={formPanelLabel}>派遣先住所</label>
                  <input
                    className={formPanelInput}
                    value={formState.shopAddress}
                    onChange={(event) =>
                      setFormState({
                        ...formState,
                        shopAddress: event.target.value,
                      })
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="grid gap-1">
                    <label className={formPanelLabel}>出勤開始</label>
                    <input
                      type="time"
                      className={formPanelInput}
                      value={formState.startTime}
                      onChange={(event) =>
                        setFormState({
                          ...formState,
                          startTime: event.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="grid gap-1">
                    <label className={formPanelLabel}>出勤終了</label>
                    <input
                      type="time"
                      className={formPanelInput}
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
                <div className="grid grid-cols-3 gap-2">
                  <div className="grid gap-1">
                    <label className={formPanelLabel}>時給</label>
                    <input
                      className={formPanelInput}
                      value={formState.hourly}
                      onChange={(event) =>
                        setFormState({
                          ...formState,
                          hourly: event.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="grid gap-1">
                    <label className={formPanelLabel}>日給</label>
                    <input
                      className={formPanelInput}
                      value={formState.daily}
                      onChange={(event) =>
                        setFormState({
                          ...formState,
                          daily: event.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="grid gap-1">
                    <label className={formPanelLabel}>手数料</label>
                    <input
                      className={formPanelInput}
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
                <div className="grid gap-1">
                  <label className={formPanelLabel}>領収書日付</label>
                  <input
                    type="date"
                    className={formPanelInput}
                    value={formState.receiptDate}
                    onChange={(event) =>
                      setFormState({
                        ...formState,
                        receiptDate: event.target.value,
                      })
                    }
                  />
                </div>
                <div className="grid gap-1">
                  <label className={formPanelLabel}>備考</label>
                  <textarea
                    className={`${formPanelInput} min-h-[100px]`}
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

              <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_1.25fr] gap-4">
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
                        <span className={styles.amountValue}>{formState.fee}</span>
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
                    <span className={styles.butLabel}>但</span>
                    <div className={styles.timeRow}>
                      <span className={styles.timeValue}>
                        {formState.startTime || "20:00"}
                      </span>
                      <span className={styles.clock} aria-hidden />
                      <span className={styles.timeValue}>
                        {formState.endTime || "01:00"}
                      </span>
                    </div>
                  </div>
                  <div className={styles.dateRow}>
                    <span className={styles.dateLabel}>月</span>
                    <div className={styles.dateLine}>
                      <span className={styles.lineValue}>
                        {receiptDateParts.month}
                      </span>
                    </div>
                    <span className={styles.dateLabel}>日</span>
                    <div className={styles.dateLine}>
                      <span className={styles.lineValue}>{receiptDateParts.day}</span>
                    </div>
                  </div>
                  <div className={styles.footerText}>上記正に領収致しました</div>
                  <div className={styles.signRow}>
                    <div className={styles.signLine}>
                      <span className={styles.lineValue}>源氏名</span>
                    </div>
                    <div className={styles.signLine}>
                      <span className={styles.lineValue}>氏名</span>
                    </div>
                    <span className={styles.signStamp}>印</span>
                  </div>
                  <div className={styles.addressLabel}>住所</div>
                  <div className={styles.longLine}>
                    <span className={styles.lineValue}>{formState.shopAddress}</span>
                  </div>
                </div>

                <div className={styles.previewCard}>
                  <div className={styles.previewTitle}>領収書</div>
                  <div className={styles.nameRow}>
                    <div className={styles.nameLine} />
                    <span className={styles.nameValue}>{formState.shopName}</span>
                    <span className={styles.nameSuffix}>様</span>
                  </div>
                  <div className={styles.feeCaption}>手数料として</div>
                  <div className={styles.amountBox}>
                    <span className={styles.amountSymbol}>¥</span>
                    <div className={styles.amountLine}>
                      <span className={styles.amountValue}>{formState.fee}</span>
                    </div>
                  </div>
                  <div className={styles.taxRow}>
                    <span className={styles.taxLabel}>税　抜(10%)</span>
                    <div className={styles.longLine} />
                  </div>
                  <div className={styles.taxRow}>
                    <span className={styles.taxLabel}>消費税(10%)</span>
                    <div className={styles.longLine} />
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
                    <div className={styles.dateLine}>
                      <span className={styles.lineValue}>{receiptDateParts.year}</span>
                    </div>
                    <span className={styles.fieldLabel}>年</span>
                    <div className={styles.dateLine}>
                      <span className={styles.lineValue}>
                        {receiptDateParts.month}
                      </span>
                    </div>
                    <span className={styles.fieldLabel}>月</span>
                    <div className={styles.dateLine}>
                      <span className={styles.lineValue}>{receiptDateParts.day}</span>
                    </div>
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
                    <div className={styles.longLine}>
                      <span className={styles.lineValue}>
                        {formState.startTime || ""}
                      </span>
                    </div>
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
