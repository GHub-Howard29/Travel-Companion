export const ITINERARY_COVER_CROP_MIN_ZOOM = 1;

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
  minimumCropSize = 640,
): number => Math.max(
  ITINERARY_COVER_CROP_MIN_ZOOM,
  Math.min(width, height) / minimumCropSize,
);

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
