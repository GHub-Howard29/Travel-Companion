import { Fragment, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
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
  Camera,
  Check,
  Copy,
  ExternalLink,
  FolderOpen,
  Eye,
  Image as ImageIcon,
  Loader2,
  MapPin,
  Search,
  Settings2,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react";

import type { Folder, ItineraryItem, SavedTravelEstimate, TravelMode, TripDetail } from "../types";
import {
  getGoogleMapsPlaceUrl,
  handlePlaceBrowse,
  handleRouteBrowse,
} from "../utils/navigationUtils";
import { focusAndRevealControl, releaseFocusedControl } from "../utils/viewportUtils";
import { trimRichText } from "../utils/richText";
import {
  formatCompleteNumericTimeInput,
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
  type CommonsResolvedEntity,
  type PlaceCandidate,
  type PlaceCandidatePhoto,
} from "../services/travelRouteService";
import {
  scheduleItineraryCoverDeletion,
  uploadItineraryCoverPhoto,
  uploadUserItineraryCoverPhoto,
  MAX_USER_COVER_SOURCE_BYTES,
} from "../services/itineraryCoverPhotoService";
import { ITINERARY_COVER_BUCKET } from "../constants/appConstants";
import { RichTextColorEditor } from "./RichTextColorEditor";
import { RichTextDisplay } from "./RichTextDisplay";
import { MaterialTravelModeIcon } from "./MaterialTravelModeIcon";
import { SortableCard } from "./SortableCard";
import { CoverPhotoCropEditor } from "./CoverPhotoCropEditor";
import { CoverPhotoViewer, type CoverPhotoViewerData } from "./CoverPhotoViewer";
import {
  DEFAULT_ITINERARY_COVER_CROP,
  type ItineraryCoverCropTransform,
} from "../utils/itineraryCoverCrop";


type CommonsPageStatus = "empty-first-page" | "duplicate-page" | "exhausted" | "entity-not-found" |
  "entity-ambiguous" | "inspection-limit-reached" | "project-quota-reached" | "rate-limited" |
  "timeout" | "upstream-error" | "session-expired" | "in-progress";

type CoverPhotoSourceChoice = "wikimedia-commons" | "user-upload";

interface UserCoverSelection {
  file: File;
  objectUrl: string;
  width: number;
  height: number;
}

interface ItineraryPageProps {
  supabase: SupabaseClient;
  trip: TripDetail;
  activeDay: number;
  hasEditPermission: boolean;
  isOnline: boolean;
  onActiveDayChange: (day: number) => void;
  onSaveTripDetail: (trip: TripDetail) => Promise<void>;
  otherInfoFolders: Folder[];
  onOpenOtherInfoFolder: (folderId: string) => void;
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
  otherInfoFolders,
  onOpenOtherInfoFolder,
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
  const [copyTimeAlertErrors, setCopyTimeAlertErrors] = useState<string[] | null>(null);
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
  const [commonsResolvedEntity, setCommonsResolvedEntity] = useState<CommonsResolvedEntity | null>(null);
  const [commonsEntityChoices, setCommonsEntityChoices] = useState<CommonsResolvedEntity[]>([]);
  const [commonsCandidates, setCommonsCandidates] = useState<CommonsPhotoCandidate[]>([]);
  const [commonsNextPageToken, setCommonsNextPageToken] = useState<string | null>(null);
  const [commonsExtendedCandidates, setCommonsExtendedCandidates] = useState<CommonsPhotoCandidate[]>([]);
  const [commonsExtensionPageToken, setCommonsExtensionPageToken] = useState<string | null>(null);
  const [commonsSeenFileTitles, setCommonsSeenFileTitles] = useState<Set<string>>(new Set());
  const [selectedCommonsPhoto, setSelectedCommonsPhoto] = useState<CommonsPhotoCandidate | null>(null);
  const [coverPhotoSource, setCoverPhotoSource] = useState<CoverPhotoSourceChoice>("wikimedia-commons");
  const [userCoverSelection, setUserCoverSelection] = useState<UserCoverSelection | null>(null);
  const [coverDialogStep, setCoverDialogStep] = useState<"search" | "confirm">("search");
  const [coverCrop, setCoverCrop] = useState<ItineraryCoverCropTransform>(DEFAULT_ITINERARY_COVER_CROP);
  const [photoViewer, setPhotoViewer] = useState<CoverPhotoViewerData | null>(null);
  const [isCommonsSearching, setIsCommonsSearching] = useState(false);
  const [isCoverSaving, setIsCoverSaving] = useState(false);
  const [coverPhotoError, setCoverPhotoError] = useState<string | null>(null);
  const [commonsPageStatus, setCommonsPageStatus] = useState<CommonsPageStatus | null>(null);
  const [failedCoverPaths, setFailedCoverPaths] = useState<Set<string>>(() => new Set());
  const editingCardRef = useRef<HTMLElement | null>(null);
  const coverDialogRef = useRef<HTMLElement | null>(null);
  const coverDialogOpenerRef = useRef<HTMLElement | null>(null);
  const photoViewerOpenerRef = useRef<HTMLElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const userCoverObjectUrlRef = useRef<string | null>(null);
  const copyTimeAlertButtonRef = useRef<HTMLButtonElement | null>(null);
  const copyTimeCompositionRef = useRef(false);
  const itineraryTimeCompositionRef = useRef(false);
  const timeAdjustmentCompositionRef = useRef(false);
  const orderSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => () => {
    if (userCoverObjectUrlRef.current) URL.revokeObjectURL(userCoverObjectUrlRef.current);
  }, []);

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

  useEffect(() => {
    if (coverTargetIndex === null) return;

    const frameId = requestAnimationFrame(() => {
      const dialog = coverDialogRef.current;
      if (!dialog || dialog.contains(document.activeElement)) return;
      dialog.querySelector<HTMLElement>(
        "a[href], input:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex='-1'])",
      )?.focus();
    });

    return () => cancelAnimationFrame(frameId);
  }, [coverDialogStep, coverTargetIndex, isCommonsSearching]);

  const currentDayEvents = trip.content.daysData[String(activeDay)] || [];
  const displayedDayEvents = (isOrderMode ? orderDraft : currentDayEvents)
    .map((event, originalIndex) => ({ event, originalIndex }));
  const canSaveSelectedCrop = coverPhotoSource === "wikimedia-commons"
    ? Boolean(selectedCommonsPhoto)
    : Boolean(userCoverSelection);
  const selectedCoverCropSource = coverPhotoSource === "wikimedia-commons" && selectedCommonsPhoto
    ? {
      url: selectedCommonsPhoto.cropImageUrl,
      width: selectedCommonsPhoto.width,
      height: selectedCommonsPhoto.height,
    }
    : coverPhotoSource === "user-upload" && userCoverSelection
      ? {
        url: userCoverSelection.objectUrl,
        width: userCoverSelection.width,
        height: userCoverSelection.height,
      }
      : null;

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
    setCopyTimeAlertErrors(null);
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

  const formatTimeInput = (value: string, previousValue: string, isComposing: boolean) => {
    const removedFormattedColon = /^\d{2}:\d{2}$/.test(previousValue) && value === previousValue.replace(":", "");
    return isComposing || removedFormattedColon ? value : formatCompleteNumericTimeInput(value);
  };

  const restoreTimeCaret = (input: HTMLInputElement, nextValue: string) => {
    requestAnimationFrame(() => input.setSelectionRange(nextValue.length, nextValue.length));
  };

  const updateArrivalTime = (value: string, input?: HTMLInputElement) => {
    const nextValue = formatTimeInput(value, draft.time, itineraryTimeCompositionRef.current);
    updateDraft({ time: nextValue });
    if (input && nextValue !== value) restoreTimeCaret(input, nextValue);
    setTimeErrors((current) => ({ ...current, arrival: undefined }));
  };

  const updateDepartureTime = (value: string, input?: HTMLInputElement) => {
    const nextValue = formatTimeInput(value, draft.departureTime ?? "", itineraryTimeCompositionRef.current);
    updateDraft({ departureTime: nextValue });
    if (input && nextValue !== value) restoreTimeCaret(input, nextValue);
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
    setCopyTimeAlertErrors(null);
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
      return `請輸入${field === "arrival" ? "抵達" : "離開"}時間；可輸入 1400 或 14:00。`;
    }
    if (error === "before-arrival") {
      return "離開時間需等於或晚於抵達時間；跨午夜請分開建立行程。";
    }
    if (error === "invalid-range") {
      return `${field === "arrival" ? "抵達" : "離開"}時間需介於 00:00 至 23:59；例如 1400 或 14:00。`;
    }
    if (error === "invalid-format") {
      return `${field === "arrival" ? "抵達" : "離開"}時間請輸入四碼，例如 0930，或使用 H:MM／HH:MM，例如 9:30 或 09:30。`;
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

  const updateCopyTime = (
    field: "arrival" | "departure",
    value: string,
    input: HTMLInputElement,
  ) => {
    const previousValue = field === "arrival" ? copyArrivalTime : copyDepartureTime;
    const removedFormattedColon = /^\d{2}:\d{2}$/.test(previousValue) &&
      value === previousValue.replace(":", "");
    const nextValue = copyTimeCompositionRef.current || removedFormattedColon
      ? value
      : formatCompleteNumericTimeInput(value);
    if (field === "arrival") setCopyArrivalTime(nextValue);
    else setCopyDepartureTime(nextValue);
    if (nextValue !== value) {
      requestAnimationFrame(() => input.setSelectionRange(nextValue.length, nextValue.length));
    }
  };

  const finishCopyTimeComposition = (
    field: "arrival" | "departure",
    input: HTMLInputElement,
  ) => {
    copyTimeCompositionRef.current = false;
    const nextValue = formatCompleteNumericTimeInput(input.value);
    if (field === "arrival") setCopyArrivalTime(nextValue);
    else setCopyDepartureTime(nextValue);
    if (nextValue !== input.value) {
      requestAnimationFrame(() => input.setSelectionRange(nextValue.length, nextValue.length));
    }
  };

  const closeCopyTimeAlert = () => {
    const focusTarget = copyTimeValidation.arrivalError
      ? "copy-arrival-time-input"
      : "copy-departure-time-input";
    setCopyTimeAlertErrors(null);
    requestAnimationFrame(() => focusAndRevealControl(focusTarget));
  };

  const saveCopies = async () => {
    if (!copySource || isCopySaving) return;
    if (!copyTimeValidation.isValid) {
      setCopyTimeAlertErrors(
        [copyArrivalError, copyDepartureError].filter((message): message is string => Boolean(message)),
      );
      requestAnimationFrame(() => copyTimeAlertButtonRef.current?.focus());
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

  const clearUserCoverSelection = () => {
    if (userCoverObjectUrlRef.current) URL.revokeObjectURL(userCoverObjectUrlRef.current);
    userCoverObjectUrlRef.current = null;
    setUserCoverSelection(null);
  };

  const selectCoverPhotoSource = (source: CoverPhotoSourceChoice) => {
    setCoverPhotoSource(source);
    setCoverPhotoError(null);
    if (source === "wikimedia-commons") clearUserCoverSelection();
  };

  const handleUserCoverFile = (file: File | undefined) => {
    if (!file) return;
    if (file.type && !file.type.startsWith("image/")) {
      setCoverPhotoError("請選擇照片檔案；可接受裝置能讀取的圖片格式。");
      return;
    }
    if (file.size <= 0 || file.size > MAX_USER_COVER_SOURCE_BYTES) {
      setCoverPhotoError("照片必須小於 20 MiB，請改選其他照片。");
      return;
    }
    clearUserCoverSelection();
    const objectUrl = URL.createObjectURL(file);
    userCoverObjectUrlRef.current = objectUrl;
    const image = new Image();
    image.onload = () => {
      if (userCoverObjectUrlRef.current !== objectUrl) return;
      setSelectedCommonsPhoto(null);
      setUserCoverSelection({ file, objectUrl, width: image.naturalWidth, height: image.naturalHeight });
      setCoverPhotoSource("user-upload");
      setCoverCrop(DEFAULT_ITINERARY_COVER_CROP);
      setCoverPhotoError(null);
      setCoverDialogStep("confirm");
      image.src = "";
    };
    image.onerror = () => {
      if (userCoverObjectUrlRef.current !== objectUrl) return;
      URL.revokeObjectURL(objectUrl);
      userCoverObjectUrlRef.current = null;
      setCoverPhotoError("無法讀取這張照片，請改選其他照片。");
      image.src = "";
    };
    image.src = objectUrl;
  };

  const openCoverPhotoDialog = (index: number, event: ItineraryItem) => {
    const query = event.location.trim();
    coverDialogOpenerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setCoverTargetIndex(index);
    setCommonsQuery(query);
    setCommonsResolvedEntity(null);
    setCommonsEntityChoices([]);
    setCommonsCandidates([]);
    setCommonsNextPageToken(null);
    setCommonsExtendedCandidates([]);
    setCommonsExtensionPageToken(null);
    setCommonsSeenFileTitles(new Set());
    setSelectedCommonsPhoto(null);
    clearUserCoverSelection();
    setCoverPhotoSource("wikimedia-commons");
    setCoverDialogStep("search");
    setCoverCrop(DEFAULT_ITINERARY_COVER_CROP);
    setCoverPhotoError(null);
    setCommonsPageStatus(null);
    requestAnimationFrame(() => coverDialogRef.current?.querySelector<HTMLElement>("input:not([disabled]), button:not([disabled])")?.focus());
  };

  const closeCoverPhotoDialog = () => {
    if (isCoverSaving) return;
    setCoverTargetIndex(null);
    setCommonsResolvedEntity(null);
    setCommonsEntityChoices([]);
    setCommonsCandidates([]);
    setCommonsNextPageToken(null);
    setCommonsExtendedCandidates([]);
    setCommonsExtensionPageToken(null);
    setCommonsSeenFileTitles(new Set());
    setSelectedCommonsPhoto(null);
    clearUserCoverSelection();
    setCoverPhotoSource("wikimedia-commons");
    setCoverDialogStep("search");
    setCoverCrop(DEFAULT_ITINERARY_COVER_CROP);
    setCoverPhotoError(null);
    setCommonsPageStatus(null);
    const opener = coverDialogOpenerRef.current;
    coverDialogOpenerRef.current = null;
    requestAnimationFrame(() => opener?.focus());
  };

  const handleCoverDialogKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (photoViewer) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeCoverPhotoDialog();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...(coverDialogRef.current?.querySelectorAll<HTMLElement>(
      "a[href], input:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex='-1'])",
    ) ?? [])];
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const openPhotoViewer = (photo: CoverPhotoViewerData, opener: HTMLElement) => {
    photoViewerOpenerRef.current = opener;
    setPhotoViewer(photo);
  };

  const closePhotoViewer = () => {
    const opener = photoViewerOpenerRef.current;
    photoViewerOpenerRef.current = null;
    setPhotoViewer(null);
    requestAnimationFrame(() => opener?.focus());
  };

  const startCommonsSearch = () => {
    setCommonsCandidates([]);
    setCommonsNextPageToken(null);
    setCommonsExtendedCandidates([]);
    setCommonsExtensionPageToken(null);
    setCommonsSeenFileTitles(new Set());
    setSelectedCommonsPhoto(null);
    setCommonsPageStatus(null);
    setCommonsResolvedEntity(null);
    setCommonsEntityChoices([]);
    void searchCommonsPhotos(commonsQuery, undefined, new Set());
  };

  const searchCommonsPhotos = async (
    queryValue = commonsQuery,
    nextPageToken: string | undefined = undefined,
    seenFileTitles = commonsSeenFileTitles,
    selectedEntityQid: string | undefined = undefined,
    candidateTier: "exact" | "extended" = "exact",
  ) => {
    const query = queryValue.trim();
    if (query.length < 2) {
      setCoverPhotoError("請輸入至少 2 個字的照片搜尋詞。");
      return;
    }
    if (!isOnline) {
      setCoverPhotoError("目前離線，無法搜尋、換一批或儲存照片。");
      return;
    }
    setIsCommonsSearching(true);
    setCoverPhotoError(null);
    setSelectedCommonsPhoto(null);
    try {
      const result = await searchCommonsPhotoCandidates(supabase, trip.id, query, nextPageToken, selectedEntityQid ?? commonsResolvedEntity?.qid);
      setCommonsResolvedEntity(result.resolvedEntity ?? (nextPageToken ? commonsResolvedEntity : null));
      setCommonsEntityChoices(result.entityChoices ?? []);
      const freshCandidates = result.candidates.filter((candidate) => !seenFileTitles.has(candidate.fileTitle));
      const nextSeenFileTitles = new Set(seenFileTitles);
      result.candidates.forEach((candidate) => nextSeenFileTitles.add(candidate.fileTitle));
      setCommonsSeenFileTitles(nextSeenFileTitles);
      const nextToken = result.nextPageToken ?? null;
      const nextExtensionToken = result.extensionPageToken ?? null;
      if (candidateTier === "extended") {
        setCommonsExtendedCandidates(freshCandidates.slice(0, 6));
        setCommonsExtensionPageToken(nextExtensionToken);
        setCommonsPageStatus(freshCandidates.length > 0
          ? nextExtensionToken ? null : "exhausted"
          : nextExtensionToken ? "duplicate-page" : "exhausted");
        return;
      }
      setCommonsExtensionPageToken(nextExtensionToken);
      if (result.state !== "results") {
        if (result.state === "entity-ambiguous" && result.entityChoices?.length) {
          setCommonsCandidates([]);
        }
        if (result.state === "no-suitable-image" && !nextPageToken && nextToken) {
          setCommonsNextPageToken(nextToken);
          setCommonsPageStatus("empty-first-page");
          await searchCommonsPhotos(query, nextToken, nextSeenFileTitles);
          return;
        }
        setCommonsNextPageToken(nextToken);
        setCommonsPageStatus(result.state === "no-suitable-image" || result.state === "offline" ? "empty-first-page" : result.state);
        return;
      }
      setCommonsCandidates(nextPageToken
        ? [...commonsCandidates, ...freshCandidates].slice(-12)
        : freshCandidates);
      if (freshCandidates.length === 0) {
        setCommonsNextPageToken(nextPageToken ? nextToken : null);
        setCommonsPageStatus(!nextPageToken
          ? "empty-first-page"
          : nextToken === null
            ? "exhausted"
            : "duplicate-page");
      } else {
        setCommonsNextPageToken(nextToken);
        setCommonsPageStatus(nextToken === null ? "exhausted" : null);
      }
    } catch (error) {
      setCoverPhotoError(error instanceof Error ? error.message : "照片搜尋暫時無法使用。");
    } finally {
      setIsCommonsSearching(false);
    }
  };

  const saveCoverPhoto = async () => {
    if (coverTargetIndex === null || isCoverSaving) return;
    if (coverPhotoSource === "wikimedia-commons" && !selectedCommonsPhoto) return;
    if (coverPhotoSource === "user-upload" && !userCoverSelection) return;
    const stableDaysData = ensureItineraryDaysDataIds(trip.content.daysData);
    const dayKey = String(activeDay);
    const target = stableDaysData[dayKey]?.[coverTargetIndex];
    if (!target?.id) return;
    setIsCoverSaving(true);
    setCoverPhotoError(null);
    let uploadedPath: string | null = null;
    try {
      const coverPhoto = coverPhotoSource === "wikimedia-commons"
        ? await uploadItineraryCoverPhoto(supabase, trip.id, target.id, selectedCommonsPhoto!, coverCrop)
        : await uploadUserItineraryCoverPhoto(supabase, trip.id, target.id, userCoverSelection!.file, coverCrop);
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
      clearUserCoverSelection();
    } catch (error) {
      if (uploadedPath) {
        try { await scheduleItineraryCoverDeletion(supabase, [uploadedPath]); } catch { /* 保留待後續清理。 */ }
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
              "到達時間格式有誤。請輸入 H:MM、HH:MM 或四碼數字，例如 8:00、08:00、0800。",
          }
        : {}),
      ...(!departureResult.isValid
        ? {
            departure:
              "離開時間格式有誤。請輸入 H:MM、HH:MM 或四碼數字，例如 8:00、08:00、0800。",
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
    if (nextEvent.travelKind === "flight") {
      delete nextEvent.travelToNext;
      delete nextEvent.travelModeToNext;
    }
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
              type="text"
              inputMode="numeric"
              onCompositionStart={() => { itineraryTimeCompositionRef.current = true; }}
              onCompositionEnd={(event) => {
                itineraryTimeCompositionRef.current = false;
                updateArrivalTime(event.currentTarget.value, event.currentTarget);
              }}
              onChange={(event) => updateArrivalTime(event.target.value, event.currentTarget)}
              placeholder="例如 08:00 或 0800"
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
              type="text"
              inputMode="numeric"
              onCompositionStart={() => { itineraryTimeCompositionRef.current = true; }}
              onCompositionEnd={(event) => {
                itineraryTimeCompositionRef.current = false;
                updateDepartureTime(event.currentTarget.value, event.currentTarget);
              }}
              onChange={(event) => updateDepartureTime(event.target.value, event.currentTarget)}
              placeholder="例如 12:20 或 1220"
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

        <label className="block space-y-1">
          <span className="text-xs font-bold text-slate-600">其他資訊分類捷徑</span>
          <select
            value={draft.otherInfoFolderId ?? ""}
            onChange={(event) => updateDraft({ otherInfoFolderId: event.target.value || undefined })}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500 sm:text-sm"
          >
            <option value="">不顯示捷徑</option>
            {otherInfoFolders.map((folder) => (
              <option key={folder.id} value={folder.id}>{folder.title}</option>
            ))}
          </select>
        </label>

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
              已依輸入內容搜尋。請選擇正確地點，以取得穩定的交通估算；若結果不理想，請調整地點關鍵字後重新搜尋。
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
                    <a
                      href={getGoogleMapsPlaceUrl(candidate.displayName, candidate.placeId)}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 flex justify-end text-[11px] font-semibold text-slate-500 hover:text-emerald-700"
                    >
                      在 Google Maps 查看地點資訊 <ExternalLink size={10} className="ml-1" />
                    </a>
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
                      type="text"
                      inputMode="numeric"
                      onCompositionStart={() => { timeAdjustmentCompositionRef.current = true; }}
                      onCompositionEnd={(event) => {
                        timeAdjustmentCompositionRef.current = false;
                        const nextValue = formatTimeInput(event.currentTarget.value, timeAdjustmentDeparture, false);
                        setTimeAdjustmentDeparture(nextValue);
                        setTimeAdjustmentResult(null);
                        if (nextValue !== event.currentTarget.value) restoreTimeCaret(event.currentTarget, nextValue);
                      }}
                      onChange={(event) => {
                        const nextValue = formatTimeInput(event.target.value, timeAdjustmentDeparture, timeAdjustmentCompositionRef.current);
                        setTimeAdjustmentDeparture(nextValue);
                        setTimeAdjustmentResult(null);
                        if (nextValue !== event.target.value) restoreTimeCaret(event.currentTarget, nextValue);
                      }}
                      placeholder="例如 10:30 或 1030"
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
            const linkedOtherInfoFolder = event.otherInfoFolderId
              ? otherInfoFolders.find(
                (folder) => folder.id === event.otherInfoFolderId,
              )
              : undefined;

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
                  <button
                    type="button"
                    onClick={(clickEvent) => openPhotoViewer({
                      url: getCoverPublicUrl(event.coverPhoto!.storagePath),
                      alt: `${event.title || "行程"}照片`,
                      sourceLabel: event.coverPhoto!.source === "wikimedia-commons" ? "Wikimedia Commons" : "自行上傳",
                      ...(event.coverPhoto!.source === "wikimedia-commons" ? {
                        sourcePageUrl: event.coverPhoto!.sourcePageUrl,
                        creator: event.coverPhoto!.creator,
                        credit: event.coverPhoto!.credit,
                        license: event.coverPhoto!.license,
                        licenseUrl: event.coverPhoto!.licenseUrl,
                      } : {}),
                      transformation: event.coverPhoto!.transformation,
                    }, clickEvent.currentTarget)}
                    className="block rounded-lg outline-none ring-emerald-500 focus:ring-2"
                    aria-label={`放大檢視「${event.title || "行程"}」照片`}
                  >
                    <img
                      src={getCoverPublicUrl(event.coverPhoto.storagePath)}
                      alt=""
                      width={76}
                      height={76}
                      loading="lazy"
                      className="h-[76px] w-[76px] rounded-lg bg-slate-100 object-cover"
                      onError={() => setFailedCoverPaths((paths) => new Set(paths).add(event.coverPhoto!.storagePath))}
                    />
                  </button>
                  {event.coverPhoto.source === "wikimedia-commons" ? (
                    <a
                      href={event.coverPhoto.sourcePageUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 block text-[11px] font-semibold text-emerald-700 hover:text-emerald-800"
                    >
                      照片來源 ↗
                    </a>
                  ) : <span className="mt-1 block text-[11px] font-semibold text-slate-500">自行上傳</span>}
                </div>
              )}
              <div className="min-w-0">
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
              {(event.location || linkedOtherInfoFolder || (hasVisibleCover && event.coverPhoto)) && (
                <div className="flex items-start justify-between gap-3 border-t border-slate-100 pt-2">
                  {hasVisibleCover && event.coverPhoto ? (
                    <p className="text-[11px] leading-relaxed text-slate-500">
                      {event.coverPhoto.source === "wikimedia-commons"
                        ? `${event.coverPhoto.creator} · ${event.coverPhoto.license}`
                        : "自行上傳"}
                    </p>
                  ) : <span />}
                  <div className="ml-auto flex flex-wrap justify-end gap-2">
                    {linkedOtherInfoFolder && (
                      <button
                        type="button"
                        onClick={() => onOpenOtherInfoFolder(linkedOtherInfoFolder.id)}
                        className="flex shrink-0 items-center gap-1.5 rounded-lg bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-700 transition-colors hover:bg-sky-100"
                      >
                        <FolderOpen size={14} /> {linkedOtherInfoFolder.title}
                      </button>
                    )}
                    {event.location && (
                      <button
                        type="button"
                        onClick={() => handlePlaceBrowse(event.location!, event.place)}
                        className="flex shrink-0 items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 transition-colors hover:bg-emerald-50 hover:text-emerald-700"
                      >
                        <MapPin size={14} className="text-emerald-600" /> 查看地圖 <ExternalLink size={10} />
                      </button>
                    )}
                  </div>
                </div>
              )}
              </div>
              {canManageItinerary && isManageMode && !isOrderMode && (
                <div className="clear-both mt-3 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3">
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
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-3 sm:items-center" role="presentation" aria-hidden={photoViewer ? true : undefined}>
          <section
            ref={coverDialogRef}
            onKeyDown={handleCoverDialogKeyDown}
            className="max-h-[min(46rem,calc(100dvh-1.5rem))] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="commons-photo-title"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 id="commons-photo-title" className="text-lg font-bold text-slate-800">{coverDialogStep === "search" ? "設定照片" : "確認照片與裁切"}</h3>
                <p className="mt-1 text-xs text-slate-500">{coverDialogStep === "search" ? "先選擇來源與候選照片；選取不會立即儲存。" : "確認照片代表正確地點，再調整正方形封面範圍。"}</p>
              </div>
              <button type="button" onClick={closeCoverPhotoDialog} disabled={isCoverSaving} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50" aria-label="關閉照片選擇">
                <X size={18} />
              </button>
            </div>
            {coverDialogStep === "search" ? (
              <>
                <fieldset className="mt-4">
                  <legend className="text-sm font-bold text-slate-700">照片來源</legend>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <label className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 text-sm font-bold ${coverPhotoSource === "wikimedia-commons" ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-700"}`}>
                      <input type="radio" name="cover-photo-source" value="wikimedia-commons" checked={coverPhotoSource === "wikimedia-commons"} onChange={() => selectCoverPhotoSource("wikimedia-commons")} className="mt-0.5 accent-emerald-700" />
                      Wikimedia Commons
                    </label>
                    <label className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 text-sm font-bold ${coverPhotoSource === "user-upload" ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-700"}`}>
                      <input type="radio" name="cover-photo-source" value="user-upload" checked={coverPhotoSource === "user-upload"} onChange={() => selectCoverPhotoSource("user-upload")} className="mt-0.5 accent-emerald-700" />
                      自行上傳
                    </label>
                  </div>
                </fieldset>
                {coverPhotoSource === "wikimedia-commons" ? <>
                <form
                  className="mt-4 flex items-stretch gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    startCommonsSearch();
                  }}
                >
                  <input
                    value={commonsQuery}
                    onChange={(event) => {
                      setCommonsQuery(event.target.value);
                      setCommonsResolvedEntity(null);
                      setCommonsEntityChoices([]);
                      setCommonsCandidates([]);
                      setCommonsNextPageToken(null);
                      setCommonsExtendedCandidates([]);
                      setCommonsExtensionPageToken(null);
                      setCommonsSeenFileTitles(new Set());
                      setSelectedCommonsPhoto(null);
                      setCommonsPageStatus(null);
                      setCoverPhotoError(null);
                    }}
                    aria-label="Commons 搜尋詞"
                    className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500 sm:text-sm"
                  />
                  <button type="submit" disabled={!isOnline || isCommonsSearching || commonsQuery.trim().length < 2} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50">
                    {isCommonsSearching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} 搜尋
                  </button>
                </form>
                {!isOnline && <p className="mt-3 text-xs text-amber-700" aria-live="polite">目前離線，無法搜尋、換一批或儲存照片。</p>}
                {coverPhotoError && <p className="mt-3 text-xs text-rose-700" aria-live="polite">{coverPhotoError}</p>}
                {commonsResolvedEntity && (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900" aria-live="polite">
                    <span>已辨識搜尋範圍：<strong>{commonsResolvedEntity.label}</strong></span>
                    <span>修改上方搜尋詞可重新判定範圍。</span>
                  </div>
                )}
                {commonsEntityChoices.length > 0 && (
                  <section className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3" aria-labelledby="commons-entity-choice-title" aria-live="polite">
                    <h4 id="commons-entity-choice-title" className="text-sm font-bold text-amber-900">請選擇要搜尋的地點範圍</h4>
                    <p className="mt-1 text-xs text-amber-800">選擇前不會搜尋照片；若都不正確，請修改關鍵字。</p>
                    <div className="mt-2 grid gap-2">
                      {commonsEntityChoices.map((entity) => (
                        <button
                          key={entity.qid}
                          type="button"
                          disabled={isCommonsSearching}
                          aria-label={`選擇地點範圍：${entity.label}${entity.description ? `，${entity.description}` : ""}，${entity.qid}`}
                          onClick={() => {
                            setCommonsCandidates([]);
                            setCommonsNextPageToken(null);
                            setCommonsExtendedCandidates([]);
                            setCommonsExtensionPageToken(null);
                            setCommonsSeenFileTitles(new Set());
                            setSelectedCommonsPhoto(null);
                            setCommonsPageStatus(null);
                            void searchCommonsPhotos(commonsQuery, undefined, new Set(), entity.qid);
                          }}
                          className="w-full min-w-0 rounded-lg border border-amber-300 bg-white px-3 py-2 text-left text-sm text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                        >
                          <span className="block break-words font-bold">{entity.label}</span>
                          {entity.description && (
                            <span className="mt-1 block break-words text-xs font-normal leading-relaxed text-amber-800">{entity.description}</span>
                          )}
                          <span className="mt-1 block font-mono text-[11px] font-normal text-amber-700">{entity.qid}</span>
                        </button>
                      ))}
                    </div>
                  </section>
                )}
                {commonsPageStatus && (
                  <p className="mt-3 text-xs text-slate-600" aria-live="polite">
                    {{
                      "empty-first-page": "第一批沒有符合條件的照片，系統已自動再查一批；之後可手動換一批或調整搜尋詞。",
                      "duplicate-page": "這一批沒有新的照片；可再換一批或調整搜尋詞。",
                      exhausted: "已沒有更多照片；可調整搜尋詞或改用其他來源。",
                      "entity-not-found": "找不到可精確對應的地點實體，請使用完整地點名稱或調整關鍵字後再試。",
                      "entity-ambiguous": "搜尋詞對應多個地點，請先選擇正確範圍，或輸入更完整的地點名稱。",
                      "inspection-limit-reached": "已達本次檢查上限；請檢視目前候選或重新調整搜尋詞。",
                      "project-quota-reached": "今日精準搜尋額度已用完，請稍後再試。",
                      "rate-limited": "Wikimedia Commons 暫時受限，請稍後再試。",
                      timeout: "Wikimedia Commons 回應逾時，請稍後再試。",
                      "upstream-error": "Wikimedia Commons 暫時無法使用，請稍後再試。",
                      "session-expired": "照片搜尋工作階段已失效，請重新搜尋。",
                      "in-progress": "精準照片搜尋正在處理中，請稍後由管理者重新操作。",
                    }[commonsPageStatus]}
                  </p>
                )}
                {commonsCandidates.length > 0 && (
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Commons 候選照片">
                    {commonsCandidates.map((candidate) => {
                      const isSelected = selectedCommonsPhoto?.fileTitle === candidate.fileTitle;
                      const name = candidate.fileTitle.replace(/^File:/, "");
                      return (
                        <article key={candidate.fileTitle} className={`overflow-hidden rounded-xl border ${isSelected ? "border-emerald-600 ring-2 ring-emerald-100" : "border-slate-200"}`}>
                          <button
                            type="button"
                            onClick={(clickEvent) => openPhotoViewer({
                              url: candidate.thumbnailUrl,
                              alt: name,
                              sourceLabel: "Wikimedia Commons",
                              sourcePageUrl: candidate.sourcePageUrl,
                              creator: candidate.creator,
                              credit: candidate.credit,
                              license: candidate.license,
                              licenseUrl: candidate.licenseUrl,
                            }, clickEvent.currentTarget)}
                            className="group relative block w-full outline-none ring-inset ring-emerald-500 focus:ring-2"
                            aria-label={`放大檢視「${name}」`}
                          >
                            <img src={candidate.thumbnailUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-28 w-full bg-slate-100 object-cover" />
                            <span className="absolute bottom-2 right-2 rounded-full bg-slate-950/70 p-1.5 text-white"><Eye size={14} /></span>
                          </button>
                          <div className="p-2">
                            <strong className="line-clamp-2 block text-xs text-slate-800">{name}</strong>
                            <span className="mt-1 block text-[11px] text-slate-500">{candidate.creator}</span>
                            <span className="mt-1 block text-[11px] font-semibold text-emerald-700">{candidate.license}</span>
                            {candidate.matchEvidence && candidate.matchEvidence.length > 0 && (
                              <span className="mt-1 block text-[11px] text-slate-600">
                                符合依據：{candidate.matchEvidence.map((evidence) => ({
                                  p18: "Wikidata 代表圖",
                                  "exact-category": "直接 Commons 分類",
                                  "related-category": "一層相關 Commons 分類",
                                  "structured-depicts": "結構化描繪實體",
                                  description: "描述精確命中",
                                  filename: "檔名命中",
                                  "broad-association": "可驗證關聯",
                                  "wrong-entity": "非目標實體",
                                })[evidence.kind] ?? evidence.kind).join("、")}
                              </span>
                            )}
                            <label className={`mt-2 flex w-full cursor-pointer items-center justify-center rounded-lg px-2 py-1.5 text-xs font-bold ${isSelected ? "bg-emerald-700 text-white" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"}`}>
                              <input
                                type="radio"
                                name="commons-photo-candidate"
                                checked={isSelected}
                                onChange={() => setSelectedCommonsPhoto(candidate)}
                                className="sr-only"
                              />
                              {isSelected ? "已選取" : "選取照片"}
                            </label>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
                {commonsExtendedCandidates.length > 0 && (
                  <section className="mt-5 border-t border-slate-200 pt-4" aria-labelledby="commons-extended-title">
                    <h4 id="commons-extended-title" className="text-sm font-bold text-slate-800">延伸候選</h4>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">來自一層已驗證相關分類；請人工確認整體建築、景觀或可辨識的內部場景是否適合作為代表照片。</p>
                    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Commons 延伸候選照片">
                      {commonsExtendedCandidates.map((candidate) => {
                        const isSelected = selectedCommonsPhoto?.fileTitle === candidate.fileTitle;
                        const name = candidate.fileTitle.replace(/^File:/, "");
                        return (
                          <article key={candidate.fileTitle} className={`overflow-hidden rounded-xl border ${isSelected ? "border-emerald-600 ring-2 ring-emerald-100" : "border-slate-200"}`}>
                            <button
                              type="button"
                              onClick={(clickEvent) => openPhotoViewer({
                                url: candidate.thumbnailUrl,
                                alt: name,
                                sourceLabel: "Wikimedia Commons",
                                sourcePageUrl: candidate.sourcePageUrl,
                                creator: candidate.creator,
                                credit: candidate.credit,
                                license: candidate.license,
                                licenseUrl: candidate.licenseUrl,
                              }, clickEvent.currentTarget)}
                              className="group relative block w-full outline-none ring-inset ring-emerald-500 focus:ring-2"
                              aria-label={`放大檢視延伸候選「${name}」`}
                            >
                              <img src={candidate.thumbnailUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-28 w-full bg-slate-100 object-cover" />
                              <span className="absolute bottom-2 right-2 rounded-full bg-slate-950/70 p-1.5 text-white"><Eye size={14} /></span>
                            </button>
                            <div className="p-2">
                              <strong className="line-clamp-2 block text-xs text-slate-800">{name}</strong>
                              <span className="mt-1 block text-[11px] text-slate-500">{candidate.creator}</span>
                              <span className="mt-1 block text-[11px] font-semibold text-emerald-700">{candidate.license}</span>
                              <label className={`mt-2 flex w-full cursor-pointer items-center justify-center rounded-lg px-2 py-1.5 text-xs font-bold ${isSelected ? "bg-emerald-700 text-white" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"}`}>
                                <input type="radio" name="commons-photo-candidate" checked={isSelected} onChange={() => setSelectedCommonsPhoto(candidate)} className="sr-only" />
                                {isSelected ? "已選取" : "選取照片"}
                              </label>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                )}
                <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center">
                  {commonsNextPageToken !== null && (
                    <button type="button" onClick={() => void searchCommonsPhotos(commonsQuery, commonsNextPageToken)} disabled={!isOnline || isCommonsSearching || isCoverSaving} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">
                      換一批
                    </button>
                  )}
                  {commonsNextPageToken === null && commonsExtensionPageToken !== null && (
                    <button type="button" onClick={() => void searchCommonsPhotos(commonsQuery, commonsExtensionPageToken, commonsSeenFileTitles, undefined, "extended")} disabled={!isOnline || isCommonsSearching || isCoverSaving} className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-bold text-sky-700 hover:bg-sky-100 disabled:opacity-50">
                      {commonsExtendedCandidates.length > 0 ? "換一批延伸候選" : "載入延伸候選"}
                    </button>
                  )}
                  <div className="flex flex-col gap-2 sm:ml-auto sm:flex-row">
                    <button type="button" onClick={closeCoverPhotoDialog} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50">取消</button>
                    <button type="button" onClick={() => { setCoverCrop(DEFAULT_ITINERARY_COVER_CROP); setCoverDialogStep("confirm"); }} disabled={!selectedCommonsPhoto} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800 disabled:bg-slate-200 disabled:text-slate-400">
                      確認候選照片
                    </button>
                  </div>
                </div>
                </> : (
                  <section className="mt-4" aria-labelledby="user-cover-upload-title">
                    <h4 id="user-cover-upload-title" className="text-sm font-bold text-slate-800">選擇自行上傳照片</h4>
                    <p className="mt-2 text-sm font-bold leading-relaxed text-rose-700" role="note">
                      請勿上傳侵權圖片，亦不得任意下載、複製或重製他人照片。
                    </p>
                    <p className="mt-2 text-xs leading-relaxed text-slate-500">可接受裝置能讀取的圖片，單檔須小於 20 MiB。雲端硬碟可透過裝置的系統選檔介面使用。</p>
                    <input
                      ref={cameraInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="sr-only"
                      aria-label="使用相機拍照"
                      onChange={(event) => {
                        handleUserCoverFile(event.target.files?.[0]);
                        event.target.value = "";
                      }}
                    />
                    <input
                      ref={galleryInputRef}
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      aria-label="從裝置或圖庫選擇照片"
                      onChange={(event) => {
                        handleUserCoverFile(event.target.files?.[0]);
                        event.target.value = "";
                      }}
                    />
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      <button type="button" onClick={() => cameraInputRef.current?.click()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-800">
                        <Camera size={17} /> 拍照
                      </button>
                      <button type="button" onClick={() => galleryInputRef.current?.click()} className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800 hover:bg-emerald-100">
                        <Upload size={17} /> 從裝置或圖庫選擇
                      </button>
                    </div>
                    {coverPhotoError && <p className="mt-3 text-xs text-rose-700" aria-live="polite">{coverPhotoError}</p>}
                    <div className="mt-4 flex justify-end border-t border-slate-100 pt-4">
                      <button type="button" onClick={closeCoverPhotoDialog} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50">取消</button>
                    </div>
                  </section>
                )}
              </>
            ) : selectedCoverCropSource ? (
              <>
                <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_15rem]">
                  <CoverPhotoCropEditor
                    source={selectedCoverCropSource}
                    value={coverCrop}
                    onChange={setCoverCrop}
                  />
                  <aside className="rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
                    {coverPhotoSource === "wikimedia-commons" && selectedCommonsPhoto ? <>
                      <strong className="block text-sm text-slate-800">{selectedCommonsPhoto.fileTitle.replace(/^File:/, "")}</strong>
                      <p className="mt-2">來源：Wikimedia Commons</p>
                      <p className="mt-1">作者：{selectedCommonsPhoto.creator}</p>
                      {selectedCommonsPhoto.credit && <p className="mt-1">Credit：{selectedCommonsPhoto.credit}</p>}
                      <p className="mt-1">授權：{selectedCommonsPhoto.license}</p>
                      <div className="mt-3 flex flex-col items-start gap-2">
                        <a href={selectedCommonsPhoto.sourcePageUrl} target="_blank" rel="noreferrer" className="font-bold text-emerald-700 hover:text-emerald-800">查看來源頁 ↗</a>
                        {selectedCommonsPhoto.licenseUrl && <a href={selectedCommonsPhoto.licenseUrl} target="_blank" rel="noreferrer" className="font-bold text-emerald-700 hover:text-emerald-800">查看授權 ↗</a>}
                      </div>
                      {/^CC BY(?: |$)/i.test(selectedCommonsPhoto.license) && <p className="mt-3 rounded-lg bg-white p-2">儲存後標示：已調整位置、縮放、加入同圖模糊背景並轉為 WebP</p>}
                    </> : <>
                      <strong className="block break-words text-sm text-slate-800">{userCoverSelection!.file.name || "自行上傳照片"}</strong>
                      <p className="mt-2">來源：自行上傳</p>
                      <p className="mt-3 rounded-lg bg-white p-2">儲存後只保留調整完成的 640×640 WebP，不保存來源原檔。</p>
                    </>}
                  </aside>
                </div>
                {coverPhotoError && <p className="mt-3 text-xs text-rose-700" aria-live="polite">{coverPhotoError}</p>}
                <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
                  <button type="button" onClick={() => { setCoverPhotoError(null); setCoverDialogStep("search"); }} disabled={isCoverSaving} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">返回來源</button>
                  <button type="button" onClick={closeCoverPhotoDialog} disabled={isCoverSaving} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">取消</button>
                  <button type="button" onClick={() => void saveCoverPhoto()} disabled={!isOnline || !canSaveSelectedCrop || isCoverSaving} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800 disabled:bg-slate-200 disabled:text-slate-400">
                    {isCoverSaving ? "正在設定…" : "確認裁切並儲存"}
                  </button>
                </div>
              </>
            ) : null}
          </section>
        </div>
      )}

      {photoViewer && <CoverPhotoViewer photo={photoViewer} onClose={closePhotoViewer} />}

      {copySource && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-3 sm:items-center" role="presentation">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void saveCopies();
            }}
            aria-hidden={copyTimeAlertErrors ? true : undefined}
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
                <span className="block text-xs text-slate-500">可輸入 1400 或 14:00。</span>
                <input
                  id="copy-arrival-time-input"
                  value={copyArrivalTime}
                  type="text"
                  onCompositionStart={() => { copyTimeCompositionRef.current = true; }}
                  onCompositionEnd={(event) => finishCopyTimeComposition("arrival", event.currentTarget)}
                  onChange={(event) => updateCopyTime("arrival", event.target.value, event.currentTarget)}
                  placeholder="例如 13:30"
                  inputMode="numeric"
                  autoComplete="off"
                  disabled={isCopySaving}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-sky-600 sm:text-sm"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-bold text-slate-600">離開時間（必填）</span>
                <span className="block text-xs text-slate-500">可輸入 1400 或 14:00。</span>
                <input
                  id="copy-departure-time-input"
                  value={copyDepartureTime}
                  type="text"
                  onCompositionStart={() => { copyTimeCompositionRef.current = true; }}
                  onCompositionEnd={(event) => finishCopyTimeComposition("departure", event.currentTarget)}
                  onChange={(event) => updateCopyTime("departure", event.target.value, event.currentTarget)}
                  placeholder="例如 15:00"
                  inputMode="numeric"
                  autoComplete="off"
                  disabled={isCopySaving}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-sky-600 sm:text-sm"
                />
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
              <button type="submit" disabled={copyTargetDays.length === 0 || isCopySaving} className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-bold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400">{isCopySaving ? "正在複製…" : "複製到所選 Day"}</button>
            </div>
          </form>
          {copyTimeAlertErrors && (
            <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/50 p-3 sm:items-center" role="presentation">
              <section
                className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="copy-time-alert-title"
                aria-describedby="copy-time-alert-description"
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    closeCopyTimeAlert();
                  } else if (event.key === "Tab") {
                    event.preventDefault();
                    copyTimeAlertButtonRef.current?.focus();
                  }
                }}
              >
                <h4 id="copy-time-alert-title" className="text-lg font-bold text-slate-800">請檢查時間格式</h4>
                <ul id="copy-time-alert-description" className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-slate-700">
                  {copyTimeAlertErrors.map((message) => <li key={message}>{message}</li>)}
                </ul>
                <div className="mt-4 flex justify-end">
                  <button ref={copyTimeAlertButtonRef} type="button" onClick={closeCopyTimeAlert} className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-bold text-white hover:bg-sky-800">知道了</button>
                </div>
              </section>
            </div>
          )}
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
