// src/lib/api.daily-reports.ts
"use client";

import { apiFetch } from "./api";

export type DailyReportPayload = {
  date: string;
  dispatchCount?: number | null;
  dispatchPeople?: number | null;
  feeSubtotal?: number | null;
  advisorFee?: number | null;
  totalAmount?: number | null;
  startAmount?: number | null;
  uncollectedFee?: number | null;
  collectedFee?: number | null;
  referralFee?: number | null;
  cashDiff?: number | null;
  expenseTotal?: number | null;
  calcTotal?: number | null;
  cashBalance?: number | null;
  difference?: number | null;
  expenseItems?: any;
  uncollectedItems?: any;
  collectedItems?: any;
  referralItems?: any;
  salesReport?: any;
  registrations?: any;
  memo?: string | null;
};

export type DailyReportRecord = DailyReportPayload & {
  id: string;
  createdAt?: string;
  updatedAt?: string;
};

export async function getDailyReport(date: string) {
  return apiFetch<DailyReportRecord | null>(
    `/daily-reports?date=${encodeURIComponent(date)}`,
  );
}

export async function saveDailyReport(payload: DailyReportPayload) {
  return apiFetch<DailyReportRecord>("/daily-reports", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
