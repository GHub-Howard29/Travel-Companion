import assert from "node:assert/strict";
import { calculateIntervalSummary } from "../supabase/functions/weather-forecast/interval-summary.ts";
import { destinationDayUtcWindow, localMidnightUtcEpoch } from "../supabase/functions/weather-forecast/timezone-utc.ts";

const makeHour = (date, hour, temp, rain, code) => ({
  time: Math.floor(Date.parse(date + "T" + String(hour).padStart(2,"0") + ":00:00Z") / 1000),
  temp, rain, code,
});
const rows = Array.from({ length: 24 }, (_, h) => makeHour("2026-11-20", h, 10+h, h*3, 1));
const hourly = {
  time: rows.map(r => r.time),
  temperature_2m: rows.map(r => r.temp),
  precipitation_probability: rows.map(r => r.rain),
  weather_code: rows.map(r => r.code),
};

function makeCompleteHourlyDay(timezone, date, overrides = {}) {
  const { startEpoch, endEpoch } = destinationDayUtcWindow(date, timezone);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", hourCycle: "h23",
  });
  const occurrences = new Map();
  const result = { time: [], temperature_2m: [], precipitation_probability: [], weather_code: [] };
  for (let epoch = startEpoch; epoch < endEpoch; epoch += 3600) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(epoch * 1000)).map(p => [p.type, p.value]));
    const hour = Number(parts.hour);
    const occurrence = occurrences.get(hour) ?? 0;
    occurrences.set(hour, occurrence + 1);
    const configured = overrides[hour];
    const values = Array.isArray(configured) ? configured[occurrence] ?? {} : configured ?? {};
    const pick = (key, fallback) => Object.prototype.hasOwnProperty.call(values, key) ? values[key] : fallback;
    result.time.push(epoch);
    result.temperature_2m.push(pick("temperature", 10 + hour));
    result.precipitation_probability.push(pick("precipitation", hour * 3));
    result.weather_code.push(pick("code", 1));
  }
  return result;
}

// Both ends included, with minute portions ignored by the caller's hour extraction.
let summary = calculateIntervalSummary(hourly, "UTC", "2026-11-20", 8, 12);
assert.equal(summary.sample_count, 5);
assert.equal(summary.temperature_2m_max, 22);
assert.equal(summary.temperature_2m_min, 18);
assert.equal(summary.precipitation_probability_max, 36);

// A single-hour interval is represented by identical start/end hours.
summary = calculateIntervalSummary(hourly, "UTC", "2026-11-20", 8, 8);
assert.equal(summary.sample_count, 1);
assert.equal(summary.temperature_2m_max, 18);
assert.equal(summary.temperature_2m_min, 18);

// Severe weather is selected even when it occurs only once.
const severeHourly = {
  ...hourly,
  weather_code: hourly.weather_code.map((code, index) => index >= 8 && index <= 12
    ? [1, 1, 95, 1, 1][index - 8]
    : code),
};
summary = calculateIntervalSummary(severeHourly, "UTC", "2026-11-20", 8, 12);
assert.equal(summary.weather_code, 95);

// A higher WMO product priority wins regardless of its frequency.
const priorityHourly = {
  ...hourly,
  weather_code: hourly.weather_code.map((code, index) => index >= 8 && index <= 12
    ? [95, 97, 95, 1, 1][index - 8]
    : code),
};
summary = calculateIntervalSummary(priorityHourly, "UTC", "2026-11-20", 8, 12);
assert.equal(summary.weather_code, 97);

// WMO 99 outranks 97 and 95 according to the approved product priority.
const topPriorityHourly = {
  ...priorityHourly,
  weather_code: priorityHourly.weather_code.map((code, index) => index >= 8 && index <= 12
    ? [95, 97, 99, 95, 97][index - 8]
    : code),
};
summary = calculateIntervalSummary(topPriorityHourly, "UTC", "2026-11-20", 8, 12);
assert.equal(summary.weather_code, 99);

// Unsupported WMO codes do not displace a supported representative code.
const unsupportedHourly = {
  ...hourly,
  weather_code: hourly.weather_code.map((code, index) => index === 8 || index === 9 ? 999 : code),
};
summary = calculateIntervalSummary(unsupportedHourly, "UTC", "2026-11-20", 8, 9);
assert.equal(summary.weather_code, null);

