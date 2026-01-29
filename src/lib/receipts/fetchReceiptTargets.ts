import type { AssignmentRow } from "./types";

export async function fetchReceiptTargets(
  businessDate: string,
): Promise<AssignmentRow[]> {
  // TODO: Replace with confirmed assignment list API
  return [
    {
      businessDate,
      castId: "K773",
      castName: "テスト1000",
      shopId: "S001",
      shopName: "テストバー",
      shopAddress: "福岡県福岡市中央区1-2-3",
      startTime: "20:00",
      endTime: "01:00",
      hourly: 2500,
      daily: 15000,
      fee: 5000,
    },
    {
      businessDate,
      castId: "A128",
      castName: "田中 花子",
      shopId: "S014",
      shopName: "クラブ ティアラ",
      shopAddress: "福岡県福岡市博多区4-5-6",
      startTime: "21:00",
      endTime: "00:30",
      hourly: 2800,
      daily: 0,
      fee: 6000,
    },
  ];
}
