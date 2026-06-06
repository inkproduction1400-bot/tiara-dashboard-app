"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Filter, RefreshCw, Search, X } from "lucide-react";
import { CastPhotoImage } from "@/components/CastPhotoImage";
import { MobileHeader } from "@/components/mobile/MobileHeader";
import { MobileShell } from "@/components/mobile/MobileShell";
import {
  cancelDispatchSheetRow,
  confirmDispatchSheetRow,
  getDispatchSheet,
  upsertAttendanceRequest,
  upsertDispatchSheetRow,
  type DispatchSheetRow,
  type DispatchSheetShop,
} from "@/lib/api.dispatch-sheet";
import { subscribeDispatchSheetUpdates } from "@/lib/socket";
import {
  listCasts,
  resolveCastPhotoDisplayUrl,
  resolveLegacyPhotoFallbackUrl,
  type CastListItem,
} from "@/lib/api.casts";
import { listStaffs, type StaffUser } from "@/lib/api.staffs";
import { getAuthSnapshot } from "@/components/mobile/mobileApi";

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
type AgeFilter = "" | "18-24" | "25-29" | "30-34" | "35-39" | "40-";

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
      ownerStaffName: null,
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
  onOpenCastPicker,
  onConfirm,
  onCancel,
}: {
  row: DispatchSheetRow;
  index: number;
  saving: boolean;
  onPatch: (castId: string, patch: Partial<DispatchSheetRow>) => void;
  onSave: (row: DispatchSheetRow, patch?: Partial<DispatchSheetRow>) => void;
  onOpenShopPicker: (castId: string) => void;
  onOpenCastPicker: (slotIndex: number) => void;
  onConfirm: (row: DispatchSheetRow) => void;
  onCancel: (row: DispatchSheetRow) => void;
}) {
  const isEmpty = !row.displayName;
  const rowCastId = row.castId ?? "";
  const disabled = isEmpty || saving;
  const canCancel =
    !isEmpty &&
    !saving &&
    ((row.manualAdded && row.status === "draft") ||
      (row.status === "confirmed" && Boolean(row.assignmentId)));
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
        <button
          type="button"
          onClick={() => {
            if (isEmpty) onOpenCastPicker(index);
          }}
          className={`flex min-w-0 items-center justify-between gap-1 px-1.5 py-1 text-left ${
            isEmpty ? "text-slate-400" : "text-slate-900"
          }`}
        >
          <span className="truncate font-bold">
            {row.displayName || "キャストを選択"}
          </span>
          <span className="shrink-0 text-[10px] text-slate-400">
            {row.managementNumber || row.castCode || ""}
          </span>
        </button>
      </div>

      <div className="grid grid-cols-[42px_minmax(0,1fr)] border-b border-slate-300">
        <div className="bg-slate-100 px-1.5 py-1 font-bold text-slate-700">
          派遣先
        </div>
        <button
          type="button"
          disabled={isEmpty}
          onClick={() => {
            if (rowCastId) onOpenShopPicker(rowCastId);
          }}
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
            onPatch(rowCastId, {
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
            onPatch(rowCastId, {
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
            onPatch(rowCastId, { startTime: event.target.value })
          }
          onBlur={(event) =>
            onSave(row, { startTime: normalizeTime(event.target.value) })
          }
          className={`${inputClass} border-0`}
          placeholder="21:00~"
        />
      </div>

      <div className="grid grid-cols-[42px_minmax(0,1fr)_46px_46px]">
        <div className="bg-slate-100 px-1.5 py-1 font-bold text-slate-700">
          メモ
        </div>
        <input
          disabled={disabled}
          value={row.note ?? ""}
          onChange={(event) => onPatch(rowCastId, { note: event.target.value })}
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
        <button
          type="button"
          disabled={!canCancel}
          onClick={() => onCancel(row)}
          className={`border-l border-slate-300 px-1 text-[10px] font-bold ${
            canCancel
              ? "bg-rose-50 text-rose-600"
              : "bg-slate-50 text-slate-300"
          }`}
        >
          {row.status === "confirmed" ? "取消" : "解除"}
        </button>
      </div>
    </article>
  );
}

export default function AssignmentsPageClient() {
  const [date] = useState(() => todayKey());
  const [rows, setRows] = useState<DispatchSheetRow[]>([]);
  const [shops, setShops] = useState<DispatchSheetShop[]>([]);
  const [castCandidates, setCastCandidates] = useState<CastListItem[]>([]);
  const [staffAccounts, setStaffAccounts] = useState<StaffUser[]>([]);
  const [savingCastId, setSavingCastId] = useState<string | null>(null);
  const [shopPickerCastId, setShopPickerCastId] = useState<string | null>(null);
  const [castPickerSlotIndex, setCastPickerSlotIndex] = useState<number | null>(
    null,
  );
  const [shopQuery, setShopQuery] = useState("");
  const [shopOwner, setShopOwner] = useState("");
  const [shopGenre, setShopGenre] = useState("");
  const [castQuery, setCastQuery] = useState("");
  const [castOwner, setCastOwner] = useState("");
  const [castGenre, setCastGenre] = useState("");
  const [castAge, setCastAge] = useState<AgeFilter>("");
  const [castFilterOpen, setCastFilterOpen] = useState(false);
  const [castPhotoUrls, setCastPhotoUrls] = useState<Record<string, string | null>>(
    {},
  );
  const [castPickerLoading, setCastPickerLoading] = useState(false);
  const [castPickerError, setCastPickerError] = useState<string | null>(null);
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
    let mounted = true;
    listStaffs()
      .then((items) => {
        if (mounted) setStaffAccounts(items);
      })
      .catch(() => {
        if (mounted) setStaffAccounts([]);
      });
    return () => {
      mounted = false;
    };
  }, []);

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
  const castOwnerOptions = useMemo(() => {
    const names = new Set<string>();
    for (const staff of staffAccounts) {
      if (staff.userType !== "staff" || staff.status !== "active") continue;
      const name = staff.loginId?.trim();
      if (name && !name.toLowerCase().includes("demo")) names.add(name);
    }
    for (const cast of castCandidates) {
      const name = cast.ownerStaffName?.trim();
      if (name) names.add(name);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b, "ja"));
  }, [castCandidates, staffAccounts]);
  const castGenreOptions = useMemo(() => {
    const genres = new Set<string>();
    for (const cast of castCandidates) {
      for (const genre of cast.genres ?? []) {
        const value = String(genre).trim();
        if (value) genres.add(value);
      }
    }
    return Array.from(genres).sort((a, b) => a.localeCompare(b, "ja"));
  }, [castCandidates]);
  const assignedCastIds = useMemo(
    () => new Set(rows.filter((row) => row.displayName).map((row) => row.castId)),
    [rows],
  );
  const currentStaffName = getAuthSnapshot().userName?.trim() ?? "";
  const isInAgeRange = (age: number | null | undefined, filter: AgeFilter) => {
    if (!filter) return true;
    if (age == null) return false;
    if (filter === "18-24") return age >= 18 && age <= 24;
    if (filter === "25-29") return age >= 25 && age <= 29;
    if (filter === "30-34") return age >= 30 && age <= 34;
    if (filter === "35-39") return age >= 35 && age <= 39;
    return age >= 40;
  };
  const filteredCastCandidates = useMemo(() => {
    return castCandidates
      .filter((cast) => !assignedCastIds.has(cast.userId))
      .filter((cast) => {
        if (castGenre && !(cast.genres ?? []).includes(castGenre)) return false;
        if (!isInAgeRange(cast.age, castAge)) return false;
        return true;
      });
  }, [assignedCastIds, castAge, castCandidates, castGenre]);
  const castFilterCount =
    (castOwner ? 1 : 0) + (castGenre ? 1 : 0) + (castAge ? 1 : 0);

  useEffect(() => {
    if (castPickerSlotIndex === null) return;
    let cancelled = false;
    const targets = filteredCastCandidates
      .slice(0, 80)
      .filter((cast) => cast.photoUrl || cast.photoUrlRaw)
      .filter((cast) => !(cast.userId in castPhotoUrls));

    if (targets.length === 0) return;

    void Promise.allSettled(
      targets.map(async (cast) => {
        const url = await resolveCastPhotoDisplayUrl({
          castId: cast.userId,
          purpose: "profile",
          urlOrPath: cast.photoUrl ?? cast.photoUrlRaw,
        });
        return [cast.userId, url] as const;
      }),
    ).then((results) => {
      if (cancelled) return;
      setCastPhotoUrls((current) => {
        const next = { ...current };
        for (const result of results) {
          if (result.status !== "fulfilled") continue;
          const [castId, url] = result.value;
          next[castId] = url;
        }
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [castPhotoUrls, castPickerSlotIndex, filteredCastCandidates]);

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
      if (!next.castId) return null;
      if (!next.displayName || !next.shopId) return null;
      setSavingCastId(next.castId);
      try {
        const sheet = await upsertDispatchSheetRow({
          date,
          castId: next.castId,
          assignmentId: next.assignmentId,
          orderId: next.orderId,
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
      if (!row?.castId) return;
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

  const openCastPicker = useCallback((slotIndex: number) => {
    setCastPickerSlotIndex(slotIndex);
    setCastQuery("");
    setCastGenre("");
    setCastAge("");
    setCastFilterOpen(false);
    const authName = getAuthSnapshot().userName?.trim() ?? "";
    setCastOwner((current) => current || authName);
  }, []);

  useEffect(() => {
    if (castPickerSlotIndex === null) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setCastPickerLoading(true);
      setCastPickerError(null);
      void listCasts({
        q: castQuery.trim() || undefined,
        ownerStaffName: castOwner || undefined,
        sort: "management",
        limit: 300,
      })
        .then((res) => {
          if (!cancelled) setCastCandidates(res.items ?? []);
        })
        .catch((err) => {
          console.warn("[m/assignments] failed to load cast candidates", err);
          if (!cancelled) setCastPickerError("キャスト一覧の取得に失敗しました");
        })
        .finally(() => {
          if (!cancelled) setCastPickerLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [castOwner, castPickerSlotIndex, castQuery]);

  const selectCast = useCallback(
    async (cast: CastListItem) => {
      if (castPickerSlotIndex === null) return;
      const slotRow = displayRows[castPickerSlotIndex];
      setSavingCastId(cast.userId);
      try {
        await upsertAttendanceRequest({
          date,
          castId: cast.userId,
          status: "added",
          displayOrder:
            typeof slotRow?.displayOrder === "number"
              ? slotRow.displayOrder
              : castPickerSlotIndex,
        });
        if (slotRow?.isOrderSlot && slotRow.orderId && slotRow.shopId) {
          await upsertDispatchSheetRow({
            date,
            castId: cast.userId,
            orderId: slotRow.orderId,
            shopId: slotRow.shopId,
            startTime: "00:00",
            endTime: null,
            castHourly: cast.desiredHourly ?? null,
            shopFee: null,
            note: slotRow.note ?? null,
            displayOrder:
              typeof slotRow.displayOrder === "number"
                ? slotRow.displayOrder
                : castPickerSlotIndex,
          });
        }
        setCastPickerSlotIndex(null);
        await load();
      } catch (err) {
        console.warn("[m/assignments] failed to add cast to dispatch", err);
        alert("キャストの追加に失敗しました。時間をおいて再度お試しください。");
      } finally {
        setSavingCastId(null);
      }
    },
    [castPickerSlotIndex, date, displayRows, load],
  );

  const confirmRow = useCallback(
    async (row: DispatchSheetRow) => {
      const current = rows.find((item) => item.castId === row.castId) ?? row;
      if (!current.castId) return;
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

  const cancelOrRemoveRow = useCallback(
    async (row: DispatchSheetRow) => {
      if (row.status === "confirmed") {
        if (!row.castId) return;
        if (!row.assignmentId) return;
        const reason =
          window.prompt(
            "キャンセル理由を入力してください。",
            row.cancellationReason || "当日欠勤",
          ) ?? "";
        const trimmed = reason.trim();
        if (!trimmed) return;
        if (!window.confirm(`${row.displayName} の確定済み派遣をキャンセルしますか？`)) {
          return;
        }
        setSavingCastId(row.castId);
        try {
          await cancelDispatchSheetRow(row.assignmentId, trimmed);
          await load();
        } catch (err) {
          console.warn("[m/assignments] failed to cancel dispatch row", err);
          alert("キャンセルに失敗しました。時間をおいて再度お試しください。");
        } finally {
          setSavingCastId(null);
        }
        return;
      }

      if (!row.manualAdded || row.status !== "draft") return;
      if (!row.castId) return;
      if (
        !window.confirm(
          `${row.displayName} を派遣表から外しますか？入力ミス扱いのため、キャンセル履歴には含めません。`,
        )
      ) {
        return;
      }
      setSavingCastId(row.castId);
      try {
        await upsertAttendanceRequest({
          date,
          castId: row.castId,
          status: "removed",
          displayOrder: row.displayOrder ?? null,
        });
        await load();
      } catch (err) {
        console.warn("[m/assignments] failed to remove manual dispatch row", err);
        alert("派遣表から外す処理に失敗しました。時間をおいて再度お試しください。");
      } finally {
        setSavingCastId(null);
      }
    },
    [date, load],
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
                onOpenCastPicker={openCastPicker}
                onConfirm={(targetRow) => {
                  void confirmRow(targetRow);
                }}
                onCancel={(targetRow) => {
                  void cancelOrRemoveRow(targetRow);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {castPickerSlotIndex !== null ? (
        <div className="fixed inset-0 z-[9999] flex items-end justify-center overflow-hidden bg-slate-950/45 px-3 pt-4">
          <div className="flex h-[calc(100dvh-16px)] w-full max-w-[420px] min-w-0 flex-col overflow-hidden rounded-t-2xl bg-white pb-[calc(env(safe-area-inset-bottom)+14px)] shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900">
                  キャストを選択
                </p>
                <p className="text-xs text-slate-500">
                  派遣表 {castPickerSlotIndex + 1}枠目に追加
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCastPickerSlotIndex(null)}
                className="rounded-full border border-slate-300 p-2 text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="shrink-0 space-y-2 border-b px-3 py-3">
              <div className="flex items-center gap-2">
                <label className="flex min-w-0 flex-1 items-center gap-2 rounded border border-slate-300 px-2 py-2">
                  <Search className="h-4 w-4 shrink-0 text-slate-400" />
                  <input
                    value={castQuery}
                    onChange={(event) => setCastQuery(event.target.value)}
                    className="min-w-0 flex-1 text-sm outline-none"
                    placeholder="名前・番号・キャストID"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setCastFilterOpen(true)}
                  className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded border border-slate-300 bg-white text-slate-700"
                  aria-label="絞り込み"
                >
                  <Filter className="h-4 w-4" />
                  {castFilterCount > 0 ? (
                    <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#0b8ef3] px-1 text-[10px] font-bold text-white">
                      {castFilterCount}
                    </span>
                  ) : null}
                </button>
              </div>
              <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                <span className="truncate">
                  担当: {castOwner || "すべて"} / {filteredCastCandidates.length}件
                </span>
                {currentStaffName ? (
                  <button
                    type="button"
                    onClick={() => setCastOwner(currentStaffName)}
                    className="shrink-0 rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-600"
                  >
                    自分担当
                  </button>
                ) : null}
              </div>
            </div>

            <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-2 py-2 [-webkit-overflow-scrolling:touch]">
              {castPickerLoading ? (
                <div className="py-10 text-center text-sm text-slate-500">
                  読み込み中...
                </div>
              ) : castPickerError ? (
                <div className="py-10 text-center text-sm text-rose-500">
                  {castPickerError}
                </div>
              ) : filteredCastCandidates.length > 0 ? (
                <div className="grid grid-cols-2 gap-2">
                  {filteredCastCandidates.map((cast) => (
                    <button
                      key={cast.userId}
                      type="button"
                      onClick={() => void selectCast(cast)}
                      className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white text-left shadow-sm"
                    >
                      <div className="aspect-[4/3] bg-slate-100">
                        <CastPhotoImage
                          src={castPhotoUrls[cast.userId] ?? null}
                          fallbackSrc={resolveLegacyPhotoFallbackUrl(cast)}
                          alt={cast.displayName || ""}
                          className="h-full w-full object-cover"
                          fallback={
                            <div className="flex h-full items-center justify-center text-[11px] font-semibold text-slate-400">
                              NO PHOTO
                            </div>
                          }
                        />
                      </div>
                      <div className="space-y-1 px-2 py-2">
                        <p className="truncate text-sm font-bold text-slate-900">
                          {cast.displayName || "名称未設定"}
                        </p>
                        <p className="truncate text-[11px] text-slate-500">
                          {cast.managementNumber || cast.castCode || "-"}
                          {cast.age != null ? ` / ${cast.age}歳` : ""}
                        </p>
                        <p className="truncate text-[11px] font-semibold text-slate-700">
                          ¥{(cast.desiredHourly ?? 0).toLocaleString("ja-JP")}
                        </p>
                        <p className="truncate text-[10px] text-slate-400">
                          {cast.ownerStaffName || "担当未設定"}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="py-10 text-center text-sm text-slate-500">
                  条件に一致するキャストがいません
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {castFilterOpen ? (
        <div className="fixed inset-0 z-[10000] flex items-end justify-center overflow-hidden bg-slate-950/45 px-3 pt-4">
          <div className="flex max-h-[calc(100dvh-16px)] w-full max-w-[420px] flex-col overflow-hidden rounded-t-2xl bg-white pb-[calc(env(safe-area-inset-bottom)+14px)] shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
              <div>
                <p className="text-sm font-bold text-slate-900">絞り込み</p>
                <p className="text-xs text-slate-500">
                  担当者・ジャンル・年齢で絞り込み
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCastFilterOpen(false)}
                className="rounded-full bg-[#0b8ef3] px-4 py-2 text-xs font-bold text-white"
              >
                決定
              </button>
            </div>
            <div className="min-h-0 flex-1 touch-pan-y space-y-3 overflow-y-auto px-4 py-4 [-webkit-overflow-scrolling:touch]">
              <label className="grid gap-1 text-xs font-semibold text-slate-600">
                担当者
                <select
                  value={castOwner}
                  onChange={(event) => setCastOwner(event.target.value)}
                  className="h-10 rounded border border-slate-300 bg-white px-2 text-sm"
                >
                  <option value="">すべて</option>
                  {castOwnerOptions.map((owner) => (
                    <option key={owner} value={owner}>
                      {owner}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-600">
                ジャンル
                <select
                  value={castGenre}
                  onChange={(event) => setCastGenre(event.target.value)}
                  className="h-10 rounded border border-slate-300 bg-white px-2 text-sm"
                >
                  <option value="">すべて</option>
                  {castGenreOptions.map((genre) => (
                    <option key={genre} value={genre}>
                      {genre}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-600">
                年齢
                <select
                  value={castAge}
                  onChange={(event) => setCastAge(event.target.value as AgeFilter)}
                  className="h-10 rounded border border-slate-300 bg-white px-2 text-sm"
                >
                  <option value="">すべて</option>
                  <option value="18-24">18-24歳</option>
                  <option value="25-29">25-29歳</option>
                  <option value="30-34">30-34歳</option>
                  <option value="35-39">35-39歳</option>
                  <option value="40-">40歳以上</option>
                </select>
              </label>
              <button
                type="button"
                onClick={() => {
                  setCastOwner("");
                  setCastGenre("");
                  setCastAge("");
                  setCastFilterOpen(false);
                }}
                className="w-full rounded-xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-600"
              >
                条件をクリア
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
