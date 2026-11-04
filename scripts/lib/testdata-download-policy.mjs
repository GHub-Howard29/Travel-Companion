export function classifyInitialDownload({ hasAppliedBaseline, databaseMatchesCurrent, localDatabaseEmpty }) {
  if (hasAppliedBaseline) return { action: "continue-revision-check" };
  if (databaseMatchesCurrent) return { action: "adopt-current-baseline" };
  if (localDatabaseEmpty) return { action: "stop-unknown-baseline" };
  return { action: "stop-local-data-divergence" };
}
