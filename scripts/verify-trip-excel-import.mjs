import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import { parseTripExcelWorkbook } from "../src/services/tripExcelImport.ts";

const templatePath = "docs/templates/AI新增TRIP標準範本_V1.xlsx";
const template = await readFile(templatePath);

const createWorkbook = async () => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(template);

  // The checked-in template may contain preserved sample data for manual
  // preview testing. Keep that source workbook intact and clear only this
  // in-memory fixture before each parser test.
  const inputSheet = workbook.getWorksheet("新增 TRIP");
  assert.ok(inputSheet);
  inputSheet.getCell("B2").value = null;
  inputSheet.getCell("B3").value = null;
  for (let row = 7; row <= 1006; row += 1) {
    for (let column = 1; column <= 6; column += 1) {
      inputSheet.getCell(row, column).value = null;
    }
  }

  return workbook;
};

const validWorkbook = await createWorkbook();
const inputSheet = validWorkbook.getWorksheet("新增 TRIP");
assert.ok(inputSheet);
inputSheet.getCell("B2").value = "北海道自駕";
inputSheet.getCell("B3").value = "2027-07-01";
inputSheet.getCell("A7").value = 1;
inputSheet.getCell("B7").value = "0930";
inputSheet.getCell("D7").value = "新千歲機場取車";
inputSheet.getCell("E7").value = "自駕";
inputSheet.getCell("F7").value = "抵達後辦理取車";
inputSheet.getCell("A8").value = 3;
inputSheet.getCell("B8").value = "0900";
inputSheet.getCell("C8").value = "1030";
inputSheet.getCell("D8").value = "美瑛青池";
inputSheet.getCell("E8").value = "景點";
const validBuffer = await validWorkbook.xlsx.writeBuffer();
const validResult = await parseTripExcelWorkbook(new Uint8Array(validBuffer));

assert.equal(validResult.success, true);
if (validResult.success) {
  assert.equal(validResult.data.title, "北海道自駕");
  assert.equal(validResult.data.departureDate, "2027-07-01");
  assert.equal(validResult.data.dayCount, 3);
  assert.deepEqual(validResult.data.days, [1, 2, 3]);
  assert.equal(validResult.data.cardCount, 2);
  assert.equal(validResult.data.daysData["1"][0].time, "09:30");
  assert.equal(validResult.data.daysData["1"][0].departureTime, "09:30");
  assert.equal(validResult.data.daysData["2"].length, 0);
  assert.equal(validResult.data.daysData["3"][0].type, "景點");
  assert.equal(validResult.data.daysData["3"][0].location, "");
}

const invalidWorkbook = await createWorkbook();
const invalidSheet = invalidWorkbook.getWorksheet("新增 TRIP");
assert.ok(invalidSheet);
invalidSheet.getCell("A6").value = "錯誤標題";
const invalidBuffer = await invalidWorkbook.xlsx.writeBuffer();
const invalidResult = await parseTripExcelWorkbook(new Uint8Array(invalidBuffer));

assert.equal(invalidResult.success, false);
if (!invalidResult.success) {
  assert.ok(invalidResult.issues.some((issue) => issue.row === 6 && issue.field === "A"));
}

const malformedResult = await parseTripExcelWorkbook(new Uint8Array([1, 2, 3]));
assert.equal(malformedResult.success, false);

