import ExcelJS from "exceljs";
import type { ItineraryItem } from "../types";

export const TRIP_EXCEL_TEMPLATE_VERSION = "1";
export const TRIP_EXCEL_CATEGORY_OPTIONS = [
  "交通",
  "住宿",
  "景點",
  "餐飲",
  "自駕",
  "其他",
] as const;

export type TripExcelCategory = (typeof TRIP_EXCEL_CATEGORY_OPTIONS)[number];

export interface ParsedTripExcelCard {
  day: number;
  item: ItineraryItem;
}

export interface ParsedTripExcel {
  templateVersion: typeof TRIP_EXCEL_TEMPLATE_VERSION;
  title: string;
  departureDate: string;
  dayCount: number;
  days: number[];
  cards: ParsedTripExcelCard[];
  daysData: Record<string, ItineraryItem[]>;
  cardCount: number;
}

export interface TripExcelValidationIssue {
  worksheet: string;
  row: number;
  field: string;
  message: string;
}

export type TripExcelParseResult =
  | { success: true; data: ParsedTripExcel }
  | { success: false; issues: TripExcelValidationIssue[] };

const WORKSHEET_NAME = "新增 TRIP";
const METADATA_SHEET_NAME = "系統設定";
const CARD_HEADERS = ["第幾天", "開始時間", "結束時間", "行程名稱", "類別", "描述"];
const REQUIRED_SHEET_NAMES = [WORKSHEET_NAME, METADATA_SHEET_NAME];
const CATEGORY_COLORS: Record<TripExcelCategory, string> = {
  交通: "bg-emerald-50 text-emerald-700 border-emerald-200",
  住宿: "bg-amber-50 text-amber-700 border-amber-200",
  景點: "bg-purple-50 text-purple-700 border-purple-200",
  餐飲: "bg-blue-50 text-blue-700 border-blue-200",
  自駕: "bg-orange-50 text-orange-700 border-orange-200",
  其他: "bg-slate-50 text-slate-700 border-slate-200",
};
const MAX_CARD_ROW = 1006;

const addIssue = (
  issues: TripExcelValidationIssue[],
  row: number,
  field: string,
  message: string,
  worksheet = WORKSHEET_NAME,
) => issues.push({ worksheet, row, field, message });

const cellValue = (value: ExcelJS.CellValue): unknown => {
  if (value instanceof Date) return value;
  if (value && typeof value === "object" && "text" in value) {
    return String(value.text);
  }
  if (value && typeof value === "object" && "richText" in value) {
    return value.richText.map((part) => part.text).join("");
  }
  return value;
};

const readText = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  return value.trim();
};

const formatDate = (value: unknown): string | null => {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null;
  return value;
};

const parseStrictTime = (value: unknown): string | null => {
  if (typeof value !== "string" || !/^\d{4}$/.test(value)) return null;
  const hour = Number(value.slice(0, 2));
  const minute = Number(value.slice(2));
  if (hour > 23 || minute > 59) return null;
  return `${value.slice(0, 2)}:${value.slice(2)}`;
};

const isBlank = (value: unknown): boolean =>
  value === null || value === undefined || value === "";

