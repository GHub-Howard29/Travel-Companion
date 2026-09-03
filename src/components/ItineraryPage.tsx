import { Fragment, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  Check,
  ExternalLink,
  Loader2,
  MapPin,
  Search,
  Settings2,
  TriangleAlert,
  X,
} from "lucide-react";

import type { ItineraryItem, SavedTravelEstimate, TravelMode, TripDetail } from "../types";
import { handlePlaceBrowse, handleRouteBrowse } from "../utils/navigationUtils";
import { focusAndRevealControl, releaseFocusedControl } from "../utils/viewportUtils";
import { trimRichText } from "../utils/richText";
import {
  getItineraryTimeValue,
  isDepartureBeforeArrival,
  sortItineraryItemsByTime,
  validateItineraryTime,
} from "../utils/itineraryTime";
import {
  formatTravelDistance,
  formatTravelDuration,
  getAdjacentTravelOriginIndexesNeedingEstimate,
  getPlaceKey,
  getPreferredTravelMode,
  getSavedTravelEstimate,
  getTravelTimeWarning,
  hasDistinctConfirmedPlaces,
  isConfirmedPlace,
  isFlightConnection,
} from "../utils/itineraryTravel";
import {
  getConfirmedPlace,
  getRouteEstimate,
  searchPlaceCandidates,
  type PlaceCandidate,
} from "../services/travelRouteService";
import { RichTextColorEditor } from "./RichTextColorEditor";
import { RichTextDisplay } from "./RichTextDisplay";
import { MaterialTravelModeIcon } from "./MaterialTravelModeIcon";

interface ItineraryPageProps {
  supabase: SupabaseClient;
  trip: TripDetail;
  activeDay: number;
  hasEditPermission: boolean;
  isOnline: boolean;
  onActiveDayChange: (day: number) => void;
  onSaveTripDetail: (trip: TripDetail) => Promise<void>;
  onManageModeChange?: (isManaging: boolean) => void;
}

