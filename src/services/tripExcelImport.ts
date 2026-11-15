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

export interface TripExcelCellDiagnostic {
  worksheet: string;
  address: string;
  field: string;
  cellType: number;
  valueType: string;
  valueSummary: string;
  hyperlinkTextType: string;
  hyperlinkTextSummary: string;
  hyperlinkUrlType: string;
  hyperlinkUrlSummary: string;
  cellTextType: string;
  cellTextSummary: string;
}

export type TripExcelParseResult =
  | { success: true; data: ParsedTripExcel }
  | {
    success: false;
    issues: TripExcelValidationIssue[];
    diagnostics: TripExcelCellDiagnostic[];
  };

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

const summarizeCellValue = (value: ExcelJS.CellValue): string => {
  if (value === null || value === undefined) return String(value);
  if (value instanceof Date) return "Date";
  if (typeof value === "string") {
    const text = value.length > 80 ? `${value.slice(0, 77)}...` : value;
    return JSON.stringify(text);
  }
  if (typeof value !== "object") return String(value);
  if ("richText" in value && Array.isArray(value.richText)) {
    return `{ richText: ${value.richText.length} run(s) }`;
  }
  if ("formula" in value) return "{ formula: <present> }";
  if ("hyperlink" in value) return "{ hyperlink: <present>, text: <see cell.text> }";
  if ("text" in value) return "{ text: <present> }";
  if ("result" in value) return `{ result: ${typeof value.result} }`;
  return `{ object keys: ${Object.keys(value).slice(0, 8).join(", ")} }`;
};

