"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AssignmentCard } from "@/components/mobile/AssignmentCard";
import { MobileHeader } from "@/components/mobile/MobileHeader";
import { MobileShell } from "@/components/mobile/MobileShell";
import {
  fetchAssignmentsForDate,
  type MobileAssignmentCardData,
} from "@/components/mobile/mobileApi";

function dateKey(offset: number) {
  const date = new Date();
  if (date.getHours() < 5) {
    date.setDate(date.getDate() - 1);
  }
  date.setDate(date.getDate() + offset);
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const DAY_OPTIONS = [
  { key: "today", label: "本日", date: () => dateKey(0) },
  { key: "tomorrow", label: "明日", date: () => dateKey(1) },
] as const;

type DayKey = (typeof DAY_OPTIONS)[number]["key"];

export default function AssignmentsPageClient() {
  const [day, setDay] = useState<DayKey>("today");
  const [items, setItems] = useState<MobileAssignmentCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currentDate = useMemo(
    () => DAY_OPTIONS.find((option) => option.key === day)?.date() ?? dateKey(0),
    [day],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await fetchAssignmentsForDate(currentDate));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "読み込み失敗");
    } finally {
      setLoading(false);
    }
  }, [currentDate]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <MobileShell>
      <MobileHeader
        title="出勤割当"
        subtitle="本日 / 明日の割当状況を閲覧専用で確認"
        onRefresh={() => void load()}
      />

      <div className="px-4 pb-6">
        <div className="mb-4 flex gap-2">
          {DAY_OPTIONS.map((option) => {
            const active = option.key === day;
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => setDay(option.key)}
                className={`tiara-mobile-pill flex-1 px-4 py-3 text-sm font-semibold transition ${
                  active
                    ? "bg-[#0b8ef3] text-white shadow-[0_10px_24px_rgba(11,142,243,0.25)]"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="py-10 text-sm text-slate-500">読み込み中...</div>
        ) : error ? (
          <div className="py-10 text-sm text-rose-500">{error}</div>
        ) : items.length > 0 ? (
          <div className="space-y-3">
            {items.map((item) => (
              <AssignmentCard key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <div className="tiara-mobile-card border px-4 py-8 text-center text-sm text-slate-500">
            対象日の割当データがありません
          </div>
        )}
      </div>
    </MobileShell>
  );
}
