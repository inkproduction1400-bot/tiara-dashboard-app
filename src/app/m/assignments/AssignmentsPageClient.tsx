"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { MobileHeader } from "@/components/mobile/MobileHeader";
import { MobileShell } from "@/components/mobile/MobileShell";
import {
  getDispatchSheet,
  type DispatchSheetRow,
} from "@/lib/api.dispatch-sheet";
import { subscribeDispatchSheetUpdates } from "@/lib/socket";

function todayKey() {
  const date = new Date();
  if (date.getHours() < 5) {
    date.setDate(date.getDate() - 1);
  }
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDateLabel(dateKey: string) {
  const [year, month, day] = dateKey.split("-");
  return `${year}/${Number(month)}/${Number(day)}`;
}

const EMPTY_ROWS = 100;

function buildDisplayRows(rows: DispatchSheetRow[]) {
  const sorted = [...rows].sort(
    (a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0),
  );
  if (sorted.length >= EMPTY_ROWS) return sorted;
  return sorted.concat(
    Array.from({ length: EMPTY_ROWS - sorted.length }, (_, index) => ({
      castId: `empty-${index}`,
      managementNumber: "",
      castCode: null,
      displayName: "",
      age: null,
      desiredHourly: null,
      assignmentId: null,
      shopId: null,
      shopName: null,
      shopNumber: null,
      isExclusiveInitial: false,
      startTime: "",
      endTime: "",
      castHourly: null,
      shopFee: null,
      note: null,
      displayOrder: sorted.length + index,
      status: "draft" as const,
      orderId: null,
      orderNo: null,
    })),
  );
}

function DispatchMiniCard({ row, index }: { row: DispatchSheetRow; index: number }) {
  const isEmpty = !row.displayName;
  return (
    <article
      className={`min-w-0 border border-slate-300 bg-white text-[11px] leading-tight ${
        index % 2 === 0 ? "border-r-slate-900" : ""
      } ${Math.floor(index / 2) % 2 === 0 ? "border-t-slate-900" : ""}`}
    >
      <div className="grid grid-cols-[42px_minmax(0,1fr)] border-b border-slate-300">
        <div className="bg-slate-100 px-1.5 py-1 font-bold text-slate-700">
          派氏名
        </div>
        <div className="flex min-w-0 items-center justify-between gap-1 px-1.5 py-1">
          <span className="truncate font-bold text-slate-900">
            {row.displayName || "\u00a0"}
          </span>
          <span className="shrink-0 text-[10px] text-slate-400">
            {row.managementNumber || row.castCode || ""}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-[42px_minmax(0,1fr)] border-b border-slate-300">
        <div className="bg-slate-100 px-1.5 py-1 font-bold text-slate-700">
          派遣先
        </div>
        <div className="min-w-0 truncate px-1.5 py-1 text-slate-900">
          {row.shopName || (isEmpty ? "\u00a0" : "未設定")}
        </div>
      </div>

      <div className="grid grid-cols-[42px_minmax(0,1fr)_minmax(0,1fr)] border-b border-slate-300">
        <div className="bg-slate-100 px-1.5 py-1 font-bold text-slate-700">
          時給
        </div>
        <div className="border-r border-slate-300 px-1.5 py-1 text-right text-slate-900">
          {row.castHourly ?? ""}
        </div>
        <div className="px-1.5 py-1 text-right text-slate-500">
          {row.shopFee ?? ""}
        </div>
      </div>

      <div className="grid grid-cols-[42px_minmax(0,1fr)] border-b border-slate-300">
        <div className="bg-slate-100 px-1.5 py-1 font-bold text-slate-700">
          時間
        </div>
        <div className="px-1.5 py-1 text-slate-900">
          {row.startTime ? `${row.startTime}~` : "\u00a0"}
        </div>
      </div>

      <div className="grid grid-cols-[42px_minmax(0,1fr)]">
        <div className="bg-slate-100 px-1.5 py-1 font-bold text-slate-700">
          メモ
        </div>
        <div className="flex min-w-0 items-center justify-between gap-1 px-1.5 py-1">
          <span className="truncate text-slate-500">{row.note || "\u00a0"}</span>
          {row.status === "confirmed" ? (
            <span className="shrink-0 rounded-sm bg-emerald-100 px-1 text-[10px] font-bold text-emerald-700">
              確定
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export default function AssignmentsPageClient() {
  const [date] = useState(() => todayKey());
  const [rows, setRows] = useState<DispatchSheetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sheet = await getDispatchSheet(date);
      setRows(sheet.rows ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "読み込み失敗");
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return subscribeDispatchSheetUpdates(() => {
      void load();
    });
  }, [load]);

  const displayRows = useMemo(() => buildDisplayRows(rows), [rows]);
  const assignedCount = rows.filter((row) => row.shopName).length;
  const confirmedCount = rows.filter((row) => row.status === "confirmed").length;

  return (
    <MobileShell edgeToEdge>
      <MobileHeader
        title="本日出勤 派遣表"
        subtitle={`${formatDateLabel(date)} / 派遣先 ${assignedCount}件 / 確定 ${confirmedCount}件`}
        onRefresh={() => void load()}
      />

      <div className="px-2 pb-6">
        <div className="mb-2 flex items-center justify-between gap-2 text-xs text-slate-500">
          <span>2列表示 / PC版の本日出勤派遣表と同期</span>
          <button
            type="button"
            onClick={() => void load()}
            className="flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 font-semibold text-slate-700"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            再読込
          </button>
        </div>

        {loading ? (
          <div className="py-10 text-center text-sm text-slate-500">
            読み込み中...
          </div>
        ) : error ? (
          <div className="py-10 text-center text-sm text-rose-500">{error}</div>
        ) : (
          <div className="grid grid-cols-2 border-2 border-slate-900 bg-slate-900">
            {displayRows.map((row, index) => (
              <DispatchMiniCard
                key={row.assignmentId ?? row.castId ?? `row-${index}`}
                row={row}
                index={index}
              />
            ))}
          </div>
        )}
      </div>
    </MobileShell>
  );
}
