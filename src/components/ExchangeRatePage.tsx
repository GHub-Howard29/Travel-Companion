import { Calculator, Download, Pencil, Save, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { TripExchangePurchase } from "../types";
import {
  type ExchangeReferenceRate,
  readExchangeReferenceRate,
  writeExchangeReferenceRate,
} from "../storage/exchangeReferenceRateStorage";
import {
  hasInitializedCloudExchangeHistory,
  markCloudExchangeHistoryInitialized,
  readExchangePurchases,
  type ExchangePurchaseStorageScope,
  writeExchangePurchases,
} from "../storage/exchangeRateStorage";
import {
  deleteCloudExchangePurchase,
  getCloudExchangePurchases,
  upsertCloudExchangePurchases,
} from "../services/exchangeRateCloudService";
import { fetchTaiwanBankCashSellRate } from "../services/taiwanBankExchangeRateService";
import { formatForeignAmount, formatRate, formatTwd, formatTwdWithCode } from "../utils/currencyFormat";
import { getExchangeSummary } from "../utils/exchangeRate";

const CURRENCIES = ["JPY", "KRW", "USD", "EUR"];

type PurchaseForm = Pick<
  TripExchangePurchase,
  "foreignCurrency" | "purchaseDate" | "twdAmount" | "foreignAmount"
>;

const today = () => new Date().toISOString().slice(0, 10);

const createForm = (currency: string): PurchaseForm => ({
  foreignCurrency: CURRENCIES.includes(currency) ? currency : "JPY",
  purchaseDate: today(),
  twdAmount: 0,
  foreignAmount: 0,
});

const createId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `exchange-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const formatImportedAt = (value: string) =>
  new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

const formatCalculatorInput = (value: string): string => {
  if (!value) return "";
  const [integer, ...fraction] = value.split(".");
  const groupedInteger = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction.length > 0 ? `${groupedInteger}.${fraction.join("")}` : groupedInteger;
};

const normalizeCalculatorInput = (value: string): string => {
  const normalized = value.replace(/,/g, "").replace(/[^0-9.]/g, "");
  const [integer = "", ...fraction] = normalized.split(".");
  return fraction.length > 0 ? `${integer}.${fraction.join("")}` : integer;
};

interface ExchangeRatePageProps {
  tripId: string;
  defaultForeignCurrency: string;
  supabase: SupabaseClient;
  canSyncCloudHistory: boolean;
}

export const ExchangeRatePage = ({
  tripId,
  defaultForeignCurrency,
  supabase,
  canSyncCloudHistory,
}: ExchangeRatePageProps) => {
  const storageScope: ExchangePurchaseStorageScope = canSyncCloudHistory
    ? "cloud"
    : "local";
  const initialCurrency = CURRENCIES.includes(defaultForeignCurrency)
    ? defaultForeignCurrency
    : "JPY";
  const [purchases, setPurchases] = useState(() =>
    readExchangePurchases(tripId, storageScope),
  );
  const [selectedCurrency, setSelectedCurrency] = useState(initialCurrency);
  const [referenceRate, setReferenceRate] = useState<ExchangeReferenceRate | null>(
    () => readExchangeReferenceRate(initialCurrency),
  );
  const [form, setForm] = useState<PurchaseForm>(() => createForm(initialCurrency));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [calculatorAmount, setCalculatorAmount] = useState("");
  const [isImportingReferenceRate, setIsImportingReferenceRate] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [cloudStatus, setCloudStatus] = useState<
    "local" | "syncing" | "synced" | "error"
  >("local");

  const summary = useMemo(
    () => getExchangeSummary(tripId, purchases, selectedCurrency),
    [purchases, selectedCurrency, tripId],
  );
  const visiblePurchases = useMemo(
    () =>
      purchases
        .filter((item) => item.foreignCurrency === selectedCurrency)
        .sort(
          (a, b) =>
            b.purchaseDate.localeCompare(a.purchaseDate) ||
            b.createdAt.localeCompare(a.createdAt),
        ),
    [purchases, selectedCurrency],
  );
  const hasValidForm =
    form.twdAmount > 0 && form.foreignAmount > 0 && Boolean(form.purchaseDate);
  const calculatorValue = Number(calculatorAmount);
  const hasCalculatorValue =
    calculatorAmount !== "" &&
    Number.isFinite(calculatorValue) &&
    calculatorValue >= 0;
  const canCalculate = Boolean(summary || referenceRate);

  const refreshCloudPurchases = useCallback(async (): Promise<boolean> => {
    if (!canSyncCloudHistory) return false;

    setCloudStatus("syncing");
    const cloudPurchases = await getCloudExchangePurchases(supabase, tripId);
    if (cloudPurchases === null) {
      setCloudStatus("error");
      return false;
    }

    writeExchangePurchases(tripId, cloudPurchases, storageScope);
    setPurchases(cloudPurchases);
    markCloudExchangeHistoryInitialized(tripId);
    setCloudStatus("synced");
    return true;
  }, [canSyncCloudHistory, storageScope, supabase, tripId]);

  useEffect(() => {
    if (!canSyncCloudHistory) return;

    let active = true;
    void (async () => {
      setCloudStatus("syncing");
      const cloudPurchases = await getCloudExchangePurchases(supabase, tripId);
      if (!active) return;
      if (cloudPurchases === null) {
        setCloudStatus("error");
        return;
      }

      const localPurchases = readExchangePurchases(tripId, storageScope);
      const cloudWasInitialized = hasInitializedCloudExchangeHistory(tripId);

      // Once this trip has a cloud history, the server is authoritative. This
      // prevents an older browser cache from recreating a record deleted on
      // another device.
      if (cloudPurchases.length > 0 || cloudWasInitialized) {
        writeExchangePurchases(tripId, cloudPurchases, storageScope);
        setPurchases(cloudPurchases);
        markCloudExchangeHistoryInitialized(tripId);
        setCloudStatus("synced");
        return;
      }

      // The very first successful cloud connection may migrate local records
      // created before cloud history was available. It is a one-time action.
      const synced =
        localPurchases.length === 0 ||
        (await upsertCloudExchangePurchases(supabase, localPurchases));
      if (!active) return;

      if (synced) {
        writeExchangePurchases(tripId, localPurchases, storageScope);
        setPurchases(localPurchases);
        markCloudExchangeHistoryInitialized(tripId);
      }
      setCloudStatus(synced ? "synced" : "error");
    })();

    return () => {
      active = false;
    };
  }, [canSyncCloudHistory, storageScope, supabase, tripId]);

  useEffect(() => {
    if (!canSyncCloudHistory) return;

    const refreshOnFocus = () => {
      void refreshCloudPurchases();
    };
    const channel = supabase
      .channel(`exchange-purchases-${tripId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "exchange_purchases",
          filter: `trip_id=eq.${tripId}`,
        },
        refreshOnFocus,
      )
      .subscribe();

    window.addEventListener("focus", refreshOnFocus);
    return () => {
      window.removeEventListener("focus", refreshOnFocus);
      void supabase.removeChannel(channel);
    };
  }, [canSyncCloudHistory, refreshCloudPurchases, supabase, tripId]);

  const persist = (next: TripExchangePurchase[]) => {
    setPurchases(next);
    writeExchangePurchases(tripId, next, storageScope);
    if (canSyncCloudHistory) {
      setCloudStatus("syncing");
      void upsertCloudExchangePurchases(supabase, next).then((synced) => {
        if (!synced) {
          setCloudStatus("error");
          return;
        }
        void refreshCloudPurchases();
      });
    }
  };

  const resetForm = (currency = selectedCurrency) => {
    setEditingId(null);
    setForm(createForm(currency));
  };

  const updateForm = <K extends keyof PurchaseForm>(
    key: K,
    value: PurchaseForm[K],
  ) => setForm((current) => ({ ...current, [key]: value }));

  const selectCurrency = (currency: string) => {
    setSelectedCurrency(currency);
    setReferenceRate(readExchangeReferenceRate(currency));
    setImportError(null);
    if (!editingId) resetForm(currency);
  };

  const handleImportReferenceRate = async () => {
    setIsImportingReferenceRate(true);
    setImportError(null);
    try {
      const nextReferenceRate = await fetchTaiwanBankCashSellRate(
        supabase,
        selectedCurrency,
      );
      writeExchangeReferenceRate(nextReferenceRate);
      setReferenceRate(nextReferenceRate);
    } catch (error) {
      setImportError(
        error instanceof Error ? error.message : "載入參考匯率失敗，請稍後再試。",
      );
    } finally {
      setIsImportingReferenceRate(false);
    }
  };

  const handleSave = () => {
    if (!hasValidForm) return;

    const now = new Date().toISOString();
    const next = editingId
      ? purchases.map((item) =>
          item.id === editingId ? { ...item, ...form, updatedAt: now } : item,
        )
      : [
          ...purchases,
          {
            id: createId(),
            tripId,
            ...form,
            createdAt: now,
            updatedAt: now,
          },
        ];
    persist(next);
    selectCurrency(form.foreignCurrency);
    resetForm(form.foreignCurrency);
  };

  const handleEdit = (item: TripExchangePurchase) => {
    setEditingId(item.id);
    setSelectedCurrency(item.foreignCurrency);
    setReferenceRate(readExchangeReferenceRate(item.foreignCurrency));
    setForm({
      foreignCurrency: item.foreignCurrency,
      purchaseDate: item.purchaseDate,
      twdAmount: item.twdAmount,
      foreignAmount: item.foreignAmount,
    });
  };

  const handleDelete = (id: string) => {
    if (!window.confirm("確定要刪除這筆換匯紀錄嗎？")) return;

    const next = purchases.filter((item) => item.id !== id);
    setPurchases(next);
    writeExchangePurchases(tripId, next, storageScope);
    if (canSyncCloudHistory) {
      setCloudStatus("syncing");
      void deleteCloudExchangePurchase(supabase, tripId, id).then((deleted) => {
        if (!deleted) {
          setCloudStatus("error");
          return;
        }
        void refreshCloudPurchases();
      });
    }
    if (editingId === id) resetForm();
  };

  return (
    <section className="space-y-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-sky-700">
          Travel Tool
        </p>
        <h2 className="text-2xl font-extrabold text-slate-900">外幣換算</h2>
        <p className="mt-1 text-sm leading-relaxed text-slate-500">
          記錄實際換匯金額，以加權平均匯率估算旅途中的新臺幣花費。
        </p>
      </div>

      {canSyncCloudHistory ? (
        <p className="text-xs font-semibold text-sky-700" aria-live="polite">
          雲端換匯歷史：
          {cloudStatus === "syncing"
            ? "同步中"
            : cloudStatus === "synced"
              ? "已同步"
              : cloudStatus === "error"
                ? "同步失敗，將保留本機資料"
                : "本機"}
        </p>
      ) : (
        <p className="text-xs text-slate-500">換匯紀錄僅保留在此裝置。</p>
      )}

      <div className="rounded-xl border border-sky-100 bg-sky-50 p-4">
        <label className="mb-2 block text-xs font-bold text-sky-900">
          外幣幣別
        </label>
        <select
          value={selectedCurrency}
          onChange={(event) => selectCurrency(event.target.value)}
          className="w-full rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:border-sky-500"
        >
          {CURRENCIES.map((currency) => (
            <option key={currency} value={currency}>
              {currency}
            </option>
          ))}
        </select>

        {summary && (
          <div className="mt-4 rounded-lg bg-white p-3 shadow-sm">
            <p className="text-xs font-bold text-slate-500">目前加權平均匯率</p>
            <p className="mt-1 text-xl font-extrabold text-sky-800">
              1 {selectedCurrency} = {formatRate(summary.weightedAverageRate)} TWD
            </p>
            <p className="mt-1 text-xs text-slate-500">
              累計 {formatTwd(summary.totalTwdAmount)} ÷ {formatForeignAmount(summary.totalForeignAmount, selectedCurrency)}
            </p>
          </div>
        )}

        {referenceRate ? (
          <div className="mt-3 rounded-lg border border-sky-100 bg-white p-3 shadow-sm">
            <p className="text-xs font-bold text-slate-500">最近載入的臺銀參考匯率</p>
            <p className="mt-1 text-xl font-extrabold text-sky-800">
              1 {selectedCurrency} = {formatRate(referenceRate.rate)} TWD
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              {referenceRate.sourceName}・匯入於 {formatImportedAt(referenceRate.importedAt)}
            </p>
          </div>
        ) : (
          <p className="mt-3 text-xs leading-relaxed text-sky-900">
            尚未載入臺銀參考匯率；載入後可離線使用，並與實際換匯紀錄比較。
          </p>
        )}

        <div className="mt-3 border-t border-sky-200 pt-3 text-right">
          <a
            href="https://rate.bot.com.tw/xrt?Lang=zh-TW"
            target="_blank"
            rel="noreferrer"
            className="mr-3 text-xs font-semibold text-sky-700 underline underline-offset-2"
          >
            來源：臺灣銀行牌告匯率
          </a>
          <button
            type="button"
            onClick={() => void handleImportReferenceRate()}
            disabled={isImportingReferenceRate}
            className="inline-flex items-center gap-1.5 rounded-lg border border-sky-300 bg-white px-3 py-2 text-xs font-bold text-sky-800 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Download size={14} />
            {isImportingReferenceRate ? "載入中..." : "載入最新參考匯率"}
          </button>
          {importError && (
          <p role="alert" className="mt-2 text-left text-xs font-semibold text-rose-700">
              無法載入臺灣銀行參考匯率（{importError}）。
            </p>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
        <div className="flex items-center gap-2">
          <Calculator size={18} className="text-amber-700" />
          <h3 className="font-bold text-amber-950">外幣轉新臺幣</h3>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-amber-800">
          輸入金額後，同時比較實際換匯紀錄與最近載入的臺銀參考匯率。
        </p>
        <input
          type="text"
          inputMode="decimal"
          value={formatCalculatorInput(calculatorAmount)}
          onChange={(event) => setCalculatorAmount(normalizeCalculatorInput(event.target.value))}
          onFocus={() => void refreshCloudPurchases()}
          placeholder={`輸入 ${selectedCurrency} 金額`}
          disabled={!canCalculate}
          className="mt-3 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-slate-700 outline-none focus:border-amber-500 disabled:cursor-not-allowed disabled:bg-slate-100"
        />

        {hasCalculatorValue ? (
          <div className="mt-3 grid gap-2">
            <div className="rounded-lg border border-amber-200 bg-white p-3">
              <p className="text-xs font-bold text-amber-800">依換匯紀錄估算</p>
              <p className="mt-1 text-lg font-extrabold text-amber-950">
                {summary
                  ? `${formatForeignAmount(calculatorValue, selectedCurrency)} ≈ ${formatTwdWithCode(calculatorValue * summary.weightedAverageRate)}`
                  : "尚無換匯紀錄"}
              </p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-white p-3">
              <p className="text-xs font-bold text-amber-800">依臺銀公告牌價估算</p>
              <p className="mt-1 text-lg font-extrabold text-amber-950">
                {referenceRate
                  ? `${formatForeignAmount(calculatorValue, selectedCurrency)} ≈ ${formatTwdWithCode(calculatorValue * referenceRate.rate)}`
                  : "尚未載入臺銀參考匯率"}
              </p>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm font-bold text-amber-900">
            {canCalculate ? "輸入金額後即可同時查看兩種估算結果。" : "請先新增換匯紀錄或載入臺銀參考匯率。"}
          </p>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="font-bold text-slate-800">
            {editingId ? "編輯換匯紀錄" : "新增換匯紀錄"}
          </h3>
          {editingId && (
            <button
              type="button"
              onClick={() => resetForm()}
              className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-800"
            >
              <X size={14} />取消編輯
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-semibold text-slate-600">
            日期
            <input
              type="date"
              value={form.purchaseDate}
              onChange={(event) => updateForm("purchaseDate", event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-700 outline-none focus:border-sky-500"
            />
          </label>
          <label className="text-sm font-semibold text-slate-600">
            幣別
            <select
              value={form.foreignCurrency}
              onChange={(event) => updateForm("foreignCurrency", event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-700 outline-none focus:border-sky-500"
            >
              {CURRENCIES.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold text-slate-600">
            支付新臺幣
            <input
              type="text"
              inputMode="decimal"
              value={form.twdAmount ? formatCalculatorInput(String(form.twdAmount)) : ""}
              onChange={(event) => updateForm("twdAmount", Number(normalizeCalculatorInput(event.target.value)))}
              placeholder="例如 20100"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-700 outline-none focus:border-sky-500"
            />
          </label>
          <label className="text-sm font-semibold text-slate-600">
            取得外幣
            <input
              type="text"
              inputMode="decimal"
              value={form.foreignAmount ? formatCalculatorInput(String(form.foreignAmount)) : ""}
              onChange={(event) => updateForm("foreignAmount", Number(normalizeCalculatorInput(event.target.value)))}
              placeholder="例如 100000"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-700 outline-none focus:border-sky-500"
            />
          </label>
        </div>
        <button
          type="button"
          disabled={!hasValidForm}
          onClick={handleSave}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-sky-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          <Save size={16} />
          {editingId ? "儲存變更" : "新增換匯紀錄"}
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-bold text-slate-800">{selectedCurrency} 換匯紀錄</h3>
          <span className="text-xs font-semibold text-slate-400">
            {visiblePurchases.length} 筆
          </span>
        </div>
        {visiblePurchases.length === 0 ? (
          <p className="py-5 text-center text-sm text-slate-400">
            尚無 {selectedCurrency} 換匯紀錄
          </p>
        ) : (
          <div className="space-y-2">
            {visiblePurchases.map((item) => (
              <article key={item.id} className="rounded-lg bg-slate-50 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-slate-800">{item.purchaseDate}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      {formatTwd(item.twdAmount)} → {formatForeignAmount(item.foreignAmount, item.foreignCurrency)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      1 {item.foreignCurrency} = {formatRate(item.twdAmount / item.foreignAmount)} TWD
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => handleEdit(item)}
                      aria-label="編輯換匯紀錄"
                      className="rounded-md p-2 text-slate-500 hover:bg-white hover:text-sky-700"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(item.id)}
                      aria-label="刪除換匯紀錄"
                      className="rounded-md p-2 text-slate-500 hover:bg-white hover:text-rose-700"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
