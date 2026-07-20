export interface ExchangeReferenceRate {
  currency: string;
  rate: number;
  rateType: "cash_sell";
  importedAt: string;
  sourceName: string;
  sourceUrl: string;
}

const STORAGE_KEY = "travel_companion_exchange_reference_rates";

const isReferenceRate = (value: unknown): value is ExchangeReferenceRate => {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ExchangeReferenceRate>;
  return typeof item.currency === "string" && typeof item.rate === "number" &&
    Number.isFinite(item.rate) && item.rate > 0 && item.rateType === "cash_sell" &&
    typeof item.importedAt === "string" && typeof item.sourceName === "string" &&
    typeof item.sourceUrl === "string";
};

const readAll = (): Record<string, ExchangeReferenceRate> => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, value]) => isReferenceRate(value)));
  } catch {
    return {};
  }
};

export const readExchangeReferenceRate = (currency: string): ExchangeReferenceRate | null =>
  readAll()[currency] ?? null;

export const writeExchangeReferenceRate = (referenceRate: ExchangeReferenceRate): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    ...readAll(),
    [referenceRate.currency]: referenceRate,
  }));
};
