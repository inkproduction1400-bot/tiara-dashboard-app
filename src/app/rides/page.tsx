// src/app/rides/page.tsx
"use client";

import { useEffect, useMemo, useState, ChangeEvent } from "react";
import AppShell from "@/components/AppShell";
import { listRides, updateRide } from "@/lib/api.rides";
import type { RideListItem, RideStatus } from "@/lib/api.rides";
import { generateTimes } from "@/lib/time";
import { format, addDays, parseISO } from "date-fns";
import { ja } from "date-fns/locale";

export default function RidesPage() {
  const [rides, setRides] = useState<RideListItem[]>([]);
  const [loading, setLoading] = useState(false);

  // ---- 日付切り替え ----
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = new Date();
    return format(today, "yyyy-MM-dd");
  });

  const displayDate = useMemo(
    () =>
      format(parseISO(selectedDate), "yyyy年MM月dd日（E）", {
        locale: ja,
      }),
    [selectedDate],
  );

  function goPrevDay() {
    setSelectedDate((prev: string) => {
      const base = parseISO(prev);
      const next = addDays(base, -1);
      return format(next, "yyyy-MM-dd");
    });
  }

  function goNextDay() {
    setSelectedDate((prev: string) => {
      const base = parseISO(prev);
      const next = addDays(base, 1);
      return format(next, "yyyy-MM-dd");
    });
  }

  function goToday() {
    const t = new Date();
    setSelectedDate(format(t, "yyyy-MM-dd"));
  }

  // ---- 時間リスト（10分刻み）----
  const timeOptions = useMemo(() => generateTimes(), []);

  // ---- 送迎リスト読み込み ----
  useEffect(() => {
    void load();
  }, [selectedDate]);

  async function load() {
    setLoading(true);
    try {
      const data = await listRides({ date: selectedDate });
      setRides(data);
    } finally {
      setLoading(false);
    }
  }

  // ---- PATCH: 各項目変更時 ----
  async function patchField(
    id: string,
    field: string,
    value: string | number | null,
  ) {
    // UpdateRidePayload は { field, value } 形式
    await updateRide(id, { field, value });
    await load();
  }

  async function handleCarNumberChange(
    id: string,
    e: ChangeEvent<HTMLSelectElement>,
  ) {
    const v = e.target.value ? Number(e.target.value) : null;
    await patchField(id, "carNumber", v);
  }

  async function handleBoardingChange(
    id: string,
    e: ChangeEvent<HTMLSelectElement>,
  ) {
    const v = e.target.value || null;
    await patchField(id, "boardingTime", v);
  }

  async function handleArrivalChange(
    id: string,
    e: ChangeEvent<HTMLSelectElement>,
  ) {
    const v = e.target.value || null;
    await patchField(id, "arrivalTime", v);
  }

  async function handleNoteChange(id: string, value: string) {
    await patchField(id, "note", value || null);
  }

  async function handleStatusChange(
    id: string,
    e: ChangeEvent<HTMLSelectElement>,
  ) {
    const v = e.target.value as RideStatus;
    await patchField(id, "status", v);
  }

  function StatusBadge({ status }: { status: RideStatus }) {
    // status: pending | accepted | completed | canceled
    let style = "bg-gray-100 text-gray-700 border-gray-300";
    let label: string = status;

    if (status === "pending") {
      style = "bg-yellow-100 text-yellow-700 border-yellow-300";
      label = "受付済";
    } else if (status === "completed") {
      style = "bg-green-100 text-green-700 border-green-300";
      label = "完了";
    } else if (status === "canceled") {
      style = "bg-red-100 text-red-700 border-red-300";
      label = "キャンセル";
    } else if (status === "accepted") {
      // いまは UI からは使わないが、将来用
      style = "bg-blue-100 text-blue-700 border-blue-300";
      label = "配車済";
    }

    return (
      <span
        className={`px-2 py-1 rounded text-xs border inline-block font-medium ${style}`}
      >
        {label}
      </span>
    );
  }

  return (
    <AppShell title="送迎管理">
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold">送迎管理</h1>

        {/* 日付切り替え */}
        <div className="flex items-center gap-3">
          <button
            onClick={goPrevDay}
            className="px-3 py-1 rounded bg-gray-100 hover:bg-gray-200 border"
          >
            ← 前日
          </button>

          <button
            onClick={goToday}
            className="px-3 py-1 rounded bg-gray-100 hover:bg-gray-200 border"
          >
            今日
          </button>

          <button
            onClick={goNextDay}
            className="px-3 py-1 rounded bg-gray-100 hover:bg-gray-200 border"
          >
            翌日 →
          </button>

          <span className="text-lg font-semibold ml-4">{displayDate}</span>
        </div>

        {/* 表 */}
        <div className="overflow-x-auto border rounded-xl">
          <table className="min-w-[1400px] text-sm">
            <thead className="bg-gray-100 text-gray-700">
              <tr>
                <th className="px-3 py-2 border">名前</th>
                <th className="px-3 py-2 border">ID</th>
                <th className="px-3 py-2 border">場所</th>
                <th className="px-3 py-2 border">車番</th>
                <th className="px-3 py-2 border">受付時間</th>
                <th className="px-3 py-2 border">乗車時間</th>
                <th className="px-3 py-2 border">到着予定</th>
                <th className="px-3 py-2 border">備考</th>
                <th className="px-3 py-2 border">ステータス</th>
              </tr>
            </thead>
            <tbody>
              {rides.map((r) => {
                const checkedAt = r.created_at
                  ? format(new Date(r.created_at), "HH:mm")
                  : "-";

                return (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 border font-medium">
                      {r.cast_name ?? "-"}
                    </td>
                    <td className="px-3 py-2 border text-center">
                      {r.cast_management_number ?? "-"}
                    </td>
                    <td className="px-3 py-2 border">
                      {r.pickup_city || "-"}
                    </td>
                    <td className="px-3 py-2 border">
                      <select
                        className="border rounded px-2 py-1"
                        value={r.car_number ?? ""}
                        onChange={(e) => handleCarNumberChange(r.id, e)}
                      >
                        <option value="">-</option>
                        {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                          <option key={n} value={n}>
                            {n}号車
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 border text-center">
                      {checkedAt}
                    </td>
                    <td className="px-3 py-2 border">
                      <select
                        className="border rounded px-2 py-1"
                        value={r.boarding_time ?? ""}
                        onChange={(e) => handleBoardingChange(r.id, e)}
                      >
                        <option value="">-</option>
                        {timeOptions.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 border">
                      <select
                        className="border rounded px-2 py-1"
                        value={r.arrival_time ?? ""}
                        onChange={(e) => handleArrivalChange(r.id, e)}
                      >
                        <option value="">-</option>
                        {timeOptions.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 border">
                      <input
                        defaultValue={r.note ?? ""}
                        onBlur={(e) => handleNoteChange(r.id, e.target.value)}
                        className="border rounded px-2 py-1 w-full"
                        placeholder="備考"
                      />
                    </td>
                    <td className="px-3 py-2 border text-center">
                      <div className="flex flex-col items-center gap-1">
                        <StatusBadge status={r.status} />
                        <select
                          className="border rounded px-2 py-1 text-xs"
                          value={r.status}
                          onChange={(e) => handleStatusChange(r.id, e)}
                        >
                          {/* pending / completed / canceled の 3 状態を使う */}
                          <option value="pending">受付済</option>
                          <option value="completed">完了</option>
                          <option value="canceled">キャンセル</option>
                        </select>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {loading && (
            <div className="p-4 text-center text-gray-500">読み込み中...</div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
