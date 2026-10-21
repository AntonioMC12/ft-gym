import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {isolatedDatabase,startHttp} from './helpers.mjs';
import {createCentersDatabase} from '../../centers/db.js';
test('platform pagination reaches beyond100 centers with tied timestamps, literal search and account-bound cursors',async t=>{
  const {app,migrator}=await isolatedDatabase(),database=createCentersDatabase({enabled:true,databaseUrl:app});t.after(async()=>{await database.close();await migrator.end()});
  const p='pages_'+randomBytes(5).toString('hex'),root=p+'_root',root2=p+'_root2',technical=p+'_technical';
  const h=await startHttp(t,{app,superadminUids:[root,root2],users:[{id:root,name:root},{id:root2,name:root2},{id:technical,name:technical,admin:true}]});
  await database.platformTransaction(root,async client=>{
    await client.query("INSERT INTO centers.centers(id,name) SELECT $1||'_'||n::text,$1||' batch '||lpad(n::text,3,'0') FROM generate_series(1,103) n",[p]);
    await client.query('INSERT INTO centers.centers(id,name) VALUES($1,$2)',[p+'_special',p+' literal %_\\']);
  });
  const req=async(params,uid=root)=>{const response=await fetch(h.base+'/api/platform/centers?'+new URLSearchParams(params),{headers:h.headers(uid)});return {status:response.status,body:await response.json()}};
  const first=await req({query:p+' batch',limit:40});assert.equal(first.status,200);assert.equal(first.body.centers.length,40);assert.ok(first.body.nextCursor);
  const second=await req({query:p+' batch',limit:40,cursor:first.body.nextCursor}),third=await req({query:p+' batch',limit:40,cursor:second.body.nextCursor});
  assert.equal(second.body.centers.length,40);assert.equal(third.body.centers.length,23);assert.equal(third.body.nextCursor,null);assert.equal(new Set([...first.body.centers,...second.body.centers,...third.body.centers].map(row=>row.id)).size,103);
  assert.equal((await req({query:p+' batch'})).body.centers.length,30);
  assert.equal((await req({query:p+' changed',cursor:first.body.nextCursor})).status,400);
  assert.equal((await req({query:p+' batch',cursor:first.body.nextCursor},root2)).status,400);
  assert.equal((await req({query:p},technical)).status,403,'technical admin never inherits platform listing');
  assert.equal((await req({query:'%_\\'})).body.centers.filter(row=>row.id===p+'_special').length,1,'search wildcards are literal');
  assert.equal((await req({limit:'101'})).status,400);
});