const objectCellWorkbook = await createWorkbook();
const objectCellSheet = objectCellWorkbook.getWorksheet("新增 TRIP");
assert.ok(objectCellSheet);
objectCellSheet.getCell("B2").value = "物件儲存格值拒絕測試";
objectCellSheet.getCell("B3").value = "2027-07-01";
objectCellSheet.getCell("A7").value = 1;
objectCellSheet.getCell("B7").value = "0900";
objectCellSheet.getCell("C7").value = "1000";
objectCellSheet.getCell("D7").value = { formula: '"不是行程名稱"' };
objectCellSheet.getCell("E7").value = "景點";
const objectCellBuffer = await objectCellWorkbook.xlsx.writeBuffer();
const objectCellResult = await parseTripExcelWorkbook(new Uint8Array(objectCellBuffer));
assert.equal(objectCellResult.success, false);
if (!objectCellResult.success) {
  assert.ok(objectCellResult.issues.some((issue) => issue.field === "行程名稱"));
  const titleDiagnostic = objectCellResult.diagnostics.find(
    (diagnostic) => diagnostic.address === "D7",
  );
  assert.ok(titleDiagnostic);
  assert.equal(titleDiagnostic.worksheet, "新增 TRIP");
  assert.equal(titleDiagnostic.field, "行程名稱");
  assert.equal(titleDiagnostic.cellType, objectCellSheet.getCell("D7").type);
  assert.equal(titleDiagnostic.valueType, "object");
  assert.match(titleDiagnostic.valueSummary, /formula/);
  assert.equal(titleDiagnostic.hyperlinkTextType, "undefined");
  assert.equal(titleDiagnostic.hyperlinkTextSummary, "undefined");
  assert.equal(titleDiagnostic.hyperlinkUrlType, "undefined");
  assert.equal(titleDiagnostic.hyperlinkUrlSummary, "undefined");
  assert.equal(titleDiagnostic.cellTextType, "string");
  assert.equal(titleDiagnostic.cellTextSummary, '""');
}

const hyperlinkWorkbook = await createWorkbook();
const hyperlinkSheet = hyperlinkWorkbook.getWorksheet("新增 TRIP");
assert.ok(hyperlinkSheet);
hyperlinkSheet.getCell("B2").value = "超連結文字診斷測試";
hyperlinkSheet.getCell("B3").value = "2027-07-01";
hyperlinkSheet.getCell("A7").value = 1;
hyperlinkSheet.getCell("B7").value = "0900";
hyperlinkSheet.getCell("C7").value = "1000";
hyperlinkSheet.getCell("D7").value = {
  text: {
    richText: [
      { text: "松山城入口", font: { bold: true } },
      { text: "/搭纜車", font: { underline: true } },
    ],
  },
  hyperlink: "https://maps.app.goo.gl/xBDVatMsasGrHc5j7",
};
hyperlinkSheet.getCell("E7").value = "景點";
const hyperlinkBuffer = await hyperlinkWorkbook.xlsx.writeBuffer();
const hyperlinkResult = await parseTripExcelWorkbook(new Uint8Array(hyperlinkBuffer));
assert.equal(hyperlinkResult.success, true);
if (hyperlinkResult.success) {
  assert.equal(hyperlinkResult.data.daysData["1"][0].title, "松山城入口/搭纜車");
}

const richTextWorkbook = await createWorkbook();
const richTextSheet = richTextWorkbook.getWorksheet("新增 TRIP");
assert.ok(richTextSheet);
richTextSheet.getCell("B2").value = "Rich Text 行程名稱測試";
richTextSheet.getCell("B3").value = "2027-07-01";
richTextSheet.getCell("A7").value = 4;
richTextSheet.getCell("B7").value = "0900";
richTextSheet.getCell("C7").value = 1000;
richTextSheet.getCell("D7").value = {
  richText: [{ text: "松山城入口/搭纜車", font: { underline: true } }],
};
richTextSheet.getCell("E7").value = "景點";
const richTextBuffer = await richTextWorkbook.xlsx.writeBuffer();
const richTextResult = await parseTripExcelWorkbook(new Uint8Array(richTextBuffer));
assert.equal(richTextResult.success, true);
if (richTextResult.success) {
  assert.equal(richTextResult.data.daysData["4"][0].title, "松山城入口/搭纜車");
}