export const parseTripExcelWorkbook = async (
  input: ArrayBuffer | Uint8Array,
): Promise<TripExcelParseResult> => {
  const workbook = new ExcelJS.Workbook();
  try {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    const arrayBuffer = bytes.slice().buffer as ArrayBuffer;
    await workbook.xlsx.load(arrayBuffer);
  } catch {
    return {
      success: false,
      issues: [{
        worksheet: WORKSHEET_NAME,
        row: 1,
        field: "工作簿",
        message: "無法讀取 Excel 檔案，請使用標準 .xlsx 範本。",
      }],
    };
  }

  const issues: TripExcelValidationIssue[] = [];
  const actualNames = workbook.worksheets.map((sheet) => sheet.name);
  if (
    actualNames.length !== REQUIRED_SHEET_NAMES.length ||
    REQUIRED_SHEET_NAMES.some((name, index) => actualNames[index] !== name)
  ) {
    addIssue(issues, 1, "工作表", "工作表必須依序且僅包含「新增 TRIP」及「系統設定」。");
    return { success: false, issues };
  }

  const sheet = workbook.getWorksheet(WORKSHEET_NAME);
  const metadata = workbook.getWorksheet(METADATA_SHEET_NAME);
  if (!sheet || !metadata) {
    addIssue(issues, 1, "工作表", "缺少必要工作表。");
    return { success: false, issues };
  }

  if (metadata.state !== "hidden") {
    addIssue(issues, 1, "工作表狀態", "「系統設定」工作表必須保持隱藏。", METADATA_SHEET_NAME);
  }
  if (cellValue(metadata.getCell("A1").value) !== "Travel-Companion Template Metadata") {
    addIssue(issues, 1, "A1", "系統識別標題不符。", METADATA_SHEET_NAME);
  }
  if (cellValue(metadata.getCell("A2").value) !== "template_version") {
    addIssue(issues, 2, "A2", "版本鍵名不符。", METADATA_SHEET_NAME);
  }
  if (
    typeof cellValue(metadata.getCell("B2").value) !== "string" ||
    cellValue(metadata.getCell("B2").value) !== TRIP_EXCEL_TEMPLATE_VERSION
  ) {
    addIssue(issues, 2, "B2", "範本版本缺漏或不支援，請使用 V1 標準範本。", METADATA_SHEET_NAME);
  }
  if (["hidden", "veryHidden"].includes(sheet.state)) {
    addIssue(issues, 1, "工作表狀態", "「新增 TRIP」工作表必須可見。");
  }

  if (cellValue(sheet.getCell("A1").value) !== "TRIP 基本資料") {
    addIssue(issues, 1, "A1", "固定區塊標題不符。");
  }
  const fixedLabels: Array<[string, string, number]> = [
    ["A2", "TRIP 名稱", 2],
    ["A3", "出發日期", 3],
  ];
  for (const [address, expected, row] of fixedLabels) {
    if (cellValue(sheet.getCell(address).value) !== expected) {
      addIssue(issues, row, address, `固定標籤必須為「${expected}」。`);
    }
  }
  CARD_HEADERS.forEach((header, index) => {
    if (cellValue(sheet.getCell(6, index + 1).value) !== header) {
      addIssue(issues, 6, String.fromCharCode(65 + index), `固定欄位標題必須為「${header}」。`);
    }
  });

  if (
    Array.from({ length: 6 }, (_, index) => sheet.getColumn(index + 9).hidden)
      .some((hidden) => !hidden)
  ) {
    addIssue(issues, 1, "I:N", "類別輔助欄 I:N 必須保持隱藏。");
  }

  const title = readText(cellValue(sheet.getCell("B2").value));
  if (!title) addIssue(issues, 2, "TRIP 名稱", "必填，且必須為文字。");

  const departureDate = formatDate(cellValue(sheet.getCell("B3").value));
  if (!departureDate) addIssue(issues, 3, "出發日期", "必須是有效日期，格式為 YYYY-MM-DD。");

  const cards: ParsedTripExcelCard[] = [];
  for (let row = 7; row <= MAX_CARD_ROW; row += 1) {
    const values = Array.from({ length: 6 }, (_, column) =>
      cellValue(sheet.getCell(row, column + 1).value),
    );
    if (values.every(isBlank)) continue;

    const [dayValue, startValue, endValue, titleValue, categoryValue, descriptionValue] = values;
    const cardTitle = readText(titleValue);
    const category = readText(categoryValue);
    const day = typeof dayValue === "number" && Number.isInteger(dayValue)
      ? dayValue
      : typeof dayValue === "string" && /^\d+$/.test(dayValue)
        ? Number(dayValue)
        : NaN;
    if (!Number.isInteger(day) || day < 1 || day > 30) {
      addIssue(issues, row, "第幾天", "必須為 1–30 的正整數。");
    }
    const startTime = parseStrictTime(startValue);
    if (!startTime) addIssue(issues, row, "開始時間", "必須使用有效四位數 HHMM，例如 0930。");

    const endIsBlank = isBlank(endValue);
    const endTime = endIsBlank ? startTime : parseStrictTime(endValue);
    if (!endIsBlank && !endTime) {
      addIssue(issues, row, "結束時間", "必須留白或使用有效四位數 HHMM。");
    }
    if (startTime && endTime && endTime < startTime) {
      addIssue(issues, row, "結束時間", "不得早於開始時間；V1 不支援跨午夜。");
    }
    if (!cardTitle) addIssue(issues, row, "行程名稱", "必填，且必須為文字。");
    if (!category || !TRIP_EXCEL_CATEGORY_OPTIONS.includes(category as TripExcelCategory)) {
      addIssue(issues, row, "類別", "必須是交通、住宿、景點、餐飲、自駕、其他其中一項。");
    }
    if (!isBlank(descriptionValue) && typeof descriptionValue !== "string") {
      addIssue(issues, row, "描述", "描述必須為文字或空白。");
    }

    if (
      Number.isInteger(day) && day >= 1 && day <= 30 &&
      startTime && endTime && cardTitle &&
      category && TRIP_EXCEL_CATEGORY_OPTIONS.includes(category as TripExcelCategory) &&
      (isBlank(descriptionValue) || typeof descriptionValue === "string")
    ) {
      const normalizedCategory = category as TripExcelCategory;
      cards.push({
        day,
        item: {
          id: crypto.randomUUID(),
          time: startTime,
          departureTime: endTime,
          title: cardTitle,
          type: normalizedCategory,
          typeColor: CATEGORY_COLORS[normalizedCategory],
          desc: typeof descriptionValue === "string" ? descriptionValue.trim() : "",
          location: "",
        },
      });
    }
  }

  if (cards.length === 0) {
    addIssue(issues, 7, "行程卡片", "至少需要一筆完整有效的行程卡片。");
  }
  const dayCount = cards.reduce((maximum, card) => Math.max(maximum, card.day), 0);
  if (title && departureDate && issues.length === 0) {
    const days = Array.from({ length: dayCount }, (_, index) => index + 1);
    const daysData = Object.fromEntries(days.map((day) => [String(day), [] as ItineraryItem[]]));
    cards.forEach(({ day, item }) => daysData[String(day)].push(item));

    return {
      success: true,
      data: {
        templateVersion: TRIP_EXCEL_TEMPLATE_VERSION,
        title,
        departureDate,
        dayCount,
        days,
        cards,
        daysData,
        cardCount: cards.length,
      },
    };
  }

  return { success: false, issues };
};
