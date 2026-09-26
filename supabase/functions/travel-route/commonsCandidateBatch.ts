export const COMMONS_ELIGIBLE_BATCH_SIZE = 24;
export const COMMONS_BATCH_LOOKAHEAD = 1;
export const COMMONS_BATCH_MAX_RAW_PAGES = 12;

export interface CommonsBatchCandidate {
  fileTitle: string;
}

export interface CommonsRawCandidatePage<TCandidate extends CommonsBatchCandidate, TCursor> {
  candidates: TCandidate[];
  nextCursor: TCursor | null;
}

export interface CommonsEligibleBatchResult<TCandidate extends CommonsBatchCandidate, TCursor> {
  candidates: TCandidate[];
  bufferedCandidates: TCandidate[];
  nextRawCursor: TCursor | null;
  seenFileTitles: string[];
  hasMoreEligibleCandidates: boolean;
  reachedEnd: boolean;
  rawPagesRead: number;
}

interface BuildCommonsEligibleBatchInput<TCandidate extends CommonsBatchCandidate, TCursor> {
  bufferedCandidates?: TCandidate[];
  seenFileTitles?: Iterable<string>;
  rawCursor: TCursor | null;
  fetchRawPage: (cursor: TCursor | null) => Promise<CommonsRawCandidatePage<TCandidate, TCursor>>;
  maxRawPages?: number;
}

/**
 * Assemble one visible Commons batch while looking ahead far enough to prove that
 * a next-batch control is valid. Raw cursors alone are never treated as evidence
 * that another eligible candidate exists.
 */
export const buildCommonsEligibleBatch = async <
  TCandidate extends CommonsBatchCandidate,
  TCursor,
>({
  bufferedCandidates = [],
  seenFileTitles = [],
  rawCursor,
  fetchRawPage,
  maxRawPages = COMMONS_BATCH_MAX_RAW_PAGES,
}: BuildCommonsEligibleBatchInput<TCandidate, TCursor>): Promise<
  CommonsEligibleBatchResult<TCandidate, TCursor>
> => {
  const seen = new Set(seenFileTitles);
  const eligible: TCandidate[] = [];

  for (const candidate of bufferedCandidates) {
    if (seen.has(candidate.fileTitle)) continue;
    seen.add(candidate.fileTitle);
    eligible.push(candidate);
  }

  let cursor = rawCursor;
  let reachedEnd = cursor === null;
  let rawPagesRead = 0;
  const lookaheadTarget = COMMONS_ELIGIBLE_BATCH_SIZE + COMMONS_BATCH_LOOKAHEAD;

  while (
    eligible.length < lookaheadTarget &&
    !reachedEnd &&
    rawPagesRead < maxRawPages
  ) {
    const page = await fetchRawPage(cursor);
    rawPagesRead += 1;
    for (const candidate of page.candidates) {
      if (seen.has(candidate.fileTitle)) continue;
      seen.add(candidate.fileTitle);
      eligible.push(candidate);
    }
    cursor = page.nextCursor;
    reachedEnd = cursor === null;
  }

  if (
    !reachedEnd &&
    eligible.length <= COMMONS_ELIGIBLE_BATCH_SIZE &&
    rawPagesRead >= maxRawPages
  ) {
    throw new Error("Commons candidate lookahead limit reached before a next eligible candidate was confirmed.");
  }

  const candidates = eligible.slice(0, COMMONS_ELIGIBLE_BATCH_SIZE);
  const buffered = eligible.slice(COMMONS_ELIGIBLE_BATCH_SIZE);
  const hasMoreEligibleCandidates = buffered.length > 0;

  const displayedSeen = new Set(seenFileTitles);
  candidates.forEach((candidate) => displayedSeen.add(candidate.fileTitle));

  return {
    candidates,
    bufferedCandidates: buffered,
    nextRawCursor: cursor,
    seenFileTitles: [...displayedSeen],
    hasMoreEligibleCandidates,
    reachedEnd: reachedEnd && !hasMoreEligibleCandidates,
    rawPagesRead,
  };
};
