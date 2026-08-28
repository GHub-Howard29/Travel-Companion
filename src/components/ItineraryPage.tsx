import { useEffect, useState } from "react";
import { ExternalLink, MapPin, Settings2, X } from "lucide-react";

import type { ItineraryItem, TripDetail } from "../types";
import { handleNavigate } from "../utils/navigationUtils";
import { releaseFocusedControl } from "../utils/viewportUtils";
import { trimRichText } from "../utils/richText";
import {
  getItineraryTimeValue,
  isDepartureBeforeArrival,
  sortItineraryItemsByTime,
  validateItineraryTime,
} from "../utils/itineraryTime";
import { RichTextColorEditor } from "./RichTextColorEditor";
import { RichTextDisplay } from "./RichTextDisplay";

interface ItineraryPageProps {
  trip: TripDetail;
  activeDay: number;
  hasEditPermission: boolean;
  isOnline: boolean;
  onActiveDayChange: (day: number) => void;
  onSaveTripDetail: (trip: TripDetail) => Promise<void>;
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
  trip,
  activeDay,
  hasEditPermission,
  isOnline,
  onActiveDayChange,
  onSaveTripDetail,
}: ItineraryPageProps) => {
  const [isManageMode, setIsManageMode] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<ItineraryItem>(createEmptyItineraryDraft);
  const [timeErrors, setTimeErrors] = useState<{
    arrival?: string;
    departure?: string;
  }>({});

  useEffect(() => {
    if (editingIndex === null) return;

    const frameId = requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    return () => cancelAnimationFrame(frameId);
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
    setIsFormOpen(false);
    setEditingIndex(null);
    setDraft(createEmptyItineraryDraft());
    setTimeErrors({});
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
    setEditingIndex(null);
    setDraft(createEmptyItineraryDraft());
    setTimeErrors({});
    setIsFormOpen(true);
  };

  const startEditItem = (event: ItineraryItem, index: number) => {
    setEditingIndex(index);
    setDraft(event);
    setTimeErrors({});
    setIsFormOpen(true);
  };

  const toggleManageMode = () => {
    if (isManageMode) {
      closeManageMode();
      return;
    }

    setIsManageMode(true);
  };

  const canManageItinerary = hasEditPermission && isOnline;

  const saveItem = async () => {
    if (!draft.title.trim()) return;

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

    await onSaveTripDetail({
      ...trip,
      content: {
        ...trip.content,
        daysData: {
          ...trip.content.daysData,
          [dayKey]: sortItineraryItemsByTime(nextEvents),
        },
      },
    });
    resetForm();
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

      {canManageItinerary && isManageMode && (
        <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">
              Day {activeDay} 行程管理
            </h3>
            <button
              type="button"
              onClick={isFormOpen ? resetForm : startCreateItem}
              className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800"
            >
              {isFormOpen ? "取消" : "新增活動"}
            </button>
          </div>

          <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-500">
            依到達時間排序，未填到達時間的活動會置於最下方；未填離開時間時，儲存後會沿用到達時間。時間可使用半形或全形冒號，但冒號前後不可空格。
          </p>

          {isFormOpen && (
            <div className="mt-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1">
                  <span className="text-xs font-bold text-slate-600">到達時間</span>
                  <input
                    value={draft.time}
                    onChange={(event) => updateArrivalTime(event.target.value)}
                    placeholder="例如 08:00"
                    aria-invalid={Boolean(timeErrors.arrival)}
                    aria-describedby={timeErrors.arrival ? "arrival-time-error" : undefined}
                    className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                      timeErrors.arrival
                        ? "border-rose-400 focus:ring-rose-400"
                        : "border-slate-200 focus:ring-emerald-500"
                    }`}
                  />
                  {timeErrors.arrival && (
                    <span id="arrival-time-error" className="block text-xs leading-relaxed text-rose-700">
                      {timeErrors.arrival}
                    </span>
                  )}
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-bold text-slate-600">離開時間</span>
                  <input
                    value={draft.departureTime ?? ""}
                    onChange={(event) => updateDepartureTime(event.target.value)}
                    placeholder="例如 12:20"
                    aria-invalid={Boolean(timeErrors.departure)}
                    aria-describedby={timeErrors.departure ? "departure-time-error" : undefined}
                    className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                      timeErrors.departure
                        ? "border-rose-400 focus:ring-rose-400"
                        : "border-slate-200 focus:ring-emerald-500"
                    }`}
                  />
                  {timeErrors.departure && (
                    <span id="departure-time-error" className="block text-xs leading-relaxed text-rose-700">
                      {timeErrors.departure}
                    </span>
                  )}
                </label>
              </div>
              <select
                value={draft.type}
                onChange={(event) => handleTypeChange(event.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {ITINERARY_TYPE_OPTIONS.map((option) => (
                  <option key={option.type} value={option.type}>
                    {option.type}
                  </option>
                ))}
              </select>
              <input
                value={draft.title}
                onChange={(event) => updateDraft({ title: event.target.value })}
                placeholder="活動標題"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <RichTextColorEditor
                value={draft.desc}
                onChange={(desc) => updateDraft({ desc })}
                placeholder="說明"
                minHeightClassName="min-h-24"
                focusClassName="focus:ring-2 focus:ring-emerald-500"
              />
              <input
                value={draft.location}
                onChange={(event) => updateDraft({ location: event.target.value })}
                placeholder="地圖地點"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="button"
                onClick={() => void saveItem()}
                disabled={!draft.title.trim()}
                className="w-full rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-60"
              >
                {editingIndex === null ? "新增行程" : "儲存行程"}
              </button>
            </div>
          )}
        </div>
      )}

      {sortedDayEvents.length > 0 ? (
        <div className="space-y-4">
          {sortedDayEvents.map(({ event, originalIndex }) => (
            <div
              key={originalIndex}
              className="bg-white border border-slate-200/60 rounded-xl p-4 shadow-sm"
            >
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
                    onClick={() => handleNavigate(event.location!)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 rounded-lg text-xs font-bold text-slate-600 transition-colors"
                  >
                    <MapPin size={14} className="text-emerald-600" /> 地圖導航{" "}
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
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-slate-400 bg-white border border-dashed border-slate-200 rounded-xl shadow-sm">
          此行程今日尚無規劃活動景點。
        </div>
      )}
    </>
  );
};
