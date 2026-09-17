interface ItineraryTimeItem {
  time: string;
}

const ITINERARY_TIME_PATTERN = /^(\d{1,2})(?::|：)(\d{2})$/;
const FOUR_DIGIT_TIME_PATTERN = /^\d{4}$/;

const normalizeFullWidthDigits = (value: string): string =>
  value.replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xfee0));

const parseItineraryTime = (
  value: string,
): { minutes: number; normalized: string } | null => {
  const match = normalizeFullWidthDigits(value.trim()).match(ITINERARY_TIME_PATTERN);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour >= 24 || minute >= 60) return null;

  return {
    minutes: hour * 60 + minute,
    normalized: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  };
};

export type ItineraryTimeValidationResult =
  | { isValid: true; normalized: string }
  | { isValid: false; normalized: string };

export type RequiredItineraryTimeError =
  | "required"
  | "invalid-format"
  | "invalid-range"
  | "before-arrival";

export interface RequiredItineraryTimeRangeValidationResult {
  isValid: boolean;
  arrivalTime: string;
  departureTime: string;
  arrivalError?: RequiredItineraryTimeError;
  departureError?: RequiredItineraryTimeError;
}

export const formatCompleteNumericTimeInput = (value: string): string => {
  const normalizedDigits = normalizeFullWidthDigits(value);
  if (!FOUR_DIGIT_TIME_PATTERN.test(normalizedDigits)) return value;

  const hour = Number(normalizedDigits.slice(0, 2));
  const minute = Number(normalizedDigits.slice(2));
  if (hour >= 24 || minute >= 60) return value;
  return `${normalizedDigits.slice(0, 2)}:${normalizedDigits.slice(2)}`;
};

const validateRequiredTime = (
  value: string,
): { normalized: string; error?: Exclude<RequiredItineraryTimeError, "before-arrival"> } => {
  const trimmedValue = value.trim();
  if (!trimmedValue) return { normalized: "", error: "required" };

  const numericValue = normalizeFullWidthDigits(trimmedValue);
  if (FOUR_DIGIT_TIME_PATTERN.test(numericValue)) {
    const formatted = `${numericValue.slice(0, 2)}:${numericValue.slice(2)}`;
    const result = validateItineraryTime(formatted);
    return result.isValid
      ? { normalized: result.normalized }
      : { normalized: numericValue, error: "invalid-range" };
  }

  const result = validateItineraryTime(trimmedValue);
  return result.isValid
    ? { normalized: result.normalized }
    : { normalized: result.normalized, error: "invalid-format" };
};

export const validateItineraryTime = (value: string): ItineraryTimeValidationResult => {
  const trimmedValue = value.trim();
  if (!trimmedValue) return { isValid: true, normalized: "" };

  const parsed = parseItineraryTime(trimmedValue);
  if (!parsed) return { isValid: false, normalized: trimmedValue };

  return { isValid: true, normalized: parsed.normalized };
};

export const getItineraryTimeValue = (value: string): number | null =>
  parseItineraryTime(value)?.minutes ?? null;

export const isDepartureBeforeArrival = (
  arrivalTime: string,
  departureTime: string,
): boolean => {
  const arrival = parseItineraryTime(arrivalTime);
  const departure = parseItineraryTime(departureTime);
  return Boolean(arrival && departure && departure.minutes < arrival.minutes);
};

export const validateRequiredItineraryTimeRange = (
  arrivalTime: string,
  departureTime: string,
): RequiredItineraryTimeRangeValidationResult => {
  const arrivalResult = validateRequiredTime(arrivalTime);
  const departureResult = validateRequiredTime(departureTime);
  const arrivalError = arrivalResult.error;
  let departureError: RequiredItineraryTimeError | undefined = departureResult.error;

  if (
    !arrivalError &&
    !departureError &&
    isDepartureBeforeArrival(arrivalResult.normalized, departureResult.normalized)
  ) {
    departureError = "before-arrival";
  }

  return {
    isValid: !arrivalError && !departureError,
    arrivalTime: arrivalResult.normalized,
    departureTime: departureResult.normalized,
    arrivalError,
    departureError,
  };
};

export const normalizeItineraryTime = (value: string): string => {
  return validateItineraryTime(value).normalized;
};

export const sortItineraryItemsByTime = <Item extends ItineraryTimeItem>(
  items: Item[],
): Item[] =>
  items
    .map((item, index) => ({ item, index, time: getItineraryTimeValue(item.time) }))
    .sort((left, right) => {
      if (left.time === null && right.time === null) return left.index - right.index;
      if (left.time === null) return 1;
      if (right.time === null) return -1;
      return left.time - right.time || left.index - right.index;
    })
    .map(({ item }) => item);
