export interface TripExchangePurchase {
  id: string;
  tripId: string;
  foreignCurrency: string;
  purchaseDate: string;
  twdAmount: number;
  foreignAmount: number;
  createdAt: string;
  updatedAt: string;
}

export interface TripExchangeSummary {
  tripId: string;
  baseCurrency: "TWD";
  foreignCurrency: string;
  totalTwdAmount: number;
  totalForeignAmount: number;
  weightedAverageRate: number;
}
