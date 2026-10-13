import { create } from 'zustand'
import { centersMe } from '../lib/centers-api.js'

let generation = 0
const empty = () => ({ ownerUid: null, status: 'idle', centers: [], platformCapabilities: [], selectedId: null, error: null })

// Never persist administrative data or inject it into the personal training document.
export const useCenters = create((set, get) => ({
  ...empty(),
  reset() { generation++; set(empty()) },
  select(id) { set({ selectedId: id }) },
  async load(uid) {
    if (!uid) { get().reset(); return }
    const request = ++generation
    const selected = get().ownerUid === uid ? get().selectedId : null
    const preserve = get().ownerUid === uid && get().status === 'ready'
    if (!preserve) set({ ...empty(), ownerUid: uid, status: 'loading' })
    try {
      const result = await centersMe()
      if (request !== generation || get().ownerUid !== uid) return
      const centers = Array.isArray(result.centers) ? result.centers : []
      const platformCapabilities = Array.isArray(result.platformCapabilities) ? result.platformCapabilities : []
      const previous = get()
      const selectedNow = preserve ? previous.selectedId : selected
      set({ status: 'ready', centers: JSON.stringify(previous.centers) === JSON.stringify(centers) ? previous.centers : centers,
        platformCapabilities: JSON.stringify(previous.platformCapabilities) === JSON.stringify(platformCapabilities) ? previous.platformCapabilities : platformCapabilities,
        selectedId: platformCapabilities.includes('centers.manage') || centers.some(c => c.id === selectedNow) ? selectedNow : null })
    } catch (error) {
      if (request !== generation || get().ownerUid !== uid) return
      set({ ...empty(), ownerUid: uid, status: 'unavailable', error })
    }
  },
  revokeOn(error) {
    if ([401, 403, 404].includes(error?.status)) get().reset()
  },
}))
