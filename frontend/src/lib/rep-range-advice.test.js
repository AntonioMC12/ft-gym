import { describe, expect, it } from 'vitest'
import { repRangeAdvice } from './rep-range-advice.js'
import { buildSessionEntries } from './session-start.js'
import { buildCompletedWorkout } from './finish-workout.js'

const cfg = { id: '0025', mode: 'reps', sets: 3, repsMin: 12, reps: 15, weight: 60, prog: 'off' }
const row = (r, extra = {}) => ({ w: 60, r, done: true, ...extra })
const logged = (reps = [16, 17, 16], extra = {}) => ({
  id: 'previous', d: '2026-10-26', routineIds: ['r'],
  entries: [{ id: cfg.id, rid: 'r', target: { ...cfg }, planned: { sets: 3, repsMin: 12, reps: 15 }, sets: reps.map(r => row(r)) }],
  ...extra,
})
const stateFor = (workouts = [logged()], config = cfg) => {
  const routine = { id: 'r', name: 'Test', prog: 'off', ex: [{ ...config }] }
  const state = { unit: 'kg', exWeights: {}, workouts, routines: [routine] }
  const [entry] = buildSessionEntries(state, routine)
  state.active = { id: 'next', d: '2026-10-27', start: new Date('2026-10-27T10:00:00').getTime(), routineIds: ['r'], entries: [entry] }
  return state
}
const advice = state => repRangeAdvice(state, state.active.entries[0])
const previous = state => state.workouts.at(-1).entries[0]

