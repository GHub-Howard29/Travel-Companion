import { corsHeaders } from "npm:@supabase/supabase-js@2.108.2/cors";

const SOURCE_URL = "https://rate.bot.com.tw/xrt/flcsv/0/day";
const SOURCE_PAGE_URL = "https://rate.bot.com.tw/xrt?Lang=zh-TW";
const SUPPORTED_CURRENCIES = new Set(["JPY", "KRW", "USD", "EUR"]);

const parseCsvLine = (line: string): string[] => {
  const values: string[] = [];
  let value = "";
  let inQuotes = false;

  for (const character of line) {
    if (character === '"') inQuotes = !inQuotes;
    else if (character === "," && !inQuotes) {
      values.push(value.trim());
      value = "";
    } else value += character;
  }
  values.push(value.trim());
  return values;
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

const parseCashSellRateFromCsv = (csv: string, currency: string): number | null => {
  const row = csv.split(/\r?\n/).find((line) => new RegExp(`\\(${currency}\\)`, "i").test(line));
  if (!row) return null;

  const rate = Number.parseFloat(parseCsvLine(row)[2]?.replace(/,/g, ""));
  return Number.isFinite(rate) && rate > 0 ? rate : null;
};

const parseCashSellRateFromPage = (html: string, currency: string): number | null => {
  const currencyPosition = html.search(new RegExp(`\\(${currency}\\)`, "i"));
  if (currencyPosition < 0) return null;

  const rowStart = html.lastIndexOf("<tr", currencyPosition);
  const rowEnd = html.indexOf("</tr>", currencyPosition);
  if (rowStart < 0 || rowEnd < 0) return null;

  const rowText = html.slice(rowStart, rowEnd).replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ");
  const rates = Array.from(rowText.matchAll(/\d+(?:\.\d+)?/g), (match) => Number(match[0]));
  return rates.length >= 2 && rates[1] > 0 ? rates[1] : null;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { currency } = await request.json();
    if (typeof currency !== "string" || !SUPPORTED_CURRENCIES.has(currency)) {
      return json({ error: "Unsupported currency" }, 400);
    }

    const response = await fetch(SOURCE_URL, { headers: { "User-Agent": "Travel Companion reference-rate importer" } });
    const csvRate = response.ok
      ? parseCashSellRateFromCsv(new TextDecoder("big5").decode(await response.arrayBuffer()), currency)
      : null;
    const pageRate = csvRate === null
      ? parseCashSellRateFromPage(await (await fetch(SOURCE_PAGE_URL)).text(), currency)
      : null;
    const rate = csvRate ?? pageRate;
    if (rate === null) return json({ error: `臺灣銀行目前沒有可用的 ${currency} 現金賣出匯率。` }, 502);

    return json({
      currency,
      rate,
      rateType: "cash_sell",
      importedAt: new Date().toISOString(),
      sourceName: "臺灣銀行牌告匯率（現金賣出）",
      sourceUrl: SOURCE_PAGE_URL,
    });
  } catch {
    return json({ error: "參考匯率服務暫時無法使用。" }, 502);
  }
});
