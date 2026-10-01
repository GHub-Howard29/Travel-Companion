import type { ItineraryItem, SavedTravelEstimate } from "../types";
import {
  getItineraryTimeValue,
  normalizeItineraryTime,
} from "./itineraryTime.ts";
import {
  getPreferredTravelMode,
  getTravelModeLabel,
  getTravelNodeIndexes,
  isFlightConnection,
  isIncludedInTravelCalculation,
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

export const adjustTimePreviewArrival = (
  sourceItems: ItineraryItem[],
  result: TimeAdjustmentResult,
  targetIndex: number,
  requestedArrivalTime: string,
): TimeAdjustmentResult => {
  const requestedArrival = getItineraryTimeValue(normalizeItineraryTime(requestedArrivalTime));
  const suggestedArrival = getItineraryTimeValue(result.items[targetIndex]?.time);
  const originalArrival = getItineraryTimeValue(sourceItems[targetIndex]?.time);
  const originalDeparture = getItineraryTimeValue(
    sourceItems[targetIndex]?.departureTime || sourceItems[targetIndex]?.time,
  );
  if (
    requestedArrival === null ||
    suggestedArrival === null ||
    originalArrival === null ||
    originalDeparture === null ||
    requestedArrival < suggestedArrival
  ) {
    return {
      ...result,
      blocker: {
        index: targetIndex,
        message: "調整後的到達時間不得早於系統建議時間。",
        focusTarget: "arrival",
      },
    };
  }

  const items = result.items.map((item) => ({ ...item }));
  const stayMinutes = originalDeparture - originalArrival;
  const targetDeparture = requestedArrival + stayMinutes;
  if (targetDeparture >= 24 * 60) {
    return {
      ...result,
      blocker: {
        index: targetIndex,
        message: "調整後將跨越午夜，系統不會自動移動到隔日。",
        focusTarget: "arrival",
      },
    };
  }
  items[targetIndex] = {
    ...items[targetIndex],
    time: toClockTime(requestedArrival),
    departureTime: toClockTime(targetDeparture),
  };

  const downstreamSegments = result.segments
    .filter((segment) => segment.originIndex >= targetIndex)
    .sort((left, right) => left.originIndex - right.originIndex);

  for (const segment of downstreamSegments) {
    const origin = items[segment.originIndex];
    const destination = items[segment.destinationIndex];
    const originDeparture = getItineraryTimeValue(origin.departureTime || origin.time);
    const destinationOriginalArrival = getItineraryTimeValue(sourceItems[segment.destinationIndex]?.time);
    const destinationOriginalDeparture = getItineraryTimeValue(
      sourceItems[segment.destinationIndex]?.departureTime ||
        sourceItems[segment.destinationIndex]?.time,
    );
    if (
      originDeparture === null ||
      destinationOriginalArrival === null ||
      destinationOriginalDeparture === null
    ) {
      return {
        ...result,
        blocker: {
          index: segment.destinationIndex,
          message: "後續活動缺少有效時間，無法完成預覽調整。",
          focusTarget: "arrival",
        },
      };
    }

    const arrivalMinutes = roundUpToHalfHour(
      originDeparture + segment.estimate.durationSeconds / 60,
    );
    const departureMinutes =
      arrivalMinutes + (destinationOriginalDeparture - destinationOriginalArrival);
    if (arrivalMinutes >= 24 * 60 || departureMinutes >= 24 * 60) {
      return {
        ...result,
        blocker: {
          index: segment.destinationIndex,
          message: "調整後將跨越午夜，系統不會自動移動到隔日。",
          focusTarget: "arrival",
        },
      };
    }
    items[segment.destinationIndex] = {
      ...destination,
      time: toClockTime(arrivalMinutes),
      departureTime: toClockTime(departureMinutes),
    };
  }

  return { ...result, items, blocker: null };
};

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

  if (!isIncludedInTravelCalculation(items[startIndex])) {
    return {
      items: sourceItems,
      segments: [],
      blocker: {
        index: startIndex,
        message: "此活動未納入交通計算，請改從其他活動開始。",
        focusTarget: "route",
      },
    };
  }

  items[startIndex] = { ...items[startIndex], departureTime };
  const segments: TimeAdjustmentSegment[] = [];
  const travelNodeIndexes = getTravelNodeIndexes(items).filter((index) => index >= startIndex);
  const startNodePosition = travelNodeIndexes.indexOf(startIndex);

  for (let nodePosition = startNodePosition + 1; nodePosition < travelNodeIndexes.length; nodePosition += 1) {
    const originIndex = travelNodeIndexes[nodePosition - 1];
    const destinationIndex = travelNodeIndexes[nodePosition];
    const origin = items[originIndex];
    const destination = items[destinationIndex];
    const originDeparture = getItineraryTimeValue(origin.departureTime || origin.time);
    if (originDeparture === null) {
      return { items: sourceItems, segments, blocker: { index: originIndex, message: `「${origin.title || "此站"}」缺少有效的離開時間。`, focusTarget: "departure" } };
    }

    if (isFlightConnection(origin, destination)) {
      return {
        items: sourceItems,
        segments,
        blocker: {
          index: originIndex,
          message: `「${origin.title || "此站"}」已標示為航班，不會規劃到下一站的地面交通。`,
          focusTarget: "route",
        },
      };
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
