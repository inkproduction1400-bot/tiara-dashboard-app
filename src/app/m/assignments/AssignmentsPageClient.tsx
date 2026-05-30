"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, RefreshCw, Search, X } from "lucide-react";
import { MobileHeader } from "@/components/mobile/MobileHeader";
import { MobileShell } from "@/components/mobile/MobileShell";
import {
  confirmDispatchSheetRow,
  getDispatchSheet,
  upsertDispatchSheetRow,
  type DispatchSheetRow,
  type DispatchSheetShop,
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
const TIME_OPTIONS = ["21:00~", "21:30~", "22:00~"] as const;

function normalizeTime(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "21:00";
  return trimmed.replace(/[〜～~]+$/, "") || "21:00";
}

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

function DispatchMiniCard({
  row,
  index,
  saving,
  onPatch,
  onSave,
  onOpenShopPicker,
  onConfirm,
}: {
  row: DispatchSheetRow;
  index: number;
  saving: boolean;
  onPatch: (castId: string, patch: Partial<DispatchSheetRow>) => void;
  onSave: (row: DispatchSheetRow, patch?: Partial<DispatchSheetRow>) => void;
  onOpenShopPicker: (castId: string) => void;
  onConfirm: (row: DispatchSheetRow) => void;
}) {
  const isEmpty = !row.displayName;
  const disabled = isEmpty || saving;
  const inputClass =
    "h-7 w-full min-w-0 border border-slate-300 bg-white px-1 text-[11px] text-slate-900 outline-none focus:border-[#0b8ef3]";
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
        <button
          type="button"
          disabled={isEmpty}
          onClick={() => onOpenShopPicker(row.castId)}
          className={`min-w-0 truncate px-1.5 py-1 text-left ${
            row.shopName ? "text-slate-900" : "text-slate-400"
          }`}
        >
          {row.shopName || (isEmpty ? "\u00a0" : "店舗を選択")}
        </button>
      </div>

      <div className="grid grid-cols-[42px_minmax(0,1fr)_minmax(0,1fr)] border-b border-slate-300">
        <div className="bg-slate-100 px-1.5 py-1 font-bold text-slate-700">
          時給
        </div>
        <input
          type="number"
          inputMode="numeric"
          disabled={disabled}
          value={row.castHourly ?? ""}
          onChange={(event) =>
            onPatch(row.castId, {
              castHourly: event.target.value ? Number(event.target.value) : null,
            })
          }
          onBlur={(event) =>
            onSave(row, {
              castHourly: event.target.value ? Number(event.target.value) : null,
            })
          }
          className={`${inputClass} border-y-0 border-l-0 text-right`}
          placeholder="時給"
        />
        <input
          type="number"
          inputMode="numeric"
          disabled={disabled}
          value={row.shopFee ?? ""}
          onChange={(event) =>
            onPatch(row.castId, {
              shopFee: event.target.value ? Number(event.target.value) : null,
            })
          }
          onBlur={(event) =>
            onSave(row, {
              shopFee: event.target.value ? Number(event.target.value) : null,
            })
          }
          className={`${inputClass} border-y-0 border-r-0 text-right text-slate-600`}
          placeholder="手数料"
        />
      </div>

      <div className="grid grid-cols-[42px_minmax(0,1fr)] border-b border-slate-300">
        <div className="bg-slate-100 px-1.5 py-1 font-bold text-slate-700">
          時間
        </div>
        <input
          list="mobile-dispatch-time-options"
          disabled={disabled}
          value={row.startTime ? `${normalizeTime(row.startTime)}~` : ""}
          onChange={(event) =>
            onPatch(row.castId, { startTime: event.target.value })
          }
          onBlur={(event) =>
            onSave(row, { startTime: normalizeTime(event.target.value) })
          }
          className={`${inputClass} border-0`}
          placeholder="21:00~"
        />
      </div>

      <div className="grid grid-cols-[42px_minmax(0,1fr)_48px]">
        <div className="bg-slate-100 px-1.5 py-1 font-bold text-slate-700">
          メモ
        </div>
        <input
          disabled={disabled}
          value={row.note ?? ""}
          onChange={(event) => onPatch(row.castId, { note: event.target.value })}
          onBlur={(event) => onSave(row, { note: event.target.value })}
          className={`${inputClass} border-y-0 border-l-0`}
        />
        <button
          type="button"
          disabled={disabled || row.status === "confirmed"}
          onClick={() => onConfirm(row)}
          className={`border-l border-slate-300 px-1 text-[10px] font-bold ${
            row.status === "confirmed"
              ? "bg-emerald-100 text-emerald-700"
              : "bg-white text-slate-900"
          }`}
        >
          {saving ? "保存" : row.status === "confirmed" ? "確定" : "確定"}
        </button>
      </div>
    </article>
  );
}

