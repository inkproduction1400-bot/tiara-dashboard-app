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
