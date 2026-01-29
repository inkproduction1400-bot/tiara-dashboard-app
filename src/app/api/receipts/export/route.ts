import { exportReceiptXlsm } from "@/lib/receipts/exportReceiptXlsm";
import type { ReceiptPayload } from "@/lib/receipts/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let payload: ReceiptPayload;
  try {
    payload = (await req.json()) as ReceiptPayload;
  } catch {
    return new Response("Invalid payload", { status: 400 });
  }

  if (!payload?.businessDate || !payload?.shopName) {
    return new Response("Missing required fields", { status: 400 });
  }

  const buffer = await exportReceiptXlsm(payload);
  const safeDate = payload.businessDate.replace(/[^0-9-]/g, "");
  const safeCastId = (payload.castId || "unknown").replace(/[^a-zA-Z0-9_-]/g, "");
  const safeShopId = (payload.shopId || "unknown").replace(/[^a-zA-Z0-9_-]/g, "");
  const filename = `receipt_${safeDate}_${safeCastId}_${safeShopId}.xlsm`;

  return new Response(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.ms-excel.sheet.macroEnabled.12",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
