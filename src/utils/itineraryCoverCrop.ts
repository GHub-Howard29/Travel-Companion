export const ITINERARY_COVER_CROP_MIN_ZOOM = 1;
export const ITINERARY_COVER_CROP_MAX_ZOOM = 2.5;

export interface ItineraryCoverCropTransform {
  zoom: number;
  offsetX: number;
  offsetY: number;
}

export interface ItineraryCoverCropRect {
  x: number;
  y: number;
  size: number;
}

export interface ItineraryCoverPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const DEFAULT_ITINERARY_COVER_CROP: ItineraryCoverCropTransform = {
  zoom: ITINERARY_COVER_CROP_MIN_ZOOM,
  offsetX: 0,
  offsetY: 0,
};

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

export const getItineraryCoverCropMaxZoom = (
  width: number,
  height: number,
): number => {
  void width;
  void height;
  return ITINERARY_COVER_CROP_MAX_ZOOM;
};

export const clampItineraryCoverCrop = (
  transform: ItineraryCoverCropTransform,
  maxZoom: number,
): ItineraryCoverCropTransform => ({
  zoom: clamp(transform.zoom, ITINERARY_COVER_CROP_MIN_ZOOM, Math.max(1, maxZoom)),
  offsetX: clamp(transform.offsetX, -1, 1),
  offsetY: clamp(transform.offsetY, -1, 1),
});

export const getItineraryCoverCropRect = (
  width: number,
  height: number,
  transform: ItineraryCoverCropTransform,
): ItineraryCoverCropRect => {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("照片尺寸無效，請改選其他照片。");
  }
  const zoom = Math.max(ITINERARY_COVER_CROP_MIN_ZOOM, transform.zoom);
  const size = Math.min(width, height) / zoom;
  const maxX = width - size;
  const maxY = height - size;
  return {
    x: maxX * ((clamp(transform.offsetX, -1, 1) + 1) / 2),
    y: maxY * ((clamp(transform.offsetY, -1, 1) + 1) / 2),
    size,
  };
};

export const getItineraryCoverPlacement = (
  width: number,
  height: number,
  transform: ItineraryCoverCropTransform,
  outputSize = 640,
): ItineraryCoverPlacement => {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || outputSize <= 0) {
    throw new Error("照片尺寸無效，請改選其他照片。");
  }
  const zoom = clamp(transform.zoom, ITINERARY_COVER_CROP_MIN_ZOOM, ITINERARY_COVER_CROP_MAX_ZOOM);
  const scale = (outputSize / Math.max(width, height)) * zoom;
  const drawWidth = width * scale;
  const drawHeight = height * scale;
  const overflowX = Math.max(0, (drawWidth - outputSize) / 2);
  const overflowY = Math.max(0, (drawHeight - outputSize) / 2);
  return {
    x: (outputSize - drawWidth) / 2 - clamp(transform.offsetX, -1, 1) * overflowX,
    y: (outputSize - drawHeight) / 2 - clamp(transform.offsetY, -1, 1) * overflowY,
    width: drawWidth,
    height: drawHeight,
  };
};

export const getWikimediaDerivativeSize = (
  width: number,
  height: number,
  longestEdge = 1280,
): { width: number; height: number } => {
  const scale = Math.min(1, longestEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
};
