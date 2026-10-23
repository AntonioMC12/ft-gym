// @vitest-environment happy-dom
// "Repeat today" in a saved workout's sheet (#58): a new freestyle session dated today, seeded
// from this workout; the record itself is left as it is.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRoot } from 'react-dom/client'
import { useStore } from './store/useStore.js'
import { useUI } from './store/useUI.js'
import { workoutDetailSheet } from './sheets.jsx'
import { setNav } from './lib/nav.js'
import { EXDB } from './lib/exercises.js'
import { todayISO } from './lib/format.js'

const mounted = []
const [A, B] = EXDB.filter(e => e.bp !== 'cardio').slice(0, 2).map(e => e.id)
const workout = () => ({
  id: 'w-old', d: '2026-09-10', start: 1, end: 2, name: 'Push', prs: [], routineIds: ['r1'],
  entries: [
    { id: A, rid: 'r1', target: { mode: 'reps', reps: 8, weight: 40 }, sets: [{ w: 45, r: 8, done: true }, { w: 45, r: 7, done: true }] },
    { id: 'deleted-custom', target: { mode: 'reps', reps: 8 }, sets: [{ w: 10, r: 8, done: true }] },
    { id: B, rid: 'r1', target: { mode: 'reps', reps: 10, weight: 30 }, sets: [{ w: 35, r: 10, done: true }] },
  ],
})

function renderTop() {
  const sheet = useUI.getState().sheets.at(-1)
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push(root)
  act(() => root.render(sheet.render(() => useUI.getState().closeSheet(sheet.id))))
  return host
}
const button = (host, label) => [...host.querySelectorAll('button')].find(b => b.textContent.trim() === label)

describe('WorkoutDetail — repeat today', () => {
  let navigated

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    navigated = null
    setNav(to => { navigated = to })
    useUI.setState({ sheets: [], toastMsg: '' })
    useStore.setState(s => ({ S: { ...s.S, workouts: [], routines: [], active: null, weighIn: false } }))
    document.body.innerHTML = ''
  })
  afterEach(() => { act(() => { mounted.splice(0).forEach(root => root.unmount()) }) })

  it('starts a freestyle session today from this workout and leaves the record alone', () => {
    const saved = workout()
    useStore.setState(s => ({ S: { ...s.S, workouts: [saved] } }))
    const host = (workoutDetailSheet(saved), renderTop())
    act(() => { button(host, 'Repeat today').click() })
    const active = useStore.getState().S.active
    expect(active).toMatchObject({ d: todayISO(), routineIds: [], name: 'Push', cur: 0, bw: null })
    expect(active.entries.map(e => e.id)).toEqual([A, B])
    // Fresh rep inputs must be entered again; the saved workout remains untouched below.
    expect(active.entries[0].sets.map(s => [s.w, s.r, s.done])).toEqual([[45, null, false], [45, null, false]])
    expect(active.entries.some(e => 'rid' in e)).toBe(false)
    expect(navigated).toBe('/workout')
    expect(useStore.getState().S.workouts[0]).toEqual(saved)
    expect(useUI.getState().toastMsg).toMatch(/1 exercise no longer exists/)
  })

  it('asks for the weigh-in first when that is on', () => {
    const saved = workout()
    useStore.setState(s => ({ S: { ...s.S, workouts: [saved], weighIn: true } }))
    const host = (workoutDetailSheet(saved), renderTop())
    act(() => { button(host, 'Repeat today').click() })
    expect(useStore.getState().S.active).toBeNull()
    expect(useUI.getState().sheets.length).toBe(1)
    expect(navigated).toBeNull()
  })

  it('is disabled while a workout is running', () => {
    const saved = workout()
    useStore.setState(s => ({ S: { ...s.S, workouts: [saved], active: { id: 'x', d: todayISO(), start: 1, entries: [] } } }))
    const host = (workoutDetailSheet(saved), renderTop())
    expect(button(host, 'Repeat today').disabled).toBe(true)
  })

  it('opens member workout and exercise history sheets with their data and no editing actions',()=>{
    const saved=workout(),member={...useStore.getState().S,unit:'lb',workouts:[saved]},definitions=Object.fromEntries(saved.entries.map(e=>[e.id,{id:e.id,n:'Member '+e.id,eq:'barbell',bp:'chest'}]));
    const before=JSON.stringify(useStore.getState().S);
    workoutDetailSheet(saved,{state:member,definitions});const host=renderTop();
    expect(host.textContent).toContain('Member '+A);expect(host.textContent).toContain('lb');
    for(const label of ['Edit workout','Repeat today','Change date & time','Change duration','Save as routine'])expect(button(host,label)).toBeUndefined();
    expect(host.querySelector('textarea')).toBeNull();
    act(()=>host.querySelector('.wd-ex').click());const history=renderTop();
    expect(history.textContent).toContain('Member '+A);expect(history.textContent).toContain('Exercise history');expect(history.textContent).toContain('lb');
    act(()=>mounted.splice(0).forEach(root=>root.unmount()));expect(JSON.stringify(useStore.getState().S)).toBe(before);
  })
})
