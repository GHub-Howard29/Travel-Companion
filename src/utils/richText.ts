export interface RichTextColorRange {
  start: number;
  end: number;
  color: string;
}

export interface RichTextDocument {
  text: string;
  colors: RichTextColorRange[];
}

export const RICH_TEXT_COLORS = [
  "#dc2626",
  "#ea580c",
  "#ca8a04",
  "#16a34a",
  "#2563eb",
  "#7c3aed",
  "#92400e",
  "#475569",
] as const;

const RICH_TEXT_PREFIX = "::travel-companion-rich-text-v1::";
const DEFAULT_TEXT_COLOR = "#475569";
const VALID_COLOR_SET = new Set<string>(RICH_TEXT_COLORS);

const normalizeColor = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return VALID_COLOR_SET.has(normalized) ? normalized : null;
};

const normalizeRanges = (
  text: string,
  ranges: RichTextColorRange[],
): RichTextColorRange[] => {
  const characterColors = Array<string | null>(text.length).fill(null);

  ranges.forEach((range) => {
    const color = normalizeColor(range.color);
    if (!color || color === DEFAULT_TEXT_COLOR) return;

    const start = Math.max(0, Math.min(text.length, Math.trunc(range.start)));
    const end = Math.max(start, Math.min(text.length, Math.trunc(range.end)));
    for (let index = start; index < end; index += 1) {
      if (text[index] !== "\n") characterColors[index] = color;
    }
  });

  const normalized: RichTextColorRange[] = [];
  let index = 0;
  while (index < characterColors.length) {
    const color = characterColors[index];
    if (!color) {
      index += 1;
      continue;
    }

    let end = index + 1;
    while (end < characterColors.length && characterColors[end] === color) {
      end += 1;
    }
    normalized.push({ start: index, end, color });
    index = end;
  }

  return normalized;
};

export const parseRichText = (value: string): RichTextDocument => {
  if (!value.startsWith(RICH_TEXT_PREFIX)) {
    return { text: value, colors: [] };
  }

  try {
    const payload = JSON.parse(value.slice(RICH_TEXT_PREFIX.length)) as {
      text?: unknown;
      colors?: unknown;
    };
    if (typeof payload.text !== "string" || !Array.isArray(payload.colors)) {
      return { text: value, colors: [] };
    }

    const colors = payload.colors.flatMap((range) => {
      if (!range || typeof range !== "object") return [];
      const candidate = range as Partial<RichTextColorRange>;
      const color = normalizeColor(candidate.color);
      if (
        typeof candidate.start !== "number" ||
        typeof candidate.end !== "number" ||
        !color
      ) {
        return [];
      }
      return [{ start: candidate.start, end: candidate.end, color }];
    });

    return {
      text: payload.text,
      colors: normalizeRanges(payload.text, colors),
    };
  } catch {
    return { text: value, colors: [] };
  }
};

export const serializeRichText = (
  text: string,
  colors: RichTextColorRange[],
): string => {
  const normalizedColors = normalizeRanges(text, colors);
  if (normalizedColors.length === 0) return text;

  return `${RICH_TEXT_PREFIX}${JSON.stringify({ text, colors: normalizedColors })}`;
};

export const getRichTextPlainText = (value: string): string =>
  parseRichText(value).text;

export const trimRichText = (value: string): string => {
  const document = parseRichText(value);
  const leadingLength = document.text.length - document.text.trimStart().length;
  const trimmedText = document.text.trim();
  const trimmedEnd = leadingLength + trimmedText.length;
  const colors = document.colors.flatMap((range) => {
    const start = Math.max(range.start, leadingLength);
    const end = Math.min(range.end, trimmedEnd);
    return end > start
      ? [{ ...range, start: start - leadingLength, end: end - leadingLength }]
      : [];
  });

  return serializeRichText(trimmedText, colors);
};

export const applyRichTextColor = (
  value: string,
  selectionStart: number,
  selectionEnd: number,
  color: string,
): string => {
  const document = parseRichText(value);
  const normalizedColor = normalizeColor(color);
  if (!normalizedColor) return value;

  const start = Math.max(0, Math.min(document.text.length, selectionStart));
  const end = Math.max(start, Math.min(document.text.length, selectionEnd));
  if (start === end) return value;

  const retainedRanges = document.colors.flatMap((range) => {
    if (range.end <= start || range.start >= end) return [range];

    const splitRanges: RichTextColorRange[] = [];
    if (range.start < start) splitRanges.push({ ...range, end: start });
    if (range.end > end) splitRanges.push({ ...range, start: end });
    return splitRanges;
  });

  if (normalizedColor !== DEFAULT_TEXT_COLOR) {
    retainedRanges.push({ start, end, color: normalizedColor });
  }

  return serializeRichText(document.text, retainedRanges);
};

export const getRichTextRuns = (
  value: string,
  start = 0,
  end?: number,
): Array<{ text: string; color?: string }> => {
  const document = parseRichText(value);
  const safeStart = Math.max(0, Math.min(document.text.length, start));
  const safeEnd = Math.max(
    safeStart,
    Math.min(document.text.length, end ?? document.text.length),
  );
  const boundaries = new Set([safeStart, safeEnd]);
  document.colors.forEach((range) => {
    if (range.end > safeStart && range.start < safeEnd) {
      boundaries.add(Math.max(safeStart, range.start));
      boundaries.add(Math.min(safeEnd, range.end));
    }
  });

  const points = [...boundaries].sort((left, right) => left - right);
  return points.slice(0, -1).flatMap((point, index) => {
    const nextPoint = points[index + 1];
    const text = document.text.slice(point, nextPoint);
    if (!text) return [];
    const color = document.colors.find(
      (range) => range.start <= point && nextPoint <= range.end,
    )?.color;
    return [{ text, color }];
  });
};
