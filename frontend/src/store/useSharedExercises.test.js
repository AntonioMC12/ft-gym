import { afterEach, beforeEach, expect, it, vi } from 'vitest'
vi.mock('../lib/api.js', () => ({ api: vi.fn(), apiBlob: vi.fn(), apiUpload: vi.fn() }))
import { api, apiBlob } from '../lib/api.js'
import { useSharedExercises, sharedMediaBlob, sharedMediaKey } from './useSharedExercises.js'
import { EXIDX, registerShared } from '../lib/exercises.js'
import { _setMediaStore, createMediaStore, memoryBackend } from '../lib/media-store.js'
import { sha256Hex } from '../lib/sha256.js'
let storage, media
const entry = { id: 'ft_one', n: 'Shared', bp: 'back', eq: 'cable', origin: 'platform', revision: 1 }
beforeEach(() => {
  vi.clearAllMocks(); storage = new Map(); vi.stubGlobal('localStorage', { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v) });
  media = createMediaStore(memoryBackend()); _setMediaStore(media); useSharedExercises.getState().reset()
})
afterEach(() => { useSharedExercises.getState().reset(); _setMediaStore(null); vi.unstubAllGlobals() })
it('retains training but removes management capability after offline failure', async () => {
  api.mockResolvedValueOnce({ instance: 'a', rev: 1, entries: [entry], canManage: true });
  await useSharedExercises.getState().load('root', 'https://a.example');
  expect(useSharedExercises.getState().canManage).toBe(true)
  api.mockRejectedValueOnce(new Error('offline')); await useSharedExercises.getState().load('root', 'https://a.example');
  expect(useSharedExercises.getState().status).toBe('cached'); expect(useSharedExercises.getState().canManage).toBe(false)
  expect(EXIDX.ft_one.n).toBe('Shared')
  const cache = JSON.parse(storage.get('ft_catalogue:https://a.example')); expect(cache.canManage).toBeUndefined()
})
it('discarded late response cannot restore catalogue or capabilities from previous account/server', async () => {
  let finish; api.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }));
  const first = useSharedExercises.getState().load('root', 'https://a.example');
  api.mockResolvedValueOnce({ instance: 'b', rev: 0, entries: [], canManage: false });
  await useSharedExercises.getState().load('member', 'https://b.example');
  finish({ instance: 'a', rev: 1, entries: [entry], canManage: true }); await first;
  expect(useSharedExercises.getState().owner).toBe('member'); expect(useSharedExercises.getState().instance).toBe('b')
  expect(EXIDX.ft_one).toBeUndefined(); expect(useSharedExercises.getState().canManage).toBe(false)
})
it('cached catalogue can be used while loading but never restores management permission', async () => {
  storage.set('ft_catalogue:https://a.example', JSON.stringify({ instance: 'a', rev: 1, entries: [entry], canManage: true }));
  api.mockRejectedValueOnce(new Error('offline')); await useSharedExercises.getState().load('member', 'https://a.example');
  expect(useSharedExercises.getState().canManage).toBe(false); expect(EXIDX.ft_one.n).toBe('Shared')
})
it('private hash cache does not authorize shared media; scoped offline copy is reusable', async () => {
  const blob = new Blob(['synthetic bytes']), hash = await sha256Hex(blob), ref = { hash, mime: 'image/png', size: blob.size };
  registerShared([entry], 'a'); useSharedExercises.setState({ owner: 'root', server: 'https://a.example', instance: 'a' });
  await media.put(hash, blob, { mime: ref.mime, pending: false }); apiBlob.mockRejectedValueOnce(new Error('not authorized'));
  await expect(sharedMediaBlob(ref)).rejects.toThrow('not authorized');
  apiBlob.mockResolvedValueOnce(blob); await sharedMediaBlob(ref);
  expect(await media.has(await sharedMediaKey(hash))).toBe(true)
  apiBlob.mockClear(); expect(await (await sharedMediaBlob(ref)).text()).toBe('synthetic bytes'); expect(apiBlob).not.toHaveBeenCalled()
  useSharedExercises.setState({ server: 'https://b.example' }); apiBlob.mockRejectedValueOnce(new Error('new server'));
  await expect(sharedMediaBlob(ref)).rejects.toThrow('new server')
})
it('shared media rejects a response whose bytes do not match its content hash', async () => {
  registerShared([entry], 'a'); const expected = new Blob(['expected']);
  apiBlob.mockResolvedValueOnce(new Blob(['wrong']));
  await expect(sharedMediaBlob({ hash: await sha256Hex(expected), mime: 'image/png', size: expected.size })).rejects.toThrow('media-hash-mismatch')
})
