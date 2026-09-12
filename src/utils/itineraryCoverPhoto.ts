import type { ItineraryCoverPhoto, TripDetail } from "../types";
import {
  ITINERARY_COVER_BUCKET,
  MAX_ITINERARY_COVER_BYTES,
} from "../constants/appConstants.ts";

const HTTPS_URL = /^https:\/\/[^\s]+$/i;
const STORAGE_PATH = /^s_[0-9a-f]+\/s_[0-9a-f]+\/[0-9a-f-]{20,}\.webp$/;

export const isItineraryCoverPhoto = (
  value: unknown,
): value is ItineraryCoverPhoto => {
  if (!value || typeof value !== "object") return false;
  const photo = value as Partial<ItineraryCoverPhoto>;
  return photo.source === "wikimedia-commons" &&
    typeof photo.storagePath === "string" && STORAGE_PATH.test(photo.storagePath) &&
    typeof photo.fileTitle === "string" && photo.fileTitle.startsWith("File:") &&
    typeof photo.sourcePageUrl === "string" && HTTPS_URL.test(photo.sourcePageUrl) &&
    typeof photo.creator === "string" && Boolean(photo.creator.trim()) &&
    typeof photo.license === "string" && Boolean(photo.license.trim()) &&
    (photo.licenseUrl === undefined || HTTPS_URL.test(photo.licenseUrl)) &&
    typeof photo.selectedAt === "string" && !Number.isNaN(Date.parse(photo.selectedAt)) &&
    photo.modified === true &&
    Number.isSafeInteger(photo.width) && Number(photo.width) > 0 && Number(photo.width) <= 640 &&
    Number.isSafeInteger(photo.height) && Number(photo.height) > 0 && Number(photo.height) <= 640 &&
    photo.mime === "image/webp" &&
    Number.isSafeInteger(photo.size) && Number(photo.size) > 0 && Number(photo.size) <= MAX_ITINERARY_COVER_BYTES;
};

export const sanitizeItineraryCoverPhotos = (
  content: TripDetail["content"],
): TripDetail["content"] => {
  let changed = false;
  const daysData = Object.fromEntries(
    Object.entries(content.daysData).map(([day, items]) => [
      day,
      items.map((item) => {
        if (item.coverPhoto === undefined || isItineraryCoverPhoto(item.coverPhoto)) return item;
        changed = true;
        const nextItem = { ...item };
        delete nextItem.coverPhoto;
        return nextItem;
      }),
    ]),
  );
  return changed ? { ...content, daysData } : content;
};

export const getItineraryCoverPaths = (trip: TripDetail): Set<string> =>
  new Set(
    Object.values(trip.content.daysData)
      .flat()
      .map((item) => item.coverPhoto?.storagePath)
      .filter((path): path is string => Boolean(path)),
  );

export const getUnusedItineraryCoverPaths = (
  previous: TripDetail,
  next: TripDetail,
): string[] => {
  const nextPaths = getItineraryCoverPaths(next);
  return [...getItineraryCoverPaths(previous)].filter((path) => !nextPaths.has(path));
};

export const getItineraryCoverPublicUrl = (
  supabaseUrl: string,
  storagePath: string,
): string => `${supabaseUrl}/storage/v1/object/public/${ITINERARY_COVER_BUCKET}/${storagePath}`;
