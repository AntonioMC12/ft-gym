import { create } from 'zustand'
import { api, apiBlob, apiUpload } from '../lib/api.js'
import { mediaStore } from '../lib/media-store.js'
import { sha256Hex } from '../lib/sha256.js'
import { registerShared, sharedInstanceId } from '../lib/exercises.js'
let generation = 0
export const useSharedExercises = create((set, get) => ({
  owner: null, server: '', status: 'idle', canManage: false, entries: [], instance: '', rev: 0, error: null,
  reset() { generation++; registerShared([]); set({ owner: null, status: 'idle', canManage: false, entries: [], instance: '', rev: 0 }) },
  async load(uid, server = '') {
    if (!uid) return get().reset()
    const n = ++generation, key = `ft_catalogue:${server || location.origin}`
    if (get().owner !== uid || get().server !== server) {
      registerShared([]); set({ owner: uid, server, status: 'loading', canManage: false, entries: [], instance: '' })
      try { const cached = JSON.parse(localStorage.getItem(key)); if (cached?.instance && Array.isArray(cached.entries)) {
        registerShared(cached.entries, cached.instance); set({ ...cached, status: 'cached', canManage: false })
      } } catch { /* no usable cached catalogue */ }
    }
    try {
      const result = await api('/api/exercises/shared')
      if (n !== generation || get().owner !== uid || get().server !== server) return
      const { entries, instance, rev } = result
      if (!Array.isArray(entries) || !instance) throw new Error('invalid catalogue')
      if (get().instance !== instance || get().rev !== rev) registerShared(entries, instance)
      set({ entries, instance, rev, canManage: !!result.canManage && !result.degraded, status: 'ready', error: null })
      try { localStorage.setItem(key, JSON.stringify({ entries, instance, rev })) } catch { /* quota/offline storage */ }
    } catch (error) {
      if (n !== generation) return
      if ([401,403].includes(error.status)) { get().reset(); return }
      set({ status: get().instance ? 'cached' : 'error', canManage: false, error })
    }
  },
  async save(exercise, existing, requestId) {
    if (!get().canManage || get().status !== 'ready') throw new Error('catalogue-unavailable')
    for (const ref of [exercise.media, exercise.media?.poster].filter(Boolean)) {
      const local = await mediaStore.get(ref.hash)
      if (local) await apiUpload(`/api/exercises/shared/media/${ref.hash}`, local.blob, ref.mime)
      else if (!existing?.media || ![existing.media.hash, existing.media.poster?.hash].includes(ref.hash)) throw new Error('shared-media-missing')
    }
    const result = await api(existing ? `/api/exercises/shared/${existing.id}` : '/api/exercises/shared', {
      method: existing ? 'PATCH' : 'POST', body: JSON.stringify({ exercise, requestId, ...(existing ? { revision: existing.revision } : {}) }) })
    await get().load(get().owner, get().server)
    return result.exercise
  },
  async archive(exercise) {
    await api(`/api/exercises/shared/${exercise.id}/archive`, { method: 'POST', body: JSON.stringify({ revision: exercise.revision, requestId: crypto.randomUUID() }) })
    await get().load(get().owner, get().server)
  }
}))

// Scoped keys prevent a private cached blob (or a different server) authorizing shared display.
export const sharedMediaKey = hash => sha256Hex(new Blob([`shared:${useSharedExercises.getState().server}:${sharedInstanceId()}:${hash}`]))
export async function sharedMediaBlob(ref) {
  const key = await sharedMediaKey(ref.hash), stored = await mediaStore.get(key)
  if (stored) return stored.blob
  const blob = await apiBlob(`/api/exercises/shared/media/${ref.hash}`, { expectSize: ref.size })
  if (await sha256Hex(blob) !== ref.hash) throw new Error('media-hash-mismatch')
  await mediaStore.put(key, blob, { mime: ref.mime, pending: false })
  return blob
}