// Null values are never coerced to zero.
const nullHourly = {
  ...hourly,
  temperature_2m: hourly.temperature_2m.map((value, index) => index === 8 ? null : index === 9 ? 20 : value),
  precipitation_probability: hourly.precipitation_probability.map((value, index) => index === 8 ? null : index === 9 ? 40 : value),
  weather_code: hourly.weather_code.map((value, index) => index === 8 ? null : index === 9 ? 3 : value),
};
summary = calculateIntervalSummary(nullHourly, "UTC", "2026-11-20", 8, 9);
assert.equal(summary.temperature_2m_min, 20);
assert.equal(summary.temperature_2m_max, 20);
assert.equal(summary.precipitation_probability_max, 40);
assert.equal(summary.weather_code, 3);

// DST fall-back retains both real instants even though they share local 01:00.
const dstFallHourly = makeCompleteHourlyDay("America/Los_Angeles", "2026-11-01", {
  1: [
    { temperature: 12, precipitation: 20, code: 1 },
    { temperature: 11, precipitation: 40, code: 61 },
  ],
});
summary = calculateIntervalSummary(dstFallHourly, "America/Los_Angeles", "2026-11-01", 1, 1);
assert.equal(summary.sample_count, 2);
assert.equal(summary.temperature_2m_max, 12);
assert.equal(summary.temperature_2m_min, 11);
assert.equal(summary.precipitation_probability_max, 40);
assert.equal(summary.weather_code, 61);

// DST spring-forward has no local 02:00; the interval includes only real timestamps.
const dstSpringHourly = makeCompleteHourlyDay("America/Los_Angeles", "2026-03-08", {
  1: { temperature: 8, precipitation: 10, code: 1 },
  3: { temperature: 10, precipitation: 30, code: 3 },
});
summary = calculateIntervalSummary(dstSpringHourly, "America/Los_Angeles", "2026-03-08", 1, 3);
assert.equal(summary.sample_count, 2);
assert.equal(summary.temperature_2m_max, 10);
assert.equal(summary.temperature_2m_min, 8);

// Filtering uses the requested destination-local calendar date.
const crossDateHourly = makeCompleteHourlyDay("America/Los_Angeles", "2026-11-20", {
  8: { temperature: 5 },
  9: { temperature: 6 },
});
summary = calculateIntervalSummary(crossDateHourly, "America/Los_Angeles", "2026-11-20", 8, 9);
assert.equal(summary.sample_count, 2);
assert.equal(summary.temperature_2m_max, 6);

// Real Open-Meteo response fixture captured for Tokyo on 2026-11-20.
const realTokyoHourly = {
  time: [1795100400,1795104000,1795107600,1795111200,1795114800,1795118400,1795122000,1795125600,1795129200,1795132800,1795136400,1795140000,1795143600,1795147200,1795150800,1795154400,1795158000,1795161600,1795165200,1795168800,1795172400,1795176000,1795179600,1795183200],
  temperature_2m: [10.4,9.9,9.6,9.3,9.3,9.5,9.8,10.2,10.8,11.4,12.0,12.6,13.1,13.2,13.2,13.2,13.4,12.7,11.7,10.6,9.6,8.9,8.3,7.8],
  precipitation_probability: [1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  weather_code: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
};

function destinationDaySamples(hourly, timezone, forecastDate, startEpoch, endEpoch) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", hourCycle: "h23",
  });
  return hourly.time.flatMap((epoch, i) => {
    if (epoch < startEpoch || epoch >= endEpoch) return [];
    const parts = Object.fromEntries(formatter.formatToParts(new Date(epoch * 1000)).map(p => [p.type, p.value]));
    const date = parts.year + "-" + parts.month + "-" + parts.day;
    return date === forecastDate ? [{ epoch, hour: Number(parts.hour), index: i }] : [];
  });
}

function assertDayWindow(timezone, date, expectedHours) {
  const { startEpoch, endEpoch } = destinationDayUtcWindow(date, timezone);
  assert.equal((endEpoch - startEpoch) / 3600, expectedHours);
  return { start: startEpoch * 1000, end: endEpoch * 1000 };
}

