import {test} from 'node:test';
import assert from 'node:assert/strict';
import {accountDirectoryPage} from '../centers/domain/account-directory.js';
import {centersRoutes} from '../centers/routes.js';

const directory=Array.from({length:75},(_,i)=>({id:'u'+i,name:'Person '+String(i).padStart(3,'0'),disabled:i===4,email:'private@example.com',admin:true}));
test('initial account directory paginates every row with no private fields and filters single characters',()=>{
  let cursor,ids=[];
  do{const page=accountDirectoryPage([...directory].reverse(),'root',new URLSearchParams(cursor?{cursor}:{}));ids.push(...page.accounts.map(a=>a.id));cursor=page.nextCursor;for(const a of page.accounts)assert.deepEqual(Object.keys(a).sort(),['disabled','id','name'])}while(cursor);
  assert.equal(ids.length,75);assert.equal(new Set(ids).size,75);
  assert.equal(accountDirectoryPage(directory,'root',new URLSearchParams('query=0&limit=100')).accounts.length,75);
  assert.equal(accountDirectoryPage(directory,'root',new URLSearchParams('query=u4')).accounts.length,11);
  assert.deepEqual(accountDirectoryPage(directory,'root',new URLSearchParams('query=absent')).accounts,[]);
});
test('account cursors reject another actor, filter, changed account snapshot and invalid selectors',()=>{
  const {nextCursor}=accountDirectoryPage(directory,'root',new URLSearchParams());
  for(const [rows,uid,params] of [[directory,'other',{cursor:nextCursor}],[directory,'root',{cursor:nextCursor,query:'p'}],[directory.slice(1),'root',{cursor:nextCursor}],[directory,'root',{limit:'101'}],[directory,'root',{memberId:'u4'}],[directory,'root',{cursor:'invalid'}]])assert.throws(()=>accountDirectoryPage(rows,uid,new URLSearchParams(params)),{status:400});
});
test('account directory is platform-only even when the technical administrator can authenticate',async()=>{
  const user={id:'technical',admin:true};let result,reads=0;
  const route=centersRoutes({config:{enabled:true,superadminUids:['root']},readSession:()=>user,accountDirectory:()=>{reads++;return directory},json:(_,code,body)=>result={code,body}})['GET /api/platform/centers/accounts'];
  await route({url:'/api/platform/centers/accounts'},{});assert.equal(result.code,403);assert.equal(reads,0);
  user.id='root';await route({url:'/api/platform/centers/accounts'},{});assert.equal(result.code,200);assert.equal(result.body.accounts.length,30);assert.ok(result.body.nextCursor);
});