const ITINERARY_TYPE_OPTIONS = [
  { type: "交通", typeColor: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { type: "住宿", typeColor: "bg-amber-50 text-amber-700 border-amber-200" },
  { type: "景點", typeColor: "bg-purple-50 text-purple-700 border-purple-200" },
  { type: "餐飲", typeColor: "bg-blue-50 text-blue-700 border-blue-200" },
  { type: "自駕", typeColor: "bg-orange-50 text-orange-700 border-orange-200" },
  { type: "其他", typeColor: "bg-slate-50 text-slate-700 border-slate-200" },
];

const createEmptyItineraryDraft = (): ItineraryItem => ({
  time: "",
  departureTime: "",
  title: "",
  type: "景點",
  typeColor: "bg-purple-50 text-purple-700 border-purple-200",
  desc: "",
  location: "",
});

export const ItineraryPage = ({
  supabase,
  trip,
  activeDay,
  hasEditPermission,
  isOnline,
  onActiveDayChange,
  onSaveTripDetail,
  onManageModeChange,
}: ItineraryPageProps) => {
  const [isManageMode, setIsManageMode] = useState(false);

  useEffect(() => {
    onManageModeChange?.(isManageMode);
    return () => onManageModeChange?.(false);
  }, [isManageMode, onManageModeChange]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<ItineraryItem>(createEmptyItineraryDraft);
  const [timeErrors, setTimeErrors] = useState<{
    arrival?: string;
    departure?: string;
  }>({});
  const [isPlaceSearchOpen, setIsPlaceSearchOpen] = useState(false);
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeCandidates, setPlaceCandidates] = useState<PlaceCandidate[]>([]);
  const [isPlaceSearching, setIsPlaceSearching] = useState(false);
  const [placeSearchError, setPlaceSearchError] = useState<string | null>(null);
  const [isPlaceDecisionPending, setIsPlaceDecisionPending] = useState(false);
  const [activeTravelSegment, setActiveTravelSegment] = useState<{
    originIndex: number;
    destinationIndex: number;
    origin: ItineraryItem;
    destination: ItineraryItem;
  } | null>(null);
  const [selectedTravelMode, setSelectedTravelMode] = useState<TravelMode>("drive");
  const [previewEstimate, setPreviewEstimate] = useState<SavedTravelEstimate | null>(null);
  const [isRouteLoading, setIsRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [isItemSaving, setIsItemSaving] = useState(false);
  const [itemSaveError, setItemSaveError] = useState<string | null>(null);
  const [autoRouteError, setAutoRouteError] = useState<string | null>(null);
  const editingCardRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (editingIndex === null) return;

    let layoutFrameId = 0;
    const renderFrameId = requestAnimationFrame(() => {
      layoutFrameId = requestAnimationFrame(() => {
        const editingCard = editingCardRef.current;
        if (!editingCard) return;

        const viewportOffset = window.visualViewport?.offsetTop ?? 0;
        const cardTop = window.scrollY + editingCard.getBoundingClientRect().top;
        window.scrollTo({
          top: Math.max(0, cardTop - viewportOffset - 8),
          behavior: "auto",
        });
      });
    });

    return () => {
      cancelAnimationFrame(renderFrameId);
      cancelAnimationFrame(layoutFrameId);
    };
  }, [editingIndex]);

  const currentDayEvents = trip.content.daysData[String(activeDay)] || [];
  const sortedDayEvents = currentDayEvents
    .map((event, originalIndex) => ({ event, originalIndex }))
    .sort((left, right) => {
      const leftTime = getItineraryTimeValue(left.event.time);
      const rightTime = getItineraryTimeValue(right.event.time);
      if (leftTime === null && rightTime === null) return left.originalIndex - right.originalIndex;
      if (leftTime === null) return 1;
      if (rightTime === null) return -1;
      return leftTime - rightTime || left.originalIndex - right.originalIndex;
    });

  const resetForm = () => {
    releaseFocusedControl();
    setIsFormOpen(false);
    setEditingIndex(null);
    setDraft(createEmptyItineraryDraft());
    setTimeErrors({});
    setIsPlaceSearchOpen(false);
    setPlaceCandidates([]);
    setPlaceSearchError(null);
    setIsPlaceDecisionPending(false);
    setItemSaveError(null);
  };

  const closeManageMode = () => {
    releaseFocusedControl();
    setIsManageMode(false);
    resetForm();
  };

  const updateDraft = (patch: Partial<ItineraryItem>) => {
    setDraft((currentDraft) => ({
      ...currentDraft,
      ...patch,
    }));
  };

  const updateArrivalTime = (value: string) => {
    updateDraft({ time: value });
    setTimeErrors((current) => ({ ...current, arrival: undefined }));
  };

  const updateDepartureTime = (value: string) => {
    updateDraft({ departureTime: value });
    setTimeErrors((current) => ({ ...current, departure: undefined }));
  };

  const handleDayChange = (day: number) => {
    if (activeDay !== day) {
      closeManageMode();
    }
    onActiveDayChange(day);
  };

  const handleTypeChange = (type: string) => {
    const selectedType =
      ITINERARY_TYPE_OPTIONS.find((option) => option.type === type) ??
      ITINERARY_TYPE_OPTIONS[ITINERARY_TYPE_OPTIONS.length - 1];

    updateDraft({
      type: selectedType.type,
      typeColor: selectedType.typeColor,
    });
  };

  const startCreateItem = () => {
    releaseFocusedControl();
    setEditingIndex(null);
    setDraft(createEmptyItineraryDraft());
    setTimeErrors({});
    setIsFormOpen(true);
    setIsPlaceSearchOpen(false);
    setIsPlaceDecisionPending(false);
    setItemSaveError(null);
  };

  const startEditItem = (event: ItineraryItem, index: number) => {
    releaseFocusedControl();
    setEditingIndex(index);
    setDraft(event);
    setTimeErrors({});
    setIsFormOpen(true);
    setIsPlaceSearchOpen(false);
    setIsPlaceDecisionPending(false);
    setItemSaveError(null);
  };

  const toggleManageMode = () => {
    if (isManageMode) {
      closeManageMode();
      return;
    }

    setIsManageMode(true);
  };

  const canManageItinerary = hasEditPermission && isOnline;

  const openPlaceSearch = () => {
    const query = draft.location.trim();
    setPlaceQuery(query);
    setPlaceCandidates([]);
    setPlaceSearchError(null);
    setIsPlaceSearchOpen(true);
    setIsPlaceDecisionPending(Boolean(query));
    void searchPlaces(query);
  };

  const searchPlaces = async (queryValue = placeQuery) => {
    const query = queryValue.trim();
    if (query.length < 2) {
      setPlaceSearchError("請輸入至少 2 個字的地點名稱。");
      return;
    }

    setIsPlaceSearching(true);
    setPlaceSearchError(null);
    try {
      const candidates = await searchPlaceCandidates(
        supabase,
        trip.id,
        query,
      );
      setPlaceCandidates(candidates);
      if (candidates.length === 0) setPlaceSearchError("找不到相符地點，請調整關鍵字。");
    } catch (error) {
      setPlaceSearchError(error instanceof Error ? error.message : "地點搜尋暫時無法使用。");
    } finally {
      setIsPlaceSearching(false);
    }
  };

  const confirmPlaceCandidate = async (candidate: PlaceCandidate) => {
    setIsPlaceSearching(true);
    setPlaceSearchError(null);
    try {
      const place = getConfirmedPlace(candidate);
      updateDraft({
        location: draft.location.trim() || placeQuery.trim(),
        place,
        travelToNext: undefined,
      });
      setIsPlaceDecisionPending(false);
      setIsPlaceSearchOpen(false);
      setPlaceCandidates([]);
    } catch (error) {
      setPlaceSearchError(error instanceof Error ? error.message : "無法確認所選地點。");
    } finally {
      setIsPlaceSearching(false);
    }
  };

  const openTravelPanel = (
    origin: ItineraryItem,
    destination: ItineraryItem,
    originIndex: number,
    destinationIndex: number,
  ) => {
    const savedEstimate = getSavedTravelEstimate(origin, destination);
    setActiveTravelSegment({ origin, destination, originIndex, destinationIndex });
    setSelectedTravelMode(getPreferredTravelMode(origin));
    setPreviewEstimate(savedEstimate);
    setRouteError(null);
  };

  const requestTravelEstimate = async (
    origin: ItineraryItem,
    destination: ItineraryItem,
    mode: TravelMode,
  ): Promise<SavedTravelEstimate> => {
    const result = await getRouteEstimate(supabase, {
      tripId: trip.id,
      origin: origin.place!,
      destination: destination.place!,
      mode,
      departureTime: origin.departureTime || origin.time,
      tripDepartureDate: trip.departureDate,
      activeDay,
    });

    return {
      mode,
      durationSeconds: result.durationSeconds,
      distanceMeters: result.distanceMeters,
      originKey: getPlaceKey(origin.place!),
      destinationKey: getPlaceKey(destination.place!),
      queriedAt: new Date().toISOString(),
      expiresAt: result.expiresAt,
      departureTimeBasis:
        mode === "transit" ? origin.departureTime || origin.time : undefined,
      transitDaytimeFallback: result.transitDaytimeFallback,
      transitVehicle: result.transitVehicle,
    };
  };

  const queryTravelMode = async (mode: TravelMode) => {
    setSelectedTravelMode(mode);
    setRouteError(null);
    if (!activeTravelSegment ||
      !isConfirmedPlace(activeTravelSegment.origin.place) ||
      !isConfirmedPlace(activeTravelSegment.destination.place)) return;

    setIsRouteLoading(true);
    try {
      setPreviewEstimate(await requestTravelEstimate(
        activeTravelSegment.origin,
        activeTravelSegment.destination,
        mode,
      ));
    } catch (error) {
      setRouteError(error instanceof Error ? error.message : "路線查詢暫時無法使用。");
    } finally {
      setIsRouteLoading(false);
    }
  };

  const saveTravelEstimate = async () => {
    if (!activeTravelSegment || !previewEstimate || previewEstimate.mode !== selectedTravelMode) return;
    const dayKey = String(activeDay);
    const currentEvents = trip.content.daysData[dayKey] ?? [];
    const nextEvents = currentEvents.map((event, index) =>
      index === activeTravelSegment.originIndex
        ? {
            ...event,
            travelModeToNext: previewEstimate.mode,
            travelToNext: previewEstimate,
          }
        : event,
    );
    await onSaveTripDetail({
      ...trip,
      content: {
        ...trip.content,
        daysData: { ...trip.content.daysData, [dayKey]: nextEvents },
      },
    });
    setActiveTravelSegment(null);
  };

  const saveItem = async () => {
    if (!draft.title.trim() || isPlaceDecisionPending || isItemSaving) return;

    setItemSaveError(null);
    const dayKey = String(activeDay);
    const currentEvents = trip.content.daysData[dayKey] ?? [];
    const arrivalResult = validateItineraryTime(draft.time);
    const departureResult = validateItineraryTime(draft.departureTime ?? "");
    const nextTimeErrors = {
      ...(!arrivalResult.isValid
        ? {
            arrival:
              "到達時間格式有誤。請輸入HH:MM，例如 08:00",
          }
        : {}),
      ...(!departureResult.isValid
        ? {
            departure:
              "離開時間格式有誤。請輸入HH:MM，例如 08:00",
          }
        : {}),
    };

    if (!arrivalResult.isValid || !departureResult.isValid) {
      setTimeErrors(nextTimeErrors);
      requestAnimationFrame(() => {
        focusAndRevealControl(
          !arrivalResult.isValid
            ? "itinerary-arrival-time-input"
            : "itinerary-departure-time-input",
        );
      });
      return;
    }

    if (
      arrivalResult.normalized &&
      departureResult.normalized &&
      isDepartureBeforeArrival(
        arrivalResult.normalized,
        departureResult.normalized,
      )
    ) {
      setTimeErrors({
        departure: "同一天內，離開時間不得早於到達時間。",
      });
      requestAnimationFrame(() => {
        focusAndRevealControl("itinerary-departure-time-input");
      });
      return;
    }

    setTimeErrors({});
    const arrivalTime = arrivalResult.normalized;
    const requestedDepartureTime = departureResult.normalized;
    const departureTime = requestedDepartureTime || arrivalTime;
    const nextEvent: ItineraryItem = {
      ...draft,
      time: arrivalTime || requestedDepartureTime,
      departureTime,
      title: draft.title.trim(),
      desc: trimRichText(draft.desc),
      location: draft.location.trim(),
    };
    const nextEvents =
      editingIndex === null
        ? [...currentEvents, nextEvent]
        : currentEvents.map((event, index) =>
            index === editingIndex ? nextEvent : event,
          );

    let savedEvents = sortItineraryItemsByTime(nextEvents);
    const changedIndex = savedEvents.indexOf(nextEvent);
    const routeOriginIndexes = getAdjacentTravelOriginIndexesNeedingEstimate(
      savedEvents,
      changedIndex,
    );

    setIsItemSaving(true);
    setAutoRouteError(null);
    try {
      for (const originIndex of routeOriginIndexes) {
        const origin = savedEvents[originIndex];
        const destination = savedEvents[originIndex + 1];
        const mode = getPreferredTravelMode(origin);

        try {
          const estimate = await requestTravelEstimate(origin, destination, mode);
          savedEvents = savedEvents.map((event, index) =>
            index === originIndex
              ? { ...event, travelModeToNext: mode, travelToNext: estimate }
              : event,
          );
        } catch (error) {
          setAutoRouteError(
            error instanceof Error
              ? `活動已儲存，但自動路線規劃失敗：${error.message}`
              : "活動已儲存，但自動路線規劃暫時無法使用。",
          );
        }
      }

      await onSaveTripDetail({
        ...trip,
        content: {
          ...trip.content,
          daysData: {
            ...trip.content.daysData,
            [dayKey]: savedEvents,
          },
        },
      });
      resetForm();
    } catch (error) {
      setItemSaveError(
        error instanceof Error
          ? `無法儲存行程：${error.message}`
          : "無法儲存行程，請檢查網路後再試一次。",
      );
      requestAnimationFrame(() => {
        focusAndRevealControl("itinerary-item-save-error");
      });
    } finally {
      setIsItemSaving(false);
    }
  };

  const deleteItem = async (index: number) => {
    const dayKey = String(activeDay);
    const currentEvents = trip.content.daysData[dayKey] ?? [];
    const targetEvent = currentEvents[index];
    if (!targetEvent) return;
    if (!confirm(`確定刪除「${targetEvent.title}」？`)) return;

    await onSaveTripDetail({
      ...trip,
      content: {
        ...trip.content,
        daysData: {
          ...trip.content.daysData,
          [dayKey]: sortItineraryItemsByTime(
            currentEvents.filter((_, eventIndex) => eventIndex !== index),
          ),
        },
      },
    });
    resetForm();
  };

  const renderItemForm = (isInlineEdit: boolean) => {
    const errorIdPrefix = isInlineEdit ? `edit-${editingIndex}` : "create";

    return (
      <div
        className={isInlineEdit ? "space-y-2" : "mt-3 space-y-2"}
        aria-label={isInlineEdit ? `編輯行程：${draft.title}` : "新增行程"}
      >
        {isInlineEdit && (
          <div className="mb-3 flex items-center justify-between gap-3 border-b border-emerald-100 pb-3">
            <div>
              <p className="text-xs font-bold text-emerald-700">卡片原地編輯</p>
              <h3 className="mt-0.5 text-base font-bold text-slate-800">{draft.title || "未命名活動"}</h3>
            </div>
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 hover:bg-slate-50"
            >
              <X size={14} /> 取消
            </button>
          </div>
        )}

        {itemSaveError && (
          <p
            id="itinerary-item-save-error"
            tabIndex={-1}
            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm leading-relaxed text-rose-700 outline-none focus:ring-2 focus:ring-rose-400"
            role="alert"
          >
            {itemSaveError}
          </p>
        )}

        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className="text-xs font-bold text-slate-600">到達時間</span>
            <input
              id="itinerary-arrival-time-input"
              value={draft.time}
              onChange={(event) => updateArrivalTime(event.target.value)}
              placeholder="例如 08:00"
              aria-invalid={Boolean(timeErrors.arrival)}
              aria-describedby={timeErrors.arrival ? `${errorIdPrefix}-arrival-time-error` : undefined}
              className={`w-full rounded-lg border px-3 py-2 text-base focus:outline-none focus:ring-2 sm:text-sm ${
                timeErrors.arrival
                  ? "border-rose-400 focus:ring-rose-400"
                  : "border-slate-200 focus:ring-emerald-500"
              }`}
            />
            {timeErrors.arrival && (
              <span id={`${errorIdPrefix}-arrival-time-error`} className="block text-xs leading-relaxed text-rose-700">
                {timeErrors.arrival}
              </span>
            )}
          </label>
          <label className="space-y-1">
            <span className="text-xs font-bold text-slate-600">離開時間</span>
            <input
              id="itinerary-departure-time-input"
              value={draft.departureTime ?? ""}
              onChange={(event) => updateDepartureTime(event.target.value)}
              placeholder="例如 12:20"
              aria-invalid={Boolean(timeErrors.departure)}
              aria-describedby={timeErrors.departure ? `${errorIdPrefix}-departure-time-error` : undefined}
              className={`w-full rounded-lg border px-3 py-2 text-base focus:outline-none focus:ring-2 sm:text-sm ${
                timeErrors.departure
                  ? "border-rose-400 focus:ring-rose-400"
                  : "border-slate-200 focus:ring-emerald-500"
              }`}
            />
            {timeErrors.departure && (
              <span id={`${errorIdPrefix}-departure-time-error`} className="block text-xs leading-relaxed text-rose-700">
                {timeErrors.departure}
              </span>
            )}
          </label>
        </div>

        <select
          value={draft.type}
          onChange={(event) => handleTypeChange(event.target.value)}
          aria-label="活動類型"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500 sm:text-sm"
        >
          {ITINERARY_TYPE_OPTIONS.map((option) => (
            <option key={option.type} value={option.type}>
              {option.type}
            </option>
          ))}
        </select>

        {draft.type === "交通" && (
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={draft.travelKind === "flight"}
              onChange={(event) =>
                updateDraft({
                  travelKind: event.target.checked ? "flight" : undefined,
                })
              }
            />
            此活動為航班（不建立機場到機場的地面交通區段）
          </label>
        )}

        <input
          value={draft.title}
          onChange={(event) => updateDraft({ title: event.target.value })}
          placeholder="活動標題"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500 sm:text-sm"
        />
        <RichTextColorEditor
          value={draft.desc}
          onChange={(desc) => updateDraft({ desc })}
          placeholder="說明"
          minHeightClassName="min-h-24"
          focusClassName="focus:ring-2 focus:ring-emerald-500"
          textSizeClassName="text-base sm:text-sm"
        />

        <div className="flex items-stretch gap-2">
          <input
            value={draft.location}
            onChange={(event) => {
              const location = event.target.value;
              updateDraft({
                location,
                place: undefined,
                travelToNext: undefined,
              });
              setIsPlaceDecisionPending(Boolean(location.trim()));
              setIsPlaceSearchOpen(false);
              setPlaceCandidates([]);
              setPlaceSearchError(null);
            }}
            placeholder="地圖地點"
            className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500 sm:text-sm"
          />
          <button
            type="button"
            onClick={openPlaceSearch}
            disabled={!isOnline || isPlaceSearching || draft.location.trim().length < 2}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {isPlaceSearching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            確認地點
          </button>
        </div>

        <p className={`rounded-lg px-3 py-2 text-xs leading-relaxed ${
          isPlaceDecisionPending
            ? "bg-amber-50 text-amber-800"
            : "bg-slate-50 text-slate-500"
        }`}>
          {isConfirmedPlace(draft.place)
            ? "已確認可供路線服務識別的地點。"
            : isPlaceDecisionPending
              ? "地點已變更，請確認正確地點，或明確選擇保留原文字。"
              : draft.location.trim()
                ? "已選擇保留原文字；可查看地圖，但不會建立交通區段。"
                : "可輸入地點並確認，讓系統自動建立交通區段。"}
        </p>

        {isPlaceSearchOpen && (
          <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm" aria-label="確認地點">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-bold text-slate-800">確認正確地點</h4>
              <button
                type="button"
                onClick={() => setIsPlaceSearchOpen(false)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                aria-label="關閉地點搜尋"
              >
                <X size={16} />
              </button>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              已依輸入內容搜尋。請選擇正確地點，以取得穩定的交通估算。
            </p>
            {isPlaceSearching && (
              <p className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-emerald-700" role="status">
                <Loader2 size={14} className="animate-spin" /> 正在搜尋「{placeQuery}」…
              </p>
            )}
            {placeSearchError && (
              <p className="mt-2 text-xs text-rose-700" role="alert">{placeSearchError}</p>
            )}
            {placeCandidates.length > 0 && (
              <div className="mt-3 space-y-2">
                {placeCandidates.map((candidate) => (
                  <button
                    key={candidate.placeId}
                    type="button"
                    onClick={() => void confirmPlaceCandidate(candidate)}
                    disabled={isPlaceSearching}
                    className="flex w-full items-start gap-2 rounded-lg border border-slate-200 px-3 py-2 text-left hover:border-emerald-300 hover:bg-emerald-50 disabled:opacity-60"
                  >
                    <MapPin size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                    <span className="min-w-0">
                      <strong className="block text-sm text-slate-800">{candidate.displayName}</strong>
                      {candidate.address && (
                        <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{candidate.address}</span>
                      )}
                    </span>
                  </button>
                ))}
                <p className="text-right text-xs font-normal text-slate-500" translate="no">Google Maps</p>
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                setIsPlaceDecisionPending(false);
                setIsPlaceSearchOpen(false);
                setPlaceCandidates([]);
                setPlaceSearchError(null);
              }}
              className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              找不到正確地點，保留原文字
            </button>
          </section>
        )}

        <div className={isInlineEdit ? "flex gap-2 pt-1" : undefined}>
          {isInlineEdit && (
            <button
              type="button"
              onClick={resetForm}
              disabled={isItemSaving}
              className="min-h-11 rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
            >
              取消
            </button>
          )}
          <button
            type="button"
            onClick={() => void saveItem()}
            disabled={!draft.title.trim() || isPlaceDecisionPending || isPlaceSearching || isItemSaving}
            className={`${isInlineEdit ? "min-w-0 flex-1" : "w-full"} min-h-11 rounded-lg bg-emerald-700 px-3 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-60`}
          >
            {isItemSaving
              ? "正在儲存並規劃路線…"
              : editingIndex === null
                ? "新增行程"
                : "儲存行程"}
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="grid grid-cols-5 gap-1.5 mb-6">
        {trip.content.days.map((day) => (
          <button
            key={day}
            onClick={() => handleDayChange(day)}
            className={`py-2 px-1 rounded-lg font-semibold text-xs transition-all shadow-sm truncate ${activeDay === day ? "bg-slate-900 text-white font-bold" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"}`}
          >
            D{day}
          </button>
        ))}
      </div>
      <div className="mb-4 border-b border-slate-200 pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-baseline gap-3">
            <span className="text-4xl font-extrabold text-amber-700 tracking-tight">
              {String(activeDay).padStart(2, "0")}
            </span>
            <div>
              <h2>行程探索 Day {activeDay}</h2>
            </div>
          </div>
          {canManageItinerary && (
            <button
              type="button"
              onClick={toggleManageMode}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                isManageMode
                  ? "bg-slate-900 text-white hover:bg-slate-800"
                  : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
              }`}
            >
              {isManageMode ? <X size={14} /> : <Settings2 size={14} />}
              {isManageMode ? "退出" : "管理"}
            </button>
          )}
        </div>
      </div>

      {autoRouteError && (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800" role="alert">
          {autoRouteError}
        </p>
      )}

      {canManageItinerary && isManageMode && (
        <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">
              Day {activeDay} 行程管理
            </h3>
            <button
              type="button"
              onClick={isFormOpen && editingIndex === null ? resetForm : startCreateItem}
              disabled={editingIndex !== null}
              className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {editingIndex !== null
                ? "卡片編輯中"
                : isFormOpen
                  ? "取消"
                  : "新增活動"}
            </button>
          </div>

          <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-500">
            依到達時間排序，未填到達時間的活動會置於最下方；未填離開時間時，儲存後會沿用到達時間。時間可使用半形或全形冒號，但冒號前後不可空格。
          </p>

          {isFormOpen && editingIndex === null && renderItemForm(false)}
        </div>
      )}

      {sortedDayEvents.length > 0 ? (
        <div>
          {sortedDayEvents.map(({ event, originalIndex }, sortedIndex) => {
            const nextEntry = sortedDayEvents[sortedIndex + 1];
            const nextEvent = nextEntry?.event;
            const hasEligiblePlaces = Boolean(
              nextEvent &&
                hasDistinctConfirmedPlaces(event, nextEvent) &&
                !isFlightConnection(event, nextEvent),
            );
            const estimate = nextEvent
              ? getSavedTravelEstimate(event, nextEvent)
              : null;
            const preferredMode = getPreferredTravelMode(event);
            const hasSavedTravelPreference = Boolean(event.travelModeToNext || event.travelToNext);
            const warning = nextEvent
              ? getTravelTimeWarning(event, nextEvent, estimate)
              : null;

            return (
            <Fragment key={`${originalIndex}-${event.title}`}>
            <article
              ref={editingIndex === originalIndex ? editingCardRef : undefined}
              className={`rounded-xl border bg-white p-4 shadow-sm ${
                editingIndex === originalIndex
                  ? "border-emerald-300 ring-2 ring-emerald-100"
                  : "border-slate-200/60"
              }`}
            >
              {isFormOpen && editingIndex === originalIndex ? (
                renderItemForm(true)
              ) : (
                <>
              <div className="flex justify-between items-center gap-3 mb-2">
                {event.time ? (
                  <div className="flex min-w-0 items-center gap-2 text-sm font-bold text-slate-500">
                    <span>到達 {event.time}</span>
                    <span className="text-slate-300" aria-hidden="true">→</span>
                    <span>離開 {event.departureTime || event.time}</span>
                  </div>
                ) : <span />}
                <span
                  className={`px-2 py-0.5 border rounded text-xs font-semibold ${event.typeColor}`}
                >
                  {event.type}
                </span>
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-1.5">
                {event.title}
              </h3>
              {event.desc && (
                <p className="mb-4 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-600">
                  <RichTextDisplay value={event.desc} />
                </p>
              )}
              {event.location && (
                <div className="flex justify-end pt-2 border-t border-slate-100">
                  <button
                    onClick={() => handlePlaceBrowse(event.location!, event.place)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 rounded-lg text-xs font-bold text-slate-600 transition-colors"
                  >
                    <MapPin size={14} className="text-emerald-600" /> 在地圖中查看{" "}
                    <ExternalLink size={10} />
                  </button>
                </div>
              )}
              {canManageItinerary && isManageMode && (
                <div className="mt-3 flex justify-end gap-2 border-t border-slate-100 pt-3">
                  <button
                    type="button"
                    onClick={() => startEditItem(event, originalIndex)}
                    className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200"
                  >
                    編輯
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteItem(originalIndex)}
                    className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100"
                  >
                    刪除
                  </button>
                </div>
              )}
                </>
              )}
            </article>
            {nextEvent && (hasEligiblePlaces || warning) && (
              <div className="py-1">
                {(estimate || hasSavedTravelPreference || canManageItinerary) && hasEligiblePlaces && (
                  <div className="mr-auto inline-flex min-h-10 items-stretch overflow-hidden rounded-lg border border-emerald-200 bg-emerald-50 text-xs font-bold text-slate-700 shadow-sm">
                    <button
                      type="button"
                      onClick={() =>
                       handleRouteBrowse(
                         event.place!,
                         event.location,
                         nextEvent.place!,
                         nextEvent.location,
                         preferredMode,
                        )
                      }
                      className="flex min-h-10 items-center justify-start gap-2 px-3 transition-colors hover:bg-emerald-100"
                      aria-label="使用 Google Maps 開啟路線"
                    >
                      {estimate ? (
                        <>
                          <MaterialTravelModeIcon mode={estimate.mode} />
                          <span>
                            約 {formatTravelDuration(estimate.durationSeconds)} · {formatTravelDistance(estimate.distanceMeters)}
                          </span>
                        </>
                      ) : hasSavedTravelPreference ? (
                        <>
                          <MaterialTravelModeIcon mode={preferredMode} />
                          <span>路線資訊待更新</span>
                        </>
                      ) : (
                        <>
                          <MaterialTravelModeIcon mode="drive" />
                          <span>查看預設路線</span>
                        </>
                      )}
                      <span className="inline-flex items-center gap-1 font-normal text-slate-500" translate="no">
                        Google Maps <ExternalLink size={11} />
                      </span>
                    </button>
                    {canManageItinerary && isManageMode && (
                      <button
                        type="button"
                        onClick={() => openTravelPanel(
                          event,
                          nextEvent,
                          originalIndex,
                          nextEntry.originalIndex,
                        )}
                        className="inline-flex min-h-10 items-center gap-1 border-l border-emerald-200 px-3 text-emerald-700 transition-colors hover:bg-emerald-100"
                        aria-label="修改交通方式"
                      >
                        <Settings2 size={13} /> 修改交通方式
                      </button>
                    )}
                  </div>
                )}
                {warning?.type === "conflict" && (
                  <div className="mx-1 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700" role="status">
                    <TriangleAlert size={15} className="mt-0.5 shrink-0" />
                    <span>行程時間順序衝突：前一站離開時間晚於下一站到達時間</span>
                  </div>
                )}
                {warning?.type === "insufficient" && (
                  <div className="mx-1 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800" role="status">
                    <TriangleAlert size={15} className="mt-0.5 shrink-0" />
                    <span>行程間隔可能不足 {warning.shortfallMinutes} 分鐘</span>
                  </div>
                )}
              </div>
            )}
            {!nextEvent ? null : !(hasEligiblePlaces || warning) ? <div className="h-2" /> : null}
            </Fragment>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12 text-slate-400 bg-white border border-dashed border-slate-200 rounded-xl shadow-sm">
          此行程今日尚無規劃活動景點。
        </div>
      )}

      {activeTravelSegment &&
        isConfirmedPlace(activeTravelSegment.origin.place) &&
        isConfirmedPlace(activeTravelSegment.destination.place) && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-3 sm:items-center" role="presentation">
          <section
            className="w-full max-w-md rounded-2xl bg-white p-4 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="travel-mode-title"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 id="travel-mode-title" className="text-lg font-bold text-slate-800">交通方式</h3>
                <p className="mt-1 text-xs text-slate-500">
                  {activeTravelSegment.origin.location} → {activeTravelSegment.destination.location}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTravelSegment(null)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                aria-label="關閉交通方式"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              {([
                { mode: "drive" as const, label: "開車" },
                { mode: "walk" as const, label: "步行" },
                { mode: "transit" as const, label: "大眾運輸" },
              ]).map((option) => (
                <button
                  key={option.mode}
                  type="button"
                  onClick={() => void queryTravelMode(option.mode)}
                  disabled={isRouteLoading}
                  aria-pressed={selectedTravelMode === option.mode}
                  className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2 text-xs font-bold transition-colors disabled:opacity-60 ${
                    selectedTravelMode === option.mode
                      ? "border-emerald-700 bg-emerald-50 text-emerald-800"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <MaterialTravelModeIcon mode={option.mode} size={18} />
                  {option.label}
                </button>
              ))}
            </div>

            <div className="mt-4 flex min-h-16 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-700" aria-live="polite">
              {isRouteLoading ? (
                <><Loader2 size={18} className="animate-spin" /> 正在查詢預估路線…</>
              ) : previewEstimate && previewEstimate.mode === selectedTravelMode ? (
                <>
                  <MaterialTravelModeIcon mode={previewEstimate.mode} size={20} />
                  約 {formatTravelDuration(previewEstimate.durationSeconds)} · {formatTravelDistance(previewEstimate.distanceMeters)}
                </>
              ) : (
                <span className="text-xs font-normal text-slate-500">點選交通方式取得預估結果</span>
              )}
            </div>
            {previewEstimate?.transitDaytimeFallback && previewEstimate.mode === selectedTravelMode && (
              <p className="mt-2 text-xs text-amber-700">此結果為日間班次估算</p>
            )}
            {routeError && <p className="mt-2 text-xs text-rose-700" role="alert">{routeError}</p>}

            <button
              type="button"
              onClick={() => void saveTravelEstimate()}
              disabled={!previewEstimate || previewEstimate.mode !== selectedTravelMode || isRouteLoading}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              <Check size={16} /> 儲存這個交通方式
            </button>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => handleRouteBrowse(
                  activeTravelSegment.origin.place!,
                  activeTravelSegment.origin.location,
                  activeTravelSegment.destination.place!,
                  activeTravelSegment.destination.location,
                  selectedTravelMode,
                )}
                className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 transition-colors hover:bg-emerald-50 hover:text-emerald-700"
              >
                <MapPin size={14} className="text-emerald-600" /> 使用 Google Maps 查看路線 <ExternalLink size={10} />
              </button>
            </div>
            <p className="mt-3 text-right text-xs font-normal text-slate-500" translate="no">Google Maps</p>
          </section>
        </div>
      )}
    </>
  );
};
