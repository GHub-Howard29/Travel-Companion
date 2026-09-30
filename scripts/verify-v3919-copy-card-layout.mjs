import assert from "node:assert/strict";
import fs from "node:fs";

const itinerary = fs.readFileSync("src/components/ItineraryPage.tsx", "utf8");
const login = fs.readFileSync("src/components/LoginSafetyModal.tsx", "utf8");
const install = fs.readFileSync("src/components/InstallAppPrompt.tsx", "utf8");
const checklist = fs.readFileSync("src/components/ChecklistPage.tsx", "utf8");
const privateChecklist = fs.readFileSync("src/components/PrivateChecklistPage.tsx", "utf8");
const otherInfo = fs.readFileSync("src/components/OtherInfoPage.tsx", "utf8");
const tripEditor = fs.readFileSync("src/components/TripEditorModal.tsx", "utf8");
const aliasModal = fs.readFileSync("src/components/PersonalExpenseAliasModal.tsx", "utf8");
const expense = fs.readFileSync("src/components/expense/ExpenseScreen.tsx", "utf8");
const exchange = fs.readFileSync("src/components/ExchangeRatePage.tsx", "utf8");
const crop = fs.readFileSync("src/components/CoverPhotoCropEditor.tsx", "utf8");
const update = fs.readFileSync("src/components/UpdatePrompt.tsx", "utf8");

assert.match(itinerary, /D\{activeDay\}/);
assert.match(itinerary, /replace\("\-", "\/"\)|replace\("-", "\/"\)/);
assert.match(itinerary, /replace\(\/\^星期\//);
assert.match(itinerary, /text-slate-400/);
assert.match(itinerary, /line-clamp-3/);
assert.match(itinerary, /aria-expanded=\{isExpanded\}/);
assert.match(itinerary, />\s*\{isExpanded \? "收合" : "展開"\}\s*</);
assert.match(itinerary, /新增依到達時間排序；編輯時間不改卡片順序。/);
assert.match(itinerary, /選擇起點，預覽後續時間/);
assert.match(itinerary, /照片來源 ↗/);
assert.match(itinerary, /查看地圖/);
assert.match(itinerary, /先選照片，確認後才會儲存。/);
assert.doesNotMatch(itinerary, /float-left mb-2 mr-3 w-\[76px\]/);
assert.match(itinerary, /請勿上傳侵權圖片/);

assert.match(login, /使用 Google 登入/);
assert.match(login, /登入資訊與權限/);
assert.match(login, /只使用 Google Email 辨識帳號與行程權限。/);
assert.match(login, /不會讀取 Gmail、Drive、通訊錄或相簿。/);
assert.match(login, /iOS 登入遇到問題？/);
assert.match(login, /aria-expanded=\{showIosHelp\}/);
assert.match(login, /驗證後若無法返回 App，請選「其他驗證方式」。需要 YouTube／Google App 確認時，改用 Safari 網頁版登入。/);

assert.match(install, /安裝到主畫面，快速查看行程與記帳。/);
assert.match(checklist, /離線，變更暫存本機/);
assert.match(checklist, /同步失敗，已保留本機變更/);
assert.match(checklist, /若要複製舊清單，請先不要新增項目。/);
assert.match(privateChecklist, /離線，變更暫存本機/);
assert.match(privateChecklist, /同步失敗，已保留本機變更/);
assert.match(privateChecklist, /若要複製舊清單，請先不要新增項目。/);

assert.match(exchange, /用實際換匯紀錄估算新臺幣花費。/);
assert.match(exchange, /輸入金額即可比較兩種估算。/);
assert.match(aliasModal, /代號只存在此裝置，用於個人帳本的付款人名稱。/);

assert.match(otherInfo, /訂位代碼、私人電話或受限連結請選「敏感資料」。/);
assert.match(otherInfo, /僅行程管理者可查看/);
assert.match(otherInfo, /一般公開網路連結可視為非敏感/);
assert.match(tripEditor, /每行一人，例如 Howard=howard@example.com。此處只設定記帳名稱，不授予編輯權。/);
assert.match(tripEditor, /可編輯者 Google Email/);

assert.match(expense, /個人帳本僅存此裝置。換裝置或清除資料前，請先匯出備份。/);
assert.match(expense, /照片會壓縮後上傳；建議使用 Wi-Fi。/);
assert.match(expense, /有離線新增的照片，請先連線讓帳目自動同步後，再按同步照片。/);

assert.match(crop, /拖曳調整位置；使用縮放控制。/);
assert.match(crop, /縮放範圍為 100%～250%/);
assert.match(update, /更新會重新載入 App；請先儲存目前編輯內容。/);
assert.match(update, /已儲存的旅程、清單、記帳與附件不會被清除。/);

console.log("V3.9.19 文案、每日行程卡片排版與安全資訊契約驗證通過。");
