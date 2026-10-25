/** Reviewing is an inspection, not a rewind of the active recording. */
export function captureParkingPracticeCursor({ state, progress, selectedIndex, sampleTime }) {
  return structuredClone({ state, progress, selectedIndex, sampleTime });
}

/** A demonstration detour must not share mutable frames, mirror settings or
 * review data with the parked practice. Explicit new practice discards it. */
export function captureParkingPracticeReturn(snapshot) {
  if (!snapshot?.state || !snapshot?.history?.length) return null;
  return structuredClone({ ...snapshot, kind: 'parking-voice-practice',
    selectedIndex: Math.max(0, Math.min(snapshot.history.length - 1, snapshot.selectedIndex ?? snapshot.history.length - 1)) });
}

export function restoreParkingPracticeReturn(snapshot) {
  return snapshot?.kind === 'parking-voice-practice' ? captureParkingPracticeReturn(snapshot) : null;
}
