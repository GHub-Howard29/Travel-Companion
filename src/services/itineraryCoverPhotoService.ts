import type { SupabaseClient } from "@supabase/supabase-js";
import type { ItineraryCoverPhoto } from "../types";
import type { CommonsPhotoCandidate } from "./travelRouteService";
import {
  ITINERARY_COVER_BUCKET,
  MAX_ITINERARY_COVER_BYTES,
  MAX_ITINERARY_COVER_EDGE,
} from "../constants/appConstants";

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
): Promise<{ blob: Blob; width: number; height: number }> => {
  const response = await fetch(candidate.thumbnailUrl, { cache: "no-store" });
  if (!response.ok) throw new Error("照片下載失敗，請改選其他照片。 ");
  const sourceBlob = await response.blob();
  const bitmap = await createImageBitmap(sourceBlob);
  const scale = Math.min(1, MAX_ITINERARY_COVER_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("目前裝置無法處理照片。 ");
  context.drawImage(bitmap, 0, 0, width, height);
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
): Promise<ItineraryCoverPhoto> => {
  const compressed = await compressCommonsPhoto(candidate);
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
