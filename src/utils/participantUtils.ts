export const getParticipantAliasByEmail = (
  email: string | null | undefined,
  participantEmailMap: Record<string, string>,
): string | null => {
  const normalizedEmail = email?.trim().toLowerCase();
  if (!normalizedEmail) return null;

  const matchedEntry = Object.entries(participantEmailMap).find(
    ([participant, participantEmail]) =>
      Boolean(participant.trim()) &&
      participantEmail.trim().toLowerCase() === normalizedEmail,
  );

  return matchedEntry?.[0].trim() || null;
};

export const getExpenseRecorderAlias = (
  recordedByEmail: string | null | undefined,
  payer: string | null | undefined,
  participantEmailMap: Record<string, string>,
): string => {
  const recorderAlias = getParticipantAliasByEmail(
    recordedByEmail,
    participantEmailMap,
  );
  if (recorderAlias) return recorderAlias;

  // V3.4.1 以前的帳目沒有 recorded_by_email，且當時付款人鎖定為登入者，
  // 因此只有這類舊資料可以用付款人代號回填顯示；新資料不可如此推論。
  if (!recordedByEmail?.trim()) {
    return payer?.trim() || "未設定代號";
  }

  return "未設定代號";
};
