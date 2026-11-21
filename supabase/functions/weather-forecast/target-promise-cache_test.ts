import { createTargetPromiseCache } from "./target-promise-cache.ts";

Deno.test("concurrent cards sharing place/date reuse one raw target operation", async () => {
  const getTarget = createTargetPromiseCache<{ fetched: number }>();
  let fetchCount = 0;
  const loader = async () => {
    fetchCount += 1;
    await Promise.resolve();
    return { fetched: fetchCount };
  };
  const [firstCard, secondCard] = await Promise.all([
    getTarget("place-a|2026-11-20", loader),
    getTarget("place-a|2026-11-20", loader),
  ]);
  if (fetchCount !== 1 || firstCard !== secondCard) {
    throw new Error("Same place/date should share the in-flight raw forecast");
  }
});

Deno.test("different forecast dates never share raw target operations", async () => {
  const getTarget = createTargetPromiseCache<{ key: string }>();
  let fetchCount = 0;
  const loader = async (key: string) => {
    fetchCount += 1;
    await Promise.resolve();
    return { key };
  };
  const [sameDay, nextDay] = await Promise.all([
    getTarget("place-a|2026-11-20", () => loader("2026-11-20")),
    getTarget("place-a|2026-11-21", () => loader("2026-11-21")),
  ]);
  if (fetchCount !== 2 || sameDay.key === nextDay.key) {
    throw new Error("Different forecast dates must be fetched independently");
  }
});

Deno.test("failed target work is removed so a later request can retry", async () => {
  const getTarget = createTargetPromiseCache<number>();
  let attempts = 0;
  try {
    await getTarget("place-a|2026-11-20", async () => {
      attempts += 1;
      throw new Error("expected");
    });
  } catch { /* expected */ }
  const recovered = await getTarget("place-a|2026-11-20", async () => {
    attempts += 1;
    return 2;
  });
  if (attempts !== 2 || recovered !== 2) throw new Error("Failed target promise was not cleared");
});
