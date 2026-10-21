import {test} from 'node:test';
import assert from 'node:assert/strict';
import {maintenanceTick,startMaintenanceWorker} from '../centers/services/maintenance.js';

test('partial maintenance commits healthy centers and returns only counts plus a private next key',async()=>{
  const selected=[];
  const database={platformTransaction:async(uid,work,center)=>{
    selected.push(center);
    if(center==='a')throw new Error('sensitive SQL payload');
    return work({query:async(sql,args)=>{
      if(!center){assert.deepEqual(args,['before']);return {rows:[{center_id:'a'},{center_id:'b'}]}}
      return {rows:[{expired:3}]};
    }});
  }};
  assert.deepEqual(await maintenanceTick(database,{afterCenter:'before'}),{centers:2,expired:3,failed:1,nextCenter:'b'});
  assert.deepEqual(selected,[undefined,'a','b']);
});
test('maintenance rotates after failed centers, resets at the end, and hides keys/errors from observers',async()=>{
  let tick=0,finish;const observed=[],keys=[],errors=[],third=new Promise(resolve=>finish=resolve);
  const database={platformTransaction:async(uid,work,center)=>{
    if(center)throw new Error('private center/audit/DSN');
    return work({query:async(sql,args)=>{keys.push(args[0]);return {rows:tick++===1?[]:[{center_id:'center_private'}]}}});
  }};
  const worker=startMaintenanceWorker(database,{enabled:true,intervalMs:1,onResult:value=>{observed.push(value);if(observed.length===3)finish()},onError:code=>errors.push(code)});
  try{await third}finally{await worker.stop()}
  assert.deepEqual(keys,[null,'center_private',null]);
  assert.deepEqual(observed,[{centers:1,expired:0,failed:1},{centers:0,expired:0,failed:0},{centers:1,expired:0,failed:1}]);
  assert.deepEqual(errors,['centers-maintenance-partial','centers-maintenance-partial']);
});
test('disabled maintenance performs no discovery or database connection',async()=>{
  const worker=startMaintenanceWorker({platformTransaction:()=>{assert.fail('database accessed')}});await worker.stop();
});