const summarizeDiagnosticPart = (value: unknown): string => {
  if (value === null || value === undefined) return String(value);
  if (typeof value === "string") {
    return JSON.stringify(value.length > 80 ? `${value.slice(0, 77)}...` : value);
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `Array(${value.length})`;
  if (typeof value === "object") return `Object(${Object.keys(value).slice(0, 8).join(", ")})`;
  return typeof value;
};

const getCellDiagnostic = (
  cell: ExcelJS.Cell,
  worksheet: string,
  field: string,
): TripExcelCellDiagnostic => {
  const rawValue: unknown = cell.value;
  const hyperlinkText = rawValue && typeof rawValue === "object" && "text" in rawValue
    ? rawValue.text
    : undefined;
  const hyperlinkUrl = rawValue && typeof rawValue === "object" && "hyperlink" in rawValue
    ? rawValue.hyperlink
    : undefined;
  const cellText: unknown = cell.text;
  return {
    worksheet,
    address: cell.address,
    field,
    cellType: cell.type,
    valueType: rawValue === null ? "object" : typeof rawValue,
    valueSummary: summarizeCellValue(cell.value),
    hyperlinkTextType: hyperlinkText === null ? "object" : typeof hyperlinkText,
    hyperlinkTextSummary: summarizeDiagnosticPart(hyperlinkText),
    hyperlinkUrlType: hyperlinkUrl === null ? "object" : typeof hyperlinkUrl,
    hyperlinkUrlSummary: summarizeDiagnosticPart(hyperlinkUrl),
    cellTextType: cellText === null ? "object" : typeof cellText,
    cellTextSummary: summarizeDiagnosticPart(cellText),
  };
};

const readCellText = (value: unknown): string | null => {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return null;

  if ("richText" in value && Array.isArray(value.richText)) {
    const text = value.richText
      .map((part) => (part && typeof part.text === "string" ? part.text : ""))
      .join("");
    return text || null;
  }
  return null;
};

const cellValue = (value: ExcelJS.CellValue): unknown => {
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (!value || typeof value !== "object") return value;

  if ("hyperlink" in value && "text" in value) {
    return readCellText(value.text);
  }
  if ("richText" in value && Array.isArray(value.richText)) {
    return readCellText(value);
  }
  if ("text" in value) {
    return readCellText(value.text);
  }
  if ("result" in value) {
    return cellValue(value.result as ExcelJS.CellValue);
  }
  return null;
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
  let digits: string;
  if (typeof value === "string" && /^\d{4}$/.test(value)) {
    digits = value;
  } else if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 2359) {
    digits = String(value).padStart(4, "0");
  } else {
    return null;
  }

  const hour = Number(digits.slice(0, 2));
  const minute = Number(digits.slice(2));
  if (hour > 23 || minute > 59) return null;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
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
      diagnostics: [],
    };
  }

  const issues: TripExcelValidationIssue[] = [];
  const diagnostics: TripExcelCellDiagnostic[] = [];
  const actualNames = workbook.worksheets.map((sheet) => sheet.name);
  if (
    actualNames.length !== REQUIRED_SHEET_NAMES.length ||
    REQUIRED_SHEET_NAMES.some((name, index) => actualNames[index] !== name)
  ) {
    addIssue(issues, 1, "工作表", "工作表必須依序且僅包含「新增 TRIP」及「系統設定」。");
    return { success: false, issues, diagnostics: [] };
  }

  const sheet = workbook.getWorksheet(WORKSHEET_NAME);
  const metadata = workbook.getWorksheet(METADATA_SHEET_NAME);
  if (!sheet || !metadata) {
    addIssue(issues, 1, "工作表", "缺少必要工作表。");
    return { success: false, issues, diagnostics: [] };
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

  const tripTitleCell = sheet.getCell("B2");
  const title = readText(cellValue(tripTitleCell.value));
  if (!title) {
    addIssue(issues, 2, "TRIP 名稱", "必填，且必須為文字。");
    diagnostics.push(getCellDiagnostic(tripTitleCell, WORKSHEET_NAME, "TRIP 名稱"));
  }

  const departureDateCell = sheet.getCell("B3");
  const departureDate = formatDate(cellValue(departureDateCell.value));
  if (!departureDate) {
    addIssue(issues, 3, "出發日期", "必須是有效日期，格式為 YYYY-MM-DD。");
    diagnostics.push(getCellDiagnostic(departureDateCell, WORKSHEET_NAME, "出發日期"));
  }

  const cards: ParsedTripExcelCard[] = [];
  for (let row = 7; row <= MAX_CARD_ROW; row += 1) {
    const rowCells = Array.from({ length: 6 }, (_, column) =>
      sheet.getCell(row, column + 1),
    );
    const values = rowCells.map((cell) => cellValue(cell.value));
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
    if (!cardTitle) {
      addIssue(issues, row, "行程名稱", "必填，且必須為文字。");
      diagnostics.push(getCellDiagnostic(rowCells[3], WORKSHEET_NAME, "行程名稱"));
    }
    if (!category || !TRIP_EXCEL_CATEGORY_OPTIONS.includes(category as TripExcelCategory)) {
      addIssue(issues, row, "類別", "必須是交通、住宿、景點、餐飲、自駕、其他其中一項。");
      diagnostics.push(getCellDiagnostic(rowCells[4], WORKSHEET_NAME, "類別"));
    }
    if (!isBlank(descriptionValue) && typeof descriptionValue !== "string") {
      addIssue(issues, row, "描述", "描述必須為文字或空白。");
      diagnostics.push(getCellDiagnostic(rowCells[5], WORKSHEET_NAME, "描述"));
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
  if (issues.length > 0) {
    const diagnosticKeys = new Set(
      diagnostics.map((diagnostic) => `${diagnostic.worksheet}!${diagnostic.address}`),
    );
    issues.forEach((issue) => {
      if (issue.worksheet !== WORKSHEET_NAME || issue.row < 1 || !issue.field) return;
      const columnByField: Record<string, number> = {
        "第幾天": 1,
        "開始時間": 2,
        "結束時間": 3,
        "行程名稱": 4,
        "類別": 5,
        "描述": 6,
        "TRIP 名稱": 2,
        "出發日期": 2,
      };
      const column = columnByField[issue.field];
      if (!column) return;
      const cell = sheet.getCell(issue.field === "TRIP 名稱" ? "B2" :
        issue.field === "出發日期" ? "B3" : issue.row, column);
      const key = `${issue.worksheet}!${cell.address}`;
      if (diagnosticKeys.has(key)) return;
      diagnostics.push(getCellDiagnostic(cell, issue.worksheet, issue.field));
      diagnosticKeys.add(key);
    });
    return { success: false, issues, diagnostics };
  }
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

  return { success: false, issues, diagnostics };
};
