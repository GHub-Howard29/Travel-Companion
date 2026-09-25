import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ConfirmedPlace,
  TransitVehicle,
  TravelMode,
} from "../types";

interface FunctionErrorBody {
  error?: string;
}

export interface PlaceCandidate {
  placeId: string;
  displayName: string;
  address?: string;
}

export interface PlaceCandidatePhoto {
  placeId: string;
  photoUri: string;
  authorAttributions: Array<{ displayName: string; uri?: string }>;
}

export interface PlaceCandidatePhotoResult {
  photos: PlaceCandidatePhoto[];
  limitReached: boolean;
}

export interface CommonsPhotoCandidate {
  fileTitle: string;
  thumbnailUrl: string;
  cropImageUrl: string;
  thumbnailMime: "image/jpeg" | "image/png" | "image/webp";
  sourcePageUrl: string;
  creator: string;
  credit?: string;
  license: string;
  licenseUrl?: string;
  sourceSha1?: string;
  sourceRevisionAt?: string;
  width: number;
  height: number;
}

export interface CommonsPhotoBatch {
  candidates: CommonsPhotoCandidate[];
  nextOffset: number | null;
}

export interface CommonsPhotoCategory {
  name: string;
  chineseLabel?: string;
}

export interface CommonsCategoryPhotoBatch {
  candidates: CommonsPhotoCandidate[];
  continuation: string | null;
}

export interface RouteEstimateResult {
  durationSeconds: number;
  distanceMeters: number;
  transitDaytimeFallback?: boolean;
  transitVehicle?: TransitVehicle;
  cached: boolean;
  expiresAt: string;
}

const invokeTravelRoute = async <T>(
  supabase: SupabaseClient,
  body: Record<string, unknown>,
  headers?: Record<string, string>,
): Promise<T> => {
  const { data, error } = await supabase.functions.invoke("travel-route", {
    body,
    ...(headers ? { headers } : {}),
  });

  if (error) {
    const context = error.context;
    if (context instanceof Response) {
      try {
        const payload = (await context.clone().json()) as FunctionErrorBody;
        if (payload.error) throw new Error(payload.error);
      } catch (parseError) {
        if (parseError instanceof Error && parseError.message !== "Unexpected end of JSON input") {
          throw parseError;
        }
      }
    }
    throw new Error(error.message || "地圖服務暫時無法使用。");
  }

  return data as T;
};

export const searchPlaceCandidates = async (
  supabase: SupabaseClient,
  tripId: string,
  input: string,
): Promise<PlaceCandidate[]> => {
  const result = await invokeTravelRoute<{ candidates: PlaceCandidate[] }>(
    supabase,
    { action: "placeAutocomplete", tripId, input },
  );
  return result.candidates;
};

export const getPlaceCandidatePhotos = async (
  supabase: SupabaseClient,
  tripId: string,
  placeIds: string[],
): Promise<PlaceCandidatePhotoResult> =>
  invokeTravelRoute<PlaceCandidatePhotoResult>(supabase, {
    action: "placePhotos",
    tripId,
    placeIds,
  });

export const searchCommonsPhotoCandidates = async (
  supabase: SupabaseClient,
  tripId: string,
  query: string,
  offset = 0,
): Promise<CommonsPhotoBatch> => invokeTravelRoute<CommonsPhotoBatch>(
  supabase, { action: "commonsPhotoSearch", tripId, query, offset },
);

export const getCommonsPhotoCategories = async (
  supabase: SupabaseClient,
  tripId: string,
  fileTitle: string,
): Promise<CommonsPhotoCategory[]> => {
  const result = await invokeTravelRoute<{ categories: CommonsPhotoCategory[] }>(
    supabase, { action: "commonsPhotoCategories", tripId, fileTitle },
  );
  return result.categories;
};

export const getCommonsCategoryPhotos = async (
  supabase: SupabaseClient,
  tripId: string,
  category: string,
  continuation?: string,
): Promise<CommonsCategoryPhotoBatch> => invokeTravelRoute<CommonsCategoryPhotoBatch>(
  supabase, { action: "commonsCategoryPhotos", tripId, category, ...(continuation ? { continuation } : {}) },
);

export const getConfirmedPlace = (
  candidate: PlaceCandidate,
): ConfirmedPlace => ({ placeId: candidate.placeId });

export const getRouteEstimate = async (
  supabase: SupabaseClient,
  input: {
    tripId: string;
    origin: ConfirmedPlace;
    destination: ConfirmedPlace;
    mode: TravelMode;
    departureTime?: string;
    tripDepartureDate: string;
    activeDay: number;
  },
): Promise<RouteEstimateResult> =>
  invokeTravelRoute<RouteEstimateResult>(supabase, {
    action: "routeEstimate",
    ...input,
  });
