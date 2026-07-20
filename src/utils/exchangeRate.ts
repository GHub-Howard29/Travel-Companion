import type { TripExchangePurchase, TripExchangeSummary } from "../types";

export const getExchangeSummary = (
  tripId: string,
  purchases: TripExchangePurchase[],
  foreignCurrency: string,
): TripExchangeSummary | null => {
  const matches = purchases.filter((item) => item.foreignCurrency === foreignCurrency);
  const totalTwdAmount = matches.reduce((sum, item) => sum + item.twdAmount, 0);
  const totalForeignAmount = matches.reduce((sum, item) => sum + item.foreignAmount, 0);

  return totalTwdAmount > 0 && totalForeignAmount > 0
    ? {
        tripId,
        baseCurrency: "TWD",
        foreignCurrency,
        totalTwdAmount,
        totalForeignAmount,
        weightedAverageRate: totalTwdAmount / totalForeignAmount,
      }
    : null;
};
