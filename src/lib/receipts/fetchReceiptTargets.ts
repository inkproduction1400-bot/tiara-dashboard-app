import type { AssignmentRow, ReceiptStatus } from "./types";
import { apiFetch } from "@/lib/api";

export async function fetchReceiptTargets(
  businessDate: string,
  options?: { includeOpen?: boolean },
): Promise<AssignmentRow[]> {
  const qs = new URLSearchParams({ date: businessDate });
  if (options?.includeOpen) qs.set("includeOpen", "true");
  return apiFetch<AssignmentRow[]>(
    `/dispatch-sheet/receipt-targets?${qs.toString()}`,
  );
}

export async function updateReceiptStatus(
  assignmentId: string,
  status: Extract<ReceiptStatus, "uncollected" | "collected">,
) {
  return apiFetch<{ assignmentId: string; status: ReceiptStatus }>(
    `/dispatch-sheet/rows/${assignmentId}/receipt-status`,
    {
      method: "PUT",
      body: JSON.stringify({ status }),
    },
  );
}

export async function updateReceiptFee(
  assignmentId: string,
  fee: number | null,
) {
  return apiFetch<{
    assignmentId: string;
    fee: number | null;
    previousFee: number | null;
  }>(`/dispatch-sheet/rows/${assignmentId}/receipt-fee`, {
    method: "PUT",
    body: JSON.stringify({ fee }),
  });
}

export async function updateReceiptDetails(
  assignmentId: string,
  payload: {
    rideRequested?: boolean | null;
    rideDestination?: string | null;
    startTime?: string | null;
    daily?: number | null;
    actualTime?: string | null;
  },
) {
  return apiFetch<{
    assignmentId: string;
    rideRequested?: boolean | null;
    rideDestination?: string | null;
    startTime?: string | null;
    daily?: number | null;
    actualTime?: string | null;
  }>(`/dispatch-sheet/rows/${assignmentId}/receipt-details`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function recordReceiptIssued(
  assignmentId: string,
  payload: {
    receiptDate: string;
    fee?: number | null;
    hourly?: number | null;
    daily?: number | null;
    actualTime?: string | null;
    startTime?: string | null;
    endTime?: string | null;
    rideRequested?: boolean | null;
    rideDestination?: string | null;
  },
) {
  return apiFetch<{
    assignmentId: string;
    receiptIssuedFee: number | null;
    receiptPrintedAt: string | null;
  }>(`/dispatch-sheet/rows/${assignmentId}/receipt-issued`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
