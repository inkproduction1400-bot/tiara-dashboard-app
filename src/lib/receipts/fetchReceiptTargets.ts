import type { AssignmentRow } from "./types";
import { apiFetch } from "@/lib/api";

export async function fetchReceiptTargets(
  businessDate: string,
): Promise<AssignmentRow[]> {
  const qs = new URLSearchParams({ date: businessDate });
  return apiFetch<AssignmentRow[]>(
    `/dispatch-sheet/receipt-targets?${qs.toString()}`,
  );
}
