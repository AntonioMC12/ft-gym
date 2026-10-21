import { describe, it, expect } from 'vitest'
import { setFeedbackHistory, feedbackForSet } from './set-feedback.js'
import { sessionHistory } from './backfill.js'
import { EXDB, isAssisted } from './exercises.js'

const set = (w = 60, r = 10, extra = {}) => ({ w, r, done: true, ...extra })
const entry = (sets, extra = {}) => ({ id: 'bench-test', rid: 'routine', target: { mode: 'reps' }, sets, ...extra })
const workout = (entries, extra = {}) => ({ id: 'old', d: '2026-10-18', routineIds: ['routine'], entries, ...extra })
const feedback = (old, current, index = 0, side, extras = {}) => {
  const en = entry(current, extras)
  return feedbackForSet(setFeedbackHistory({ workouts: [workout([entry(old, extras)])] }, en), en, index, side)
}

describe('live set comparisons and records', () => {
  it('compares weight and reps independently, including ties and empty inputs', () => {
    expect(feedback([set()], [set(65, 9)])).toMatchObject({ w: 'higher', r: 'lower', record: true })
    expect(feedback([set()], [set(60, 10)])).toEqual({ w: 'equal', r: 'equal', record: false })
    expect(feedback([set()], [set(55, 11)])).toMatchObject({ w: 'lower', r: 'higher', record: false })
    expect(feedback([set()], [set(60, null)])).toMatchObject({ r: null, record: false })
    expect(feedback([set()], [set(null, 12)])).toMatchObject({ w: null, record: false })
  })
  it('recognises more reps at a previously logged weight but not a tie', () => {
    expect(feedback([set(60, 10), set(40, 25)], [set(60, 11)])).toMatchObject({ record: true })
    expect(feedback([set(60, 10)], [set(60, 10)])).toMatchObject({ record: false })
    expect(feedback([set(60, 10)], [set(30, 30)])).toMatchObject({ record: false })
  })
  it('does not award a first-ever set, an empty set, or warmups', () => {
    expect(feedback([], [set()])).toEqual({ w: null, r: null, record: false })
    expect(feedback([set()], [set(100, 0)])).toMatchObject({ record: false })
    expect(feedback([set()], [set(100, 12, { warmup: true })])).toEqual({})
    expect(feedback([set(100, 20, { warmup: true }), set(60, 10)], [set(65, 10)])).toMatchObject({ w: 'higher', record: true })
  })
  it('aligns work ordinals across warmups, without inventing references for extra sets', () => {
    expect(feedback([set(60, 10), set(65, 8)], [set(30, 5, { warmup: true }), set(60, 10), set(65, 9)], 2)).toMatchObject({ w: 'equal', r: 'higher' })
    expect(feedback([set()], [set(), set(60, 10)], 1)).toMatchObject({ w: null, r: null })
  })
  it('uses the routine for colours, all routines for records, and ignores unfinished history', () => {
    const en = entry([set(65, 11)])
    const H = { workouts: [workout([entry([set(80, 10)], { rid: 'other' })]), workout([entry([set(), set(200, 10, { done: false })])])] }
    expect(feedbackForSet(setFeedbackHistory(H, en), en, 0)).toEqual({ w: 'higher', r: 'higher', record: false })
  })
  it('accounts for earlier completed sets and repeated exercise entries in this session', () => {
    expect(feedback([set()], [set(65, 10), set(65, 10)], 1)).toMatchObject({ record: false })
    expect(feedback([set()], [set(65, 10, { done: false }), set(65, 10)], 1)).toMatchObject({ record: true })
    const en = entry([set(65, 10)])
    expect(feedbackForSet(setFeedbackHistory({ workouts: [workout([entry([set()])])] }, en), en, 0, undefined, [entry([set(70, 10)])]).record).toBe(false)
  })
  it('compares each side only with that same side and does not mix bilateral sets', () => {
    const old = { sides: { L: set(20, 10), R: set(30, 8) }, done: true }
    const now = { sides: { L: set(20, 11), R: set(25, 8) }, done: true }
    expect(feedback([old], [now], 0, 'L')).toEqual({ w: 'equal', r: 'higher', record: true })
    expect(feedback([old], [now], 0, 'R')).toEqual({ w: 'lower', r: 'equal', record: false })
    expect(feedback([set()], [now], 0, 'L')).toMatchObject({ w: null, record: false })
  })
  it('reverses load comparisons for assistance machines and rewards less help', () => {
    const id = EXDB.find(isAssisted).id
    expect(feedback([set(40, 10)], [set(35, 10)], 0, undefined, { id })).toMatchObject({ w: 'higher', record: true })
    expect(feedback([set(40, 10)], [set(45, 10)], 0, undefined, { id })).toMatchObject({ w: 'lower', record: false })
  })
  it('compares decimal weights without floating-point false records', () => {
    expect(feedback([set(0.3, 10)], [set(0.1 + 0.2, 10)])).toEqual({ w: 'equal', r: 'equal', record: false })
  })
  it('does not compare time or cardio to reps', () => {
    const en = entry([set()], { target: { mode: 'time' } })
    expect(setFeedbackHistory({ workouts: [] }, en)).toBeNull()
    expect(feedbackForSet(null, en, 0)).toEqual({})
  })
  it('uses the session dumbbell meaning for the reference and record', () => {
    const en = entry([set(22, 10)], { target: { mode: 'reps', dbLoad: 'each' } })
    const H = { workouts: [workout([entry([set(40, 10)], { target: { mode: 'reps', dbLoad: 'total' } })])] }
    expect(feedbackForSet(setFeedbackHistory(H, en), en, 0)).toMatchObject({ w: 'higher', record: true })
  })
  it('uses earlier history only in the saved-workout editor', () => {
    const en = entry([set(65, 10)])
    const S = { workouts: [workout([entry([set()])]), workout([en], { id: 'edit', d: '2026-10-19' }), workout([entry([set(100, 10)])], { id: 'future', d: '2026-10-20' })], active: { d: '2026-10-19', editingWorkoutId: 'edit' } }
    expect(feedbackForSet(setFeedbackHistory(sessionHistory(S), en), en, 0)).toMatchObject({ record: true })
  })
})
