// @vitest-environment happy-dom
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
vi.mock('react-router-dom',()=>({useNavigate:()=>vi.fn()}))
vi.mock('../lib/api.js',async load=>({...await load(),api:vi.fn(()=>Promise.resolve({})),beacon:vi.fn()}))
vi.mock('../sheets.jsx',async load=>({...await load(),startFlow:vi.fn()}))
import {startFlow} from '../sheets.jsx'
import {DEF,useStore} from '../store/useStore.js'
import {todayISO} from '../lib/format.js'
import Workout from './Workout.jsx'
let root,host
beforeEach(()=>{globalThis.IS_REACT_ACT_ENVIRONMENT=true;Element.prototype.scrollIntoView=vi.fn();vi.clearAllMocks();useStore.setState({S:structuredClone(DEF),user:{id:'self'}});host=document.createElement('div');document.body.append(host);root=createRoot(host)})
afterEach(()=>{act(()=>root.unmount());host.remove()})
const render=()=>act(async()=>root.render(<Workout/>))
const click=async text=>act(async()=>[...host.querySelectorAll('button,[role="button"]')].find(b=>b.textContent.includes(text)).click())
it('offers today and alternative routines without mutating the schedule or adding empty routines',async()=>{
 useStore.setState(s=>({S:{...s.S,routines:[{id:'a',name:'Today A',ex:[{id:'0025'}]},{id:'b',name:'Alternative B',ex:[{id:'0025'}]},{id:'empty',name:'Empty',ex:[]}],week:{[new Date().getDay()]:['a','empty']}}}));
 const original=structuredClone(useStore.getState().S.week);await render();expect(host.textContent).toContain("Today's plan");expect(host.textContent).toContain('Alternative B');expect(host.textContent).not.toContain('Empty');
 await click('Alternative B');expect(startFlow).toHaveBeenLastCalledWith(['b']);expect(useStore.getState().S.week).toEqual(original);
 await click('Start Today A');expect(startFlow).toHaveBeenLastCalledWith(['a']);
});
it('has a clear empty state',async()=>{await render();expect(host.textContent).toContain('No routines available to start.');expect(host.textContent).not.toContain('Build a plan')});
const entry=()=>({id:'0025',rid:'r',target:{mode:'reps',reps:12,repsMin:8,weight:20},planned:{reps:12,repsMin:8},sets:[{w:20,r:null,done:false}]});
const active=e=>({id:'active',d:todayISO(),start:Date.now(),name:'Test',cur:0,routineIds:['r'],entries:[e],workoutView:'cards'});
const input=()=>host.querySelector('input[aria-label="Reps"]');
const type=async value=>act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input(),value);input().dispatchEvent(new Event('input',{bubbles:true}))});
it('shows previous repetitions only as a placeholder; typing and clearing keep the actual input separate',async()=>{
 useStore.setState(s=>({S:{...s.S,active:active(entry()),workouts:[{id:'old',d:'2026-10-15',routineIds:['r'],entries:[{id:'0025',rid:'r',sets:[{w:20,r:10,done:true}]}]}]}}));
 await render();expect(input().value).toBe('');expect(input().placeholder).toBe('10');expect(host.textContent).toContain('8–12');expect(useStore.getState().S.active.entries[0].sets[0].r).toBeNull();
 await type('11');expect(input().value).toBe('11');expect(useStore.getState().S.active.entries[0].sets[0].r).toBe(11);
 await type('');expect(input().value).toBe('');expect(input().placeholder).toBe('10');expect(useStore.getState().S.active.entries[0].sets[0].r).toBeNull();
});
it('keeps real saved repetitions editable',async()=>{
 const e=entry();e.sets[0]={w:20,r:9,done:true};const a=active(e);a.editingWorkoutId='saved';useStore.setState(s=>({S:{...s.S,active:a}}));await render();expect(input().value).toBe('9');await type('');expect(useStore.getState().S.active.entries[0].sets[0].done).toBe(false);
});
