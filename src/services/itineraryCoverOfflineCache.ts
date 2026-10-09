import type { TripDetail } from "../types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ITINERARY_COVER_BUCKET } from "../constants/appConstants";
import { MAX_ITINERARY_COVER_BYTES } from "../constants/appConstants";
import {
  getItineraryCoverPaths,
  getItineraryCoverPublicUrl,
} from "../utils/itineraryCoverPhoto";

export const ITINERARY_COVER_CACHE_NAME = "travel-companion-itinerary-covers-v1";
export const MAX_ITINERARY_COVER_CACHE_ENTRIES = 250;

const MANIFEST_PREFIX = "itinerary_cover_cache_manifest_v1:";

const manifestKey = (tripId: string): string =>
  `${MANIFEST_PREFIX}${encodeURIComponent(tripId)}`;

const readManifest = (tripId: string): string[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(manifestKey(tripId)) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
};

const writeManifest = (tripId: string, urls: string[]): void => {
  localStorage.setItem(manifestKey(tripId), JSON.stringify([...new Set(urls)].sort()));
};

const isCacheableCoverResponse = (response: Response): boolean => {
  if (!response.ok) return false;
  const contentType = response.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (contentType !== "image/webp") return false;

  const contentLength = Number(response.headers.get("content-length") ?? 0);
  return !contentLength || contentLength <= MAX_ITINERARY_COVER_BYTES;
};

export const syncItineraryCoverOfflineCache = async (
  trip: TripDetail,
  supabase: SupabaseClient,
): Promise<void> => {
  if (!navigator.onLine || !("caches" in window)) return;

  const publicUrl = supabase.storage.from(ITINERARY_COVER_BUCKET).getPublicUrl("_").data.publicUrl;
  const storageBaseUrl = publicUrl.split("/storage/v1/object/public/")[0];
  const paths = [...getItineraryCoverPaths(trip)];
  const desiredUrls = paths.map((path) => getItineraryCoverPublicUrl(storageBaseUrl, path));
  const desiredSet = new Set(desiredUrls);
  const previousUrls = readManifest(trip.id);
  const cache = await caches.open(ITINERARY_COVER_CACHE_NAME);

  await Promise.all(
    previousUrls
      .filter((url) => !desiredSet.has(url))
      .map((url) => cache.delete(url)),
  );

  for (const [index, url] of desiredUrls.entries()) {
    if (await cache.match(url)) continue;

    try {
      const { data, error } = await supabase.storage.from(ITINERARY_COVER_BUCKET).createSignedUrl(paths[index], 3600);
      if (error || !data?.signedUrl) continue;
      const response = await fetch(data.signedUrl, {
        cache: "no-store",
        credentials: "omit",
        redirect: "follow",
      });
      if (!isCacheableCoverResponse(response)) continue;
      const blob = await response.clone().blob();
      if (blob.size <= 0 || blob.size > MAX_ITINERARY_COVER_BYTES) continue;
      await cache.put(url, response);
    } catch (error) {
      console.warn("Failed to preload itinerary cover for offline use", error);
    }
  }

  const cachedRequests = await cache.keys();
  const removableRequests = cachedRequests.filter(
    (request) => !desiredSet.has(request.url),
  );
  const overflow = Math.max(
    0,
    cachedRequests.length - MAX_ITINERARY_COVER_CACHE_ENTRIES,
  );
  if (overflow > 0) {
    await Promise.all(
      removableRequests
        .slice(0, overflow)
        .map((request) => cache.delete(request)),
    );
  }

  writeManifest(trip.id, desiredUrls);
};

export const clearItineraryCoverOfflineCache = async (
  tripId: string,
): Promise<void> => {
  const key = manifestKey(tripId);
  const urls = readManifest(tripId);
  localStorage.removeItem(key);

  if (!("caches" in window) || urls.length === 0) return;
  const cache = await caches.open(ITINERARY_COVER_CACHE_NAME);
  await Promise.all(urls.map((url) => cache.delete(url)));
};
