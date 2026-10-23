import { afterEach, describe, expect, it } from 'vitest'
import { EXIDX, allExercises, byOrigin, exerciseOrigin, isSharedEx, registerCustom, registerShared, retainSharedTraining, portableExerciseState } from './exercises.js'
import { buildSessionEntries } from './session-start.js'
import { buildCompletedWorkout } from './finish-workout.js'
import { repeatSessionEntries } from './session-repeat.js'
import { exerciseMuscleSnapshot, loadOfWorkouts } from './muscles.js'
import { buildPlanBundle, buildTrainingProposal, parsePlan, mergePlan } from './plan-share.js'
import { mergeStates } from './sync-merge.js'
import { convertStateUnit } from './units.js'
const exercise = { id: 'ft_test', n: 'Remo FT', bp: 'back', eq: 'cable', tg: 'lats', primaries: ['lats'], assisted: false, origin: 'platform', revision: 1, archived: false }
const state = () => ({ unit: 'kg', routines: [{ id: 'r', name: 'FT', prog: 'off', ex: [{ id: 'ft_test', sets: 3, reps: 8, weight: 40 }] }], workouts: [], week: { 1: ['r'] }, customEx: [], exWeights: {} })
afterEach(() => { registerShared([]); registerCustom([]) })
describe('shared catalogue training lifecycle', () => {
  it('survives personal reload and account switch without private exercise leakage', () => {
    registerShared([exercise], 'installation-a'); registerCustom([{ id: 'private-a', n: 'Private', custom: true }]);
    registerCustom([{ id: 'private-b', n: 'Other', custom: true }]);
    expect(EXIDX.ft_test.n).toBe('Remo FT'); expect(EXIDX['private-a']).toBeUndefined()
    expect(byOrigin(allExercises(state()), 'platform').map(e => e.id)).toEqual(['ft_test'])
  })
  it('does not grant a badge from imported prefix or origin', () => {
    const forged = { ...exercise, custom: true }; registerCustom([forged]);
    expect(isSharedEx(forged)).toBe(false); expect(exerciseOrigin(forged)).toBe('own')
  })
  it('archived promoted exercises cannot reappear through their private original', () => {
    registerShared([{ ...exercise, archived: true }], 'a'); registerCustom([{ ...exercise, custom: true }]);
    expect(allExercises({ customEx: [{ ...exercise, custom: true }] }).some(e => e.id === exercise.id)).toBe(false)
    expect(EXIDX.ft_test.archived).toBe(true)
    expect(buildSessionEntries(state(), state().routines[0])[0].sets[0].w).toBe(40)
  })
  it('freezes active and historic muscle semantics across edits and archive', () => {
    registerShared([exercise], 'a'); const st = state();
    st.active = { id: 'a', d: '2026-10-23', start: 1000, entries: buildSessionEntries(st, st.routines[0]).map(e => ({ ...e, sets: e.sets.map(s => ({ ...s, done: true })) })) };
    retainSharedTraining(st); const frozen = structuredClone(st.active.entries[0].exerciseSnapshot)
    registerShared([{ ...exercise, revision: 2, n: 'Rename', primaries: ['biceps'], tg: 'biceps' }], 'a'); retainSharedTraining(st)
    expect(st.active.entries[0].exerciseSnapshot).toEqual(frozen)
    const completed = buildCompletedWorkout(st.active, { end: 2000, snapshotFor: e => exerciseMuscleSnapshot(e.exerciseSnapshot) });
    const load = loadOfWorkouts([completed]); expect(load['upper-back']).toBe(3); expect(load.biceps).toBeUndefined()
    registerShared([{ ...exercise, revision: 3, archived: true, primaries: ['biceps'] }], 'a')
    expect(loadOfWorkouts([completed])).toEqual(load)
    expect(repeatSessionEntries({ ...st, workouts: [completed] }, completed).skipped).toBe(0)
  })
  it('retains used definitions for offline startup and repetition without catalogue', () => {
    registerShared([exercise], 'a'); const st = state(); retainSharedTraining(st)
    const entries = buildSessionEntries(st, st.routines[0]).map(e => ({ ...e, sets: e.sets.map(s => ({ ...s, done: true })) }));
    const workout = buildCompletedWorkout({ id: 'w', d: '2026-10-23', start: 1, entries }, { end: 1000 });
    registerShared([]); registerCustom([], st.exerciseDefs)
    expect(repeatSessionEntries({ ...st, workouts: [workout] }, workout).skipped).toBe(0)
    expect(isSharedEx('ft_test')).toBe(false)
  })
  it('exports portable definitions and preserves same-instance IDs but remaps elsewhere', () => {
    registerShared([exercise], 'a'); const source = state(); const before = structuredClone(source)
    const bundle = buildPlanBundle(source, 'FT'); expect(bundle.customEx[0].id).toBe('ft_test')
    const same = { ...state(), routines: [], week: {} }; mergePlan(same, parsePlan(bundle));
    expect(same.routines[0].ex[0].id).toBe('ft_test'); expect(same.customEx).toHaveLength(0)
    registerShared([]); registerCustom([])
    const other = { ...state(), routines: [], week: {} }; const parsed = parsePlan(bundle)
    expect(parsed.dropped).toBe(0); mergePlan(other, parsed)
    expect(other.routines[0].ex[0].id).not.toBe('ft_test'); expect(other.customEx[0].origin).toBeUndefined()
    expect(source).toEqual(before)
  })
  it('backup includes only used definitions and does not carry verified origin', () => {
    registerShared([exercise, { ...exercise, id: 'ft_unused' }], 'a'); const portable = portableExerciseState(state())
    expect(portable.customEx.map(e => e.id)).toEqual(['ft_test']); expect(portable.exerciseDefs).toBeUndefined()
    expect(portable.customEx[0].origin).toBeUndefined()
  })
  it('definition fallback maps merge per exercise instead of losing another device additions', () => {
    const a = { ...state(), _ts: 2, exerciseDefs: { a: { ...exercise, id: 'a' } }, edited: { 'exerciseDefs.a': 2 } }
    const b = { ...state(), _ts: 3, exerciseDefs: { b: { ...exercise, id: 'b' } }, edited: { 'exerciseDefs.b': 3 } }
    expect(Object.keys(mergeStates(a, b).exerciseDefs).sort()).toEqual(['a','b'])
  })
  it('unit conversion preserves shared identifiers and personal source state', () => {
    registerShared([exercise], 'a'); const st = state(), converted = convertStateUnit(st, 'lb')
    expect(converted.routines[0].ex[0].id).toBe(exercise.id); expect(converted.routines[0].ex[0].weight).toBeGreaterThan(40)
    expect(st.routines[0].ex[0].weight).toBe(40)
  })
})


it('proposal payload uses shared IDs without portable definitions or installation fields',()=>{
 registerShared([exercise],'installation-a');const S=state();retainSharedTraining(S);
 const portable=buildPlanBundle(S);expect(portable.customEx).toHaveLength(1);
 const proposal=buildTrainingProposal(S);expect(proposal.customEx).toEqual([]);expect(proposal.catalogueInstance).toBeUndefined();expect(proposal.routines[0].ex[0].id).toBe(exercise.id);
});
it('legacy private admin exercises require selective publication, then retain their IDs in proposals',()=>{
 const privateEx={...exercise,id:'legacy',custom:true};registerCustom([privateEx]);const S=state();S.customEx=[privateEx];S.routines[0].ex[0].id='legacy';
 expect(()=>buildTrainingProposal(S)).toThrow();registerShared([{...exercise,id:'legacy'}],'installation-a');
 expect(buildTrainingProposal(S).routines[0].ex[0].id).toBe('legacy');expect(buildTrainingProposal(S).customEx).toEqual([]);
});
