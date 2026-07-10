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
  currencyConfig: {
    code: string;
    symbol: string;
  };
}

export interface TripEditorInput {
  title: string;
  departureDate: string;
  dayCount: number;
  mode: TripMode;
  participants: string[];
  editorEmails: string[];
  currencyCode: string;
  currencySymbol: string;
}

// 2. 對應詳細行程中的單一時間軸項目
export interface ItineraryItem {
  time: string;
  title: string;
  type: string;
  typeColor: string;
  desc: string;
  location: string;
}

// 3. 對應詳細行程中的行前檢查清單項目
export interface ChecklistItem {
  id: string;
  category: string;
  label: string;
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
    days: number[];
    custom_tab_1: CustomTabConfig;
    checklistData: ChecklistItem[];
    otherInfoItems?: OtherInfoItem[];
    daysData: {
      [dayNumber: string]: ItineraryItem[]; // 動態對應 "1", "2", "3" 等天數的行程陣列
    };
  };
}
