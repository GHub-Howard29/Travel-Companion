import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Minus, Plus } from "lucide-react";

import {
  clampItineraryCoverCrop,
  getItineraryCoverCropMaxZoom,
  type ItineraryCoverCropTransform,
} from "../utils/itineraryCoverCrop";
import { drawItineraryCover } from "../utils/itineraryCoverRenderer";

export interface CoverPhotoCropSource {
  url: string;
  width: number;
  height: number;
}

interface CoverPhotoCropEditorProps {
  source: CoverPhotoCropSource;
  value: ItineraryCoverCropTransform;
  onChange: (value: ItineraryCoverCropTransform) => void;
}

const drawPreview = (
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  transform: ItineraryCoverCropTransform,
) => {
  const context = canvas.getContext("2d");
  if (!context) return;
  drawItineraryCover(context, image, image.naturalWidth, image.naturalHeight, transform);
};

export const CoverPhotoCropEditor = ({ source, value, onChange }: CoverPhotoCropEditorProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cardPreviewRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const valueRef = useRef(value);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const gestureRef = useRef<{ distance: number; zoom: number } | null>(null);
  const dragRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const [loadedUrl, setLoadedUrl] = useState("");
  const maxZoom = useMemo(() => getItineraryCoverCropMaxZoom(source.width, source.height), [source.height, source.width]);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.referrerPolicy = "no-referrer";
    image.onload = () => {
      imageRef.current = image;
      setLoadedUrl(source.url);
      if (canvasRef.current) drawPreview(canvasRef.current, image, valueRef.current);
      if (cardPreviewRef.current) drawPreview(cardPreviewRef.current, image, valueRef.current);
    };
    image.src = source.url;
    return () => {
      imageRef.current = null;
      image.src = "";
    };
  }, [source.url]);

  useEffect(() => {
    if (canvasRef.current && imageRef.current) drawPreview(canvasRef.current, imageRef.current, value);
    if (cardPreviewRef.current && imageRef.current) drawPreview(cardPreviewRef.current, imageRef.current, value);
  }, [value]);

  const update = (next: ItineraryCoverCropTransform) => onChange(clampItineraryCoverCrop(next, maxZoom));
  const nudgeZoom = (delta: number) => update({ ...value, zoom: value.zoom + delta });

  const handleKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
    const step = event.shiftKey ? 0.12 : 0.04;
    const next = { ...value };
    if (event.key === "ArrowLeft") next.offsetX -= step;
    else if (event.key === "ArrowRight") next.offsetX += step;
    else if (event.key === "ArrowUp") next.offsetY -= step;
    else if (event.key === "ArrowDown") next.offsetY += step;
    else if (event.key === "+" || event.key === "=") next.zoom += 0.1;
    else if (event.key === "-") next.zoom -= 0.1;
    else return;
    event.preventDefault();
    update(next);
  };

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size === 1) {
      dragRef.current = { x: event.clientX, y: event.clientY, offsetX: value.offsetX, offsetY: value.offsetY };
    } else if (pointersRef.current.size === 2) {
      const [first, second] = [...pointersRef.current.values()];
      gestureRef.current = { distance: Math.hypot(second.x - first.x, second.y - first.y), zoom: value.zoom };
      dragRef.current = null;
    }
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size === 2 && gestureRef.current) {
      const [first, second] = [...pointersRef.current.values()];
      const distance = Math.hypot(second.x - first.x, second.y - first.y);
      update({ ...value, zoom: gestureRef.current.zoom * (distance / Math.max(1, gestureRef.current.distance)) });
      return;
    }
    if (dragRef.current) {
      const rect = event.currentTarget.getBoundingClientRect();
      update({
        ...value,
        offsetX: dragRef.current.offsetX - ((event.clientX - dragRef.current.x) / Math.max(1, rect.width)) * 2,
        offsetY: dragRef.current.offsetY - ((event.clientY - dragRef.current.y) / Math.max(1, rect.height)) * 2,
      });
    }
  };

  const endPointer = (event: PointerEvent<HTMLCanvasElement>) => {
    pointersRef.current.delete(event.pointerId);
    gestureRef.current = null;
    dragRef.current = null;
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={640}
        height={640}
        autoFocus
        tabIndex={0}
        role="img"
        aria-label="正方形照片裁切區；可拖曳或使用方向鍵平移，並以加減鍵縮放"
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        className="aspect-square w-full touch-none rounded-xl bg-slate-100 object-cover outline-none ring-emerald-500 focus:ring-2"
      />
      {loadedUrl !== source.url && <p className="mt-2 text-xs text-slate-500" aria-live="polite">正在載入裁切預覽…</p>}
      <div className="mt-3 flex items-center gap-3">
        <button type="button" onClick={() => nudgeZoom(-0.1)} disabled={value.zoom <= 1} className="rounded-lg border border-slate-200 p-2 disabled:opacity-40" aria-label="縮小照片">
          <Minus size={16} />
        </button>
        <label className="min-w-0 flex-1 text-xs font-semibold text-slate-600">
          縮放 {Math.round(value.zoom * 100)}%
          <input
            type="range"
            min={1}
            max={maxZoom}
            step={0.01}
            value={value.zoom}
            onChange={(event) => update({ ...value, zoom: Number(event.target.value) })}
            className="mt-1 w-full accent-emerald-700"
            aria-label="照片縮放比例"
          />
        </label>
        <button type="button" onClick={() => nudgeZoom(0.1)} disabled={value.zoom >= maxZoom} className="rounded-lg border border-slate-200 p-2 disabled:opacity-40" aria-label="放大照片">
          <Plus size={16} />
        </button>
      </div>
      <div className="mt-3 flex items-center gap-3 rounded-xl bg-slate-50 p-3">
        <canvas ref={cardPreviewRef} width={76} height={76} className="h-[76px] w-[76px] rounded-lg" aria-label="76×76 卡片預覽" role="img" />
        <p className="text-xs leading-relaxed text-slate-600"><strong className="block text-slate-800">76×76 卡片預覽</strong>100% 顯示完整原圖，非正方形空間使用同一照片的模糊背景。</p>
      </div>
      <p className="mt-2 text-xs text-slate-500">拖曳調整位置；手機可拖曳或雙指縮放，鍵盤可使用方向鍵與加減鍵。縮放範圍為 100%～250%。</p>
    </div>
  );
};