assert.throws(() => localMidnightUtcEpoch("2026-02-30", "UTC"), /INVALID_LOCAL_DATE/);
assert.throws(() => localMidnightUtcEpoch("2026-11-20", "Not/A_Real_Zone"), /INVALID_TIME_ZONE/);
assert.throws(() => localMidnightUtcEpoch("2026-1-02", "UTC"), /INVALID_LOCAL_DATE/);
assert.equal(
  new Date(localMidnightUtcEpoch("1970-01-01", "UTC")).toISOString(),
  "1970-01-01T00:00:00.000Z",
);
assert.equal(
  new Date(localMidnightUtcEpoch("2026-11-20", "Asia/Kathmandu")).toISOString(),
  "2026-11-19T18:15:00.000Z",
);

// Real LA spring-forward UTC query: start 08:00Z, end next-day 07:00Z.
// Historical API returns 24 inclusive epochs; half-open filtering retains 23.
const springWindow = assertDayWindow("America/Los_Angeles", "2026-03-08", 23);
assert.equal(new Date(springWindow.start).toISOString(), "2026-03-08T08:00:00.000Z");
assert.equal(new Date(springWindow.end).toISOString(), "2026-03-09T07:00:00.000Z");
const springDayWindow = {
  time: [1772956800,1772960400,1772964000,1772967600,1772971200,1772974800,1772978400,1772982000,1772985600,1772989200,1772992800,1772996400,1773000000,1773003600,1773007200,1773010800,1773014400,1773018000,1773021600,1773025200,1773028800,1773032400,1773036000,1773039600],
  temperature_2m: [18.1,18.0,15.9,15.7,14.6,15.7,14.6,15.9,18.8,22.0,25.1,28.1,29.6,30.9,31.5,31.2,31.2,29.7,27.0,24.1,22.4,21.4,18.7,16.8],
  precipitation_probability: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  weather_code: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
};
const springLocalSamples = destinationDaySamples(springDayWindow, "America/Los_Angeles", "2026-03-08", springWindow.start / 1000, springWindow.end / 1000);
assert.equal(springDayWindow.time.length, 24);
assert.equal(springLocalSamples.length, 23);
assert.equal(springLocalSamples[0].hour, 0);
assert.equal(springLocalSamples.at(-1).hour, 23);
assert.equal(springLocalSamples.some(x => x.hour === 2), false);

// Real LA fall-back UTC query: start 07:00Z, end next-day 08:00Z.
// The API includes the endpoint; excluding endEpoch leaves all 25 real local hours.
const fallWindow = assertDayWindow("America/Los_Angeles", "2026-11-01", 25);
assert.equal(new Date(fallWindow.start).toISOString(), "2026-11-01T07:00:00.000Z");
assert.equal(new Date(fallWindow.end).toISOString(), "2026-11-02T08:00:00.000Z");
const fallDayWindow = {
  time: [1793516400,1793520000,1793523600,1793527200,1793530800,1793534400,1793538000,1793541600,1793545200,1793548800,1793552400,1793556000,1793559600,1793563200,1793566800,1793570400,1793574000,1793577600,1793581200,1793584800,1793588400,1793592000,1793595600,1793599200,1793602800,1793606400],
  temperature_2m: [16.1,15.4,15.6,15.8,15.8,15.6,15.6,15.8,15.7,16.7,18.0,18.2,19.0,20.6,22.0,21.1,21.2,19.6,18.1,17.9,16.3,15.9,14.7,14.4,14.0,13.8],
  precipitation_probability: [42,68,76,64,56,40,24,23,15,10,9,5,2,2,2,1,1,0,0,0,0,0,0,0,0,0],
  weather_code: [63,51,3,51,45,3,3,65,3,1,3,3,2,0,0,1,1,0,0,0,1,0,0,0,1,0],
};
const fallLocalSamples = destinationDaySamples(fallDayWindow, "America/Los_Angeles", "2026-11-01", fallWindow.start / 1000, fallWindow.end / 1000);
assert.equal(fallDayWindow.time.length, 26);
assert.equal(fallLocalSamples.length, 25);
assert.equal(fallLocalSamples.filter(x => x.hour === 1).length, 2);
assert.equal(fallLocalSamples[0].hour, 0);
assert.equal(fallLocalSamples.at(-1).hour, 23);

