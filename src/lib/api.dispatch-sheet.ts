"use client";

import { apiFetch } from "./api";

export type DispatchSheetShop = {
  id: string;
  code: string | null;
  name: string;
  nameKana: string | null;
  genre: string | null;
  ownerStaff: string | null;
  wageLabel: string | null;
  addressLine: string | null;
  buildingName: string | null;
};

export type DispatchSheetRow = {
  castId: string;
  managementNumber: string;
  castCode: string | null;
  displayName: string;
  age: number | null;
  desiredHourly: number | null;
  assignmentId: string | null;
  shopId: string | null;
  shopName: string | null;
  shopNumber: string | null;
  isExclusiveInitial: boolean;
  startTime: string;
  endTime: string;
  castHourly: number | null;
  shopFee: number | null;
  note: string | null;
  displayOrder: number;
  status: "draft" | "confirmed" | "canceled";
  orderId: string | null;
  orderNo: number | null;
  cancellationReason?: string | null;
  canceledAt?: string | null;
};

export type DispatchSheetResponse = {
  date: string;
  rows: DispatchSheetRow[];
  shops: DispatchSheetShop[];
};

export type UpsertDispatchSheetRowPayload = {
  date: string;
  castId: string;
  assignmentId?: string | null;
  shopId: string;
  startTime: string;
  endTime?: string | null;
  castHourly?: number | null;
  shopFee?: number | null;
  note?: string | null;
  displayOrder?: number | null;
};

export async function getDispatchSheet(
  date?: string,
): Promise<DispatchSheetResponse> {
  const qs = date ? `?date=${encodeURIComponent(date)}` : "";
  return apiFetch<DispatchSheetResponse>(`/dispatch-sheet${qs}`);
}

export async function upsertDispatchSheetRow(
  payload: UpsertDispatchSheetRowPayload,
): Promise<DispatchSheetResponse> {
  return apiFetch<DispatchSheetResponse>("/dispatch-sheet/rows", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function confirmDispatchSheetRow(
  assignmentId: string,
): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(
    `/dispatch-sheet/rows/${assignmentId}/confirm`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export async function cancelDispatchSheetRow(
  assignmentId: string,
  reason?: string | null,
): Promise<{ ok: boolean; assignmentId: string; status: "canceled"; reason: string }> {
  return apiFetch<{ ok: boolean; assignmentId: string; status: "canceled"; reason: string }>(
    `/dispatch-sheet/rows/${assignmentId}/cancel`,
    { method: "POST", body: JSON.stringify({ reason: reason ?? null }) },
  );
}

export async function confirmDispatchSheet(payload: {
  date: string;
  assignmentIds?: string[];
}): Promise<{ ok: boolean; confirmedOrderCount: number }> {
  return apiFetch<{ ok: boolean; confirmedOrderCount: number }>(
    "/dispatch-sheet/confirm",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}
