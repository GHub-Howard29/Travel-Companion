import { Fragment, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  ExternalLink,
  Image as ImageIcon,
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
  isDepartureBeforeArrival,
  sortItineraryItemsByTime,
  validateItineraryTime,
  validateRequiredItineraryTimeRange,
  type RequiredItineraryTimeError,
} from "../utils/itineraryTime";
import {
  formatTravelDistance,
  formatTravelDuration,
  getAdjacentTravelOriginIndexesNeedingEstimate,
  getPlaceKey,
  getPreferredTravelMode,
  getSavedTravelEstimate,
  getTravelModeLabel,
  getTravelTimeWarning,
  hasDistinctConfirmedPlaces,
  isConfirmedPlace,
  isFlightConnection,
} from "../utils/itineraryTravel";
import {
  calculateTimeAdjustment,
  type TimeAdjustmentResult,
} from "../utils/itineraryTimeAdjustment";
import { getItineraryDayDate, getLunarDateLabel } from "../utils/itineraryDate";
import { getItineraryDayTone } from "../utils/itineraryDayStyle";
import {
  copyItineraryItemToDays,
  createItineraryItemId,
  ensureItineraryDaysDataIds,
  invalidateChangedTravelDestinations,
  moveItineraryItem,
  reorderItineraryItems,
} from "../utils/itineraryOrder";
import {
  getConfirmedPlace,
  getRouteEstimate,
  searchPlaceCandidates,
  getPlaceCandidatePhotos,
  searchCommonsPhotoCandidates,
  type CommonsPhotoCandidate,
  type PlaceCandidate,
  type PlaceCandidatePhoto,
} from "../services/travelRouteService";
import {
  removeItineraryCoverPaths,
  uploadItineraryCoverPhoto,
} from "../services/itineraryCoverPhotoService";
import { ITINERARY_COVER_BUCKET } from "../constants/appConstants";
import { RichTextColorEditor } from "./RichTextColorEditor";
import { RichTextDisplay } from "./RichTextDisplay";
import { MaterialTravelModeIcon } from "./MaterialTravelModeIcon";
import { SortableCard } from "./SortableCard";

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
  const [isOrderMode, setIsOrderMode] = useState(false);
  const [orderOriginal, setOrderOriginal] = useState<ItineraryItem[]>([]);
  const [orderDraft, setOrderDraft] = useState<ItineraryItem[]>([]);
  const [isOrderSaving, setIsOrderSaving] = useState(false);
  const [orderSaveError, setOrderSaveError] = useState<string | null>(null);
  const [showOrderSaved, setShowOrderSaved] = useState(false);
  const [copySource, setCopySource] = useState<ItineraryItem | null>(null);
  const [copyTargetDays, setCopyTargetDays] = useState<number[]>([]);
  const [copyArrivalTime, setCopyArrivalTime] = useState("");
  const [copyDepartureTime, setCopyDepartureTime] = useState("");
  const [isCopySaving, setIsCopySaving] = useState(false);
  const [copySaveError, setCopySaveError] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState<string | null>(null);
  const [isTimeAdjustmentMode, setIsTimeAdjustmentMode] = useState(false);
  const [timeAdjustmentStartIndex, setTimeAdjustmentStartIndex] = useState<number | null>(null);
  const [timeAdjustmentDeparture, setTimeAdjustmentDeparture] = useState("");
  const [timeAdjustmentResult, setTimeAdjustmentResult] = useState<TimeAdjustmentResult | null>(null);
  const [isTimeAdjustmentLoading, setIsTimeAdjustmentLoading] = useState(false);
  const [isTimeAdjustmentSaving, setIsTimeAdjustmentSaving] = useState(false);
  const [timeAdjustmentSaveError, setTimeAdjustmentSaveError] = useState<string | null>(null);

  useEffect(() => {
    onManageModeChange?.(isManageMode || isTimeAdjustmentMode || isOrderMode || Boolean(copySource));
    return () => onManageModeChange?.(false);
  }, [copySource, isManageMode, isOrderMode, isTimeAdjustmentMode, onManageModeChange]);
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
  const [placeCandidatePhotos, setPlaceCandidatePhotos] = useState<Record<string, PlaceCandidatePhoto>>({});
  const [isPlacePhotosLoading, setIsPlacePhotosLoading] = useState(false);
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
  const [coverTargetIndex, setCoverTargetIndex] = useState<number | null>(null);
  const [commonsQuery, setCommonsQuery] = useState("");
  const [commonsCandidates, setCommonsCandidates] = useState<CommonsPhotoCandidate[]>([]);
  const [selectedCommonsPhoto, setSelectedCommonsPhoto] = useState<CommonsPhotoCandidate | null>(null);
  const [isCommonsSearching, setIsCommonsSearching] = useState(false);
  const [isCoverSaving, setIsCoverSaving] = useState(false);
  const [coverPhotoError, setCoverPhotoError] = useState<string | null>(null);
  const [failedCoverPaths, setFailedCoverPaths] = useState<Set<string>>(() => new Set());
  const editingCardRef = useRef<HTMLElement | null>(null);
  const orderSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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
  const displayedDayEvents = (isOrderMode ? orderDraft : currentDayEvents)
    .map((event, originalIndex) => ({ event, originalIndex }));

  const resetForm = () => {
    releaseFocusedControl();
    setIsFormOpen(false);
    setEditingIndex(null);
    setDraft(createEmptyItineraryDraft());
    setTimeErrors({});
    setIsPlaceSearchOpen(false);
    setPlaceCandidates([]);
    setPlaceCandidatePhotos({});
    setPlaceSearchError(null);
    setIsPlaceDecisionPending(false);
    setItemSaveError(null);
  };

  const resetTimeAdjustment = () => {
    releaseFocusedControl();
    setIsTimeAdjustmentMode(false);
    setTimeAdjustmentStartIndex(null);
    setTimeAdjustmentDeparture("");
    setTimeAdjustmentResult(null);
    setTimeAdjustmentSaveError(null);
  };

  const resetOrder = () => {
    setIsOrderMode(false);
    setOrderOriginal([]);
    setOrderDraft([]);
    setOrderSaveError(null);
  };

  const closeCopyDialog = () => {
    if (isCopySaving) return;
    setCopySource(null);
    setCopyTargetDays([]);
    setCopyArrivalTime("");
    setCopyDepartureTime("");
    setCopySaveError(null);
  };

  const closeManageMode = () => {
    releaseFocusedControl();
    setIsManageMode(false);
    resetForm();
    resetTimeAdjustment();
    resetOrder();
    closeCopyDialog();
    setShowOrderSaved(false);
    setCopySuccess(null);
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
  const canAdjustItineraryTime = hasEditPermission;
  const getCoverPublicUrl = (path: string) =>
    supabase.storage.from(ITINERARY_COVER_BUCKET).getPublicUrl(path).data.publicUrl;

  const activeDayDate = getItineraryDayDate(trip.departureDate, activeDay);
  const activeDayLunarDate = trip.content.showLunarDate !== false && activeDayDate
    ? getLunarDateLabel(activeDayDate)
    : null;

  const startTimeAdjustment = () => {
    resetForm();
    resetOrder();
    setShowOrderSaved(false);
    setIsTimeAdjustmentMode(true);
    setTimeAdjustmentStartIndex(null);
    setTimeAdjustmentDeparture("");
    setTimeAdjustmentResult(null);
    setTimeAdjustmentSaveError(null);
  };

  const startOrderAdjustment = () => {
    resetForm();
    resetTimeAdjustment();
    setShowOrderSaved(false);
    setCopySuccess(null);
    const stableItems = ensureItineraryDaysDataIds(trip.content.daysData)[String(activeDay)] ?? [];
    setOrderOriginal(stableItems);
    setOrderDraft(stableItems);
    setOrderSaveError(null);
    setIsOrderMode(true);
  };

  const handleOrderDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setOrderDraft((items) => reorderItineraryItems(items, String(active.id), String(over.id)));
  };

  const saveOrder = async () => {
    if (isOrderSaving) return;
    setIsOrderSaving(true);
    setOrderSaveError(null);
    try {
      const stableDaysData = ensureItineraryDaysDataIds(trip.content.daysData);
      const savedItems = invalidateChangedTravelDestinations(orderOriginal, orderDraft);
      await onSaveTripDetail({
        ...trip,
        content: {
          ...trip.content,
          daysData: {
            ...stableDaysData,
            [String(activeDay)]: savedItems,
          },
        },
      });
      resetOrder();
      setShowOrderSaved(true);
    } catch (error) {
      setOrderSaveError(
        error instanceof Error
          ? `無法儲存順序：${error.message}`
          : "無法儲存順序，排序草稿已保留。",
      );
    } finally {
      setIsOrderSaving(false);
    }
  };

  const openCopyDialog = (event: ItineraryItem) => {
    setCopySource(event);
    setCopyTargetDays([]);
    setCopyArrivalTime("");
    setCopyDepartureTime("");
    setCopySaveError(null);
    setCopySuccess(null);
  };

  const toggleCopyTargetDay = (day: number) => {
    setCopyTargetDays((days) =>
      days.includes(day) ? days.filter((value) => value !== day) : [...days, day],
    );
  };

  const copyTimeValidation = validateRequiredItineraryTimeRange(
    copyArrivalTime,
    copyDepartureTime,
  );

  const getCopyTimeErrorMessage = (
    field: "arrival" | "departure",
    error?: RequiredItineraryTimeError,
  ) => {
    if (error === "required") {
      return field === "arrival" ? "請輸入抵達時間" : "請輸入離開時間";
    }
    if (error === "before-arrival") return "離開時間不得早於抵達時間";
    if (error === "invalid") {
      return `${field === "arrival" ? "抵達" : "離開"}時間格式有誤。請輸入 HH:MM，例如 08:00`;
    }
    return undefined;
  };

  const copyArrivalError = getCopyTimeErrorMessage(
    "arrival",
    copyTimeValidation.arrivalError,
  );
  const copyDepartureError = getCopyTimeErrorMessage(
    "departure",
    copyTimeValidation.departureError,
  );

  const saveCopies = async () => {
    if (!copySource || isCopySaving) return;
    if (!copyTimeValidation.isValid) {
      requestAnimationFrame(() => {
        focusAndRevealControl(
          copyTimeValidation.arrivalError
            ? "copy-arrival-time-input"
            : "copy-departure-time-input",
        );
      });
      return;
    }
    if (copyTargetDays.length === 0) return;
    setIsCopySaving(true);
    setCopySaveError(null);
    try {
      const stableDaysData = ensureItineraryDaysDataIds(trip.content.daysData);
      const nextDaysData = copyItineraryItemToDays(
        stableDaysData,
        copyTargetDays,
        copySource,
        copyTimeValidation.arrivalTime,
        copyTimeValidation.departureTime,
      );
      await onSaveTripDetail({
        ...trip,
        content: { ...trip.content, daysData: nextDaysData },
      });
      const copiedDays = [...copyTargetDays].sort((left, right) => left - right);
      setCopySource(null);
      setCopyTargetDays([]);
      setCopyArrivalTime("");
      setCopyDepartureTime("");
      setCopySuccess(`已複製到 ${copiedDays.map((day) => `Day ${day}`).join("、")}`);
    } catch (error) {
      setCopySaveError(
        error instanceof Error
          ? `無法複製行程：${error.message}`
          : "無法複製行程，所有日期均維持原狀。",
      );
    } finally {
      setIsCopySaving(false);
    }
  };

  const selectTimeAdjustmentStart = (sortedIndex: number, event: ItineraryItem) => {
    setTimeAdjustmentStartIndex(sortedIndex);
    setTimeAdjustmentDeparture(event.departureTime || event.time);
    setTimeAdjustmentResult(null);
    setTimeAdjustmentSaveError(null);
    requestAnimationFrame(() => focusAndRevealControl("time-adjustment-departure"));
  };

  const prepareTimeAdjustment = async () => {
    if (timeAdjustmentStartIndex === null || isTimeAdjustmentLoading) return;
    const remainingEvents = currentDayEvents;
    const hasTransit = remainingEvents.slice(timeAdjustmentStartIndex, -1)
      .some((event) => getPreferredTravelMode(event) === "transit");
    if (hasTransit && !confirm("此調整包含大眾運輸，將重新查詢受影響區段，可能產生地圖服務費用。要繼續嗎？")) return;

    setIsTimeAdjustmentLoading(true);
    setTimeAdjustmentSaveError(null);
    try {
      const result = await calculateTimeAdjustment(
        remainingEvents,
        timeAdjustmentStartIndex,
        timeAdjustmentDeparture,
        async (_originIndex, origin, destination) => {
          const mode = getPreferredTravelMode(origin);
          if (mode === "transit") {
            if (!isOnline) return null;
            return requestTravelEstimate(origin, destination, mode);
          }
          return getSavedTravelEstimate(origin, destination);
        },
      );
      setTimeAdjustmentResult(result);
      if (result.blocker) {
        requestAnimationFrame(() => focusAndRevealControl(
          result.blocker?.focusTarget === "departure"
            ? "time-adjustment-departure"
            : "time-adjustment-result",
        ));
      }
    } catch (error) {
      setTimeAdjustmentSaveError(error instanceof Error ? error.message : "無法建立時間調整預覽，請稍後重試。");
      requestAnimationFrame(() => focusAndRevealControl("time-adjustment-result"));
    } finally {
      setIsTimeAdjustmentLoading(false);
    }
  };

  const applyTimeAdjustment = async () => {
    if (!timeAdjustmentResult || timeAdjustmentResult.blocker || isTimeAdjustmentSaving) return;
    setIsTimeAdjustmentSaving(true);
    setTimeAdjustmentSaveError(null);
    try {
      const stableDaysData = ensureItineraryDaysDataIds(trip.content.daysData);
      const dayKey = String(activeDay);
      const stableActiveDay = stableDaysData[dayKey] ?? [];
      await onSaveTripDetail({
        ...trip,
        content: {
          ...trip.content,
          daysData: {
            ...stableDaysData,
            [dayKey]: timeAdjustmentResult.items.map((item, index) => ({
              ...item,
              id: stableActiveDay[index]?.id ?? item.id ?? createItineraryItemId(),
            })),
          },
        },
      });
      resetTimeAdjustment();
    } catch (error) {
      setTimeAdjustmentSaveError(error instanceof Error ? `無法套用調整：${error.message}` : "無法套用調整，資料尚未變更。");
      requestAnimationFrame(() => focusAndRevealControl("time-adjustment-result"));
    } finally {
      setIsTimeAdjustmentSaving(false);
    }
  };

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
      if (candidates.length > 0) {
        setIsPlacePhotosLoading(true);
        void getPlaceCandidatePhotos(
          supabase,
          trip.id,
          candidates.slice(0, 5).map((candidate) => candidate.placeId),
        ).then((result) => {
          setPlaceCandidatePhotos(Object.fromEntries(result.photos.map((photo) => [photo.placeId, photo])));
        }).catch(() => {
          setPlaceCandidatePhotos({});
        }).finally(() => setIsPlacePhotosLoading(false));
      }
    } catch (error) {
      setPlaceSearchError(error instanceof Error ? error.message : "地點搜尋暫時無法使用。");
    } finally {
      setIsPlaceSearching(false);
    }
  };

  const openCoverPhotoDialog = (index: number, event: ItineraryItem) => {
    const query = event.location.trim() || event.title.trim();
    setCoverTargetIndex(index);
    setCommonsQuery(query);
    setCommonsCandidates([]);
    setSelectedCommonsPhoto(null);
    setCoverPhotoError(null);
    void searchCommonsPhotos(query);
  };

  const closeCoverPhotoDialog = () => {
    if (isCoverSaving) return;
    setCoverTargetIndex(null);
    setCommonsCandidates([]);
    setSelectedCommonsPhoto(null);
    setCoverPhotoError(null);
  };

  const searchCommonsPhotos = async (queryValue = commonsQuery) => {
    const query = queryValue.trim();
    if (query.length < 2) {
      setCoverPhotoError("請輸入至少 2 個字的照片搜尋詞。");
      return;
    }
    setIsCommonsSearching(true);
    setCoverPhotoError(null);
    setSelectedCommonsPhoto(null);
    try {
      const candidates = await searchCommonsPhotoCandidates(supabase, trip.id, query);
      setCommonsCandidates(candidates);
      if (candidates.length === 0) setCoverPhotoError("找不到適合的 Commons 照片，請調整搜尋詞。");
    } catch (error) {
      setCoverPhotoError(error instanceof Error ? error.message : "照片搜尋暫時無法使用。");
    } finally {
      setIsCommonsSearching(false);
    }
  };

  const saveCommonsPhoto = async () => {
    if (coverTargetIndex === null || !selectedCommonsPhoto || isCoverSaving) return;
    const stableDaysData = ensureItineraryDaysDataIds(trip.content.daysData);
    const dayKey = String(activeDay);
    const target = stableDaysData[dayKey]?.[coverTargetIndex];
    if (!target?.id) return;
    setIsCoverSaving(true);
    setCoverPhotoError(null);
    let uploadedPath: string | null = null;
    try {
      const coverPhoto = await uploadItineraryCoverPhoto(
        supabase,
        trip.id,
        target.id,
        selectedCommonsPhoto,
      );
      uploadedPath = coverPhoto.storagePath;
      const nextTrip: TripDetail = {
        ...trip,
        content: {
          ...trip.content,
          daysData: {
            ...stableDaysData,
            [dayKey]: stableDaysData[dayKey].map((item, index) =>
              index === coverTargetIndex ? { ...item, coverPhoto } : item,
            ),
          },
        },
      };
      await onSaveTripDetail(nextTrip);
      setCoverTargetIndex(null);
      setCommonsCandidates([]);
      setSelectedCommonsPhoto(null);
    } catch (error) {
      if (uploadedPath) {
        try { await removeItineraryCoverPaths(supabase, [uploadedPath]); } catch { /* 保留待後續清理。 */ }
      }
      setCoverPhotoError(error instanceof Error ? error.message : "照片設定失敗，行程尚未變更。");
    } finally {
      setIsCoverSaving(false);
    }
  };

  const removeCoverPhoto = async (index: number) => {
    const stableDaysData = ensureItineraryDaysDataIds(trip.content.daysData);
    const dayKey = String(activeDay);
    const target = stableDaysData[dayKey]?.[index];
    if (!target?.coverPhoto) return;
    const nextItem = { ...target };
    delete nextItem.coverPhoto;
    const nextTrip: TripDetail = {
      ...trip,
      content: {
        ...trip.content,
        daysData: {
          ...stableDaysData,
          [dayKey]: stableDaysData[dayKey].map((item, itemIndex) => itemIndex === index ? nextItem : item),
        },
      },
    };
    try {
      await onSaveTripDetail(nextTrip);
    } catch (error) {
      setAutoRouteError(error instanceof Error ? `移除照片失敗：${error.message}` : "移除照片失敗，行程尚未變更。");
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
    const stableDaysData = ensureItineraryDaysDataIds(trip.content.daysData);
    const currentEvents = stableDaysData[dayKey] ?? [];
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
        daysData: { ...stableDaysData, [dayKey]: nextEvents },
      },
    });
    setActiveTravelSegment(null);
  };

  const saveItem = async () => {
    if (!draft.title.trim() || isPlaceDecisionPending || isItemSaving) return;

    setItemSaveError(null);
    const dayKey = String(activeDay);
    const stableDaysData = ensureItineraryDaysDataIds(trip.content.daysData);
    const currentEvents = stableDaysData[dayKey] ?? [];
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
      id: editingIndex === null
        ? draft.id ?? createItineraryItemId()
        : currentEvents[editingIndex]?.id ?? draft.id ?? createItineraryItemId(),
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

    let savedEvents = editingIndex === null
      ? sortItineraryItemsByTime(nextEvents)
      : nextEvents;
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
            ...stableDaysData,
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
    const stableDaysData = ensureItineraryDaysDataIds(trip.content.daysData);
    const currentEvents = stableDaysData[dayKey] ?? [];
    const targetEvent = currentEvents[index];
    if (!targetEvent) return;
    if (!confirm(`確定刪除「${targetEvent.title}」？`)) return;

    await onSaveTripDetail({
      ...trip,
      content: {
        ...trip.content,
          daysData: {
            ...stableDaysData,
            [dayKey]: invalidateChangedTravelDestinations(
              currentEvents,
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
                  <div key={candidate.placeId} className="rounded-lg border border-slate-200 p-2 hover:border-emerald-300 hover:bg-emerald-50">
                    <button
                      type="button"
                      onClick={() => void confirmPlaceCandidate(candidate)}
                      disabled={isPlaceSearching}
                      className="flex w-full items-start gap-3 text-left disabled:opacity-60"
                    >
                      {placeCandidatePhotos[candidate.placeId] ? (
                        <img
                          src={placeCandidatePhotos[candidate.placeId].photoUri}
                          alt=""
                          width={76}
                          height={76}
                          referrerPolicy="no-referrer"
                          className="h-[76px] w-[76px] shrink-0 rounded-lg object-cover"
                        />
                      ) : isPlacePhotosLoading ? (
                        <span className="h-[76px] w-[76px] shrink-0 animate-pulse rounded-lg bg-slate-100" aria-hidden="true" />
                      ) : (
                        <span className="flex h-[76px] w-[76px] shrink-0 items-center justify-center rounded-lg bg-slate-100 text-emerald-600"><MapPin size={20} /></span>
                      )}
                      <span className="min-w-0 flex-1">
                        <strong className="block text-sm text-slate-800">{candidate.displayName}</strong>
                        {candidate.address && (
                          <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{candidate.address}</span>
                        )}
                        {placeCandidatePhotos[candidate.placeId]?.authorAttributions.length ? (
                          <span className="mt-1 block text-[11px] text-slate-500">
                            照片：{placeCandidatePhotos[candidate.placeId].authorAttributions.map((author) => author.displayName).join("、")}
                          </span>
                        ) : null}
                      </span>
                    </button>
                    {placeCandidatePhotos[candidate.placeId]?.googleMapsUri && (
                      <a
                        href={placeCandidatePhotos[candidate.placeId].googleMapsUri}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 flex justify-end text-[11px] font-semibold text-slate-500 hover:text-emerald-700"
                      >
                        在 Google Maps 查看照片 <ExternalLink size={10} className="ml-1" />
                      </a>
                    )}
                  </div>
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
        {trip.content.days.map((day, index) => {
          const tone = getItineraryDayTone(trip.content.days, index);
          const isActive = activeDay === day;
          const colorClass = {
            first: isActive
              ? "border-blue-300 bg-blue-100 text-blue-700 ring-2 ring-blue-100"
              : "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100",
            middle: isActive
              ? "border-emerald-300 bg-emerald-100 text-emerald-700 ring-2 ring-emerald-100"
              : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
            last: isActive
              ? "border-rose-300 bg-rose-100 text-rose-700 ring-2 ring-rose-100"
              : "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100",
          }[tone];

          return (
          <button
            key={day}
            onClick={() => handleDayChange(day)}
            aria-current={isActive ? "page" : undefined}
            className={`rounded-lg border px-1 py-2 text-xs font-semibold shadow-sm transition-all ${colorClass}`}
          >
            D{day}
          </button>
          );
        })}
      </div>
      <div className="mb-4 border-b border-slate-200 pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate">
              Day {activeDay} 行程探索 {activeDayDate && (
                <span className="text-sm font-medium text-slate-500">
                  {activeDayDate.slice(5)}{activeDayLunarDate && `（${activeDayLunarDate}）`}
                </span>
              )}
            </h2>
          </div>
          {(canManageItinerary || canAdjustItineraryTime) && (
            <button
              type="button"
              onClick={toggleManageMode}
              disabled={!canManageItinerary}
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

      {(canManageItinerary || (canAdjustItineraryTime && isTimeAdjustmentMode)) && (isManageMode || isTimeAdjustmentMode) && (
        <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-800">
              Day {activeDay} 行程管理
            </h3>
            <div className="flex shrink-0 flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={startOrderAdjustment}
                disabled={!canManageItinerary || editingIndex !== null || isTimeAdjustmentMode || isOrderMode || currentDayEvents.length < 2}
                className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-800 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                調整順序
              </button>
              <button
                type="button"
                onClick={startTimeAdjustment}
                disabled={!canAdjustItineraryTime || editingIndex !== null || isTimeAdjustmentMode || isOrderMode}
                className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                調整時間
              </button>
              <button
                type="button"
                onClick={isFormOpen && editingIndex === null ? resetForm : startCreateItem}
                disabled={!canManageItinerary || editingIndex !== null || isTimeAdjustmentMode || isOrderMode}
                className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {editingIndex !== null
                  ? "卡片編輯中"
                  : isFormOpen
                    ? "取消"
                    : "新增活動"}
              </button>
            </div>
          </div>

          <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-500">
            新增活動會依到達時間插入；編輯時間不會自行移動卡片。未填離開時間時，儲存後會沿用到達時間。時間可使用半形或全形冒號，但冒號前後不可空格。
          </p>

          {isFormOpen && editingIndex === null && renderItemForm(false)}

          {isOrderMode && (
            <section className="mt-3 rounded-xl border border-sky-200 bg-sky-50/60 p-3" aria-label="調整順序模式">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="text-sm font-bold text-sky-900">調整順序</h4>
                  <p className="mt-1 text-xs leading-relaxed text-sky-800">拖曳卡片、聚焦拖拉按鈕後按 Alt＋上／下方向鍵，或使用上移／下移按鈕。時間與交通方式偏好不會變更。</p>
                </div>
                <span className="shrink-0 rounded-full bg-white px-2 py-1 text-xs font-bold text-sky-700">草稿</span>
              </div>
              {orderSaveError && <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700" role="alert">{orderSaveError}</p>}
              <div className="mt-3 flex justify-end gap-2">
                <button type="button" onClick={resetOrder} disabled={isOrderSaving} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">取消</button>
                <button type="button" onClick={() => void saveOrder()} disabled={isOrderSaving} className="rounded-lg bg-sky-700 px-3 py-2 text-xs font-bold text-white hover:bg-sky-800 disabled:opacity-50">{isOrderSaving ? "正在儲存…" : "儲存順序"}</button>
              </div>
            </section>
          )}

          {showOrderSaved && (
            <section className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3" aria-label="順序儲存完成" role="status">
              <p className="text-sm font-bold text-emerald-900">順序已儲存</p>
              <p className="mt-1 text-xs leading-relaxed text-emerald-800">原本的到達與離開時間已保留；如需讓時間配合新順序，可接著調整。</p>
              <div className="mt-3 flex justify-end gap-2">
                <button type="button" onClick={() => setShowOrderSaved(false)} className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">完成</button>
                <button type="button" onClick={startTimeAdjustment} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800">接著調整時間</button>
              </div>
            </section>
          )}

          {copySuccess && (
            <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800" role="status">{copySuccess}</p>
          )}

          {isTimeAdjustmentMode && (
            <section className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3" aria-label="時間調整模式">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="text-sm font-bold text-emerald-900">時間調整模式</h4>
                  <p className="mt-1 text-xs leading-relaxed text-emerald-800">選擇一個起點，重新計算當日後續行程。</p>
                </div>
                <button type="button" onClick={resetTimeAdjustment} className="rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50">退出</button>
              </div>
              {timeAdjustmentStartIndex !== null && (
                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                  <label className="space-y-1">
                    <span className="text-xs font-bold text-slate-700">新的離開時間</span>
                    <input
                      id="time-adjustment-departure"
                      value={timeAdjustmentDeparture}
                      onChange={(event) => { setTimeAdjustmentDeparture(event.target.value); setTimeAdjustmentResult(null); }}
                      placeholder="例如 10:30"
                      className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500 sm:text-sm"
                    />
                  </label>
                  <button type="button" onClick={() => void prepareTimeAdjustment()} disabled={isTimeAdjustmentLoading} className="self-end rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-60">
                    {isTimeAdjustmentLoading ? "正在計算…" : "預覽調整"}
                  </button>
                </div>
              )}
              {timeAdjustmentResult && (
                <div id="time-adjustment-result" tabIndex={-1} className="mt-3 rounded-lg border border-emerald-100 bg-white p-3 outline-none focus:ring-2 focus:ring-emerald-500">
                  {timeAdjustmentResult.blocker ? (
                    <p className="text-xs leading-relaxed text-rose-700" role="alert">⚠️ {timeAdjustmentResult.blocker.message}</p>
                  ) : (
                    <div className="space-y-3 text-sm text-slate-700">
                      {timeAdjustmentResult.items.slice(timeAdjustmentStartIndex ?? 0).map((event, index) => {
                        const absoluteIndex = (timeAdjustmentStartIndex ?? 0) + index;
                        const segment = timeAdjustmentResult.segments.find((entry) => entry.destinationIndex === absoluteIndex);
                        return <Fragment key={`time-adjustment-preview-${absoluteIndex}-${event.title}`}>
                          {segment && <div className="border-y border-slate-100 py-2 text-xs text-slate-600"><span className="inline-flex items-center gap-1 font-bold"><MaterialTravelModeIcon mode={segment.estimate.mode} />{getTravelModeLabel(segment.estimate.mode)}</span>｜約 {formatTravelDuration(segment.estimate.durationSeconds)}｜{formatTravelDistance(segment.estimate.distanceMeters)}</div>}
                          <div><p className="font-bold text-slate-800">{event.title || "未命名活動"}</p><p className="mt-0.5 text-xs">{absoluteIndex === timeAdjustmentStartIndex ? `離開 ${event.departureTime}` : `到達 ${event.time} → 離開 ${event.departureTime}`}</p></div>
                        </Fragment>;
                      })}
                    </div>
                  )}
                  {timeAdjustmentSaveError && <p className="mt-3 text-xs text-rose-700" role="alert">{timeAdjustmentSaveError}</p>}
                  <div className="mt-3 flex justify-end gap-2">
                    <button type="button" onClick={resetTimeAdjustment} disabled={isTimeAdjustmentSaving} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">取消調整</button>
                    <button type="button" onClick={() => void applyTimeAdjustment()} disabled={Boolean(timeAdjustmentResult.blocker) || isTimeAdjustmentSaving} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50">{isTimeAdjustmentSaving ? "正在套用…" : "套用調整"}</button>
                  </div>
                </div>
              )}
              {timeAdjustmentSaveError && !timeAdjustmentResult && <p id="time-adjustment-result" tabIndex={-1} className="mt-3 text-xs text-rose-700" role="alert">{timeAdjustmentSaveError}</p>}
            </section>
          )}
        </div>
      )}

      {displayedDayEvents.length > 0 ? (
        <DndContext sensors={orderSensors} collisionDetection={closestCenter} onDragEnd={handleOrderDragEnd}>
        <SortableContext
          items={displayedDayEvents.map(({ event, originalIndex }) => event.id ?? `legacy-${activeDay}-${originalIndex}`)}
          strategy={verticalListSortingStrategy}
        >
        <div>
          {displayedDayEvents.map(({ event, originalIndex }, sortedIndex) => {
            const nextEntry = displayedDayEvents[sortedIndex + 1];
            const nextEvent = nextEntry?.event;
            const sortableId = event.id ?? `legacy-${activeDay}-${originalIndex}`;
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
            const hasVisibleCover = Boolean(
              event.coverPhoto && !failedCoverPaths.has(event.coverPhoto.storagePath),
            );

            return (
            <Fragment key={sortableId}>
            <SortableCard
              id={sortableId}
              disabled={!isOrderMode}
              onKeyboardMove={(direction) => setOrderDraft((items) => moveItineraryItem(items, sortableId, direction))}
            >
            {(dragHandle) => <article
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
              {isOrderMode && (
                <div className="mb-3 flex items-center justify-between gap-3 border-b border-sky-100 pb-3">
                  <span className="text-xs font-bold text-sky-700">第 {sortedIndex + 1} 站</span>
                  <div className="flex shrink-0 items-center gap-1">
                    {dragHandle}
                    <button
                      type="button"
                      onClick={() => setOrderDraft((items) => moveItineraryItem(items, sortableId, -1))}
                      disabled={sortedIndex === 0}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-sky-100 hover:text-sky-800 disabled:opacity-30"
                      aria-label={`上移「${event.title || "未命名活動"}」`}
                      title="上移"
                    >
                      <ArrowUp size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setOrderDraft((items) => moveItineraryItem(items, sortableId, 1))}
                      disabled={sortedIndex === displayedDayEvents.length - 1}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-sky-100 hover:text-sky-800 disabled:opacity-30"
                      aria-label={`下移「${event.title || "未命名活動"}」`}
                      title="下移"
                    >
                      <ArrowDown size={15} />
                    </button>
                  </div>
                </div>
              )}
              <div className={hasVisibleCover ? "relative flow-root" : ""}>
              {hasVisibleCover && event.coverPhoto && (
                <div className="float-left mb-2 mr-3 w-[76px]">
                  <img
                    src={getCoverPublicUrl(event.coverPhoto.storagePath)}
                    alt={`${event.title || "行程"}照片`}
                    width={76}
                    height={76}
                    loading="lazy"
                    className="h-[76px] w-[76px] rounded-lg bg-slate-100 object-cover"
                    onError={() => setFailedCoverPaths((paths) => new Set(paths).add(event.coverPhoto!.storagePath))}
                  />
                  <a
                    href={event.coverPhoto.sourcePageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 block text-[11px] font-semibold text-emerald-700 hover:text-emerald-800"
                  >
                    照片來源 ↗
                  </a>
                </div>
              )}
              <div className={`min-w-0 ${hasVisibleCover && canManageItinerary && isManageMode && !isOrderMode ? "sm:pr-28" : ""}`}>
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
              {hasVisibleCover && event.coverPhoto && (
                <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                  {event.coverPhoto.creator} · {event.coverPhoto.license}
                </p>
              )}
              </div>
              {canManageItinerary && isManageMode && !isOrderMode && (
                <div className={`mt-3 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3 ${hasVisibleCover ? "clear-both sm:absolute sm:right-0 sm:top-0 sm:mt-0 sm:w-24 sm:flex-col sm:border-0 sm:pt-0" : ""}`}>
                  <button
                    type="button"
                    onClick={() => openCoverPhotoDialog(originalIndex, event)}
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
                  >
                    <ImageIcon size={13} /> {event.coverPhoto ? "更換照片" : "設定照片"}
                  </button>
                  {event.coverPhoto && (
                    <button
                      type="button"
                      onClick={() => void removeCoverPhoto(originalIndex)}
                      className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200"
                    >
                      移除照片
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => openCopyDialog(event)}
                    className="inline-flex items-center gap-1 rounded-lg bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-700 hover:bg-sky-100"
                  >
                    <Copy size={13} /> 複製
                  </button>
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
              {canAdjustItineraryTime && isTimeAdjustmentMode && (
                <div className="mt-3 flex justify-end border-t border-slate-100 pt-3">
                  <button
                    type="button"
                    onClick={() => selectTimeAdjustmentStart(sortedIndex, event)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold ${timeAdjustmentStartIndex === sortedIndex ? "bg-emerald-700 text-white" : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"}`}
                  >
                    從這站開始
                  </button>
                </div>
              )}
              </div>
                </>
              )}
            </article>}
            </SortableCard>
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
                    {canManageItinerary && isManageMode && !isOrderMode && (
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
        </SortableContext>
        </DndContext>
      ) : (
        <div className="text-center py-12 text-slate-400 bg-white border border-dashed border-slate-200 rounded-xl shadow-sm">
          此行程今日尚無規劃活動景點。
        </div>
      )}

      {coverTargetIndex !== null && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-3 sm:items-center" role="presentation">
          <section
            className="max-h-[min(46rem,calc(100dvh-1.5rem))] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="commons-photo-title"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 id="commons-photo-title" className="text-lg font-bold text-slate-800">設定照片</h3>
                <p className="mt-1 text-xs text-slate-500">請確認照片代表正確地點，並查看作者與授權。</p>
              </div>
              <button type="button" onClick={closeCoverPhotoDialog} disabled={isCoverSaving} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50" aria-label="關閉照片選擇">
                <X size={18} />
              </button>
            </div>
            <form
              className="mt-4 flex items-stretch gap-2"
              onSubmit={(event) => { event.preventDefault(); void searchCommonsPhotos(); }}
            >
              <input
                value={commonsQuery}
                onChange={(event) => setCommonsQuery(event.target.value)}
                aria-label="Commons 搜尋詞"
                className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500 sm:text-sm"
              />
              <button type="submit" disabled={isCommonsSearching || commonsQuery.trim().length < 2} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50">
                {isCommonsSearching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} 搜尋
              </button>
            </form>
            {coverPhotoError && <p className="mt-3 text-xs text-rose-700" role="alert">{coverPhotoError}</p>}
            {commonsCandidates.length > 0 && (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {commonsCandidates.map((candidate) => {
                  const isSelected = selectedCommonsPhoto?.fileTitle === candidate.fileTitle;
                  return (
                    <button
                      key={candidate.fileTitle}
                      type="button"
                      onClick={() => setSelectedCommonsPhoto(candidate)}
                      aria-pressed={isSelected}
                      className={`overflow-hidden rounded-xl border text-left ${isSelected ? "border-emerald-600 ring-2 ring-emerald-100" : "border-slate-200 hover:border-emerald-300"}`}
                    >
                      <img src={candidate.thumbnailUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-28 w-full bg-slate-100 object-cover" />
                      <span className="block p-2">
                        <strong className="line-clamp-2 block text-xs text-slate-800">{candidate.fileTitle.replace(/^File:/, "")}</strong>
                        <span className="mt-1 block text-[11px] text-slate-500">{candidate.creator}</span>
                        <span className="mt-1 block text-[11px] font-semibold text-emerald-700">{candidate.license}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" onClick={closeCoverPhotoDialog} disabled={isCoverSaving} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">取消</button>
              <button type="button" onClick={() => void saveCommonsPhoto()} disabled={!selectedCommonsPhoto || isCoverSaving} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800 disabled:bg-slate-200 disabled:text-slate-400">
                {isCoverSaving ? "正在設定…" : "使用照片"}
              </button>
            </div>
          </section>
        </div>
      )}

      {copySource && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-3 sm:items-center" role="presentation">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void saveCopies();
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || copyTimeValidation.isValid) return;
              event.preventDefault();
              void saveCopies();
            }}
            className="max-h-[min(42rem,calc(100dvh-1.5rem))] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="copy-itinerary-title"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 id="copy-itinerary-title" className="text-lg font-bold text-slate-800">跨日複製</h3>
                <p className="mt-1 truncate text-sm font-semibold text-slate-600">{copySource.title || "未命名活動"}</p>
              </div>
              <button type="button" onClick={closeCopyDialog} disabled={isCopySaving} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50" aria-label="關閉跨日複製">
                <X size={18} />
              </button>
            </div>

            <p className="mt-4 rounded-xl bg-sky-50 px-3 py-3 text-sm font-bold text-sky-800">
              來源時間：{copySource.time.trim() || "未設定"}–{copySource.departureTime?.trim() || "未設定"}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              請先設定副本時間，再選擇要複製的日期。所有所選 Day 將套用同一組時間。
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-xs font-bold text-slate-600">抵達時間（必填）</span>
                <input
                  id="copy-arrival-time-input"
                  value={copyArrivalTime}
                  onChange={(event) => setCopyArrivalTime(event.target.value)}
                  placeholder="例如 13:30"
                  inputMode="numeric"
                  autoComplete="off"
                  disabled={isCopySaving}
                  aria-invalid={Boolean(copyArrivalError)}
                  aria-describedby={copyArrivalError ? "copy-arrival-time-error" : undefined}
                  className={`w-full rounded-lg border px-3 py-2 text-base focus:outline-none focus:ring-2 sm:text-sm ${
                    copyArrivalError
                      ? "border-rose-400 focus:ring-rose-400"
                      : "border-slate-200 focus:ring-sky-600"
                  }`}
                />
                {copyArrivalError && (
                  <span id="copy-arrival-time-error" className="block text-xs leading-relaxed text-rose-700">
                    {copyArrivalError}
                  </span>
                )}
              </label>
              <label className="space-y-1">
                <span className="text-xs font-bold text-slate-600">離開時間（必填）</span>
                <input
                  id="copy-departure-time-input"
                  value={copyDepartureTime}
                  onChange={(event) => setCopyDepartureTime(event.target.value)}
                  placeholder="例如 15:00"
                  inputMode="numeric"
                  autoComplete="off"
                  disabled={isCopySaving}
                  aria-invalid={Boolean(copyDepartureError)}
                  aria-describedby={copyDepartureError ? "copy-departure-time-error" : undefined}
                  className={`w-full rounded-lg border px-3 py-2 text-base focus:outline-none focus:ring-2 sm:text-sm ${
                    copyDepartureError
                      ? "border-rose-400 focus:ring-rose-400"
                      : "border-slate-200 focus:ring-sky-600"
                  }`}
                />
                {copyDepartureError && (
                  <span id="copy-departure-time-error" className="block text-xs leading-relaxed text-rose-700">
                    {copyDepartureError}
                  </span>
                )}
              </label>
            </div>

            <fieldset className="mt-4">
              <legend className="pb-2 text-xs font-bold text-slate-700">複製到</legend>
              {trip.content.days.filter((day) => day !== activeDay).map((day) => {
                const date = getItineraryDayDate(trip.departureDate, day);
                const itemCount = trip.content.daysData[String(day)]?.length ?? 0;
                return (
                  <label key={day} className="flex cursor-pointer items-center gap-3 border-t border-slate-200 px-3 py-2.5 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={copyTargetDays.includes(day)}
                      onChange={() => toggleCopyTargetDay(day)}
                      disabled={isCopySaving}
                      className="h-4 w-4 accent-sky-700"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-slate-800">Day {day}{date ? `｜${date.slice(5)}` : ""}</span>
                      <span className="mt-0.5 block text-xs text-slate-500">目前 {itemCount} 張卡片</span>
                    </span>
                  </label>
                );
              })}
            </fieldset>
            {trip.content.days.length <= 1 && <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">此旅程沒有其他 Day 可供複製。</p>}
            {copySaveError && <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700" role="alert">{copySaveError}</p>}
            <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" onClick={closeCopyDialog} disabled={isCopySaving} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">取消</button>
              <button type="submit" disabled={copyTargetDays.length === 0 || !copyTimeValidation.isValid || isCopySaving} className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-bold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400">{isCopySaving ? "正在複製…" : "複製到所選 Day"}</button>
            </div>
          </form>
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
