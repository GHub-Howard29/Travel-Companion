// Travel-Companion product priority for representative interval weather codes.
// This is a product-defined ordering, not an official WMO severity scale.
const WEATHER_CODE_PRIORITY = Object.freeze({
  99: 28, 97: 27, 96: 26, 95: 25,
  67: 24, 66: 23, 57: 22, 56: 21,
  82: 20, 65: 19, 86: 18, 75: 17,
  55: 16, 81: 15, 63: 14, 73: 13,
  53: 12, 80: 11, 61: 10, 85: 9,
  71: 8, 51: 7, 77: 6, 48: 5,
  45: 4, 3: 3, 2: 2, 1: 1, 0: 0,
});

export const getWeatherCodePriority = (code) =>
  Number.isInteger(code) ? WEATHER_CODE_PRIORITY[code] ?? null : null;

/** Select the highest-priority supported code; frequency never affects the result. */
export const selectRepresentativeWeatherCode = (codes) => {
  let selectedCode = null;
  let selectedPriority = -1;
  for (const code of codes) {
    const priority = getWeatherCodePriority(code);
    if (priority === null) continue;
    if (priority > selectedPriority ||
      (priority === selectedPriority && (selectedCode === null || code < selectedCode))) {
      selectedCode = code;
      selectedPriority = priority;
    }
  }
  return selectedCode;
};
