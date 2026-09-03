/**
 * 可選用的 App 啟動／PWA 更新效能量測。
 *
 * 只在網址帶有 `?app-perf=1` 時啟用。所有量測集中在本檔與少量 mark 呼叫，
 * 不影響一般使用者流程；移除本檔及呼叫點即可完整撤除。
 */

export interface AppPerformanceEntry {
  name: string;
  wallTime: number;
  sinceNavigationMs: number;
  details?: Record<string, unknown>;
}

interface PreviousReloadTrace {
  reloadRequestedAt: number;
  entries: AppPerformanceEntry[];
}

interface AppPerformanceReport {
  enabled: true;
  navigationId: string;
  entries: AppPerformanceEntry[];
  previousReload: PreviousReloadTrace | null;
  navigation: Record<string, number | string> | null;
}

const ENABLE_PARAM = "app-perf";
const RELOAD_TRACE_KEY = "travel_companion_app_performance_reload";
const LOG_PREFIX = "[App Performance]";
const markedMilestones = new Set<string>();

const isBrowser = typeof window !== "undefined";
const enabled =
  isBrowser && new URLSearchParams(window.location.search).get(ENABLE_PARAM) === "1";

const readPreviousReloadTrace = (): PreviousReloadTrace | null => {
  if (!enabled) return null;

  try {
    const value = sessionStorage.getItem(RELOAD_TRACE_KEY);
    sessionStorage.removeItem(RELOAD_TRACE_KEY);
    if (!value) return null;
    const parsed = JSON.parse(value) as PreviousReloadTrace;
    return Array.isArray(parsed.entries) && typeof parsed.reloadRequestedAt === "number"
      ? parsed
      : null;
  } catch (error) {
    console.warn(`${LOG_PREFIX} 無法讀取 reload 前量測。`, error);
    return null;
  }
};

const report: AppPerformanceReport | null = enabled
  ? {
      enabled: true,
      navigationId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      entries: [],
      previousReload: readPreviousReloadTrace(),
      navigation: null,
    }
  : null;

const publishReport = () => {
  if (!report) return;
  (window as Window & { __TRAVEL_APP_PERFORMANCE__?: AppPerformanceReport })
    .__TRAVEL_APP_PERFORMANCE__ = report;
};

export const isAppPerformanceEnabled = () => enabled;

export const recordAppPerformance = (
  name: string,
  details?: Record<string, unknown>,
) => {
  if (!report) return;

  const entry: AppPerformanceEntry = {
    name,
    wallTime: Date.now(),
    sinceNavigationMs: Math.round(performance.now() * 10) / 10,
    ...(details ? { details } : {}),
  };
  report.entries.push(entry);
  publishReport();
  console.info(`${LOG_PREFIX} ${name} ${JSON.stringify(entry)}`);
};

export const markAppPerformance = (
  name: string,
  details?: Record<string, unknown>,
) => {
  if (!report || markedMilestones.has(name)) return;
  markedMilestones.add(name);
  recordAppPerformance(name, details);
};

export const prepareAppPerformanceReload = () => {
  if (!report) return;

  try {
    sessionStorage.setItem(
      RELOAD_TRACE_KEY,
      JSON.stringify({
        reloadRequestedAt: Date.now(),
        entries: report.entries,
      } satisfies PreviousReloadTrace),
    );
  } catch (error) {
    console.warn(`${LOG_PREFIX} 無法保存 reload 前量測。`, error);
  }
};

export const recordNavigationPerformance = () => {
  if (!report) return;

  const navigation = performance.getEntriesByType("navigation")[0] as
    | PerformanceNavigationTiming
    | undefined;
  if (!navigation) return;

  report.navigation = {
    type: navigation.type,
    serviceWorkerStartMs: Math.round(navigation.workerStart * 10) / 10,
    requestStartMs: Math.round(navigation.requestStart * 10) / 10,
    responseStartMs: Math.round(navigation.responseStart * 10) / 10,
    responseEndMs: Math.round(navigation.responseEnd * 10) / 10,
    domInteractiveMs: Math.round(navigation.domInteractive * 10) / 10,
    domContentLoadedMs: Math.round(navigation.domContentLoadedEventEnd * 10) / 10,
    loadEventEndMs: Math.round(navigation.loadEventEnd * 10) / 10,
    reloadGapMs: report.previousReload
      ? Math.max(0, Math.round(performance.timeOrigin - report.previousReload.reloadRequestedAt))
      : 0,
  };
  publishReport();
  console.info(`${LOG_PREFIX} navigation ${JSON.stringify(report.navigation)}`);
};

if (report) {
  publishReport();
  recordAppPerformance("app:module-evaluated", {
    previousReloadEntries: report.previousReload?.entries.length ?? 0,
  });
  const scheduleNavigationMeasurement = () => {
    window.setTimeout(recordNavigationPerformance, 0);
  };
  if (document.readyState === "complete") {
    scheduleNavigationMeasurement();
  } else {
    window.addEventListener("load", scheduleNavigationMeasurement, { once: true });
  }
}
