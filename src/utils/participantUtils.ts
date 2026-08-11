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
