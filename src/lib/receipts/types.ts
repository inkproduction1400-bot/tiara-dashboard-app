export type AssignmentRow = {
  businessDate: string; // YYYY-MM-DD
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

export type ReceiptStatus = "none" | "issued" | "uncollected";

export type ReceiptStatusEntry = {
  status: ReceiptStatus;
  row?: AssignmentRow;
  payload?: ReceiptPayload;
  updatedAt: string;
};
