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
): Promise<T> => {
  const { data, error } = await supabase.functions.invoke("travel-route", {
    body,
  });

  if (error) {
    const context = error.context as Response | undefined;
    if (context) {
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
