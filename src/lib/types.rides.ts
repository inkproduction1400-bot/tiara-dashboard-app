// src/lib/types.rides.ts

// 送迎ステータス
export type RideStatus = "pending" | "accepted" | "completed" | "canceled";

// 一覧取得パラメータ
export type ListRidesParams = {
  status?: RideStatus;
  pickup_city?: string;
  date?: string;
  from?: string;
  to?: string;
};

// API そのままのレスポンス型
export type RideListItemFromApi = {
  id: string;
  castId: string | null;
  shopId: string | null;
  requestDate: string;
  status: RideStatus;
  direction: "from_shop" | "to_shop";
  pickupCity: string | null;
  carNumber: string | null;
  boardingTime: string | null;
  arrivalTime: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  cast?: {
    displayName: string;
    managementNumber: string;
  } | null;
  shop?: {
    name: string;
  } | null;
};

// UI 用にフラットにした型（テーブルで使う）
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
  cast_name: string | null;
  cast_management_number: string | null;
  shop_name: string | null;
};

// PATCH /rides/:id 用のペイロード
export type UpdateRidePayload = {
  status?: RideStatus;
  note?: string | null;
  carNumber?: string | null;
  boardingTime?: string | null;
  arrivalTime?: string | null;
};
