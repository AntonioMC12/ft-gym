import { lastEntryFor, modeOf, metricRowsForEntry } from './history.js'
import { entryDbLoad, entryAs, historyAs } from './dumbbells.js'
import { isWarmupRow, isSideSet } from './workout-model.js'
import { isAssisted } from './exercises.js'

const number = v => typeof v === 'number' && Number.isFinite(v) && v >= 0
const valid = s => number(s?.w) && number(s?.r) && s.r > 0
const completed = s => s?.done && valid(s)
const same = (a, b) => Math.abs(a - b) < 1e-6

// Prepared once per exercise/history change. Use sessionHistory at the call site so an
// edited/backfilled session cannot compete against itself or against its future.
export function setFeedbackHistory(S, entry) {
  if (modeOf({ ...entry.target, id: entry.id }) !== 'reps') return null
  const H = historyAs(S, entry.id, entryDbLoad(entry))
  const last = lastEntryFor(H, entry.id, entry.rid)
  const previous = last && modeOf({ ...last.target, id: entry.id }) === 'reps' ? last.sets : []
  const records = (H.workouts || []).flatMap(w => (w.entries || [])
    .filter(en => en.id === entry.id).flatMap(en => metricRowsForEntry(en, 'reps')))
  return { previous, records, assisted: isAssisted(entry.id) }
}

// Colours compare the same working-set ordinal, independently for weight and reps.
// Records compare all routines, only completed working sets and matching laterality.
// Repetition records require at least the earlier load (less help on assisted machines).
export function feedbackForSet(history, entry, index, side, earlierEntries = [], laterEntries = []) {
  if (!history || isWarmupRow(entry.sets[index])) return {}
  const current = entry.sets[index]
  const value = side ? current.sides?.[side] : current
  const ordinal = entry.sets.slice(0, index).filter(s => !isWarmupRow(s)).length
  const priorRow = history.previous[ordinal]
  const prior = side ? priorRow?.sides?.[side] : !isSideSet(priorRow) ? priorRow : null
  const compare = field => !number(value?.[field]) || !number(prior?.[field]) ? null
    : same(value[field], prior[field]) ? 'equal'
      : ((value[field] > prior[field]) !== (field === 'w' && history.assisted)) ? 'higher' : 'lower'
  const result = { w: compare('w'), r: compare('r'), record: false }
  if (!valid(value)) return result
  const earlier = earlierEntries.filter(en => en.id === entry.id)
    .flatMap(en => metricRowsForEntry(entryAs(en, entryDbLoad(entry)), 'reps'))
  const candidates = [...history.records, ...earlier, ...entry.sets.slice(0, index).filter(s => !isWarmupRow(s))]
    .map(s => side ? s.sides?.[side] : !isSideSet(s) ? s : null).filter(completed)
  if (!candidates.length) return result // first session establishes a baseline
  const betterLoad = (a, b) => history.assisted ? a < b && !same(a, b) : a > b && !same(a, b)
  const weightRecord = value.w > 0 && candidates.every(s => betterLoad(value.w, s.w))
  const comparable = candidates.filter(s => same(value.w, s.w) || betterLoad(s.w, value.w))
  const repsRecord = candidates.some(s => same(value.w, s.w)) && comparable.every(s => value.r > s.r)
  // Only the strongest completed set keeps the crown. Later equal sets leave it on
  // the first occurrence; unfinished rows never displace an earned record.
  const later = [...entry.sets.slice(index + 1).filter(s => !isWarmupRow(s)),
    ...laterEntries.filter(en => en.id === entry.id).flatMap(en => metricRowsForEntry(entryAs(en, entryDbLoad(entry)), 'reps'))]
    .map(s => side ? s.sides?.[side] : !isSideSet(s) ? s : null).filter(completed)
  const surpassed = later.some(s => betterLoad(s.w, value.w) || (same(s.w, value.w) && s.r > value.r))
  return { ...result, record: (weightRecord || repsRecord) && !surpassed }
}