// Tokyo ordinary local day: 15:00Z to next-day 15:00Z, with 24 local samples.
const tokyoWindow = assertDayWindow("Asia/Tokyo", "2026-11-20", 24);
assert.equal(new Date(tokyoWindow.start).toISOString(), "2026-11-19T15:00:00.000Z");
assert.equal(new Date(tokyoWindow.end).toISOString(), "2026-11-20T15:00:00.000Z");
const tokyoLocalSamples = destinationDaySamples(realTokyoHourly, "Asia/Tokyo", "2026-11-20", tokyoWindow.start / 1000, tokyoWindow.end / 1000);
assert.equal(tokyoLocalSamples.length, 24);

// Kathmandu UTC+05:45 verifies that UTC boundary conversion handles fractional offsets.
const kathmanduWindow = assertDayWindow("Asia/Kathmandu", "2026-11-20", 24);
assert.equal(new Date(kathmanduWindow.start).toISOString(), "2026-11-19T18:15:00.000Z");
assert.equal(new Date(kathmanduWindow.end).toISOString(), "2026-11-20T18:15:00.000Z");
const kathmanduDayWindow = {
  time: [1795112100,1795115700,1795119300,1795122900,1795126500,1795130100,1795133700,1795137300,1795140900,1795144500,1795148100,1795151700,1795155300,1795158900,1795162500,1795166100,1795169700,1795173300,1795176900,1795180500,1795184100,1795187700,1795191300,1795194900,1795198500,1795202100],
  temperature_2m: [12.4,12.2,11.8,11.0,10.0,10.0,11.6,14.2,16.5,18.3,19.9,21.0,22.4,21.6,20.3,18.8,17.4,16.4,15.8,15.2,14.8,14.4,14.0,13.6,13.0,12.2],
  precipitation_probability: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  weather_code: [2,3,3,3,3,3,3,3,3,3,3,3,0,0,0,1,1,1,1,1,0,0,0,0,0,0],
};
const kathmanduLocalSamples = destinationDaySamples(kathmanduDayWindow, "Asia/Kathmandu", "2026-11-20", kathmanduWindow.start / 1000, kathmanduWindow.end / 1000);
assert.equal(kathmanduLocalSamples.length, 24);

summary = calculateIntervalSummary(realTokyoHourly, "Asia/Tokyo", "2026-11-20", 8, 12);
assert.equal(summary.sample_count, 5);
assert.equal(summary.temperature_2m_max, 13.1);
assert.equal(summary.temperature_2m_min, 10.8);
assert.equal(summary.precipitation_probability_max, 0);
assert.equal(summary.weather_code, 0);

// Invalid array lengths, incomplete day payloads, and invalid intervals fail closed.
assert.throws(() => calculateIntervalSummary({ ...hourly, weather_code: [] }, "UTC", "2026-11-20", 8, 12), /HOURLY_ARRAY_LENGTH_MISMATCH/);
const incompleteHourly = {
  ...hourly,
  time: hourly.time.filter((_, index) => index !== 10),
  temperature_2m: hourly.temperature_2m.filter((_, index) => index !== 10),
  precipitation_probability: hourly.precipitation_probability.filter((_, index) => index !== 10),
  weather_code: hourly.weather_code.filter((_, index) => index !== 10),
};
assert.throws(() => calculateIntervalSummary(incompleteHourly, "UTC", "2026-11-20", 8, 12), /HOURLY_DAY_INCOMPLETE/);
const duplicateHourly = {
  ...hourly,
  time: [...hourly.time, hourly.time[10]],
  temperature_2m: [...hourly.temperature_2m, hourly.temperature_2m[10]],
  precipitation_probability: [...hourly.precipitation_probability, hourly.precipitation_probability[10]],
  weather_code: [...hourly.weather_code, hourly.weather_code[10]],
};
assert.throws(() => calculateIntervalSummary(duplicateHourly, "UTC", "2026-11-20", 8, 12), /DUPLICATE_HOURLY_TIMESTAMP/);
assert.throws(() => calculateIntervalSummary(hourly, "UTC", "2026-11-20", 12, 8), /INVALID_INTERVAL/);

console.log("Interval summary fixture tests passed.");
