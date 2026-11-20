import { appBase } from './app-base.js'
import { sharedMediaBlob, useSharedExercises } from '../store/useSharedExercises.js'

export const sharedVideoUrl = hash => appBase().replace(/\/$/, '') + '/api/exercises/shared/media/' + hash
export const sharedVideoScope = s => JSON.stringify([s.server, s.instance, s.owner])

// Only one player can read video bytes from the network. Decoding a cached clip
// does not need a slot. An explicit play takes precedence over autoplay.
const players = new Map()
const listeners = new Set()
let active = null
let cacheTimer
let cacheJob
let watched
const CACHE_DELAY = 15000

export const currentSharedPlayer = () => active
export function subscribeSharedPlayer(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function cacheWhenIdle() {
  clearTimeout(cacheTimer)
  if (active || cacheJob || !watched) return
  cacheTimer = setTimeout(async () => {
    const { ref, scope } = watched
    const connection = navigator.connection
    if (active || document.visibilityState === 'hidden' || navigator.onLine === false ||
        !connection || connection.saveData || connection.type === 'cellular' ||
        !(connection.type === 'wifi' || connection.type === 'ethernet' || connection.downlink >= 5) ||
        scope !== sharedVideoScope(useSharedExercises.getState())) return
    const controller = new AbortController()
    cacheJob = controller
    watched = null
    try { await sharedMediaBlob(ref, { signal: controller.signal }) }
    catch {
      if (controller.signal.aborted && !watched && scope === sharedVideoScope(useSharedExercises.getState())) {
        watched = { ref, scope }
      }
    } finally {
      cacheJob = null
      cacheWhenIdle()
    }
  }, CACHE_DELAY)
}

function updatePlayer() {
  const previous = active
  active = null
  let explicit = false
  for (const [player, tapped] of players) {
    if (!explicit || tapped) { active = player; explicit = tapped }
  }
  if (active) cacheJob?.abort()
  cacheWhenIdle()
  if (previous !== active) for (const fn of listeners) fn()
}

export function claimSharedPlayer(player, explicit) {
  players.set(player, explicit)
  updatePlayer()
  return () => { players.delete(player); updatePlayer() }
}

export function rememberSharedVideo(ref, scope) {
  watched = { ref, scope }
  cacheWhenIdle()
}

useSharedExercises.subscribe((next, previous) => {
  if (sharedVideoScope(next) === sharedVideoScope(previous)) return
  watched = null
  clearTimeout(cacheTimer)
  cacheJob?.abort()
})
