import {describe,it,expect} from 'vitest'
import {applyPlanDelivery} from './plan-delivery.js'
import {mergePlanDeliveries,protectPlanDeliveryDeletions} from './plan-delivery-state.js'
import * as server from '../../../api/plan-delivery-state.js'
import {stampPut} from '../../../api/sync-stamps.js'
import {mergeStates,stampChange,resetIdsOf} from './sync-merge.js'

const clone=x=>JSON.parse(JSON.stringify(x))
const key='td_'+'a'.repeat(32),rid='cr_'+'b'.repeat(32),H=1800000000000
const marker={id:key,acceptedAt:H,routineIds:[rid]}
const delivery=()=>({deliveryKey:key,acceptedAt:H,routineIds:{source:rid},bundle:{opengym_plan:1,unit:'kg',name:'Plan',routines:[{id:'source',name:'Push',prog:'double',ex:[{id:'0025',sets:3,reps:8,weight:60,restSec:90,pyramid:[8,6,4],pyramidWeight:[60,65,70]}]}],week:{1:['source']},customEx:[]}})
const state=()=>({_ts:H,unit:'kg',routines:[],workouts:[],customEx:[],week:{2:['personal']},dayPlan:{'2026-10-16':['personal']},active:{id:'live',entries:[{id:'0025',reps:5}]}})
const apply=(s,d=delivery(),options)=>{const n=clone(s);applyPlanDelivery(n,d,options);n._ts=stampChange(s,n,H+100);return n}

describe('accepted training delivery',()=>{
  it('uses stable IDs and preserves current session, day plan and week by default',()=>{
    const s=state(),n=apply(s)
    expect(n.routines).toHaveLength(1)
    expect(n.routines[0]).toMatchObject({id:rid,prog:'double',ex:[{restSec:90,pyramid:[8,6,4]}]})
    for(const field of ['active','week','dayPlan'])expect(n[field]).toEqual(s[field])
    expect(n.planDeliveries).toEqual([marker])
    n.routines[0].name='Personal edit'
    expect(applyPlanDelivery(n,delivery(),{schedule:true})).toEqual({routines:0,alreadyApplied:true})
    expect(n.routines[0].name).toBe('Personal edit')
    expect(n.week).toEqual(s.week)
  })
  it('converts the full prescription to the recipient unit and schedules only explicitly',()=>{
    const s=state();s.unit='lb';const n=apply(s,delivery(),{schedule:true})
    expect(n.routines[0].ex[0]).toMatchObject({weight:132.5,pyramidWeight:[132.5,143.5,154.5]})
    expect(n.week).toEqual({1:[rid]})
    expect(n.dayPlan).toEqual(s.dayPlan)
  })
  it('rejects invalid maps, custom exercises and unknown catalogue IDs without changing the draft',()=>{
    for(const mutate of [d=>{d.routineIds={source:'arbitrary'}},d=>{d.routineIds={}},d=>{d.routineIds=[rid]},d=>{d.bundle.customEx=[{id:'private'}]},d=>{d.bundle.routines[0].ex[0].id='missing'},d=>{d.acceptedAt=0}]){
      const d=delivery(),s=state(),before=clone(s);mutate(d)
      expect(()=>applyPlanDelivery(s,d)).toThrow()
      expect(s).toEqual(before)
    }
  })
  it('does not overwrite an existing destination or resurrect a removed/reset routine',()=>{
    const s=state();s.routines=[{id:rid,name:'My edit',ex:[]}]
    expect(apply(s).routines[0].name).toBe('My edit')
    for(const metadata of [{deleted:{routines:{[rid]:H+1}}},{resetIds:{routines:[rid]}}]){
      const n=apply({...state(),...metadata},delivery(),{schedule:true})
      expect(n.routines).toEqual([])
      expect(n.week).toEqual({})
      expect(n.planDeliveries).toEqual([marker])
    }
  })
  it('rejects destination IDs already belonging to another delivery',()=>{
    const s=state();s.planDeliveries=[{...marker,id:'td_'+'c'.repeat(32)}]
    expect(()=>applyPlanDelivery(s,delivery())).toThrow('destination conflict')
  })
  it('rejects a conflicting timestamp or destination for an already applied delivery',()=>{
    const s=apply(state())
    for(const mutate of [d=>{d.acceptedAt++},d=>{d.routineIds.source='cr_'+'d'.repeat(32)}]){
      const d=delivery();mutate(d);expect(()=>applyPlanDelivery(s,d)).toThrow('identity conflict')
    }
  })
})

