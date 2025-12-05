// src/app/rides/page.tsx
"use client";

import {
  useCallback,
  useEffect,
  useState,
  type ChangeEvent,
} from "react";
import AppShell from "@/components/AppShell";
import { ListRides, updateRide } from "@/lib/api.rides";
import {
  type RideListItem,
  type RideStatus,
  type UpdateRidePayload,
} from "@/lib/types.rides";
import { generateTimes } from "@/lib/time";
import { format, addDays, parseISO } from "date-fns";
import { ja } from "date-fns/locale";

function formatDateLabel(dateStr: string) {
  const d = parseISO(dateStr);
  return format(d, "yyyy年MM月dd日（EEE）", { locale: ja });
}

function toDateString(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

function StatusBadge({ status }: { status: RideStatus }) {
  let style =
    "bg-gray-100 text-gray-700 border-gray-300 px-2 py-1 rounded text-xs";
  let label = ""; // string 型で初期化

  if (status === "pending") {
    style =
      "bg-yellow-100 text-yellow-700 border-yellow-300 px-2 py-1 rounded text-xs";
    label = "受付済み";
  } else if (status === "completed") {
    style =
      "bg-green-100 text-green-700 border-green-300 px-2 py-1 rounded text-xs";
    label = "終了";
  } else if (status === "canceled") {
    style =
      "bg-red-100 text-red-700 border-red-300 px-2 py-1 rounded text-xs";
    label = "キャンセル";
  } else if (status === "accepted") {
    style =
      "bg-blue-100 text-blue-700 border-blue-300 px-2 py-1 rounded text-xs";
    label = "配車済み";
  }

  return <span className={style}>{label}</span>;
}

export default function RidesPage() {
  const [selectedDate, setSelectedDate] = useState<string>(
    toDateString(new Date()),
  );
  const [rides, setRides] = useState<RideListItem[]>([]);
  const [loading, setLoading] = useState(false);

  const times = generateTimes(); // "HH:mm" の配列想定

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await ListRides({ date: selectedDate });
      setRides(data);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    void load();
  }, [load]);

  // 日付ナビ
  const handlePrevDay = () => {
    const d = addDays(parseISO(selectedDate), -1);
    setSelectedDate(toDateString(d));
  };

  const handleToday = () => {
    setSelectedDate(toDateString(new Date()));
  };

  const handleNextDay = () => {
    const d = addDays(parseISO(selectedDate), 1);
    setSelectedDate(toDateString(d));
  };

  // ----- PATCH: 各項目変更時 -----
  async function patchField<K extends keyof UpdateRidePayload>(
    id: string,
    field: K,
    value: UpdateRidePayload[K],
  ) {
    const payload: UpdateRidePayload = {
      [field]: value,
    } as UpdateRidePayload;

    await updateRide(id, payload);
    await load();
  }

  async function handleCarNumberChange(
    id: string,
    e: ChangeEvent<HTMLSelectElement>,
  ) {
    const v = e.target.value || null;
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

  async function handleStatusChange(
    id: string,
    e: ChangeEvent<HTMLSelectElement>,
  ) {
    const v = e.target.value as RideStatus;
    await patchField(id, "status", v);
  }

  return (
    <AppShell title="送迎管理">
      <div className="px-6 py-6 space-y-6">
        {/* ヘッダー：日付ナビ */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">送迎管理</h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            className="px-3 py-1 text-sm border rounded"
            onClick={handlePrevDay}
          >
            &lt; 前日
          </button>
          <button
            type="button"
            className="px-3 py-1 text-sm border rounded"
            onClick={handleToday}
          >
            今日
          </button>
          <button
            type="button"
            className="px-3 py-1 text-sm border rounded"
            onClick={handleNextDay}
          >
            翌日 &gt;
          </button>

          <div className="ml-4 text-sm">{formatDateLabel(selectedDate)}</div>
        </div>

        {/* テーブル */}
        <div className="overflow-x-auto rounded border bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left">名前</th>
                <th className="px-3 py-2 text-left">ID</th>
                <th className="px-3 py-2 text-left">場所</th>
                <th className="px-3 py-2 text-left">車番</th>
                <th className="px-3 py-2 text-left">乗車時間</th>
                <th className="px-3 py-2 text-left">到着時間</th>
                <th className="px-3 py-2 text-left">ステータス</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-4 text-center text-gray-500"
                  >
                    読み込み中…
                  </td>
                </tr>
              )}

              {!loading && rides.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-4 text-center text-gray-500"
                  >
                    この日の送迎情報はありません。
                  </td>
                </tr>
              )}

              {!loading &&
                rides.map((ride) => (
                  <tr key={ride.id} className="border-t">
                    <td className="px-3 py-2">
                      {ride.cast_name ?? "未設定"}
                    </td>
                    <td className="px-3 py-2">
                      {ride.cast_management_number ?? "-"}
                    </td>
                    <td className="px-3 py-2">
                      {/* 場所：pickup_city を優先し、なければ店舗名、それもなければ "-" */}
                      {ride.pickup_city ?? ride.shop_name ?? "-"}
                    </td>
                    <td className="px-3 py-2">
                      <select
                        className="border rounded px-2 py-1 text-xs"
                        value={ride.car_number ?? ""}
                        onChange={(e) => handleCarNumberChange(ride.id, e)}
                      >
                        <option value="">未設定</option>
                        {/* 必要なら車番候補をここに列挙 */}
                        <option value="1">1</option>
                        <option value="2">2</option>
                        <option value="3">3</option>
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <select
                        className="border rounded px-2 py-1 text-xs"
                        value={ride.boarding_time ?? ""}
                        onChange={(e) => handleBoardingChange(ride.id, e)}
                      >
                        <option value="">未設定</option>
                        {times.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <select
                        className="border rounded px-2 py-1 text-xs"
                        value={ride.arrival_time ?? ""}
                        onChange={(e) => handleArrivalChange(ride.id, e)}
                      >
                        <option value="">未設定</option>
                        {times.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={ride.status} />
                        <select
                          className="border rounded px-2 py-1 text-xs"
                          value={ride.status}
                          onChange={(e) => handleStatusChange(ride.id, e)}
                        >
                          <option value="pending">受付済み</option>
                          <option value="accepted">配車済み</option>
                          <option value="completed">終了</option>
                          <option value="canceled">キャンセル</option>
                        </select>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
