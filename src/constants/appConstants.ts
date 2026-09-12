/**
 * =====================================
 * Travel Companion
 * 檔案：appConstants.ts
 * 功能：集中管理專案常數
 * =====================================
 */

// 支援手動切換的常用幣別選單配置
export const SUPPORTED_CURRENCIES = [
  { code: 'TWD', symbol: 'NT$', name: '新台幣' },
  { code: 'JPY', symbol: '¥', name: '日圓' },
  { code: 'KRW', symbol: '₩', name: '韓元' },
  { code: 'USD', symbol: '$', name: '美金' },
  { code: 'EUR', symbol: '€', name: '歐元' },
];

// Supabase Storage Bucket 名稱
export const ATTACHMENT_BUCKET = 'expense-attachments';
export const ITINERARY_COVER_BUCKET = 'itinerary-covers';
export const MAX_ITINERARY_COVER_BYTES = 120 * 1024;
export const MAX_ITINERARY_COVER_EDGE = 640;

// 私有附件簽名網址僅供當次開啟或匯出使用，15 分鐘後失效。
export const ATTACHMENT_SIGNED_URL_EXPIRES_IN_SECONDS = 15 * 60;

// IndexedDB 資料庫名稱
export const ATTACHMENT_DB_NAME = 'travel-companion-attachments';

// IndexedDB Object Store 名稱
export const ATTACHMENT_STORE_NAME = 'expense-attachments';

// 單張照片最大容量（1MB）
export const MAX_ATTACHMENT_BYTES = 1024 * 1024;

// 壓縮後照片最長邊限制
export const MAX_ATTACHMENT_EDGE = 1800;
export const PROTECTED_SEED_TRIP_IDS = [
  "free-travel-2026-01",
  "group-tour-2026-10",
] as const;

export const isProtectedSeedTripId = (tripId: string): boolean =>
  (PROTECTED_SEED_TRIP_IDS as readonly string[]).includes(tripId);
