import path from "path";
import { readFile } from "fs/promises";
import * as XLSX from "xlsx";
import type { ReceiptPayload } from "./types";

const TEMPLATE_PATH = path.join(
  process.cwd(),
  "public",
  "templates",
  "receipt_template.xlsm",
);
const TEMPLATE_SHEET = "領収書テンプレート";
const LIST_SHEET = "リスト";

const asNumber = (value: number | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const setCell = (
  sheet: XLSX.WorkSheet | undefined,
  cell: string,
  value: string | number | undefined,
) => {
  if (!sheet) return;
  if (value === undefined || value === null) {
    sheet[cell] = { t: "s", v: "" };
    return;
  }
  if (typeof value === "number") {
    sheet[cell] = { t: "n", v: value };
    return;
  }
  sheet[cell] = { t: "s", v: value };
};

const parseDateParts = (dateStr: string) => {
  const [y, m, d] = dateStr.split("-").map((part) => Number(part));
  return {
    year: Number.isFinite(y) ? y : undefined,
    month: Number.isFinite(m) ? m : undefined,
    day: Number.isFinite(d) ? d : undefined,
  };
};

export async function exportReceiptXlsm(payload: ReceiptPayload) {
  const templateBuffer = await readFile(TEMPLATE_PATH);
  const workbook = XLSX.read(templateBuffer, {
    type: "buffer",
    bookVBA: true,
  });

  const sheetName =
    workbook.Sheets[TEMPLATE_SHEET] !== undefined
      ? TEMPLATE_SHEET
      : workbook.SheetNames[0];
  const listSheetName =
    workbook.Sheets[LIST_SHEET] !== undefined
      ? LIST_SHEET
      : workbook.SheetNames.find((name) => name !== sheetName) || sheetName;

  const sheet = workbook.Sheets[sheetName];
  const listSheet = workbook.Sheets[listSheetName];

  setCell(sheet, "A3", payload.shopName ?? "");
  setCell(sheet, "T8", payload.shopAddress ?? "");
  setCell(sheet, "B12", asNumber(payload.hourly));
  setCell(sheet, "F12", asNumber(payload.daily));
  setCell(sheet, "O12", asNumber(payload.fee));
  setCell(sheet, "B14", payload.startTime ?? "");
  setCell(sheet, "D14", payload.endTime ?? "");

  const { year, month, day } = parseDateParts(payload.receiptDate);
  setCell(listSheet, "S2", year ?? "");
  setCell(listSheet, "X2", month ?? "");
  setCell(listSheet, "AA2", day ?? "");

  const output = XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsm",
    bookVBA: true,
  });

  return Buffer.from(output as Buffer);
}
