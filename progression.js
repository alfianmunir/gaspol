/* ============================================================
   Gaspol — auto-progression engine (PRD F3)
   Pure, dependency-free rules. Runs identically in the browser
   (instant, offline) and in the weekly-review Edge Function
   (server-side validation). Keep this file in sync with
   supabase/functions/_shared/progression.ts — same logic.
   ============================================================ */

/** Safe lower bound for any prescribed weight (kg). */
export const MIN_WEIGHT = 0;

/**
 * Did every working set reach the top of the prescribed rep range?
 * @param {{reps:number}[]} sets
 * @param {number} repHigh
 */
export function clearedTopOfRange(sets, repHigh) {
  const working = sets.filter((s) => Number.isFinite(s.reps));
  return working.length > 0 && working.every((s) => s.reps >= repHigh);
}

/**
 * Clean a computed weight to a loadable value (nearest 0.25 kg) without
 * forcing it onto a fixed grid — starting weights (e.g. 64 kg) are rarely
 * multiples of the increment, so grid-snapping would distort the jump.
 * The magnitude of the jump lives in `increment` (compound 2.5 / iso 1 /
 * negative for assisted).
 */
export function roundToStep(weight) {
  return Math.max(MIN_WEIGHT, Math.round(weight * 4) / 4);
}

/**
 * Evaluate the next prescription for one exercise.
 *
 * @param {object} exercise  Row from fit_exercises
 *   { current_weight, increment, is_compound, rep_low, rep_high, target_sets }
 *   `increment` is negative for assisted movements (less assist = progress).
 * @param {Array<{date:string, sets:{weight:number,reps:number}[]}>} sessions
 *   Recent sessions for THIS exercise, oldest → newest (last = most recent).
 * @returns {{action:'increase'|'deload'|'hold', newWeight:number, reason:string}}
 */
export function evaluateProgression(exercise, sessions) {
  const cur = Number(exercise.current_weight) || 0;
  const inc = Number(exercise.increment) || (exercise.is_compound ? 2.5 : 1);
  const last = sessions[sessions.length - 1];

  if (!last || !last.sets || last.sets.length === 0) {
    return { action: 'hold', newWeight: cur, reason: 'No sets logged yet — holding prescription.' };
  }

  // Top-set rule → progress.
  if (clearedTopOfRange(last.sets, exercise.rep_high)) {
    const next = roundToStep(cur + inc);
    const delta = next - cur;
    const verb = delta >= 0 ? `+${delta}` : `${delta}`;
    return {
      action: 'increase',
      newWeight: next,
      reason: `Cleared ${exercise.rep_high} reps on all sets — ${verb} kg next session.`,
    };
  }

  // Stall rule → deload 10% after 2 consecutive non-progressing sessions.
  if (sessions.length >= 2) {
    const prev = sessions[sessions.length - 2];
    const stalledBoth =
      !clearedTopOfRange(last.sets, exercise.rep_high) &&
      !clearedTopOfRange(prev.sets || [], exercise.rep_high) &&
      topWeight(last.sets) <= cur && topWeight(prev.sets || []) <= cur;
    if (stalledBoth) {
      const next = roundToStep(cur * 0.9);
      return {
        action: 'deload',
        newWeight: next,
        reason: `Stalled 2 sessions — deloading 10% to ${next} kg, then rebuild.`,
      };
    }
  }

  return { action: 'hold', newWeight: cur, reason: 'On track — same weight, keep pushing reps.' };
}

function topWeight(sets) {
  return sets.reduce((m, s) => Math.max(m, Number(s.weight) || 0), 0);
}

/**
 * Weekly calorie adjustment (PRD F8). Bounded, one-line reason.
 * @param {number} currentTarget  kcal/day
 * @param {number} weeklyChangeKg  signed weight delta over the week (−=loss)
 * @param {'cut'|'recomp'|'bulk'} goal
 * @param {number} bodyweightKg  for %/wk and safe floor
 */
export function adjustCalories(currentTarget, weeklyChangeKg, goal, bodyweightKg = 75) {
  const pctWeek = (weeklyChangeKg / bodyweightKg) * 100; // signed %
  const SAFE_FLOOR = Math.round(bodyweightKg * 22);       // conservative kcal floor
  let delta = 0;
  let reason = 'Trend on target — calories unchanged.';

  if (goal === 'cut') {
    // aim ~ −0.5%/wk to −0.8%/wk
    if (pctWeek > -0.3) { delta = -75; reason = 'Loss slower than target — trimming the deficit.'; }
    else if (pctWeek < -0.9) { delta = +75; reason = 'Dropping too fast — easing the deficit to protect muscle.'; }
  } else if (goal === 'bulk') {
    if (pctWeek < 0.15) { delta = +75; reason = 'Gain stalled — nudging calories up.'; }
    else if (pctWeek > 0.5) { delta = -75; reason = 'Gaining too fast — dialing back to stay lean.'; }
  } else { // recomp — hold weight
    if (pctWeek > 0.3) { delta = -75; reason = 'Creeping up — small trim to hold weight.'; }
    else if (pctWeek < -0.3) { delta = +75; reason = 'Dropping on a recomp — nudging calories up.'; }
  }

  const next = Math.max(SAFE_FLOOR, currentTarget + delta);
  return { newTarget: next, delta: next - currentTarget, reason };
}
