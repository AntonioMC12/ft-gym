import {createHash} from 'node:crypto';
import {CentersError} from '../errors.js';

// The directory belongs to the existing JSON account store, never the SQL member
// directory. Snapshot-bound offsets avoid silently skipping accounts after edits.
export function accountDirectoryPage(directory,uid,params){
  const fail=()=>{throw new CentersError(400,'invalid-input','invalid account directory query')};
  if([...params.keys()].some(key=>!['query','cursor','limit'].includes(key)))fail();
  const query=(params.get('query')||'').trim().toLowerCase(),limit=Number(params.get('limit')||30);
  if(query.length>128||!Number.isSafeInteger(limit)||limit<1||limit>100)fail();
  const all=directory.map(a=>({id:a.id,name:a.name,email:typeof a.email==='string'?a.email:null,disabled:!!a.disabled})).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:a.id<b.id?-1:a.id>b.id?1:0);
  const rows=all.filter(a=>!query||a.id.toLowerCase().includes(query)||a.name.toLowerCase().includes(query)||(a.email||'').toLowerCase().includes(query));
  const scope=createHash('sha256').update(JSON.stringify([uid,query,limit,all])).digest('hex');
  let offset=0;const cursor=params.get('cursor');
  if(cursor){
    if(cursor.length>512)fail();let parsed;
    try{parsed=JSON.parse(Buffer.from(cursor,'base64url').toString('utf8'))}catch{fail()}
    if(parsed?.scope!==scope||!Number.isSafeInteger(parsed.offset)||parsed.offset<1||parsed.offset>=rows.length)fail();
    offset=parsed.offset;
  }
  return {accounts:rows.slice(offset,offset+limit),nextCursor:offset+limit<rows.length?Buffer.from(JSON.stringify({scope,offset:offset+limit})).toString('base64url'):null};
}
