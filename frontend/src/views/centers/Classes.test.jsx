// @vitest-environment happy-dom
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
vi.mock('../../lib/i18n.js',()=>({t:key=>key,dateLocale:()=> 'en-GB'}))
vi.mock('../../lib/centers-api.js',()=>({centerClassSeries:vi.fn(),centerClassSeriesList:vi.fn(),centerAttendanceHistory:vi.fn(),centerClassInstructors:vi.fn(),centerClasses:vi.fn(),centerClassRoster:vi.fn(),centerPlans:vi.fn(),centerCommand:vi.fn(),classesErrorKey:error=>error?.code||'error'}))
vi.mock('../../store/useStore.js',()=>{const state={user:{id:'alice'},S:{}};return {useStore:Object.assign(selector=>selector(state),{getState:()=>state})}})
vi.mock('../../store/useCenters.js',()=>({useCenters:{getState:()=>({revokeOn:vi.fn()})}}))
vi.mock('../../sheets.jsx',()=>({confirmSheet:vi.fn()}))
import {centerClassSeries,centerClassSeriesList,centerAttendanceHistory,centerClassInstructors,centerClasses,centerClassRoster,centerPlans,centerCommand} from '../../lib/centers-api.js'
import {useStore} from '../../store/useStore.js'
import {useUI} from '../../store/useUI.js'
import {bindUI} from '../../components/ui.jsx'
import {confirmSheet} from '../../sheets.jsx'
import Classes from './Classes.jsx'
globalThis.IS_REACT_ACT_ENVIRONMENT=true
const event={id:'cl_one',name:'Fictional class',date:'2026-10-20',startsAt:'2026-10-20T08:00:00Z',endsAt:'2026-10-20T09:00:00Z',timezone:'Europe/Madrid',capacity:1,waitlistCapacity:1,booked:0,waiting:0,state:'scheduled',version:1,eligible:true,bookingOpen:true,canCancel:true,ownReservation:null}
const page={center:{id:'a',name:'Center A',state:'active',timezone:'Europe/Madrid'},today:'2026-10-15',from:'2026-10-08',to:'2026-11-14',classes:[event],nextCursor:null}
const roster={event:{...event,attendanceOpen:false,noShowOpen:false,canCancelClass:true},reservations:[{id:'rb_one',memberId:'m1',name:'Fictional member',number:'M-000001',state:'booked',version:1}],nextCursor:null}
let host,root
function Sheets(){return useUI(s=>s.sheets).map(sheet=><section key={sheet.id} data-sheet>{sheet.render(()=>useUI.getState().closeSheet(sheet.id))}</section>)}
beforeEach(()=>{vi.clearAllMocks();centerClassInstructors.mockResolvedValue({instructors:[{id:'role_teacher',name:'Teacher One',role:'trainer'}],nextCursor:null});useStore.getState().user={id:'alice'};useUI.getState().closeAll();bindUI(useUI);centerClasses.mockResolvedValue(page);centerClassRoster.mockResolvedValue(roster);centerPlans.mockResolvedValue({plans:[{id:'p1',name:'Allowed fee',archived:false}],nextCursor:null});centerCommand.mockResolvedValue({});host=document.createElement('div');document.body.append(host);root=createRoot(host)})
afterEach(()=>{act(()=>{root.unmount();useUI.getState().closeAll()});host.remove()})
const render=(extra={})=>act(async()=>{root.render(<><Classes centerId="a" ownerUid="alice" own {...extra}/><Sheets/></>);await Promise.resolve()})
it('shows instructor review warnings only from the management projection',async()=>{
  centerClasses.mockResolvedValue({...page,classes:[{...event,instructorName:'Teacher One',instructorNeedsReview:true}]});await render({own:false,canManage:true});
  expect(host.textContent).toContain('Review the instructor assignment before this class.');
  centerClassRoster.mockResolvedValue({...roster,event:{...roster.event,instructorName:'Teacher One',instructorNeedsReview:true}});await click('Class roster');expect(host.textContent).toContain('Review the instructor assignment before this class.');
})
it('shows room labels in own and management schedules as plain text',async()=>{
  centerClasses.mockResolvedValue({...page,classes:[{...event,room:'Sala <script>private()</script>'}]});await render();
  expect(host.textContent).toContain('Sala <script>private()</script>');expect(host.querySelector('script')).toBeNull();
  await render({own:false,canManage:true});expect(host.textContent).toContain('Class room');expect(host.textContent).toContain('Sala <script>private()</script>');
})
const button=text=>[...host.querySelectorAll('button')].find(b=>b.textContent===text)
const click=text=>act(async()=>{button(text).click();await Promise.resolve()})
const rowClick=text=>act(async()=>{[...host.querySelectorAll('button.lrow')].find(b=>b.querySelector('.lrow-t')?.textContent===text).click();await Promise.resolve()})
const fill=(element,value)=>act(()=>{Object.getOwnPropertyDescriptor(element.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(element,value);element.dispatchEvent(new Event('input',{bubbles:true}))})
const field=label=>[...host.querySelectorAll('label.centers-field')].find(node=>node.querySelector('span')?.textContent===label)?.querySelector('input')
async function completeEditor(){
  fill(field('Class name'),'New class');fill(field('Date'),'2026-10-25');fill(field('From'),'02:15');fill(field('To'),'02:45');fill(field('Capacity'),'10');fill(field('Waiting list capacity'),'0');fill(field('Cancellation notice (minutes)'),'0');await act(async()=>host.querySelector('button[role=checkbox]').click())
}
it('selects a real staff assignment, paginates the directory and submits only its identifier',async()=>{
  centerClassInstructors.mockResolvedValueOnce({instructors:[{id:'role_teacher',name:'Teacher One',role:'trainer'}],nextCursor:'staff_page'}).mockResolvedValueOnce({instructors:[{id:'role_teacher_2',name:'Teacher Two',role:'trainer'}],nextCursor:null});
  await render({own:false,canManage:true});await click('New class');
  const more=[...host.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='Class instructor (optional) · Show more');await act(async()=>{more.click();await Promise.resolve()});expect(centerClassInstructors).toHaveBeenLastCalledWith('a',{cursor:'staff_page'});
  await rowClick('Class instructor (optional)');await rowClick('Teacher Two · Trainer');await completeEditor();await click('Create class');
  expect(centerCommand.mock.calls[0][1].fields.instructorAssignmentId).toBe('role_teacher_2');expect(centerCommand.mock.calls[0][1].fields.instructorName).toBeUndefined();
})
it('allows classes without an instructor when the staff directory fails and does not apply stale directory responses',async()=>{
  centerClassInstructors.mockRejectedValueOnce({code:'offline'});await render({own:false,canManage:true});await click('New class');expect(host.textContent).toContain('offline');await completeEditor();expect(button('Create class').disabled).toBe(false);
  let release;centerClassInstructors.mockImplementationOnce(()=>new Promise(resolve=>release=resolve));await click('Retry');await render({centerId:'b',own:false,canManage:true});
  await act(async()=>{release({instructors:[{id:'stale',name:'Old center teacher',role:'trainer'}],nextCursor:null});await Promise.resolve()});
  expect(host.textContent).not.toContain('Old center teacher');
})
it('submits an optional room with the existing class command and keeps room conflicts reviewable',async()=>{
  centerCommand.mockRejectedValueOnce({code:'class-room-conflict'});await render({own:false,canManage:true});await click('New class');await completeEditor();
  fill(field('Class room (optional)'),'Sala A');await click('Create class');
  expect(centerCommand.mock.calls[0][1].fields.room).toBe('Sala A');expect(field('Class room (optional)').value).toBe('Sala A');
  expect(host.querySelector('[role=alert]').textContent).toContain('class-room-conflict');expect(button('Create class').disabled).toBe(false);
})
const correctionPage=()=>({reservation:{id:'rb_one',classId:'cl_one',state:'no-show',originalState:'no-show',version:2,attendanceRevision:0},corrections:[],nextCursor:null})
const correctionRoster=()=>({...roster,event:{...roster.event,noShowOpen:true},reservations:[{...roster.reservations[0],state:'no-show',version:2,attendanceRevision:0}]})
it('requires a correction reason and explicit confirmation, preserving retry identity after a lost response',async()=>{
  centerClassRoster.mockResolvedValue(correctionRoster());centerAttendanceHistory.mockResolvedValue(correctionPage());centerCommand.mockRejectedValueOnce({code:'network'}).mockResolvedValue({});
  await render({own:false,canManage:true});await click('Class roster');await click('Correct attendance');
  expect(button('Confirm').disabled).toBe(true);fill(field('Reason'),'Reviewed with reception');await click('Confirm');expect(centerCommand).not.toHaveBeenCalled();
  await act(async()=>confirmSheet.mock.calls[0][0].onConfirm());await click('Confirm');await act(async()=>confirmSheet.mock.calls[1][0].onConfirm());
  const first=centerCommand.mock.calls[0];expect(first[0]).toBe('/api/centers/classes/attendance/correct');expect(first[1]).toMatchObject({centerId:'a',id:'rb_one',version:2,attendanceRevision:0,state:'attended',reason:'Reviewed with reception'});expect(centerCommand.mock.calls[1][1].requestId).toBe(first[1].requestId);
})
it('keeps the reviewed revision while paging history and ignores changed confirmation contents',async()=>{
  centerClassRoster.mockResolvedValue(correctionRoster());centerAttendanceHistory.mockResolvedValueOnce({...correctionPage(),nextCursor:'older'}).mockResolvedValueOnce({...correctionPage(),reservation:{...correctionPage().reservation,attendanceRevision:99},corrections:[{id:'ac_old',revision:1,fromState:'attended',state:'no-show',reason:'<script>private()</script>',actorUid:'manager',createdAt:'2026-10-20T09:00:00Z'}]});
  await render({own:false,canManage:true});await click('Class roster');await click('Correct attendance');await click('Show more');
  expect(centerAttendanceHistory).toHaveBeenLastCalledWith('a','rb_one',{cursor:'older'});expect(host.querySelector('script')).toBeNull();expect(host.textContent).toContain('<script>private()</script>');
  fill(field('Reason'),'First review');await click('Confirm');fill(field('Reason'),'Changed review');await act(async()=>confirmSheet.mock.calls[0][0].onConfirm());expect(centerCommand).not.toHaveBeenCalled();
  await click('Confirm');await act(async()=>confirmSheet.mock.calls[1][0].onConfirm());expect(centerCommand.mock.calls[0][1].attendanceRevision).toBe(0);
})
it('discards a pending correction/history when the selected center changes',async()=>{
  centerClassRoster.mockResolvedValue(correctionRoster());let release;centerAttendanceHistory.mockImplementationOnce(()=>new Promise(resolve=>release=resolve));
  await render({own:false,canManage:true});await click('Class roster');await click('Correct attendance');await render({centerId:'b',own:false,canManage:true});
  await act(async()=>release({...correctionPage(),corrections:[{id:'secret',revision:1,fromState:'attended',state:'no-show',reason:'OLD PRIVATE NOTE',actorUid:'old',createdAt:'2026-10-20T09:00:00Z'}]}));expect(host.textContent).not.toContain('OLD PRIVATE NOTE');expect(centerCommand).not.toHaveBeenCalled();
})
it('reserves only the signed-in membership after confirmation and retains retry identity on failure',async()=>{
  centerCommand.mockRejectedValueOnce(new Error('network')).mockResolvedValue({});await render();await click('Reserve place');expect(centerCommand).not.toHaveBeenCalled()
  await act(async()=>confirmSheet.mock.calls[0][0].onConfirm());await click('Reserve place');await act(async()=>confirmSheet.mock.calls[1][0].onConfirm())
  const [path,body]=centerCommand.mock.calls[0];expect(path).toBe('/api/centers/own/classes/reserve');expect(body).toMatchObject({centerId:'a',id:'cl_one'});expect(body).not.toHaveProperty('memberId');expect(centerCommand.mock.calls[1][1].requestId).toBe(body.requestId)
})
it('explains full or ineligible actions and uses waiting-list language when only the queue has space',async()=>{
  centerClasses.mockResolvedValue({...page,classes:[{...event,booked:1}]});await render();expect(button('Join waiting list').disabled).toBe(false)
  centerClasses.mockResolvedValue({...page,classes:[{...event,booked:1,waiting:1,eligible:false}]});await click('Reload centers');expect(button('Join waiting list').disabled).toBe(true)
  expect(host.textContent).toContain('This class is full.');expect(host.textContent).toContain('Your membership or plan does not allow this class.')
})
it('invalidates an old confirmation and discards a delayed page when center/account changes',async()=>{
  await render();await click('Reserve place');const old=confirmSheet.mock.calls[0][0].onConfirm
  let release;centerClasses.mockReturnValueOnce(new Promise(resolve=>{release=resolve}));await render({centerId:'b'});centerClasses.mockResolvedValue({...page,classes:[{...event,name:'New account class'}]});useStore.getState().user={id:'bob'};await render({centerId:'c',ownerUid:'bob'})
  await act(async()=>{await old();release({...page,classes:[{...event,name:'Private old page'}]})});expect(centerCommand).not.toHaveBeenCalled();expect(host.textContent).not.toContain('Private old page');expect(host.textContent).toContain('New account class')
})
it('keeps earlier rows and sends server date bounds with the cursor for the next page',async()=>{
  centerClasses.mockResolvedValueOnce({...page,nextCursor:'next'}).mockResolvedValueOnce({...page,classes:[{...event,id:'two',name:'Second class'}]})
  await render();await click('Show more');expect(centerClasses).toHaveBeenLastCalledWith('a',{own:true,from:page.from,to:page.to,cursor:'next'});expect(host.textContent).toContain(event.name);expect(host.textContent).toContain('Second class')
})
it('requires explicit capacities, cancellation terms and plans, and resolves repeated start/end hours separately',async()=>{
  centerCommand.mockRejectedValueOnce({code:'class-time-ambiguous'}).mockResolvedValue({});await render({own:false,canManage:true});await click('New class')
  expect(field('Capacity').value).toBe('');expect(field('Waiting list capacity').value).toBe('');expect(button('Create class').disabled).toBe(true)
  await completeEditor();expect(host.querySelector('button[role=checkbox]').getAttribute('aria-label')).toBe('Allowed fee');await click('Create class')
  expect(host.textContent).toContain('Choose the first or second occurrence of this repeated hour.')
  await rowClick('From');await rowClick('First occurrence');await rowClick('To');await rowClick('Second occurrence');await click('Create class')
  const body=centerCommand.mock.calls[1][1];expect(body.fields).toMatchObject({capacity:10,waitlistCapacity:0,cancelBeforeMinutes:0,eligiblePlanIds:['p1'],disambiguation:{start:'earlier',end:'later'}})
  expect(body.requestId).not.toBe(centerCommand.mock.calls[0][1].requestId,'changed occurrence is a new command')
})
it('roster attendance uses server flags and a changed cancellation reason invalidates a confirmation',async()=>{
  await render({own:false,canManage:true});await click('Class roster');expect(button('No-show').disabled).toBe(true);expect(button('Attended').disabled).toBe(true)
  fill(host.querySelector('textarea'),'First reason');await click('Cancel class');fill(host.querySelector('textarea'),'Changed reason');await act(async()=>confirmSheet.mock.calls[0][0].onConfirm());expect(centerCommand).not.toHaveBeenCalled()
  await click('Cancel');centerClassRoster.mockResolvedValue({...roster,event:{...roster.event,noShowOpen:true,attendanceOpen:true,canCancelClass:false}});await click('Reload centers');await click('No-show');await act(async()=>confirmSheet.mock.calls.at(-1)[0].onConfirm())
  expect(centerCommand.mock.calls[0]).toEqual(['/api/centers/classes/attendance',expect.objectContaining({id:'rb_one',version:1,state:'no-show'})])
})
it('own cancellation stays disabled after the server deadline without changing the reservation',async()=>{
  centerClasses.mockResolvedValue({...page,classes:[{...event,booked:1,canCancel:false,ownReservation:{id:'rb_one',state:'booked',version:2}}]});await render();expect(button('Cancel reservation').disabled).toBe(true);expect(host.textContent).toContain('Booking or cancellation is closed.');expect(centerCommand).not.toHaveBeenCalled()
})

const reviewSeriesPage=(extra={})=>({definitionVersion:1,reviewHash:'a'.repeat(64),summary:{total:1,ready:1,excluded:0,errors:0},limitExceeded:false,rows:[{date:'2026-10-25',status:'ready',startsAt:'2026-10-25T01:15:00Z',endsAt:'2026-10-25T01:45:00Z'}],...extra})
const checkLabel=async label=>act(async()=>{host.querySelector('button[role=checkbox][aria-label="'+label+'"]').click();await Promise.resolve()})
async function weeklyEditor(){await render({own:false,canManage:true});await click('New class');await completeEditor();await checkLabel('Weekly class series');fill(field('Series end date'),'2026-11-01');await checkLabel('Sunday')}
const group=id=>({id,name:'Weekly '+id,timezone:'Europe/Madrid',total:1,definition:{fields:{date:'2026-10-25'},rule:{until:'2026-11-01'}}})
const seriesDetails=()=>({...page,series:group('cs_one'),classes:[{...event,seriesId:'cs_one',seriesPosition:1}]})
it('reviews weekly dates before confirmation and preserves command identity when the response is lost',async()=>{
  centerCommand.mockResolvedValueOnce(reviewSeriesPage()).mockRejectedValueOnce({code:'network'}).mockResolvedValueOnce({series:{id:'cs_one'}});centerClassSeries.mockResolvedValue(seriesDetails());
  await weeklyEditor();expect(button('Create weekly series')).toBeUndefined();await click('Review class series');expect(centerCommand.mock.calls[0][0]).toBe('/api/centers/classes/series/preview');
  expect(centerCommand.mock.calls[0][1]).toMatchObject({timezone:'Europe/Madrid',rule:{until:'2026-11-01',weekdays:[0],excludedDates:[]}});
  await click('Create weekly series');expect(centerCommand).toHaveBeenCalledTimes(1);await act(async()=>confirmSheet.mock.calls[0][0].onConfirm());await click('Create weekly series');await act(async()=>confirmSheet.mock.calls[1][0].onConfirm());
  expect(centerCommand.mock.calls[1][0]).toBe('/api/centers/classes/series/create');expect(centerCommand.mock.calls[2][1].requestId).toBe(centerCommand.mock.calls[1][1].requestId);expect(centerClassSeries).toHaveBeenCalledWith('a','cs_one');
})
it('invalidates a reviewed series and old confirmations when fields or excluded dates change',async()=>{
  centerCommand.mockResolvedValue(reviewSeriesPage());await weeklyEditor();await click('Review class series');await click('Create weekly series');
  fill(field('Class name'),'Changed class');expect(button('Create weekly series').disabled).toBe(true);await act(async()=>confirmSheet.mock.calls[0][0].onConfirm());expect(centerCommand).toHaveBeenCalledTimes(1);
  await click('Review class series');await checkLabel('Exclude date 2026-10-25');expect(button('Create weekly series').disabled).toBe(true);expect(host.textContent).toContain('Review this series again after changes.');
  centerCommand.mockResolvedValue(reviewSeriesPage({summary:{total:1,ready:0,excluded:1,errors:0},rows:[{date:'2026-10-25',status:'excluded'}]}));await click('Review class series');expect(centerCommand.mock.calls.at(-1)[1].rule.excludedDates).toEqual(['2026-10-25']);expect(button('Create weekly series').disabled).toBe(true);
})
it('keeps ambiguous dates and over-limit series blocked until explicitly reviewed again',async()=>{
  centerCommand.mockResolvedValue(reviewSeriesPage({summary:{total:1,ready:0,excluded:0,errors:1},rows:[{date:'2026-10-25',status:'error',code:'class-time-ambiguous'}]}));await weeklyEditor();await click('Review class series');expect(button('Create weekly series').disabled).toBe(true);
  expect(host.textContent).toContain('Choose the first or second occurrence of this repeated hour.');await rowClick('From');await rowClick('First occurrence');await rowClick('To');await rowClick('Second occurrence');
  centerCommand.mockResolvedValue(reviewSeriesPage({limitExceeded:true}));await click('Review class series');expect(button('Create weekly series').disabled).toBe(true);expect(centerCommand.mock.calls.at(-1)[1].fields.disambiguation).toEqual({start:'earlier',end:'later'});
})
it('discards a delayed series review after switching centers',async()=>{
  let release;centerCommand.mockImplementationOnce(()=>new Promise(resolve=>release=resolve));await weeklyEditor();await click('Review class series');await render({centerId:'b',own:false,canManage:true});
  await act(async()=>{release(reviewSeriesPage());await Promise.resolve()});expect(button('Create weekly series')).toBeUndefined();expect(host.textContent).not.toContain('Ready to create');
})
it('pages the series directory and returns from roster through the actual series origin',async()=>{
  centerClassSeriesList.mockResolvedValueOnce({series:[group('cs_one')],nextCursor:'next_series'}).mockResolvedValueOnce({series:[group('cs_two')],nextCursor:null});centerClassSeries.mockResolvedValue(seriesDetails());await render({own:false,canManage:true});await click('Class series');await click('Show more');
  expect(centerClassSeriesList).toHaveBeenLastCalledWith('a',{cursor:'next_series'});expect(host.textContent).toContain('Weekly cs_one');expect(host.textContent).toContain('Weekly cs_two');
  await rowClick('Weekly cs_one');await click('Class roster');await click('Back');expect(centerClassSeries).toHaveBeenCalledTimes(2);centerClassSeriesList.mockResolvedValue({series:[group('cs_one')],nextCursor:null});await click('Back');expect(host.textContent).toContain('Create weekly series');
  await click('Back');centerClasses.mockResolvedValue({...page,classes:[{...event,seriesId:'cs_one'}]});await click('Reload centers');await click('View series');await click('Back');expect(host.textContent).toContain('New class');
})

const cancelReview=()=>({definitionVersion:1,series:group('cs_one'),reviewHash:'b'.repeat(64),classes:[{...event,cancelable:true},{...event,id:'old',name:'Past class',cancelable:false}],summary:{classes:1,booked:1,waiting:0,skipped:1}})
async function openSeriesCancellation(){centerClassSeriesList.mockResolvedValue({series:[group('cs_one')],nextCursor:null});centerClassSeries.mockResolvedValue(seriesDetails());await render({own:false,canManage:true});await click('Class series');await rowClick('Weekly cs_one');await click('Cancel future classes')}
it('reviews affected classes and reservations and confirms cancellation with a reason and stable retry key',async()=>{
  centerCommand.mockResolvedValueOnce(cancelReview()).mockRejectedValueOnce({code:'network'}).mockResolvedValueOnce({});await openSeriesCancellation();expect(button('Cancel future classes').disabled).toBe(true);expect(host.textContent).toContain('Past class');expect(host.textContent).toContain('Preserved');
  fill(host.querySelector('textarea'),'Closure reviewed');await click('Cancel future classes');expect(centerCommand).toHaveBeenCalledTimes(1);expect(confirmSheet.mock.calls[0][0].danger).toBe(true);await act(async()=>confirmSheet.mock.calls[0][0].onConfirm());
  await click('Cancel future classes');await act(async()=>confirmSheet.mock.calls[1][0].onConfirm());expect(centerCommand.mock.calls[1][0]).toBe('/api/centers/classes/series/cancel');expect(centerCommand.mock.calls[1][1]).toMatchObject({centerId:'a',id:'cs_one',reason:'Closure reviewed',reviewHash:'b'.repeat(64)});expect(centerCommand.mock.calls[2][1].requestId).toBe(centerCommand.mock.calls[1][1].requestId);
  await click('Back');expect(host.textContent).toContain('Create weekly series');
})
it('invalidates changed cancellation confirmations and requires fresh server review after a booking conflict',async()=>{
  centerCommand.mockResolvedValueOnce(cancelReview()).mockRejectedValueOnce({code:'class-series-review-changed'}).mockResolvedValueOnce({...cancelReview(),reviewHash:'c'.repeat(64)});await openSeriesCancellation();fill(host.querySelector('textarea'),'Old reason');await click('Cancel future classes');fill(host.querySelector('textarea'),'New reason');await act(async()=>confirmSheet.mock.calls[0][0].onConfirm());expect(centerCommand).toHaveBeenCalledTimes(1);
  await click('Cancel future classes');await act(async()=>confirmSheet.mock.calls[1][0].onConfirm());expect(button('Cancel future classes').disabled).toBe(true);await click('Review class series');expect(host.querySelector('textarea').value).toBe('New reason');expect(button('Cancel future classes').disabled).toBe(false);
})
it('does not apply cancellation review or confirmations from a different selected center',async()=>{
  let release;centerCommand.mockImplementationOnce(()=>new Promise(resolve=>release=resolve));await openSeriesCancellation();await render({centerId:'b',own:false,canManage:true});await act(async()=>release(cancelReview()));expect(host.textContent).not.toContain('Past class');expect(host.querySelector('textarea')).toBeNull();
  centerCommand.mockResolvedValueOnce(cancelReview());await openSeriesCancellation();fill(host.querySelector('textarea'),'Valid reason');await click('Cancel future classes');await render({centerId:'b',own:false,canManage:true});await act(async()=>confirmSheet.mock.calls.at(-1)[0].onConfirm());expect(centerCommand).toHaveBeenCalledTimes(2);
})
