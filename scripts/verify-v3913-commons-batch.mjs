import assert from "node:assert/strict";

import {
  COMMONS_ELIGIBLE_BATCH_SIZE,
  buildCommonsEligibleBatch,
} from "../supabase/functions/travel-route/commonsCandidateBatch.ts";

const candidate = (id) => ({ fileTitle: `File:${id}.jpg` });

const fromPages = (pages) => async (cursor) => {
  const page = pages[cursor];
  if (!page) throw new Error(`missing page ${cursor}`);
  return {
    candidates: page.candidates,
    nextCursor: page.nextCursor,
  };
};

{
  const result = await buildCommonsEligibleBatch({
    rawCursor: 0,
    fetchRawPage: fromPages([{ candidates: [], nextCursor: null }]),
  });
  assert.equal(result.candidates.length, 0);
  assert.equal(result.hasMoreEligibleCandidates, false);
  assert.equal(result.reachedEnd, true);
}

{
  const result = await buildCommonsEligibleBatch({
    rawCursor: 0,
    fetchRawPage: fromPages([{ candidates: [candidate(1), candidate(2), candidate(3)], nextCursor: null }]),
  });
  assert.equal(result.candidates.length, 3);
  assert.equal(result.hasMoreEligibleCandidates, false);
  assert.equal(result.reachedEnd, true);
}

{
  const exact24 = Array.from({ length: 24 }, (_, index) => candidate(index + 1));
  const result = await buildCommonsEligibleBatch({
    rawCursor: 0,
    fetchRawPage: fromPages([{ candidates: exact24, nextCursor: null }]),
  });
  assert.equal(result.candidates.length, COMMONS_ELIGIBLE_BATCH_SIZE);
  assert.equal(result.bufferedCandidates.length, 0);
  assert.equal(result.hasMoreEligibleCandidates, false);
}

{
  const twentyFive = Array.from({ length: 25 }, (_, index) => candidate(index + 1));
  const result = await buildCommonsEligibleBatch({
    rawCursor: 0,
    fetchRawPage: fromPages([{ candidates: twentyFive, nextCursor: null }]),
  });
  assert.equal(result.candidates.length, 24);
  assert.equal(result.bufferedCandidates.length, 1);
  assert.equal(result.hasMoreEligibleCandidates, true);
}

{
  const first = Array.from({ length: 24 }, (_, index) => candidate(index + 1));
  const second = Array.from({ length: 24 }, (_, index) => candidate(index + 25));
  const result = await buildCommonsEligibleBatch({
    rawCursor: 0,
    fetchRawPage: fromPages([
      { candidates: first, nextCursor: 1 },
      { candidates: second, nextCursor: null },
    ]),
  });
  assert.equal(result.candidates.length, 24);
  assert.equal(result.bufferedCandidates.length, 24);
  assert.equal(result.hasMoreEligibleCandidates, true);
  assert.equal(result.rawPagesRead, 2);

  const next = await buildCommonsEligibleBatch({
    bufferedCandidates: result.bufferedCandidates,
    seenFileTitles: result.seenFileTitles,
    rawCursor: result.nextRawCursor,
    fetchRawPage: async () => {
      throw new Error("buffered next batch should not need another raw page");
    },
  });
  assert.equal(next.candidates.length, 24);
  assert.equal(next.candidates[0].fileTitle, "File:25.jpg");
  assert.equal(next.hasMoreEligibleCandidates, false);
}

{
  const first = Array.from({ length: 24 }, (_, index) => candidate(index + 1));
  const result = await buildCommonsEligibleBatch({
    rawCursor: 0,
    fetchRawPage: fromPages([
      { candidates: first, nextCursor: 1 },
      { candidates: [], nextCursor: 2 },
      { candidates: [], nextCursor: null },
    ]),
  });
  assert.equal(result.candidates.length, 24);
  assert.equal(result.hasMoreEligibleCandidates, false);
  assert.equal(result.reachedEnd, true);
  assert.equal(result.rawPagesRead, 3);
}

{
  const duplicate = candidate(1);
  const result = await buildCommonsEligibleBatch({
    rawCursor: 0,
    seenFileTitles: [duplicate.fileTitle],
    fetchRawPage: fromPages([
      { candidates: [duplicate, candidate(2), candidate(2), candidate(3)], nextCursor: null },
    ]),
  });
  assert.deepEqual(result.candidates.map((entry) => entry.fileTitle), [
    "File:2.jpg",
    "File:3.jpg",
  ]);
}

{
  await assert.rejects(
    () => buildCommonsEligibleBatch({
      rawCursor: 0,
      maxRawPages: 2,
      fetchRawPage: fromPages([
        { candidates: Array.from({ length: 24 }, (_, index) => candidate(index + 1)), nextCursor: 1 },
        { candidates: [], nextCursor: 2 },
      ]),
    }),
    /lookahead limit reached/,
  );
}

{
  await assert.rejects(
    () => buildCommonsEligibleBatch({
      rawCursor: 0,
      fetchRawPage: async () => {
        throw new Error("upstream timeout");
      },
    }),
    /upstream timeout/,
  );
}

console.log("V3.9.13 Commons 可展示批次 0/3/24/25/48+、不合規尾頁、重複、安全上限與來源錯誤 fixture 通過。");
