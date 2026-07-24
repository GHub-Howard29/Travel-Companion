import { useEffect, useState } from "react";
import { ExternalLink, MapPin, Settings2, X } from "lucide-react";

import type { ItineraryItem, TripDetail } from "../types";
import { handleNavigate } from "../utils/navigationUtils";

interface ItineraryPageProps {
  trip: TripDetail;
  activeDay: number;
  hasEditPermission: boolean;
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
  title: "",
  type: "景點",
  typeColor: "bg-purple-50 text-purple-700 border-purple-200",
  desc: "",
  location: "",
});

const getItineraryTimeValue = (value: string): number | null => {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour < 24 && minute < 60 ? hour * 60 + minute : null;
};

const sortItineraryItemsByTime = (items: ItineraryItem[]): ItineraryItem[] =>
  items
    .map((item, index) => ({ item, index, time: getItineraryTimeValue(item.time) }))
    .sort((left, right) => {
      if (left.time === null && right.time === null) return left.index - right.index;
      if (left.time === null) return 1;
      if (right.time === null) return -1;
      return left.time - right.time || left.index - right.index;
    })
    .map(({ item }) => item);

export const ItineraryPage = ({
  trip,
  activeDay,
  hasEditPermission,
  onActiveDayChange,
  onSaveTripDetail,
}: ItineraryPageProps) => {
  const [isManageMode, setIsManageMode] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<ItineraryItem>(createEmptyItineraryDraft);

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
  };

  const closeManageMode = () => {
    setIsManageMode(false);
    resetForm();
  };

  const updateDraft = (patch: Partial<ItineraryItem>) => {
    setDraft((currentDraft) => ({
      ...currentDraft,
      ...patch,
    }));
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
    setIsFormOpen(true);
  };

  const startEditItem = (event: ItineraryItem, index: number) => {
    setEditingIndex(index);
    setDraft(event);
    setIsFormOpen(true);
  };

  const toggleManageMode = () => {
    if (isManageMode) {
      closeManageMode();
      return;
    }

    setIsManageMode(true);
  };

  const saveItem = async () => {
    if (!draft.title.trim()) return;

    const dayKey = String(activeDay);
    const currentEvents = trip.content.daysData[dayKey] ?? [];
    const nextEvent: ItineraryItem = {
      ...draft,
      time: draft.time.trim(),
      title: draft.title.trim(),
      desc: draft.desc.trim(),
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
          {hasEditPermission && (
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

      {hasEditPermission && isManageMode && (
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
            依照輸入時間做自動排序，無輸入時間的活動會被置放在最下方。
          </p>

          {isFormOpen && (
            <div className="mt-3 space-y-2">
              <div className="grid grid-cols-[92px_1fr] gap-2">
                <input
                  value={draft.time}
                  onChange={(event) => updateDraft({ time: event.target.value })}
                  placeholder="09:00"
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <select
                  value={draft.type}
                  onChange={(event) => handleTypeChange(event.target.value)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {ITINERARY_TYPE_OPTIONS.map((option) => (
                    <option key={option.type} value={option.type}>
                      {option.type}
                    </option>
                  ))}
                </select>
              </div>
              <input
                value={draft.title}
                onChange={(event) => updateDraft({ title: event.target.value })}
                placeholder="活動標題"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <textarea
                value={draft.desc}
                onChange={(event) => updateDraft({ desc: event.target.value })}
                rows={3}
                placeholder="說明"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-bold text-slate-500">
                  {event.time}
                </span>
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
                  {event.desc}
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
              {hasEditPermission && isManageMode && (
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