describe('load advice from the previous session in the same routine', () => {
  it('recommends increasing when just one completed prescribed set exceeds the configured ceiling', () => {
    expect(advice(stateFor()).kind).toBe('increase')
    expect(advice(stateFor([logged([16, 15, 16])])).kind).toBe('increase')
    expect(advice(stateFor([logged([16, 14, 13])])).kind).toBe('increase')
  })
  it('uses the real ceiling instead of a hard-coded 15', () => {
    const state = stateFor([logged([11, 11, 12])], { ...cfg, repsMin: 8, reps: 10 })
    previous(state).planned = { repsMin: 8, reps: 10, sets: 3 }
    expect(advice(state).kind).toBe('increase')
  })
  it('recommends reducing if a completed set is below the minimum, even with another above the maximum', () => {
    expect(advice(stateFor([logged([16, 11, 15])])).kind).toBe('decrease')
    expect(advice(stateFor([logged([0, 13, 14])])).kind).toBe('decrease')
  })
  it('does not warn at either inclusive limit or inside the range', () => {
    expect(advice(stateFor([logged([12, 14, 15])]))).toBeNull()
  })
  it('does not treat an unfinished set as zero reps; one completed high set still qualifies', () => {
    const state = stateFor([logged([14, 15, 13])]); previous(state).sets[2] = row(0, { done: false })
    expect(advice(state)).toBeNull()
    previous(state).sets[0].r = 16
    expect(advice(state).kind).toBe('increase')
    previous(state).sets = [row(16), row(16)]
    expect(advice(state).kind).toBe('increase')
  })
  it.each([null, undefined, NaN, Infinity, '16', -1, 15.5])('does not invent a result from invalid repetitions %s', invalid => {
    const state = stateFor([logged([15, 15, 15])]); previous(state).sets[1].r = invalid
    expect(advice(state)).toBeNull()
  })
  it('ignores warm-ups and bonus sets when checking the prescribed work', () => {
    const state = stateFor(); previous(state).sets = [row(2, { phase: 'warmup' }), ...previous(state).sets, row(1)]
    expect(advice(state).kind).toBe('increase')
    previous(state).sets = [row(15), row(14), row(13), row(20)]
    expect(advice(state)).toBeNull()
  })
  it('does not borrow the same exercise from another routine, including a combined workout', () => {
    const state = stateFor([logged(undefined, { entries: [{ ...logged().entries[0], rid: 'other' }] })])
    expect(advice(state)).toBeNull()
    state.workouts[0].entries.push({ ...logged([14, 13, 12]).entries[0] })
    expect(advice(state)).toBeNull()
  })
  it('supports historical single-routine sessions without per-entry routine ids', () => {
    const state = stateFor(); delete previous(state).rid
    expect(advice(state).kind).toBe('increase')
  })
  it('uses the latest matching session rather than an older success', () => {
    expect(advice(stateFor([logged(), logged([13, 14, 12])]))).toBeNull()
    expect(advice(stateFor([logged(), logged([11, 12, 13])])).kind).toBe('decrease')
    const state = stateFor([logged(), logged([16, 16, 16])]); previous(state).sets.forEach(s => { s.done = false })
    expect(advice(state)).toBeNull()
  })
  it('does not carry advice across a changed rep range', () => {
    expect(advice(stateFor([logged()], { ...cfg, repsMin: 8, reps: 10 }))).toBeNull()
  })
  it('works for a fixed repetition target and legacy history without a planned snapshot', () => {
    const state = stateFor([logged([11, 11, 11])], { ...cfg, reps: 10, repsMin: undefined })
    delete previous(state).planned
    expect(advice(state).kind).toBe('increase')
  })
  it('does not combine the sides to hide a weaker side', () => {
    const state = stateFor([], { ...cfg, side: true, repsMin: 24, reps: 30 })
    const entry = { id: cfg.id, rid: 'r', target: { ...cfg, side: true, repsMin: 24, reps: 30 }, sets: Array.from({ length: 3 }, () => ({ done: true, r: 32, sides: { L: row(16), R: row(16) } })) }
    state.workouts = [logged(undefined, { entries: [entry] })]
    expect(advice(state).kind).toBe('increase')
    entry.sets[0].sides.R.r = 11
    expect(advice(state).kind).toBe('decrease')
    entry.sets.forEach(set => { set.sides.R = row(16, { done: false }) })
    expect(advice(state)).toBeNull()
  })
  it('reads legacy unilateral total reps against the total planned range', () => {
    const state = stateFor([logged([32, 34, 32])], { ...cfg, side: true, repsMin: 24, reps: 30 })
    previous(state).target.side = true; delete previous(state).planned
    expect(advice(state).kind).toBe('increase')
  })
  it('skips excluded historical entries and suppresses advice for an excluded current exercise', () => {
    const state = stateFor([logged(), logged([1, 1, 1])]); previous(state).noProg = true
    expect(advice(state).kind).toBe('increase')
    state.active.entries[0].noProg = true
    expect(advice(state)).toBeNull()
  })
  it('does not give generic load advice for timed, assisted, pyramid, unloaded bodyweight or rest-pause work', () => {
    for (const overrides of [{ mode: 'time' }, { assisted: true }, { pyramid: [15, 12, 10] }, { bodyweight: true }, { intensifier: { type: 'restpause' } }]) {
      const state = stateFor([logged()], { ...cfg, ...overrides })
      if (overrides.bodyweight) previous(state).sets.forEach(s => { s.w = 0 })
      expect(advice(state), JSON.stringify(overrides)).toBeNull()
    }
    const state = stateFor(); previous(state).sets[0].type = 'restpause'
    expect(advice(state)).toBeNull()
    previous(state).sets[0].type = 'straight'; previous(state).target.intensifier = { type: 'restpause' }
    expect(advice(state)).toBeNull()
  })
  it('uses history before a backfilled session and does not annotate an edited saved workout', () => {
    const state = stateFor([logged(), logged([1, 1, 1], { d: '2026-10-28' })])
    state.active.backfill = { durationMin: 60 }
    expect(advice(state).kind).toBe('increase')
    delete state.active.backfill; state.active.editingWorkoutId = 'previous'
    expect(advice(state)).toBeNull()
  })
  it('survives the real finish/start boundary without changing saved data or suggested loads', () => {
    const state = stateFor([])
    state.active.entries[0].sets = [row(16), row(17), row(16)]
    const saved = buildCompletedWorkout(state.active, { end: state.active.start + 3600000 })
    state.workouts = [saved]
    state.active.entries = buildSessionEntries(state, state.routines[0])
    const original = structuredClone(state)
    expect(advice(state).kind).toBe('increase')
    expect(state).toEqual(original)
  })
})
