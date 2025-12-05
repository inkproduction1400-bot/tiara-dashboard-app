// src/lib/types.rides.ts

// 送迎ステータス
export type RideStatus = "pending" | "accepted" | "completed" | "canceled";

// 一覧取得用クエリパラメータ
export type ListRidesParams = {
  status?: RideStatus;
  pickup_city?: string;
  date?: string; // YYYY-MM-DD
  from?: string; // ISO文字列などそのまま渡す
  to?: string;   // ISO文字列などそのまま渡す
};

// Dashboard で使う 1 行分
export type RideListItem = {
  id: string;
  request_date: string;
  status: RideStatus;
  pickup_city: string | null;
  note: string | null;
  car_number: string | null;
  boarding_time: string | null;
  arrival_time: string | null;
  created_at: string;

  // 画面で欲しいフラットな項目
  cast_name: string | null;
  cast_management_number: string | null;
  shop_name: string | null;
};

// PATCH /rides/:id のペイロード
export type UpdateRidePayload = {
  car_number?: string | null;
  boarding_time?: string | null;
  arrival_time?: string | null;
  note?: string | null;
  status?: RideStatus;
};
