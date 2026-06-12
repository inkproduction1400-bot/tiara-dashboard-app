// src/app/rides/page.tsx
"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import AppShell from "@/components/AppShell";
import { ListRides } from "@/lib/api.rides";
import { type RideListItem } from "@/lib/types.rides";
import { format, addDays, parseISO } from "date-fns";
import { ja } from "date-fns/locale";

function formatDateLabel(dateStr: string) {
  const d = parseISO(dateStr);
  return format(d, "yyyy年MM月dd日（EEE）", { locale: ja });
}

function toDateString(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

// 受付時間用（created_at から HH:mm 抽出）
function formatTimeLabel(isoStr: string | null | undefined): string {
  if (!isoStr) return "未設定";
  const d = parseISO(isoStr);
  return format(d, "HH:mm");
}

export default function RidesPage() {
  const [selectedDate, setSelectedDate] = useState<string>(
    toDateString(new Date()),
  );
  const [rides, setRides] = useState<RideListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const ridesKeyRef = useRef<string>("");

  const buildRidesKey = (list: RideListItem[]) =>
    list
      .map(
        (r) =>
          [
            r.id,
            r.pickup_city ?? "",
            r.shop_name ?? "",
            r.cast_name ?? "",
            r.cast_management_number ?? "",
            r.created_at ?? "",
            r.request_date ?? "",
          ].join("|"),
      )
      .join("::");

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = Boolean(opts?.silent);
      if (!silent) setLoading(true);
      try {
        const data = await ListRides({ date: selectedDate });
        const nextKey = buildRidesKey(data);
        if (nextKey !== ridesKeyRef.current) {
          ridesKeyRef.current = nextKey;
          setRides(data);
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [selectedDate],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void load({ silent: true });
    }, 5000);
    return () => {
      window.clearInterval(timer);
    };
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
                <th className="px-3 py-2 text-left">受付時間</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-4 text-center text-gray-500"
                  >
                    読み込み中…
                  </td>
                </tr>
              )}

              {!loading && rides.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-4 text-center text-gray-500"
                  >
                    この日の送迎情報はありません。
                  </td>
                </tr>
              )}

              {!loading &&
                rides.map((ride) => {
                  // 場所は pickup_city を優先し、なければ shop 名
                  const location =
                    ride.pickup_city ?? ride.shop_name ?? "-";

                  return (
                    <tr key={ride.id} className="border-t">
                      <td className="px-3 py-2">
                        {ride.cast_name ?? "未設定"}
                      </td>
                      <td className="px-3 py-2">
                        {ride.cast_management_number ?? "-"}
                      </td>
                      <td className="px-3 py-2">{location}</td>
                      <td className="px-3 py-2">
                        {formatTimeLabel(ride.created_at)}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
