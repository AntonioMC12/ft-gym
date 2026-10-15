import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {startCentersWorker} from '../centers/services/worker-lifecycle.js';
test('independent center workers do not overlap and stop waits for in-flight provider work',async()=>{
  let release,started;const running=new Promise(resolve=>started=resolve),pending=new Promise(resolve=>release=resolve);let ticks=0;
  const worker=startCentersWorker(async()=>{ticks++;started();await pending},{enabled:true,intervalMs:10});
  await running;await delay(25);assert.equal(ticks,1);let stopped=false;const finish=worker.stop().then(()=>stopped=true);await delay(5);assert.equal(stopped,false);release();await finish;await delay(20);assert.equal(ticks,1);assert.equal(stopped,true);
});
test('a failing independent worker reports only a stable error code and another worker still runs',async()=>{
  let first,second;const failed=new Promise(resolve=>first=resolve),succeeded=new Promise(resolve=>second=resolve);
  const bad=startCentersWorker(async()=>{throw new Error('private provider response')},{enabled:true,onError:code=>first(code)}),good=startCentersWorker(async()=>second('done'),{enabled:true});
  try{assert.equal(await failed,'centers-jobs-unavailable');assert.equal(await succeeded,'done')}finally{await Promise.all([bad.stop(),good.stop()])}
});