const invalidTimeWorkbook = await createWorkbook();
const invalidTimeSheet = invalidTimeWorkbook.getWorksheet("新增 TRIP");
assert.ok(invalidTimeSheet);
invalidTimeSheet.getCell("B2").value = "時間格式測試";
invalidTimeSheet.getCell("B3").value = "2027-07-01";
invalidTimeSheet.getCell("A7").value = 1;
invalidTimeSheet.getCell("B7").value = "930";
invalidTimeSheet.getCell("D7").value = "測試卡片";
invalidTimeSheet.getCell("E7").value = "景點";
const invalidTimeBuffer = await invalidTimeWorkbook.xlsx.writeBuffer();
const invalidTimeResult = await parseTripExcelWorkbook(new Uint8Array(invalidTimeBuffer));
assert.equal(invalidTimeResult.success, false);
if (!invalidTimeResult.success) {
  assert.ok(invalidTimeResult.issues.some((issue) => issue.field === "開始時間"));
}

const numericTimeWorkbook = await createWorkbook();
const numericTimeSheet = numericTimeWorkbook.getWorksheet("新增 TRIP");
assert.ok(numericTimeSheet);
numericTimeSheet.getCell("B2").value = "數值時間格式測試";
numericTimeSheet.getCell("B3").value = "2027-07-01";
numericTimeSheet.getCell("A7").value = 1;
numericTimeSheet.getCell("B7").value = 930;
numericTimeSheet.getCell("C7").value = 1200;
numericTimeSheet.getCell("D7").value = "數值時間卡片";
numericTimeSheet.getCell("E7").value = "景點";
numericTimeSheet.getCell("A8").value = 1;
numericTimeSheet.getCell("B8").value = 900;
numericTimeSheet.getCell("C8").value = null;
numericTimeSheet.getCell("D8").value = "前導零與空白結束時間";
numericTimeSheet.getCell("E8").value = "交通";
const numericTimeBuffer = await numericTimeWorkbook.xlsx.writeBuffer();
const numericTimeResult = await parseTripExcelWorkbook(new Uint8Array(numericTimeBuffer));
assert.equal(numericTimeResult.success, true);
if (numericTimeResult.success) {
  assert.equal(numericTimeResult.data.daysData["1"][0].time, "09:30");
  assert.equal(numericTimeResult.data.daysData["1"][0].departureTime, "12:00");
  assert.equal(numericTimeResult.data.daysData["1"][1].time, "09:00");
  assert.equal(numericTimeResult.data.daysData["1"][1].departureTime, "09:00");
}

const invalidNumericTimeWorkbook = await createWorkbook();
const invalidNumericTimeSheet = invalidNumericTimeWorkbook.getWorksheet("新增 TRIP");
assert.ok(invalidNumericTimeSheet);
invalidNumericTimeSheet.getCell("B2").value = "無效數值時間測試";
invalidNumericTimeSheet.getCell("B3").value = "2027-07-01";
invalidNumericTimeSheet.getCell("A7").value = 1;
invalidNumericTimeSheet.getCell("B7").value = "0900";
invalidNumericTimeSheet.getCell("C7").value = 2460;
invalidNumericTimeSheet.getCell("D7").value = "無效結束時間";
invalidNumericTimeSheet.getCell("E7").value = "景點";
const invalidNumericTimeBuffer = await invalidNumericTimeWorkbook.xlsx.writeBuffer();
const invalidNumericTimeResult = await parseTripExcelWorkbook(new Uint8Array(invalidNumericTimeBuffer));
assert.equal(invalidNumericTimeResult.success, false);
if (!invalidNumericTimeResult.success) {
  assert.ok(invalidNumericTimeResult.issues.some((issue) => issue.field === "結束時間"));
}

const invalidMetadataWorkbook = await createWorkbook();
const metadataSheet = invalidMetadataWorkbook.getWorksheet("系統設定");
assert.ok(metadataSheet);
metadataSheet.state = "visible";
const invalidMetadataBuffer = await invalidMetadataWorkbook.xlsx.writeBuffer();
const invalidMetadataResult = await parseTripExcelWorkbook(new Uint8Array(invalidMetadataBuffer));
assert.equal(invalidMetadataResult.success, false);
if (!invalidMetadataResult.success) {
  assert.ok(invalidMetadataResult.issues.some((issue) => issue.field === "工作表狀態"));
}

console.log("Trip Excel parser verification passed: valid preview, blank-day retention, strict headers, time and metadata rejection, malformed file.");
