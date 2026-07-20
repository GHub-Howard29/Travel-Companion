import type { SidebarItemConfig, SidebarItemType, TripMode } from "../types";

export const PRIVATE_CHECKLIST_SCREEN_ID = "privateChecklist";

export const PRIVATE_CHECKLIST_SIDEBAR_ITEM: SidebarItemConfig = {
  id: PRIVATE_CHECKLIST_SCREEN_ID,
  title: "私人確認清單",
  type: "privateChecklist",
};

const LEGACY_SPECIAL_INFO_SCREEN_IDS = new Set([
  "trip_special_info",
  "leader_info",
  "custom_info",
]);

const GUIDED_SPECIAL_INFO_FOLDER_ID = "special-info-guided";
const SELF_GUIDED_SPECIAL_INFO_FOLDER_ID = "special-info-self-guided";

const hasSelfGuidedTitle = (item: SidebarItemConfig | undefined): boolean =>
  item?.title.includes("自駕") === true || item?.title.includes("租車") === true;

export const expandSidebarItemsWithPrivateChecklist = (
  items: SidebarItemConfig[] | undefined,
  userEmail: string | null,
): SidebarItemConfig[] | undefined => {
  if (!items) return undefined;

  return items.flatMap((item) => {
    if (item.type !== "checklist" || !userEmail) {
      return [item];
    }

    return [item, PRIVATE_CHECKLIST_SIDEBAR_ITEM];
  });
};

export const isAuthRequiredTravelTool = (
  type: SidebarItemType | undefined,
): boolean => type === "expense" || type === "privateChecklist";

export const isSpecialInfoSidebarItem = (
  item: SidebarItemConfig | undefined,
): boolean => {
  if (!item) return false;

  return (
    LEGACY_SPECIAL_INFO_SCREEN_IDS.has(item.id) ||
    (item.type === "text" &&
      (item.title.includes("領隊") ||
        item.title.includes("導遊") ||
        item.title.includes("自駕") ||
        item.title.includes("租車")))
  );
};

export const shouldUseSpecialInfoIcon = (item: SidebarItemConfig): boolean =>
  item.id === "trip_special_info" || item.type === "text";

export const isSelfGuidedSpecialInfoIcon = (
  item: SidebarItemConfig,
  tripMode: TripMode | undefined,
): boolean =>
  tripMode === "selfGuided" || (!tripMode && hasSelfGuidedTitle(item));

export const resolveTravelToolType = (
  screenId: string,
  sidebarItem: SidebarItemConfig | undefined,
): SidebarItemType | undefined => {
  if (screenId === PRIVATE_CHECKLIST_SCREEN_ID) return "privateChecklist";

  return isSpecialInfoSidebarItem(sidebarItem)
    ? "otherInfo"
    : sidebarItem?.type;
};

export const getSpecialInfoFolderId = (
  item: SidebarItemConfig | undefined,
  tripMode: TripMode | undefined,
): string =>
  tripMode === "selfGuided" || hasSelfGuidedTitle(item)
    ? SELF_GUIDED_SPECIAL_INFO_FOLDER_ID
    : GUIDED_SPECIAL_INFO_FOLDER_ID;

export const getTravelToolHeaderBgClassName = (
  type: SidebarItemType | undefined,
): string => {
  switch (type) {
    case "checklist":
    case "privateChecklist":
      return "bg-rose-700";
    case "expense":
      return "bg-amber-600";
    case "exchangeRate":
      return "bg-sky-700";
    case "text":
    case "otherInfo":
      return "bg-stone-700";
    default:
      return "bg-emerald-700";
  }
};
