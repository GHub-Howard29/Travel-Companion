export const formatTwd = (amount: number): string => new Intl.NumberFormat("zh-TW", {
  style: "currency", currency: "TWD", maximumFractionDigits: 0,
}).format(amount);

export const formatForeignAmount = (amount: number, currency: string): string =>
  `${new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 2 }).format(amount)} ${currency}`;

export const formatRate = (rate: number): string => new Intl.NumberFormat("zh-TW", {
  minimumFractionDigits: 3, maximumFractionDigits: 6,
}).format(rate);
