// @vitest-environment happy-dom
import React,{act,useState} from 'react'
import {createRoot} from 'react-dom/client'
import {it,expect,vi,beforeEach,afterEach} from 'vitest'
vi.mock('../../lib/i18n.js',()=>({t:key=>key}))
vi.mock('../../lib/centers-api.js',()=>({centerCommand:vi.fn(),centerMemberImport:vi.fn(),memberImportErrorKey:e=>e.code||'Import unavailable'}))
vi.mock('../../store/useStore.js',()=>{const state={user:{id:'root'},S:{routines:[]}};return {useStore:{getState:()=>state}}})
vi.mock('../../store/useCenters.js',()=>({useCenters:{getState:()=>({revokeOn:vi.fn()})}}))
vi.mock('../../sheets.jsx',()=>({confirmSheet:vi.fn()}))
import {centerCommand,centerMemberImport} from '../../lib/centers-api.js'
import {confirmSheet} from '../../sheets.jsx'
import {useStore} from '../../store/useStore.js'
import CsvImport from './CsvImport.jsx'
globalThis.IS_REACT_ACT_ENVIRONMENT=true
let root,host,onJob,changed,close
const review={id:'mi_review',definitionVersion:1,state:'prepared',reviewHash:'a'.repeat(64),summary:{total:2,ready:1,skipped:1,errors:0},rows:[{record:1,line:2,status:'ready',fields:{name:'Reviewed member',email:'a@example.test'}},{record:2,line:3,status:'skipped',fields:{name:'Duplicate member'}}]}
const done={id:'mi_review',definitionVersion:1,state:'completed',result:{total:2,imported:1,skipped:1,rows:[{record:1,line:2,status:'imported',memberId:'m1'},{record:2,line:3,status:'skipped'}]}}
beforeEach(()=>{vi.clearAllMocks();useStore.getState().user={id:'root'};onJob=vi.fn();changed=vi.fn();close=vi.fn();host=document.createElement('div');document.body.append(host);root=createRoot(host)})
afterEach(()=>{act(()=>root.unmount());host.remove()})
const props=()=>({centerId:'center1',ownerUid:'root',onJob,changed,close})
const render=(extra={})=>act(async()=>{root.render(<CsvImport {...props()} {...extra}/>);await Promise.resolve()})
const button=text=>[...host.querySelectorAll('button')].find(b=>b.textContent===text)
const click=text=>act(async()=>{button(text).click();await Promise.resolve()})
const upload=(file={name:'members.csv',size:24,arrayBuffer:async()=>new TextEncoder().encode('name,email\nA,a@example.test').buffer})=>act(async()=>{
  const input=host.querySelector('input[type=file]');Object.defineProperty(input,'files',{configurable:true,value:[file]});input.dispatchEvent(new Event('change',{bubbles:true}));await Promise.resolve()
})
it('requires a review and explicit confirmation, preserves prepare identity across retries and never writes personal state',async()=>{
  const personal=structuredClone(useStore.getState().S);centerCommand.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(review).mockResolvedValueOnce(done);
  await render();await upload();await click('Review import');const first=centerCommand.mock.calls[0][1];await click('Review import');expect(centerCommand.mock.calls[1][1].requestId).toBe(first.requestId);expect(first.duplicatePolicy).toBe('skip');expect(onJob).toHaveBeenCalledWith(review.id);
  await click('Confirm import');expect(centerCommand).toHaveBeenCalledTimes(2);await act(async()=>confirmSheet.mock.calls[0][0].onConfirm());expect(centerCommand).toHaveBeenLastCalledWith('/api/centers/members/imports/commit',{centerId:'center1',id:review.id,reviewHash:review.reviewHash});expect(changed).toHaveBeenCalledOnce();expect(host.textContent).toContain('Import completed');expect(useStore.getState().S).toEqual(personal)
})
it('recovers a job from its URL identity and cannot confirm invalid rows or an expired review',async()=>{
  centerMemberImport.mockResolvedValueOnce({...review,summary:{...review.summary,errors:1},rows:[{record:1,line:2,status:'error',error:'invalid-fields'}]});await render({jobId:review.id});expect(centerMemberImport).toHaveBeenCalledWith('center1',review.id);expect(button('Confirm import').disabled).toBe(true);expect(host.textContent).toContain('Fix invalid rows before importing.');
  centerMemberImport.mockResolvedValueOnce({...review,id:'expired',state:'expired'});await render({jobId:'expired'});expect(button('Confirm import').disabled).toBe(true);expect(host.textContent).toContain('Choose the CSV file again to start a new review.');expect(centerCommand).not.toHaveBeenCalled()
})
it('rejects oversized or invalid UTF-8 files before calling the API',async()=>{
  await render();const read=vi.fn();await upload({name:'large.csv',size:256*1024+1,arrayBuffer:read});expect(read).not.toHaveBeenCalled();expect(host.querySelector('[role=alert]').textContent).toBe('invalid-member-csv');await upload({name:'bad.csv',size:1,arrayBuffer:async()=>new Uint8Array([255]).buffer});expect(centerCommand).not.toHaveBeenCalled();expect(button('Review import')).toBeUndefined()
})
it('never exposes a previous job confirmation after a different URL job fails to load',async()=>{
  centerMemberImport.mockResolvedValueOnce(review).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({...review,id:'other'});
  await render({jobId:review.id});expect(button('Confirm import')).toBeDefined();await render({jobId:'other'});expect(button('Confirm import')).toBeUndefined();expect(host.textContent).not.toContain('Reviewed member');await click('Retry');expect(centerMemberImport).toHaveBeenLastCalledWith('center1','other');expect(button('Confirm import')).toBeDefined()
})
it('can replace a recovered file without leaving its read stuck when the URL job is cleared',async()=>{
  centerMemberImport.mockResolvedValueOnce(review);
  function Controlled(){const [id,setId]=useState(review.id);return <CsvImport {...props()} jobId={id} onJob={setId}/>}
  await act(async()=>{root.render(<Controlled/>);await Promise.resolve()});await upload();expect(host.textContent).toContain('members.csv');expect(button('Review import').disabled).toBe(false);expect(button('Confirm import')).toBeUndefined()
})
it('ignores an old file read and old confirmation after context or reviewed contents change',async()=>{
  let release;await render();const pending=upload({name:'pending.csv',size:20,arrayBuffer:()=>new Promise(resolve=>release=resolve)});await pending;await render({centerId:'center2'});await act(async()=>release(new TextEncoder().encode('name\nStale').buffer));expect(button('Review import')).toBeUndefined();
  centerMemberImport.mockResolvedValueOnce(review).mockResolvedValueOnce({...review,reviewHash:'b'.repeat(64)});await render({jobId:review.id});await click('Confirm import');const old=confirmSheet.mock.calls[0][0].onConfirm;await click('Review import');await act(async()=>old());expect(centerCommand).not.toHaveBeenCalled()
})
