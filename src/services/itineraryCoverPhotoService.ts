import type { SupabaseClient } from "@supabase/supabase-js";
import type { ItineraryCoverPhoto } from "../types";
import type { CommonsPhotoCandidate } from "./travelRouteService";
import {
  ITINERARY_COVER_BUCKET,
  MAX_ITINERARY_COVER_BYTES,
  MAX_ITINERARY_COVER_EDGE,
} from "../constants/appConstants";
import {
  getItineraryCoverCropMaxZoom,
  getItineraryCoverCropRect,
  type ItineraryCoverCropTransform,
} from "../utils/itineraryCoverCrop";

const MAX_SOURCE_PHOTO_BYTES = 2 * 1024 * 1024;
const ALLOWED_SOURCE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

const encodeScope = (value: string): string => {
  const bytes = new TextEncoder().encode(value);
  return `s_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
};

const canvasToBlob = (canvas: HTMLCanvasElement, quality: number): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("無法建立照片檔案。")),
      "image/webp",
      quality,
    );
  });

export const compressCommonsPhoto = async (
  candidate: CommonsPhotoCandidate,
  crop: ItineraryCoverCropTransform,
): Promise<{ blob: Blob; width: number; height: number }> => {
  const isCcBy = /^CC BY (?:1\.0|2\.0|2\.5|3\.0|4\.0)$/i.test(candidate.license.trim());
  if (isCcBy && (!candidate.credit?.trim() || !candidate.licenseUrl?.startsWith("https://"))) {
    throw new Error("照片缺少 CC BY 必要的 credit 或授權連結，請改選其他照片。");
  }
  const requestedUrl = new URL(candidate.cropImageUrl);
  if (requestedUrl.protocol !== "https:" || requestedUrl.hostname !== "upload.wikimedia.org") {
    throw new Error("照片下載位置不符合安全規則，請改選其他照片。");
  }
  const response = await fetch(candidate.cropImageUrl, { cache: "no-store", redirect: "follow" });
  if (!response.ok) throw new Error("照片下載失敗，請改選其他照片。 ");
  const responseUrl = new URL(response.url);
  if (responseUrl.protocol !== "https:" || responseUrl.hostname !== "upload.wikimedia.org") {
    throw new Error("照片下載位置不符合安全規則，請改選其他照片。");
  }
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentLength > MAX_SOURCE_PHOTO_BYTES || !contentType || !ALLOWED_SOURCE_MIME.has(contentType) || contentType !== candidate.thumbnailMime) {
    throw new Error("照片格式或大小不符合儲存規則，請改選其他照片。");
  }
  const sourceBlob = await response.blob();
  if (sourceBlob.size > MAX_SOURCE_PHOTO_BYTES) throw new Error("照片超過 2 MiB，請改選其他照片。");
  const bitmap = await createImageBitmap(sourceBlob);
  if (Math.min(bitmap.width, bitmap.height) < MAX_ITINERARY_COVER_EDGE) {
    bitmap.close();
    throw new Error("照片衍生圖短邊不足 640px，請改選其他照片。");
  }
  const maxZoom = getItineraryCoverCropMaxZoom(bitmap.width, bitmap.height, MAX_ITINERARY_COVER_EDGE);
  const safeCrop = { ...crop, zoom: Math.min(maxZoom, Math.max(1, crop.zoom)) };
  const source = getItineraryCoverCropRect(bitmap.width, bitmap.height, safeCrop);
  if (source.size < MAX_ITINERARY_COVER_EDGE) {
    bitmap.close();
    throw new Error("裁切範圍低於 640px，請降低縮放比例後再試。");
  }
  const width = MAX_ITINERARY_COVER_EDGE;
  const height = MAX_ITINERARY_COVER_EDGE;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("目前裝置無法處理照片。 ");
  context.drawImage(bitmap, source.x, source.y, source.size, source.size, 0, 0, width, height);
  bitmap.close();

  for (const quality of [0.82, 0.72, 0.62, 0.52, 0.42]) {
    const blob = await canvasToBlob(canvas, quality);
    if (blob.size <= MAX_ITINERARY_COVER_BYTES) return { blob, width, height };
  }
  throw new Error("照片壓縮後仍超過 120 KiB，請改選其他照片。 ");
};

export const uploadItineraryCoverPhoto = async (
  supabase: SupabaseClient,
  tripId: string,
  itemId: string,
  candidate: CommonsPhotoCandidate,
  crop: ItineraryCoverCropTransform,
): Promise<ItineraryCoverPhoto> => {
  const compressed = await compressCommonsPhoto(candidate, crop);
  const storagePath = `${encodeScope(tripId)}/${encodeScope(itemId)}/${crypto.randomUUID()}.webp`;
  const { error } = await supabase.storage
    .from(ITINERARY_COVER_BUCKET)
    .upload(storagePath, compressed.blob, { contentType: "image/webp", upsert: false });
  if (error) throw error;
  return {
    source: "wikimedia-commons",
    storagePath,
    fileTitle: candidate.fileTitle,
    sourcePageUrl: candidate.sourcePageUrl,
    creator: candidate.creator,
    credit: candidate.credit,
    license: candidate.license,
    licenseUrl: candidate.licenseUrl,
    sourceSha1: candidate.sourceSha1,
    sourceRevisionAt: candidate.sourceRevisionAt,
    selectedAt: new Date().toISOString(),
    modified: true,
    transformation: /^CC BY(?: |$)/i.test(candidate.license)
      ? "cropped-resized-and-webp-transcoded"
      : undefined,
    width: compressed.width,
    height: compressed.height,
    mime: "image/webp",
    size: compressed.blob.size,
  };
};

export const removeItineraryCoverPaths = async (
  supabase: SupabaseClient,
  paths: Iterable<string>,
): Promise<void> => {
  const uniquePaths = [...new Set(paths)];
  if (uniquePaths.length === 0) return;
  const { error } = await supabase.storage.from(ITINERARY_COVER_BUCKET).remove(uniquePaths);
  if (error) throw error;
};
