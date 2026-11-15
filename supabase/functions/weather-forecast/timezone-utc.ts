const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MIN_EPOCH_MS = -8_640_000_000_000_000;
const MAX_EPOCH_MS = 8_640_000_000_000_000;

const parseDate = (date: string) => {
  const match = DATE_PATTERN.exec(date);
  if (!match) throw new RangeError("INVALID_LOCAL_DATE");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || year > 9999) throw new RangeError("INVALID_LOCAL_DATE");
  const epoch = Date.UTC(year, month - 1, day);
  const parsed = new Date(epoch);
  if (
    !Number.isFinite(epoch) ||
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    throw new RangeError("INVALID_LOCAL_DATE");
  }
  return { year, month, day, epoch };
};

const makeFormatter = (timeZone: string) => {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
  } catch {
    throw new RangeError("INVALID_TIME_ZONE");
  }
};

/**
 * Resolve a destination-local calendar date's midnight to a UTC epoch.
 * Uses the Edge runtime's IANA timezone database; never uses the host timezone.
 */
export const localMidnightUtcEpoch = (date: string, timeZone: string): number => {
  const target = parseDate(date);
  const formatter = makeFormatter(timeZone);
  let guess = target.epoch;

  // Offset iteration converges for real-world IANA offsets, including non-hour offsets.
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (!Number.isFinite(guess) || guess < MIN_EPOCH_MS || guess > MAX_EPOCH_MS) {
      throw new RangeError("EPOCH_OUT_OF_RANGE");
    }
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(guess)).map((part) => [part.type, part.value]),
    );
    const localAsUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    const nextGuess = target.epoch - (localAsUtc - guess);
    if (nextGuess === guess) {
      const check = formatter.formatToParts(new Date(guess));
      const values = Object.fromEntries(check.map((part) => [part.type, part.value]));
      if (
        Number(values.year) === target.year &&
        Number(values.month) === target.month &&
        Number(values.day) === target.day &&
        values.hour === "00" &&
        values.minute === "00" &&
        values.second === "00"
      ) return guess;
    }
    guess = nextGuess;
  }
  throw new RangeError("LOCAL_MIDNIGHT_UNRESOLVABLE");
};

/** Return the UTC half-open [start, end) epoch window for one local calendar day. */
export const destinationDayUtcWindow = (date: string, timeZone: string) => {
  const parsed = parseDate(date);
  const nextDate = new Date(parsed.epoch + 86_400_000);
  if (!Number.isFinite(nextDate.getTime())) throw new RangeError("EPOCH_OUT_OF_RANGE");
  const nextLocalDate = nextDate.toISOString().slice(0, 10);
  const startEpoch = localMidnightUtcEpoch(date, timeZone);
  const endEpoch = localMidnightUtcEpoch(nextLocalDate, timeZone);
  if (endEpoch <= startEpoch) throw new RangeError("INVALID_LOCAL_DAY_WINDOW");
  return { startEpoch: startEpoch / 1000, endEpoch: endEpoch / 1000 };
};
