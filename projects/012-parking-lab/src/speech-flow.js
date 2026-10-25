/** Complete one lecture without owning vehicle or UI state.
 *
 * playback resolves to 'ended', 'error', or 'cancelled'. Only 'ended' may call
 * onReady; an expired session returns 'cancelled' without any callbacks.
 * onReady must preserve the caller's pause gate. onError may offer retry or an
 * explicit subtitle-only continuation; failure never counts as a finished clip.
 * Both playback and callback rejections are contained. This helper adds no
 * timeout: cancelling the player remains responsible for settling playback.
 *
 * @returns {Promise<'ended'|'error'|'cancelled'>}
 */
export async function finishLecture(playback, { isCurrent = () => true, onReady, onError } = {}) {
  let outcome, cause;
  try { outcome = await playback; }
  catch (error) { outcome = 'error'; cause = error; }

  try {
    if (!isCurrent()) return 'cancelled';
    if (outcome === 'cancelled') return 'cancelled';
    if (outcome === 'ended') {
      await onReady?.();
      return 'ended';
    }
    if (outcome !== 'error') cause = new Error('Lecture playback did not report a valid outcome.');
  } catch (error) { cause = error; }

  // Recheck after an asynchronous callback failure: a retry or mode switch may
  // have replaced this lecture while that callback was pending.
  try { if (!isCurrent()) return 'cancelled'; }
  catch (error) { cause ??= error; }
  try { await onError?.(cause); }
  catch { /* A failed error display must not create an unhandled rejection. */ }
  return 'error';
}
