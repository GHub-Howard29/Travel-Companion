import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import { parseTripExcelWorkbook } from "../src/services/tripExcelImport.ts";

const templatePath = "docs/templates/AI新增TRIP標準範本_V1.xlsx";
const template = await readFile(templatePath);

const createWorkbook = async () => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(template);
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
