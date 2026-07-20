import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExchangeReferenceRate } from "../storage/exchangeReferenceRateStorage";

export const fetchTaiwanBankCashSellRate = async (
  supabase: SupabaseClient,
  currency: string,
): Promise<ExchangeReferenceRate> => {
  const { data, error } = await supabase.functions.invoke(
    "taiwan-bank-exchange-rate",
    { body: { currency } },
  );

  if (error) {
    const response = "context" in error && error.context instanceof Response
      ? await error.context.json().catch(() => null)
      : null;
    throw new Error(
      response && typeof response.error === "string"
        ? response.error
        : "無法載入臺灣銀行參考匯率，請稍後再試。",
    );
  }
  if (!data || typeof data.rate !== "number" || !Number.isFinite(data.rate)) {
    throw new Error("臺灣銀行回傳的參考匯率格式不正確。");
  }

  return data as ExchangeReferenceRate;
};
