import type { ItineraryItem, SavedTravelEstimate } from "../types";
import {
  getItineraryTimeValue,
  normalizeItineraryTime,
  validateRequiredItineraryTimeRange,
} from "./itineraryTime.ts";
import {
  getPlaceKey,
  hasDistinctConfirmedPlaces,
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

export const materializeTimeAdjustmentEstimates = (
  result: TimeAdjustmentResult,
): ItineraryItem[] => {
  const items = result.items.map((item) => ({ ...item }));

  for (const segment of result.segments) {
    const origin = items[segment.originIndex];
    const destination = items[segment.destinationIndex];
    if (
      !origin ||
      !destination ||
      segment.originIndex >= segment.destinationIndex ||
      !origin.place ||
      !destination.place ||
      segment.estimate.originKey !== getPlaceKey(origin.place) ||
      segment.estimate.destinationKey !== getPlaceKey(destination.place) ||
      !Number.isFinite(segment.estimate.durationSeconds) ||
      segment.estimate.durationSeconds < 0
    ) {
      throw new Error("時間預覽的交通區段已失效，請重新建立預覽。");
    }

    // 本次預覽已使用的估算固定沿用；一般快取 TTL 到期不代表預覽估算失效。
    items[segment.originIndex] = {
      ...origin,
      travelModeToNext: segment.estimate.mode,
      travelToNext: segment.estimate,
    };
  }

  return items;
};

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
  const originalArrival = getItineraryTimeValue(sourceItems[targetIndex]?.time);
  const originalDeparture = getItineraryTimeValue(
    sourceItems[targetIndex]?.departureTime || sourceItems[targetIndex]?.time,
  );
  const travelNodeIndexesForTarget = getTravelNodeIndexes(sourceItems);
  const targetNodePosition = travelNodeIndexesForTarget.indexOf(targetIndex);
  const incomingOriginIndex = targetNodePosition > 0
    ? travelNodeIndexesForTarget[targetNodePosition - 1]
    : undefined;
  const incomingOrigin = incomingOriginIndex !== undefined
    ? result.items[incomingOriginIndex]
    : null;
  const incomingDeparture = incomingOrigin
    ? getItineraryTimeValue(incomingOrigin.departureTime || incomingOrigin.time)
    : null;
  const incomingSegment = incomingOriginIndex !== undefined
    ? result.segments.find(
        (segment) => segment.originIndex === incomingOriginIndex && segment.destinationIndex === targetIndex,
      )
    : undefined;
  const originalIncomingOriginDeparture = incomingOriginIndex !== undefined
    ? getItineraryTimeValue(
        sourceItems[incomingOriginIndex].departureTime || sourceItems[incomingOriginIndex].time,
      )
    : null;
  const originalReservedGap = originalIncomingOriginDeparture !== null && originalArrival !== null
    ? originalArrival - originalIncomingOriginDeparture
    : null;
  const earliestFeasibleArrival = incomingDeparture !== null
    ? incomingSegment
      ? incomingDeparture + incomingSegment.estimate.durationSeconds / 60
      : originalReservedGap !== null && originalReservedGap >= 0
        ? incomingDeparture + originalReservedGap
        : null
    : null;
  if (
    requestedArrival === null ||
    originalArrival === null ||
    originalDeparture === null ||
    (incomingOriginIndex !== undefined && originalArrival === null) ||
    (incomingOriginIndex !== undefined &&
      (earliestFeasibleArrival === null || requestedArrival < earliestFeasibleArrival))
  ) {
    return {
      ...result,
      blocker: {
        index: targetIndex,
        message: "到達時間不得早於上一站離開時間加上本區段交通時間。",
        focusTarget: "arrival",
      },
    };
  }

  // 每次手動調整都從批次開始時的原始複本重算，避免沿用前次預覽造成停留時間累積誤差。
  const items = sourceItems.map((item) => ({ ...item }));
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

  const allTravelNodeIndexes = getTravelNodeIndexes(sourceItems);
  const travelNodeIndexes = allTravelNodeIndexes.filter((index) => index > targetIndex);

  for (const destinationIndex of travelNodeIndexes) {
    const destinationPosition = allTravelNodeIndexes.indexOf(destinationIndex);
    const originIndex = destinationPosition > 0
      ? allTravelNodeIndexes[destinationPosition - 1]
      : undefined;
    if (originIndex === undefined || originIndex < targetIndex) continue;

    const origin = items[originIndex];
    const destination = items[destinationIndex];
    const originDeparture = getItineraryTimeValue(origin.departureTime || origin.time);
    const destinationOriginalArrival = getItineraryTimeValue(sourceItems[destinationIndex]?.time);
    const destinationOriginalDeparture = getItineraryTimeValue(
      sourceItems[destinationIndex]?.departureTime || sourceItems[destinationIndex]?.time,
    );
    const originalOriginDeparture = getItineraryTimeValue(
      sourceItems[originIndex].departureTime || sourceItems[originIndex].time,
    );
    if (
      originDeparture === null ||
      destinationOriginalArrival === null ||
      destinationOriginalDeparture === null ||
      originalOriginDeparture === null
    ) {
      return {
        ...result,
        blocker: {
          index: destinationIndex,
          message: "後續活動缺少有效的原始時間，無法完成預覽調整。",
          focusTarget: "arrival",
        },
      };
    }

    let arrivalMinutes: number;
    const segment = result.segments.find(
      (entry) => entry.originIndex === originIndex && entry.destinationIndex === destinationIndex,
    );
    if (segment) {
      arrivalMinutes = roundUpToHalfHour(
        originDeparture + segment.estimate.durationSeconds / 60,
      );
    } else {
      const reservedGapMinutes = destinationOriginalArrival - originalOriginDeparture;
      if (reservedGapMinutes < 0) {
        return {
          ...result,
          blocker: {
            index: destinationIndex,
            message: "原始站間時間不足，無法安全推斷後續時間。",
            focusTarget: "arrival",
          },
        };
      }
      arrivalMinutes = originDeparture + reservedGapMinutes;
    }
    const departureMinutes = arrivalMinutes + (destinationOriginalDeparture - destinationOriginalArrival);
    if (arrivalMinutes >= 24 * 60 || departureMinutes >= 24 * 60) {
      return {
        ...result,
        blocker: {
          index: destinationIndex,
          message: "調整後將跨越午夜，系統不會自動移動到隔日。",
          focusTarget: "arrival",
        },
      };
    }
    items[destinationIndex] = {
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
  requestedArrivalTime: string,
  requestedDepartureTime: string,
  resolveEstimate: TimeAdjustmentEstimateResolver,
): Promise<TimeAdjustmentResult> => {
  const items = sourceItems.map((item) => ({ ...item }));
  const timeRange = validateRequiredItineraryTimeRange(
    requestedArrivalTime,
    requestedDepartureTime,
  );
  if (startIndex < 0 || startIndex >= items.length) {
    return {
      items: sourceItems,
      segments: [],
      blocker: { index: startIndex, message: "請選擇有效的調整起點。", focusTarget: "arrival" },
    };
  }
  if (!timeRange.isValid) {
    const departureBeforeArrival = timeRange.departureError === "before-arrival";
    return {
      items: sourceItems,
      segments: [],
      blocker: {
        index: startIndex,
        message: departureBeforeArrival
          ? "新的離開時間不可早於新的到達時間。"
          : timeRange.arrivalError
            ? "請輸入有效的新到達時間。"
            : "請輸入有效的新離開時間。",
        focusTarget: departureBeforeArrival || timeRange.departureError ? "departure" : "arrival",
      },
    };
  }
  const arrivalTime = timeRange.arrivalTime;
  const departureTime = timeRange.departureTime;

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

  items[startIndex] = {
    ...items[startIndex],
    time: arrivalTime,
    departureTime,
  };
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

    const hasRoutePlaces = hasDistinctConfirmedPlaces(origin, destination);
    const originalOriginDeparture = getItineraryTimeValue(
      sourceItems[originIndex].departureTime || sourceItems[originIndex].time,
    );
    const originalDestinationArrival = getItineraryTimeValue(sourceItems[destinationIndex].time);
    if (originalOriginDeparture === null || originalDestinationArrival === null) {
      return {
        items: sourceItems,
        segments,
        blocker: {
          index: destinationIndex,
          message: `「${destination.title || "此站"}」缺少有效的原始站間時間，無法推斷新時間。`,
          focusTarget: "arrival",
        },
      };
    }

    let arrivalMinutes: number;
    if (!hasRoutePlaces) {
      // 無有效地點時不查路線，沿用批次開始快照的站間預留時間推斷。
      const reservedGapMinutes = originalDestinationArrival - originalOriginDeparture;
      if (reservedGapMinutes < 0) {
        return {
          items: sourceItems,
          segments,
          blocker: {
            index: destinationIndex,
            message: `「${destination.title || "此站"}」原始到達時間早於前站離開時間，無法安全推斷。`,
            focusTarget: "arrival",
          },
        };
      }
      arrivalMinutes = originDeparture + reservedGapMinutes;
    } else {
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
      arrivalMinutes = roundUpToHalfHour(originDeparture + estimate.durationSeconds / 60);
      segments.push({ originIndex, destinationIndex, estimate });
    }

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
  }

  return { items, segments, blocker: null };
};
