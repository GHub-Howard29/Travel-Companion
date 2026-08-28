import type { ConfirmedPlace, TravelMode } from "../types";
import { openExternalUrl } from "./browserSecurity";

/**
 * 開啟 Google Maps 地點頁面，供查看評論、照片與其他地點資料。
 */
export const handlePlaceBrowse = (
  location: string,
  place?: ConfirmedPlace,
) => {
  if (!location) return;

  const params = new URLSearchParams({
    api: "1",
    query: location,
  });
  if (place?.placeId) params.set("query_place_id", place.placeId);

  openExternalUrl(`https://www.google.com/maps/search/?${params.toString()}`);
};

export const handleRouteBrowse = (
  origin: ConfirmedPlace,
  originLabel: string,
  destination: ConfirmedPlace,
  destinationLabel: string,
  mode: TravelMode,
) => {
  const params = new URLSearchParams({
    api: "1",
    origin: originLabel,
    destination: destinationLabel,
    travelmode: ({ drive: "driving", walk: "walking", transit: "transit" })[mode],
  });
  if (origin.placeId) params.set("origin_place_id", origin.placeId);
  if (destination.placeId) params.set("destination_place_id", destination.placeId);

  openExternalUrl(`https://www.google.com/maps/dir/?${params.toString()}`);
};

/** @deprecated 改用 handlePlaceBrowse，避免把地點查看誤稱為導航。 */
export const handleNavigate = handlePlaceBrowse;
