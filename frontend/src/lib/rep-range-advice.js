import { entryExcluded, entryRoutineId, isBw, isPerSide, modeOf } from './history.js'
import { sessionHistory } from './backfill.js'
import { isAssisted } from './exercises.js'
import { isPyramid } from './pyramid.js'
import { isRestPauseSet, isSideSet, isWarmupRow, modeForSet } from './workout-model.js'

const positive = n => Number.isSafeInteger(n) && n > 0
const rangeOf = cfg => {
  if (!positive(cfg?.reps)) return null
  const min = cfg.repsMin == null ? cfg.reps : cfg.repsMin
  return positive(min) && min <= cfg.reps ? { min, max: cfg.reps } : null
}
const completed = row => row?.done === true && Number.isSafeInteger(row.r) && row.r >= 0

// Advice only: never changes a prescription, a saved session or the next session's rows.
// Unlike lastEntryFor, this deliberately does not borrow another routine's history.
export function repRangeAdvice(state, entry) {
  if (!entry || state.active?.editingWorkoutId != null || entryExcluded(state.active, entry)) return null
  const cfg = { ...entry.target, ...entry.planned, id: entry.id }
  const range = rangeOf(cfg)
  const rid = entryRoutineId(state.active, entry)
  if (!rid || !range || modeOf(cfg) !== 'reps' || isPyramid(cfg) || isAssisted(entry)) return null
  if (cfg.intensifier?.type === 'restpause') return null

  const history = sessionHistory(state).workouts || []
  for (let i = history.length - 1; i >= 0; i--) {
    const workout = history[i]
    const previous = (workout.entries || []).find(en => en.id === entry.id && entryRoutineId(workout, en) === rid)
    if (!previous || entryExcluded(workout, previous)) continue
    if (modeOf({ ...previous.target, id: entry.id }) !== 'reps' || isPyramid(previous.target)) return null
    if (previous.target?.intensifier?.type === 'restpause') return null
    if (previous.target?.side != null && !!previous.target.side !== isPerSide(cfg)) return null
    const oldRange = rangeOf(previous.planned)
    if (oldRange && (oldRange.min !== range.min || oldRange.max !== range.max)) return null

    const rows = (previous.sets || []).filter(row => !isWarmupRow(row) && modeForSet(row, previous.target) === 'reps')
    const expected = positive(previous.target?.sets) ? previous.target.sets
      : positive(previous.planned?.sets) ? previous.planned.sets : rows.length
    // Bonus sets do not decide whether the prescribed work was above/below its range.
    const prescribed = rows.slice(0, expected)
    if (!prescribed.length || prescribed.some(isRestPauseSet)) return null
    if (!isPerSide(cfg) && prescribed.some(isSideSet)) return null
    const values = prescribed.flatMap(row => isSideSet(row)
      ? [row.sides.L, row.sides.R].map(side => ({ row: side, divisor: 2 }))
      : [{ row, divisor: 1 }])
    const done = values.map(value => value.row).filter(completed)
    if (!done.length || (isBw(cfg) && done.every(row => !(row.w > 0)))) return null
    // Explicit side rows store one side; legacy scalar rows store both sides' total.
    const below = values.some(({ row, divisor }) => completed(row) && row.r < range.min / divisor)
    if (below) return { kind: 'decrease', message: 'You fell below the prescribed repetition range last session. Reduce the load until you can complete the prescribed range.' }

    // One completed prescribed set is enough. A unilateral set is the pair: both sides
    // must be completed above their own ceiling, rather than masking the weaker side.
    const above = prescribed.some(row => isSideSet(row)
      ? [row.sides.L, row.sides.R].every(side => completed(side) && side.r > range.max / 2)
      : completed(row) && row.r > range.max)
    return above
      ? { kind: 'increase', message: 'You exceeded the prescribed repetition range last session. Increase the load for this session.' }
      : null
  }
  return null
}
