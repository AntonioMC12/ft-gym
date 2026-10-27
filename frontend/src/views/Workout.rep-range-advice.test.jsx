// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DEF, useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { buildSessionEntries } from '../lib/session-start.js'
import { setLang } from '../lib/i18n.js'
import Workout from './Workout.jsx'

vi.mock('../lib/api.js', async load => ({ ...await load(), api: vi.fn(() => Promise.resolve({})), beacon: vi.fn() }))
vi.mock('../lib/sound.js', () => ({ beep: vi.fn(), vibrate: vi.fn(), unlock: vi.fn() }))
globalThis.IS_REACT_ACT_ENVIRONMENT = true
let root, host
beforeEach(async () => {
  await setLang('en')
  Element.prototype.scrollIntoView = vi.fn()
  useUI.setState({ sheets: [], toastMsg: '', timer: null, work: null })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount()); host.remove(); useUI.getState().stopRest()
})
async function render(reps, view = 'cards', extra = {}) {
  const config = { id: '0025', mode: 'reps', weight: 60, sets: 3, repsMin: 12, reps: 15, prog: 'off' }
  const routine = { id: 'routine', name: 'Test', ex: [config] }
  const S = structuredClone(DEF)
  S.routines = [routine]; S.sound = false
  S.workouts = reps ? [{ id: 'previous', d: '2026-10-26', routineIds: ['routine'], entries: [{ id: config.id, rid: 'routine', target: { ...config }, planned: { sets: 3, repsMin: 12, reps: 15 }, sets: reps.map(r => ({ w: 60, r, done: true })) }] }] : []
  S.active = { id: 'current', d: '2026-10-27', start: Date.now(), name: 'Test', cur: 0, routineIds: ['routine'], workoutView: view, entries: buildSessionEntries(S, routine), ...extra }
  useStore.setState({ S, user: null })
  const before = structuredClone(S)
  await act(async () => root.render(<MemoryRouter><Workout /></MemoryRouter>))
  return before
}
for (const view of ['cards', 'list', 'compact', 'focus']) {
  it(`shows the increase notice without changing loads or history in ${view}`, async () => {
    const before = await render([16, 17, 16], view)
    expect(host.querySelectorAll('.rep-load-notice.increase')).toHaveLength(1)
    expect(host.textContent).toContain('Increase the load for this session.')
    expect(useStore.getState().S.workouts).toEqual(before.workouts)
    expect(useStore.getState().S.active.entries).toEqual(before.active.entries)
  })
  it(`shows the decrease notice in ${view}`, async () => {
    await render([15, 11, 13], view)
    expect(host.querySelectorAll('.rep-load-notice.decrease')).toHaveLength(1)
    expect(host.textContent).toContain('Reduce the load until you can complete the prescribed range.')
  })
}
it.each([[[12, 14, 15]], [null]])('does not show a notice without a matching out-of-range result: %s', async reps => {
  await render(reps); expect(host.querySelector('.rep-load-notice')).toBeNull()
})
it('shows the increase notice when only one set exceeds the ceiling', async () => {
  await render([16, 14, 13])
  expect(host.querySelector('.rep-load-notice.increase')).not.toBeNull()
})
it('does not show next-session advice while editing a saved workout', async () => {
  await render([16, 16, 16], 'cards', { editingWorkoutId: 'saved' })
  expect(host.querySelector('.rep-load-notice')).toBeNull()
})
it('renders the requested Spanish message with the real target range', async () => {
  await setLang('es'); await render([16, 16, 16])
  expect(host.querySelector('.rep-load-notice').textContent).toContain('Para esta sesión, sube la carga.')
  expect(host.querySelector('.rep-goal strong').textContent).toBe('12–15')
})
