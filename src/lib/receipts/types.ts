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
  daily?: number | null;
  actualTime?: string | null;
  fee?: number;
  receiptIssuedFee?: number | null;
  receiptPrintedAt?: string | null;
  receiptRevisionStatus?: "unissued" | "issued" | "needs_reissue" | string | null;
  receiptStatus?: ReceiptStatus;
  assignmentStatus?: "confirmed" | "canceled";
  cancellationReason?: string | null;
  cancelType?: "cast" | "shop" | string | null;
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
  actualTime?: string;
  fee?: number;
};

export type ReceiptStatus = "none" | "issued" | "uncollected" | "collected";

export type ReceiptStatusEntry = {
  status: ReceiptStatus;
  row?: AssignmentRow;
  payload?: ReceiptPayload;
  updatedAt: string;
};