export default function AssignmentsPageClient() {
  const [date] = useState(() => todayKey());
  const [rows, setRows] = useState<DispatchSheetRow[]>([]);
  const [shops, setShops] = useState<DispatchSheetShop[]>([]);
  const [savingCastId, setSavingCastId] = useState<string | null>(null);
  const [shopPickerCastId, setShopPickerCastId] = useState<string | null>(null);
  const [shopQuery, setShopQuery] = useState("");
  const [shopOwner, setShopOwner] = useState("");
  const [shopGenre, setShopGenre] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sheet = await getDispatchSheet(date);
      setRows(sheet.rows ?? []);
      setShops(sheet.shops ?? []);
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
  const ownerOptions = useMemo(() => {
    return Array.from(
      new Set(shops.map((shop) => shop.ownerStaff).filter(Boolean) as string[]),
    ).sort((a, b) => a.localeCompare(b, "ja"));
  }, [shops]);
  const genreOptions = useMemo(() => {
    return Array.from(
      new Set(shops.map((shop) => shop.genre).filter(Boolean) as string[]),
    ).sort((a, b) => a.localeCompare(b, "ja"));
  }, [shops]);
  const shopCandidates = useMemo(() => {
    const q = shopQuery.trim().toLowerCase();
    return shops
      .filter((shop) => {
        if (shopOwner && shop.ownerStaff !== shopOwner) return false;
        if (shopGenre && shop.genre !== shopGenre) return false;
        if (!q) return true;
        return [
          shop.name,
          shop.code,
          shop.nameKana,
          shop.ownerStaff,
          shop.genre,
          shop.addressLine,
          shop.buildingName,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .slice(0, 120);
  }, [shops, shopQuery, shopOwner, shopGenre]);

  const patchRow = useCallback(
    (castId: string, patch: Partial<DispatchSheetRow>) => {
      setRows((current) =>
        current.map((row) => (row.castId === castId ? { ...row, ...patch } : row)),
      );
    },
    [],
  );

  const saveRow = useCallback(
    async (row: DispatchSheetRow, patch: Partial<DispatchSheetRow> = {}) => {
      const current = rows.find((item) => item.castId === row.castId) ?? row;
      const next = { ...current, ...patch };
      if (!next.displayName || !next.shopId) return null;
      setSavingCastId(next.castId);
      try {
        const sheet = await upsertDispatchSheetRow({
          date,
          castId: next.castId,
          assignmentId: next.assignmentId,
          shopId: next.shopId,
          startTime: normalizeTime(next.startTime),
          endTime: next.endTime || null,
          castHourly: next.castHourly ?? null,
          shopFee: next.shopFee ?? null,
          note: next.note ?? null,
          displayOrder: next.displayOrder ?? 0,
        });
        setRows(sheet.rows ?? []);
        setShops(sheet.shops ?? shops);
        return sheet.rows ?? [];
      } catch (err) {
        console.warn("[m/assignments] failed to save dispatch row", err);
        alert("保存に失敗しました。時間をおいて再度お試しください。");
        return null;
      } finally {
        setSavingCastId(null);
      }
    },
    [date, rows, shops],
  );

  const selectShop = useCallback(
    async (shop: DispatchSheetShop) => {
      if (!shopPickerCastId) return;
      const row = rows.find((item) => item.castId === shopPickerCastId);
      if (!row) return;
      const patch: Partial<DispatchSheetRow> = {
        shopId: shop.id,
        shopName: shop.name,
        shopNumber: shop.code,
        startTime: row.startTime || "21:00",
        castHourly: row.castHourly ?? row.desiredHourly ?? null,
      };
      patchRow(row.castId, patch);
      setShopPickerCastId(null);
      await saveRow(row, patch);
    },
    [patchRow, rows, saveRow, shopPickerCastId],
  );

  const confirmRow = useCallback(
    async (row: DispatchSheetRow) => {
      const current = rows.find((item) => item.castId === row.castId) ?? row;
      if (!current.shopId) {
        alert("派遣先を選択してください。");
        return;
      }
      setSavingCastId(current.castId);
      try {
        const savedRows = await saveRow(current);
        const latest =
          savedRows?.find((item) => item.castId === current.castId) ?? current;
        const assignmentId = latest.assignmentId ?? current.assignmentId;
        if (!assignmentId) {
          alert("保存後に確定IDを取得できませんでした。再度お試しください。");
          return;
        }
        await confirmDispatchSheetRow(assignmentId);
        await load();
      } catch (err) {
        console.warn("[m/assignments] failed to confirm dispatch row", err);
        alert("確定に失敗しました。時間をおいて再度お試しください。");
      } finally {
        setSavingCastId(null);
      }
    },
    [load, rows, saveRow],
  );

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
            <datalist id="mobile-dispatch-time-options">
              {TIME_OPTIONS.map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>
            {displayRows.map((row, index) => (
              <DispatchMiniCard
                key={row.assignmentId ?? row.castId ?? `row-${index}`}
                row={row}
                index={index}
                saving={savingCastId === row.castId}
                onPatch={patchRow}
                onSave={(targetRow, patch) => {
                  void saveRow(targetRow, patch);
                }}
                onOpenShopPicker={setShopPickerCastId}
                onConfirm={(targetRow) => {
                  void confirmRow(targetRow);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {shopPickerCastId ? (
        <div className="fixed inset-0 z-50 bg-slate-950/45">
          <div className="absolute inset-x-0 bottom-0 max-h-[86dvh] rounded-t-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div>
                <p className="text-sm font-bold text-slate-900">派遣先を選択</p>
                <p className="text-xs text-slate-500">
                  選択するとPC側にも保存・同期されます
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShopPickerCastId(null)}
                className="rounded-full border border-slate-300 p-2 text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2 border-b px-3 py-3">
              <label className="flex items-center gap-2 rounded border border-slate-300 px-2 py-2">
                <Search className="h-4 w-4 text-slate-400" />
                <input
                  value={shopQuery}
                  onChange={(event) => setShopQuery(event.target.value)}
                  className="min-w-0 flex-1 text-sm outline-none"
                  placeholder="店舗名・番号・担当者で検索"
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={shopOwner}
                  onChange={(event) => setShopOwner(event.target.value)}
                  className="h-9 rounded border border-slate-300 bg-white px-2 text-xs"
                >
                  <option value="">担当者すべて</option>
                  {ownerOptions.map((owner) => (
                    <option key={owner} value={owner}>
                      {owner}
                    </option>
                  ))}
                </select>
                <select
                  value={shopGenre}
                  onChange={(event) => setShopGenre(event.target.value)}
                  className="h-9 rounded border border-slate-300 bg-white px-2 text-xs"
                >
                  <option value="">ジャンルすべて</option>
                  {genreOptions.map((genre) => (
                    <option key={genre} value={genre}>
                      {genre}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="max-h-[56dvh] overflow-y-auto px-2 py-2">
              {shopCandidates.map((shop) => (
                <button
                  key={shop.id}
                  type="button"
                  onClick={() => void selectShop(shop)}
                  className="mb-1 flex w-full items-center justify-between gap-2 rounded border border-slate-200 bg-white px-3 py-2 text-left"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-slate-900">
                      {shop.code ? `${shop.code} / ` : ""}
                      {shop.name}
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {[shop.ownerStaff, shop.genre, shop.addressLine]
                        .filter(Boolean)
                        .join(" / ")}
                    </span>
                  </span>
                  <Check className="h-4 w-4 shrink-0 text-[#0b8ef3]" />
                </button>
              ))}
              {shopCandidates.length === 0 ? (
                <div className="py-8 text-center text-sm text-slate-500">
                  店舗が見つかりません
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </MobileShell>
  );
}
