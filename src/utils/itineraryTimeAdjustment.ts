import type { ItineraryItem, SavedTravelEstimate } from "../types";
import {
  getItineraryTimeValue,
  normalizeItineraryTime,
} from "./itineraryTime.ts";
import {
  getPreferredTravelMode,
  getTravelModeLabel,
} from "./itineraryTravel.ts";

export interface TimeAdjustmentSegment {
  originIndex: number;
  destinationIndex: number;
  estimate: SavedTravelEstimate;
}

export interface TimeAdjustmentBlocker {
  index: number;
  message: string;
  focusTarget: "departure" | "arrival" | "route";
}

export interface TimeAdjustmentResult {
  items: ItineraryItem[];
  segments: TimeAdjustmentSegment[];
  blocker: TimeAdjustmentBlocker | null;
}

export type TimeAdjustmentEstimateResolver = (
  originIndex: number,
  origin: ItineraryItem,
  destination: ItineraryItem,
) => Promise<SavedTravelEstimate | null>;

const toClockTime = (minutes: number): string => {
  const normalized = Math.round(minutes);
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
};

const roundUpToHalfHour = (minutes: number): number => Math.ceil(minutes / 30) * 30;

/**
 * 依序重算同一天後續活動。此函式只在記憶體中建立結果；呼叫端必須在
 * 使用者確認後才儲存 result.items，因此可安全地用於預覽。
 */
export const calculateTimeAdjustment = async (
  sourceItems: ItineraryItem[],
  startIndex: number,
  requestedDepartureTime: string,
  resolveEstimate: TimeAdjustmentEstimateResolver,
): Promise<TimeAdjustmentResult> => {
  const items = sourceItems.map((item) => ({ ...item }));
  const departureTime = normalizeItineraryTime(requestedDepartureTime);
  const departureMinutes = getItineraryTimeValue(departureTime);
  if (startIndex < 0 || startIndex >= items.length || departureMinutes === null) {
    return {
      items: sourceItems,
      segments: [],
      blocker: { index: startIndex, message: "請輸入有效的新離開時間。", focusTarget: "departure" },
    };
  }

  items[startIndex] = { ...items[startIndex], departureTime };
  const segments: TimeAdjustmentSegment[] = [];

  for (let destinationIndex = startIndex + 1; destinationIndex < items.length; destinationIndex += 1) {
    const originIndex = destinationIndex - 1;
    const origin = items[originIndex];
    const destination = items[destinationIndex];
    const originDeparture = getItineraryTimeValue(origin.departureTime || origin.time);
    if (originDeparture === null) {
      return { items: sourceItems, segments, blocker: { index: originIndex, message: `「${origin.title || "此站"}」缺少有效的離開時間。`, focusTarget: "departure" } };
    }

    const originalArrival = getItineraryTimeValue(destination.time);
    if (originalArrival === null) {
      return { items: sourceItems, segments, blocker: { index: destinationIndex, message: `「${destination.title || "此站"}」缺少有效的到達時間，無法保留停留時間。`, focusTarget: "arrival" } };
    }
    const originalDeparture = getItineraryTimeValue(destination.departureTime || destination.time);
    if (originalDeparture === null || originalDeparture < originalArrival) {
      return { items: sourceItems, segments, blocker: { index: destinationIndex, message: `「${destination.title || "此站"}」缺少有效的離開時間，無法保留停留時間。`, focusTarget: "departure" } };
    }

    const estimate = await resolveEstimate(originIndex, origin, destination);
    if (!estimate || !Number.isFinite(estimate.durationSeconds) || estimate.durationSeconds < 0) {
      return {
        items: sourceItems,
        segments,
        blocker: {
          index: originIndex,
          message: `${getTravelModeLabel(getPreferredTravelMode(origin))}路線資料待更新，無法繼續計算。`,
          focusTarget: "route",
        },
      };
    }

    const arrivalMinutes = roundUpToHalfHour(originDeparture + estimate.durationSeconds / 60);
    const nextDepartureMinutes = arrivalMinutes + (originalDeparture - originalArrival);
    if (arrivalMinutes >= 24 * 60 || nextDepartureMinutes >= 24 * 60) {
      return {
        items: sourceItems,
        segments,
        blocker: { index: destinationIndex, message: "調整後將跨越午夜，系統不會自動移動到隔日。", focusTarget: "arrival" },
      };
    }

    items[destinationIndex] = {
      ...destination,
      time: toClockTime(arrivalMinutes),
      departureTime: toClockTime(nextDepartureMinutes),
    };
    segments.push({ originIndex, destinationIndex, estimate });
  }

  return { items, segments, blocker: null };
};
