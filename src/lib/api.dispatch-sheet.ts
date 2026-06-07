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
  idDocumentRequirement?: string | null;
  addressLine: string | null;
  buildingName: string | null;
  fixedCastCount?: number;
  fixed_cast_count?: number;
  hasFixedCasts?: boolean;
  has_fixed_casts?: boolean;
  exclusiveCount?: number;
  exclusive_count?: number;
  hasExclusive?: boolean;
  has_exclusive?: boolean;
  nominatedCastCount?: number;
  nominated_cast_count?: number;
  hasNominatedCasts?: boolean;
  has_nominated_casts?: boolean;
  nominationCount?: number;
  nomination_count?: number;
  hasNomination?: boolean;
  has_nomination?: boolean;
  blockedCastIds?: string[];
};

export type DispatchSheetRow = {
  castId: string | null;
  managementNumber: string;
  castCode: string | null;
  displayName: string;
  ownerStaffName: string | null;
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
  isOrderSlot?: boolean;
  cancellationReason?: string | null;
  canceledAt?: string | null;
  attendanceRequestId?: string | null;
  attendanceRequestStatus?: AttendanceRequestStatus | null;
  manualAdded?: boolean;
};

export type DispatchSheetResponse = {
  date: string;
  rows: DispatchSheetRow[];
  shops: DispatchSheetShop[];
};

export type AttendanceRequestStatus =
  | "requested"
  | "ok"
  | "ng"
  | "added"
  | "canceled"
  | "removed";

export type AttendanceRequestItem = {
  id: string;
  castId: string;
  status: AttendanceRequestStatus;
  displayOrder: number | null;
  assignmentId: string | null;
  note: string | null;
  requestedAt: string | null;
  respondedAt: string | null;
  addedAt: string | null;
};

export type AttendanceRequestResponse = {
  date: string;
  items: AttendanceRequestItem[];
};

export type BulkAttendanceRequestResponse = AttendanceRequestResponse & {
  sentCount: number;
  skippedCount: number;
  failedCount: number;
  requestedCastIds: string[];
  skippedCastIds: string[];
};

export type UpsertDispatchSheetRowPayload = {
  date: string;
  castId: string;
  assignmentId?: string | null;
  orderId?: string | null;
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

export async function getAttendanceRequests(
  date?: string,
): Promise<AttendanceRequestResponse> {
  const qs = date ? `?date=${encodeURIComponent(date)}` : "";
  return apiFetch<AttendanceRequestResponse>(
    `/dispatch-sheet/attendance-requests${qs}`,
  );
}

export async function upsertAttendanceRequest(payload: {
  date: string;
  castId: string;
  status: AttendanceRequestStatus;
  displayOrder?: number | null;
  note?: string | null;
}): Promise<AttendanceRequestResponse> {
  return apiFetch<AttendanceRequestResponse>(
    "/dispatch-sheet/attendance-requests",
    {
      method: "PUT",
      body: JSON.stringify(payload),
    },
  );
}

export async function bulkAttendanceRequest(payload: {
  date: string;
  text: string;
  castIds: string[];
}): Promise<BulkAttendanceRequestResponse> {
  return apiFetch<BulkAttendanceRequestResponse>(
    "/dispatch-sheet/attendance-requests/bulk-request",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
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
  cancelType?: "cast" | "shop",
): Promise<{
  ok: boolean;
  assignmentId: string;
  status: "canceled";
  reason: string;
  cancelType?: "cast" | "shop";
}> {
  return apiFetch<{
    ok: boolean;
    assignmentId: string;
    status: "canceled";
    reason: string;
    cancelType?: "cast" | "shop";
  }>(
    `/dispatch-sheet/rows/${assignmentId}/cancel`,
    {
      method: "POST",
      body: JSON.stringify({ reason: reason ?? null, cancelType }),
    },
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
