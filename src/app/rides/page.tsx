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

        <div className="rounded border bg-white p-3">
          {loading && (
            <div className="px-3 py-4 text-center text-sm text-gray-500">
              読み込み中…
            </div>
          )}

          {!loading && rides.length === 0 && (
            <div className="px-3 py-4 text-center text-sm text-gray-500">
              この日の送迎情報はありません。
            </div>
          )}

          {!loading && rides.length > 0 && (
            <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
              {rides.map((ride) => {
                const location = ride.pickup_city ?? ride.shop_name ?? "-";

                return (
                  <div
                    key={ride.id}
                    className="grid grid-cols-[1.1fr_0.8fr_1.8fr_0.8fr] items-center gap-2 rounded border border-gray-200 bg-white px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <div className="text-[10px] font-semibold text-gray-400">
                        名前
                      </div>
                      <div className="truncate font-semibold text-gray-900">
                        {ride.cast_name ?? "未設定"}
                      </div>
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] font-semibold text-gray-400">
                        ID
                      </div>
                      <div className="truncate text-gray-800">
                        {ride.cast_management_number ?? "-"}
                      </div>
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] font-semibold text-gray-400">
                        場所
                      </div>
                      <div className="truncate text-gray-800">{location}</div>
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] font-semibold text-gray-400">
                        受付
                      </div>
                      <div className="truncate text-gray-800">
                        {formatTimeLabel(ride.created_at)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