describe('delivery convergence and server parity',()=>{
  it('two independent acceptances converge to one routine and one marker in either order',()=>{
    const a=apply(state()),b=apply(state());b._ts+=200;b.routines[0]._ts+=200
    for(const n of [mergeStates(a,b),mergeStates(b,a)]){
      expect(n.routines.map(r=>r.id)).toEqual([rid]);expect(n.planDeliveries).toEqual([marker])
    }
  })
  it('a delayed acceptance cannot outrank a deletion on another device; explicit Undo can',()=>{
    const a=apply(state()),removed=clone(a);removed.routines=[];removed.deleted={routines:{[rid]:H+200}};removed._ts=H+200
    const delayed=apply(state());delayed._ts=H+1000;delayed.routines[0]._ts=H+1000
    for(const n of [mergeStates(removed,delayed),mergeStates(delayed,removed)])expect(n.routines).toEqual([])
    const restored=clone(delayed);restored.deleted={routines:{[rid]:-(H+2000)}}
    expect(mergeStates(removed,restored).routines.map(r=>r.id)).toEqual([rid])
    for(const stamped of [false,true]){
      const report={},stored=stampPut(removed,clone(delayed),{stamped,overRead:true,now:H+3000,report})
      expect(stored.routines).toEqual([]);expect(stored.deleted.routines[rid]).toBeGreaterThan(0);expect(report.changed).toBe(true)
      expect(stampPut(removed,clone(restored),{stamped,overRead:true,now:H+3000}).routines.map(r=>r.id)).toEqual([rid])
    }
  })
  it('keeps provenance when a legacy or stamped writer omits it, and clears it on reset',()=>{
    const cur=apply(state())
    for(const stamped of [false,true]){
      const n=clone(cur);delete n.planDeliveries
      const report={};expect(stampPut(cur,n,{stamped,report}).planDeliveries).toEqual([marker]);expect(report.changed).toBe(true)
    }
    const reset={...state(),resetAt:H+10000,resetIds:resetIdsOf(cur)}
    expect(reset.resetIds.planDeliveries).toEqual([key])
    expect(stampPut(cur,clone(reset),{stamped:true}).planDeliveries).toBeUndefined()
    for(const n of [mergeStates(cur,reset),mergeStates(reset,cur)]){
      expect(n.routines).toEqual([]);expect(n.planDeliveries||[]).toEqual([])
    }
  })
  it('normalizes only personal provenance, deterministically, identically on server and client',()=>{
    const a=[{...marker,centerId:'private',role:'manager'},null,{...marker,id:'invalid'}],b=[{...marker,acceptedAt:H+1}]
    const expected=[marker]
    for(const fn of [mergePlanDeliveries,server.mergePlanDeliveries]){
      expect(fn(a,b)).toEqual(expected);expect(fn(b,a)).toEqual(expected);expect(fn({},null)).toEqual([])
    }
    for(const fn of [protectPlanDeliveryDeletions,server.protectPlanDeliveryDeletions]){
      expect(fn({planDeliveries:{},routines:[]})).toEqual({planDeliveries:{},routines:[]})
      expect(fn({planDeliveries:a,routines:[{id:rid,_ts:H+9}],deleted:{routines:{[rid]:H}}}).routines).toEqual([])
    }
  })
})
