// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
vi.mock('../../lib/i18n.js', () => ({ t: value => value }))
vi.mock('../../store/useStore.js', () => {
  const state = { user: { id: 'platform' }, config: { centers: { enabled: true } }, S: {} }
  const useStore = selector => selector ? selector(state) : state
  useStore.getState = () => state
  return { useStore }
})
vi.mock('../../lib/centers-api.js', () => ({ platformCenters: vi.fn(), centerDetail: vi.fn(), centerStaff: vi.fn(), centerCommand: vi.fn(), centersMe: vi.fn(), centerAccounts: vi.fn(), centersErrorKey: () => 'error' }))
import { useStore } from '../../store/useStore.js'
import { useCenters } from '../../store/useCenters.js'
import { platformCenters, centerDetail, centerStaff, centerCommand, centersMe } from '../../lib/centers-api.js'
import Centers from './Centers.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let host, root
const center = { id: 'one', name: 'Synthetic center', state: 'active', version: 1, openingHours: { 1: [['08:00', '12:00'], ['16:00', '22:00']] } }
beforeEach(() => {
  vi.clearAllMocks(); useCenters.getState().reset()
  useStore.getState().user = { id: 'platform' }
  useCenters.setState({ ownerUid: 'platform', status: 'ready', centers: [], platformCapabilities: ['centers.manage'] })
  platformCenters.mockResolvedValue({ centers: [center] }); centerDetail.mockResolvedValue({ center }); centerStaff.mockResolvedValue({ staff: [] })
  centersMe.mockResolvedValue({ centers: [], platformCapabilities: ['centers.manage'] })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove(); useCenters.getState().reset() })
const render = () => act(async () => { root.render(<MemoryRouter><Centers /></MemoryRouter>); await Promise.resolve() })
const button = text => [...host.querySelectorAll('button')].find(b => b.textContent === text || b.textContent.endsWith(text))
const click = text => act(async () => { button(text).click(); await Promise.resolve() })
const input = (element, value) => act(() => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
})

it('creates a draft through all wizard steps using one stable request id', async () => {
  centerCommand.mockRejectedValue(new Error('temporary'))
  await render(); await click('New center')
  input(host.querySelector('input'), 'New synthetic center')
  await click('Next'); expect(host.textContent).toContain('Center manager')
  await click('Next'); expect(host.textContent).toContain('Review')
  await click('Create draft'); await click('Create draft')
  expect(centerCommand).toHaveBeenCalledTimes(2)
  const [path, body] = centerCommand.mock.calls[0]
  expect(path).toBe('/api/platform/centers/create'); expect(body.name).toBe('New synthetic center')
  expect(body.managerUid).toBeUndefined(); expect(body.requestId).toBe(centerCommand.mock.calls[1][1].requestId)
})

it('editing the first opening interval preserves the remaining intervals', async () => {
  centerCommand.mockResolvedValue({ center })
  await render(); await click('Center details')
  input(host.querySelector('input[aria-label="Monday From"]'), '09:00')
  await click('Save')
  expect(centerCommand.mock.calls[0][1].openingHours[1]).toEqual([['09:00', '12:00'], ['16:00', '22:00']])
})

it('schedule switches and clearing account search do not submit wizard steps', async () => {
  await render(); await click('New center'); input(host.querySelector('input'),'Synthetic')
  await act(async()=>{host.querySelector('button[role="switch"]').click()})
  expect(host.textContent).toContain('Opening hours')
  await click('Next'); input(host.querySelector('input'),'temporary')
  await act(async()=>{host.querySelector('button[aria-label="Clear"]').click()}); expect(host.textContent).toContain('Center manager')
  expect(host.textContent).not.toContain('Review')
})

it('a trainer sees operational details without platform controls or account lookup', async () => {
  useStore.getState().user = { id: 'trainer' }
  useCenters.setState({ ownerUid: 'trainer', centers: [{ ...center, capabilities: ['center.read'] }], platformCapabilities: [] })
  await render(); await click('Center details')
  expect(button('New center')).toBeUndefined(); expect(button('Save')).toBeUndefined()
  expect(button('Assign manager')).toBeUndefined(); expect(platformCenters).not.toHaveBeenCalled()
  expect(centerStaff).not.toHaveBeenCalled()
})
