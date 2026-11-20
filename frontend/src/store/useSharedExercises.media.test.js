// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { apiBlob } from '../lib/api.js'
import { sha256Hex } from '../lib/sha256.js'
import { createMediaStore, memoryBackend, _setMediaStore } from '../lib/media-store.js'
import { sharedMediaBlob } from './useSharedExercises.js'

vi.mock('../lib/api.js', () => ({ apiBlob: vi.fn() }))
afterEach(() => {
  _setMediaStore(null)
  vi.resetAllMocks()
})

it('shares an in-flight download and cancels it only when the last caller leaves', async () => {
  _setMediaStore(createMediaStore(memoryBackend()))
  const blob = new Blob(['video'])
  const ref = { hash: await sha256Hex(blob), size: blob.size, mime: 'video/mp4' }
  apiBlob.mockImplementation((_, { signal }) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  }))

  const a = new AbortController()
  const b = new AbortController()
  const first = expect(sharedMediaBlob(ref, { signal: a.signal })).rejects.toMatchObject({ name: 'AbortError' })
  const second = expect(sharedMediaBlob(ref, { signal: b.signal })).rejects.toMatchObject({ name: 'AbortError' })
  await vi.waitFor(() => expect(apiBlob).toHaveBeenCalledTimes(1))

  const request = apiBlob.mock.calls[0][1].signal
  a.abort()
  await first
  expect(request.aborted).toBe(false)
  b.abort()
  await second
  expect(request.aborted).toBe(true)

  apiBlob.mockResolvedValue(blob)
  await expect(sharedMediaBlob(ref)).resolves.toBe(blob)
  await expect(sharedMediaBlob(ref)).resolves.toBe(blob)
  expect(apiBlob).toHaveBeenCalledTimes(2)
})
