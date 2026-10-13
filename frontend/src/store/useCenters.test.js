// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('../lib/centers-api.js', () => ({ centersMe: vi.fn() }))
import { centersMe } from '../lib/centers-api.js'
import { useCenters } from './useCenters.js'

const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a;reject=b }); return {promise,resolve,reject} }
const payload = id => ({centers:[{id,name:id,capabilities:['center.read']}],platformCapabilities:[]})
beforeEach(() => {useCenters.getState().reset();centersMe.mockReset()})

describe('administrative context is memory-only and owned by the current identity',()=>{
  it('drops a late response from a previous account',async()=>{
    const old=deferred(),current=deferred();centersMe.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise)
    const a=useCenters.getState().load('a'),b=useCenters.getState().load('b')
    current.resolve(payload('b-center'));await b
    old.resolve(payload('a-center'));await a
    expect(useCenters.getState().ownerUid).toBe('b')
    expect(useCenters.getState().centers.map(c=>c.id)).toEqual(['b-center'])
  })
  it('clears capabilities and selections on SQL/auth errors',async()=>{
    centersMe.mockResolvedValueOnce(payload('one'));await useCenters.getState().load('a');useCenters.getState().select('one')
    centersMe.mockRejectedValueOnce(Object.assign(new Error('revoked'),{status:403}));await useCenters.getState().load('a')
    expect(useCenters.getState().centers).toEqual([]);expect(useCenters.getState().selectedId).toBeNull()
    expect(useCenters.getState().platformCapabilities).toEqual([])
  })
  it('preserves references and a new selection during an unchanged background refresh',async()=>{
    const result={centers:[{id:'one'},{id:'two'}],platformCapabilities:['centers.manage']}
    centersMe.mockResolvedValueOnce(result);await useCenters.getState().load('a')
    const previous=useCenters.getState().centers;const pending=deferred();centersMe.mockReturnValueOnce(pending.promise)
    const refresh=useCenters.getState().load('a');useCenters.getState().select('two')
    pending.resolve(structuredClone(result));await refresh
    expect(useCenters.getState().centers).toBe(previous);expect(useCenters.getState().selectedId).toBe('two')
  })
  it('logout invalidates queued responses and never persists administrative data',async()=>{
    const storage=vi.spyOn(Storage.prototype,'setItem'),pending=deferred();centersMe.mockReturnValue(pending.promise)
    const load=useCenters.getState().load('a');useCenters.getState().reset();pending.resolve(payload('private'));await load
    expect(useCenters.getState().ownerUid).toBeNull();expect(useCenters.getState().centers).toEqual([])
    expect(storage).not.toHaveBeenCalled();storage.mockRestore()
  })
})
