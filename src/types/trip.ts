import type { OtherInfoItem } from "./otherInfo";

// 1. 對應 list.json 的行程元資料型別
export interface TripMeta {
  id: string;
  title: string;
  departureDate: string; // 格式統一為 YYYY-MM-DD
  dayCount?: number;
  mode?: TripMode;
  detailPath?: string;
  participants: string[];
  participantEmailMap?: Record<string, string>;
  currencyConfig: {
    code: string;
    symbol: string;
  };
}

export interface TripEditorInput {
  title: string;
  departureDate: string;
  dayCount: number;
  showLunarDate: boolean;
  mode: TripMode;
  participants: string[];
  participantEmailMap: Record<string, string>;
  editorEmails: string[];
  currencyCode: string;
  currencySymbol: string;
}

export interface ConfirmedPlace {
  /** Google Maps 政策允許永久保存的穩定識別；顯示文案仍沿用使用者輸入。 */
  placeId: string;
}

export type TravelMode = "drive" | "walk" | "transit";

export type TransitVehicle =
  | "bus"
  | "rail"
  | "subway"
  | "tram"
  | "ferry"
  | "other";

export interface SavedTravelEstimate {
  mode: TravelMode;
  durationSeconds: number;
  distanceMeters: number;
  originKey: string;
  destinationKey: string;
  queriedAt: string;
  expiresAt: string;
  departureTimeBasis?: string;
  transitDaytimeFallback?: boolean;
  transitVehicle?: TransitVehicle;
}

export interface ItineraryCoverPhoto {
  source: "wikimedia-commons";
  storagePath: string;
  fileTitle: string;
  sourcePageUrl: string;
  creator: string;
  credit?: string;
  license: string;
  licenseUrl?: string;
  sourceSha1?: string;
  sourceRevisionAt?: string;
  selectedAt: string;
  modified: boolean;
  width: number;
  height: number;
  mime: "image/webp";
  size: number;
}

// 2. 對應詳細行程中的單一時間軸項目
export interface ItineraryItem {
  /** V3.8.0 起使用的穩定卡片識別；舊資料於下一次行程寫入時補齊。 */
  id?: string;
  /** 到達時間；舊資料沿用既有 time 欄位 */
  time: string;
  /** 離開時間；未輸入時儲存為到達時間 */
  departureTime?: string;
  title: string;
  type: string;
  typeColor: string;
  desc: string;
  location: string;
  /** 經管理者確認、可穩定供 Places／Routes 使用的地點。 */
  place?: ConfirmedPlace;
  /** 明確標記航班卡片；不依標題是否包含「機場」推測。 */
  travelKind?: "flight";
  /** 永久保留的交通方式偏好；Google 預估資料過期後仍用於維持區段。 */
  travelModeToNext?: TravelMode;
  /** 由本卡片前往下一張相鄰卡片的最後儲存交通結果。 */
  travelToNext?: SavedTravelEstimate;
  /** 管理者自 Wikimedia Commons 選定並保存至專案 Storage 的卡片照片。 */
  coverPhoto?: ItineraryCoverPhoto;
}

// 3. 對應詳細行程中的行前檢查清單項目
export interface ChecklistItem {
  id: string;
  category: string;
  label: string;
  updatedAt?: string;
}

export type TripMode = "guided" | "selfGuided";

// 4. 對應詳細行程中的自駕/客製化區塊
export interface CustomTabConfig {
  subtitle: string;
  mainText: string;
}

export type SidebarItemType =
  | "itinerary"
  | "checklist"
  | "privateChecklist"
  | "expense"
  | "exchangeRate"
  | "text"
  | "otherInfo";

export interface SidebarItemConfig {
  id: string;
  title: string;
  type: SidebarItemType;
}

// 5. 對應詳細行程（free-travel.json / group-tour.json）的完整內容架構
export interface TripDetail {
  id: string;
  title: string;
  departureDate: string;
  isPublic: boolean;
  sidebarConfig: SidebarItemConfig[];
  content: {
    mode?: TripMode;
    /** 未設定時沿用舊旅程行為：顯示農曆日期。 */
    showLunarDate?: boolean;
    days: number[];
    custom_tab_1: CustomTabConfig;
    checklistData: ChecklistItem[];
    participantEmailMap?: Record<string, string>;
    otherInfoItems?: OtherInfoItem[];
    daysData: {
      [dayNumber: string]: ItineraryItem[]; // 動態對應 "1", "2", "3" 等天數的行程陣列
    };
  };
}
