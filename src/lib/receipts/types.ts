export type AssignmentRow = {
  assignmentId?: string;
  businessDate: string; // YYYY-MM-DD
  castId: string;
  castName: string;
  castManagementNumber?: string;
  castCode?: string;
  shopId: string;
  shopName: string;
  shopNameKana?: string;
  shopAddress?: string;
  startTime?: string;
  endTime?: string;
  hourly?: number;
  daily?: number;
  fee?: number;
  receiptStatus?: ReceiptStatus;
  assignmentStatus?: "confirmed" | "canceled";
  cancellationReason?: string | null;
  canceledAt?: string | null;
  rideRequested?: boolean;
  rideDestination?: string | null;
};

export type ReceiptPayload = {
  businessDate: string; // YYYY-MM-DD
  receiptDate: string; // YYYY-MM-DD
  castId: string;
  castName: string;
  shopId: string;
  shopName: string;
  shopAddress?: string;
  startTime?: string;
  endTime?: string;
  hourly?: number;
  daily?: number;
  fee?: number;
};

export type ReceiptStatus = "none" | "issued" | "uncollected" | "collected";

export type ReceiptStatusEntry = {
  status: ReceiptStatus;
  row?: AssignmentRow;
  payload?: ReceiptPayload;
  updatedAt: string;
};
