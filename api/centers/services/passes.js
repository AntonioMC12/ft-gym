import {CentersError} from '../errors.js';
import {objectBody,idField,requestField,textField,versionField} from '../domain/validation.js';
import {passFields,passDates} from '../domain/passes.js';
import {businessTransaction} from './context.js';
import {memberRecord} from './member-records.js';
import {commandHash,commandReplay,rememberCommand,businessAudit} from './commands.js';
import {cursorScope,readCursor,nextCursor} from '../domain/pagination.js';
const missing=()=>{throw new CentersError(404,'not-found','not found')};
const conflict=code=>{throw new CentersError(409,code,'pass changed; reload')};
const productDto=p=>({id:p.id,name:p.name,kind:p.kind,credits:p.credits,validDays:p.valid_days,priceMinor:p.price_minor,priceIncludesTax:p.price_includes_tax,taxBasisPoints:p.tax_basis_points,netMinor:p.net_minor,taxMinor:p.tax_minor,totalMinor:p.total_minor,currency:'EUR',archived:p.archived,version:p.version});
async function product(client,c,id){return (await client.query('SELECT * FROM centers.pass_products WHERE center_id=$1 AND id=$2',[c,id])).rows[0]||missing()}
export function listPassProducts(database,uid,centerId,options,{platform=false}={}){
  return businessTransaction(database,uid,centerId,'plans.manage',async client=>{
    const scope=cursorScope(['pass-products',uid,centerId,options.archived]),after=readCursor(options.cursor,scope),{rows}=await client.query('SELECT *,created_at::text AS cursor_at FROM centers.pass_products WHERE center_id=$1 AND ($2 OR NOT archived) AND ($3::timestamptz IS NULL OR (created_at,id)<($3::timestamptz,$4::text)) ORDER BY created_at DESC,id DESC LIMIT 31',[centerId,options.archived,after?.at||null,after?.id||null]);
    const page=rows.slice(0,30);return {products:page.map(productDto),nextCursor:rows.length>30?nextCursor(scope,page.at(-1)):null};
  },{platform,allowInactive:true});
}
export function createPassProduct({database,user,checkSession},raw,{platform=false}={}){
  objectBody(raw,['centerId','fields','requestId']);const centerId=idField(raw.centerId),fields=passFields(raw.fields),requestId=requestField(raw.requestId),operation='pass.product.create',hash=commandHash(fields);
  return businessTransaction(database,user.id,centerId,'plans.manage',async client=>{
    const replay=await commandReplay(client,centerId,user.id,operation,requestId,hash);if(replay)return {product:productDto(await product(client,centerId,replay.id))};
    const id='pp_'+commandHash([centerId,user.id,requestId]).slice(0,32);checkSession();
    await client.query('INSERT INTO centers.pass_products(id,center_id,name,kind,credits,valid_days,price_minor,price_includes_tax,tax_basis_points,net_minor,tax_minor,total_minor,actor_uid) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',[id,centerId,fields.name,fields.kind,fields.credits,fields.validDays,fields.priceMinor,fields.priceIncludesTax,fields.taxBasisPoints,fields.netMinor,fields.taxMinor,fields.totalMinor,user.id]);
    await businessAudit(client,centerId,user.id,operation,id);await rememberCommand(client,centerId,user.id,operation,requestId,hash,{id});checkSession();return {product:productDto(await product(client,centerId,id))};
  },{platform});
}
export function archivePassProduct({database,user,checkSession},raw,{platform=false}={}){
  objectBody(raw,['centerId','id','version','requestId']);const centerId=idField(raw.centerId),id=idField(raw.id),version=versionField(raw.version),requestId=requestField(raw.requestId),operation='pass.product.archive',hash=commandHash({id,version});
  return businessTransaction(database,user.id,centerId,'plans.manage',async client=>{
    const replay=await commandReplay(client,centerId,user.id,operation,requestId,hash),row=await product(client,centerId,id);if(!replay){if(row.version!==version)conflict('version-conflict');if(!row.archived){await client.query('UPDATE centers.pass_products SET archived=true,version=version+1 WHERE center_id=$1 AND id=$2',[centerId,id]);await businessAudit(client,centerId,user.id,operation,id)}await rememberCommand(client,centerId,user.id,operation,requestId,hash,{id})}checkSession();return {product:productDto(await product(client,centerId,id))};
  },{platform,allowInactive:true});
}
async function quote(client,uid,c,m,p,start){
  const member=await memberRecord(client,c,m),terms=await product(client,c,p);if(terms.archived)conflict('pass-unavailable');
  if(member.state!=='active'||member.joined_on>member.local_today||member.ends_on&&member.ends_on<=member.local_today)conflict('pass-member-inactive');
  const dates=passDates(start,terms.valid_days,member.local_today);
  const value={definitionVersion:1,centerId:c,actorUid:uid,memberId:m,memberVersion:member.version,memberName:member.name,memberNumber:member.member_number,product:productDto(terms),...dates,today:member.local_today};return {quote:value,quoteHash:commandHash(value)};
}
export function previewPassPurchase({database,user},raw,{platform=false}={}){
  objectBody(raw,['centerId','memberId','productId','startsOn']);const c=idField(raw.centerId),m=idField(raw.memberId),p=idField(raw.productId);
  return businessTransaction(database,user.id,c,'billing.manage',client=>quote(client,user.id,c,m,p,raw.startsOn),{platform});
}
const purchaseProjection=`b.*,b.starts_on::text AS starts_on,b.ends_on::text AS ends_on,b.created_at::text AS cursor_at,p.name,p.kind,p.credits,p.total_minor,
  (SELECT count(*)::integer FROM centers.pass_consumptions u WHERE (u.center_id,u.pass_id)=(b.center_id,b.id)) AS used,
  EXISTS(SELECT 1 FROM centers.pass_revocations r WHERE (r.center_id,r.pass_id)=(b.center_id,b.id)) AS revoked,
  centers.pass_available(b.center_id,b.member_id,b.id,(statement_timestamp() AT TIME ZONE c.timezone)::date) AS available,
  centers.access_decision(b.center_id,b.member_id,statement_timestamp(),b.id)='allowed' AS can_use`;
const purchaseFrom=` FROM centers.pass_purchases b JOIN centers.pass_products p ON (p.center_id,p.id)=(b.center_id,b.product_id) JOIN centers.centers c ON c.id=b.center_id `;
const purchaseDto=r=>({id:r.id,memberId:r.member_id,name:r.name,kind:r.kind,credits:r.credits,used:r.used,remaining:r.credits-r.used,startsOn:r.starts_on,endsOn:r.ends_on,receiptId:r.receipt_id,totalMinor:r.total_minor,currency:'EUR',revoked:r.revoked,available:r.available,canUse:r.can_use});
async function purchase(client,c,id){const row=(await client.query('SELECT '+purchaseProjection+purchaseFrom+'WHERE b.center_id=$1 AND b.id=$2',[c,id])).rows[0]||missing();return purchaseDto(row)}
export function buyPass({database,user,checkSession},raw,{platform=false}={}){
  objectBody(raw,['centerId','memberId','productId','startsOn','quoteHash','requestId']);const c=idField(raw.centerId),m=idField(raw.memberId),p=idField(raw.productId),requestId=requestField(raw.requestId);
  if(typeof raw.quoteHash!=='string'||!/^[a-f0-9]{64}$/.test(raw.quoteHash))throw new CentersError(400,'invalid-pass','quote required');
  const operation='pass.purchase',hash=commandHash({memberId:m,productId:p,startsOn:raw.startsOn,quoteHash:raw.quoteHash});
  return businessTransaction(database,user.id,c,'billing.manage',async(client,context)=>{
    const replay=await commandReplay(client,c,user.id,operation,requestId,hash);if(replay){checkSession();return {pass:await purchase(client,c,replay.id)}}
    if(context.center.state!=='active')conflict('center-inactive');const preview=await quote(client,user.id,c,m,p,raw.startsOn);if(preview.quoteHash!==raw.quoteHash)conflict('quote-changed');
    const id='pb_'+commandHash([c,user.id,requestId]).slice(0,32),q=preview.quote,paid=q.product.kind==='paid',receiptId=paid?'rc_'+commandHash([c,id,'pass']).slice(0,32):null;checkSession();
    await client.query('INSERT INTO centers.pass_purchases(id,center_id,member_id,product_id,starts_on,ends_on,receipt_id,actor_uid) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,c,m,p,q.startsOn,q.endsOn,receiptId,user.id]);
    if(paid){const snapshot={definitionVersion:1,concept:'pass',name:q.product.name,memberName:q.memberName,memberNumber:q.memberNumber,credits:q.product.credits,startsOn:q.startsOn,periodStart:q.today,periodEnd:q.endsOn,currency:'EUR',netMinor:q.product.netMinor,taxMinor:q.product.taxMinor,totalMinor:q.product.totalMinor,priceIncludesTax:q.product.priceIncludesTax,taxBasisPoints:q.product.taxBasisPoints};
      await client.query("INSERT INTO centers.receipts(id,center_id,member_id,concept,pass_purchase_id,period_start,period_end,due_on,currency,net_minor,tax_minor,total_minor,snapshot,actor_uid) VALUES($1,$2,$3,'pass',$4,$5,$6,$5,'EUR',$7,$8,$9,$10,$11)",[receiptId,c,m,id,q.today,q.endsOn,q.product.netMinor,q.product.taxMinor,q.product.totalMinor,JSON.stringify(snapshot),user.id]);
      await businessAudit(client,c,user.id,'receipt.created',receiptId,{memberId:m,passId:id});await client.query("INSERT INTO centers.outbox(id,center_id,receipt_id,kind,payload) VALUES($1,$2,$3,'receipt.created',$4)",['ob_'+commandHash([c,receiptId,'receipt.created']).slice(0,32),c,receiptId,JSON.stringify({receiptId})]);
    }
    await businessAudit(client,c,user.id,operation,id,{memberId:m,productId:p});await rememberCommand(client,c,user.id,operation,requestId,hash,{id});checkSession();return {pass:await purchase(client,c,id)};
  },{platform,allowInactive:true});
}
export function listPasses(database,uid,c,memberId,options,{platform=false,own=false}={}){
  return businessTransaction(database,uid,c,own?'membership.own.read':'billing.read',async client=>{
    if(own)memberId=(await client.query('SELECT id FROM centers.members WHERE center_id=$1 AND account_uid=$2',[c,uid])).rows[0]?.id||missing();else await memberRecord(client,c,memberId);
    const scope=cursorScope(['passes',uid,c,memberId,own]),after=readCursor(options.cursor,scope),{rows}=await client.query('SELECT '+purchaseProjection+purchaseFrom+'WHERE b.center_id=$1 AND b.member_id=$2 AND ($3::timestamptz IS NULL OR (b.created_at,b.id)<($3::timestamptz,$4::text)) ORDER BY b.created_at DESC,b.id DESC LIMIT 31',[c,memberId,after?.at||null,after?.id||null]);const page=rows.slice(0,30);return {passes:page.map(purchaseDto),nextCursor:rows.length>30?nextCursor(scope,page.at(-1)):null};
  },{platform:!own&&platform,allowInactive:true});
}
export function revokePass({database,user,checkSession},raw,{platform=false}={}){
  objectBody(raw,['centerId','id','reason','requestId']);const c=idField(raw.centerId),id=idField(raw.id),reason=textField(raw.reason,250,{required:true}),requestId=requestField(raw.requestId),operation='pass.revoke',hash=commandHash({id,reason});
  return businessTransaction(database,user.id,c,'billing.manage',async client=>{
    if(!await commandReplay(client,c,user.id,operation,requestId,hash)){const row=await purchase(client,c,id);if(row.revoked)conflict('pass-revoked');checkSession();await client.query('INSERT INTO centers.pass_revocations(id,center_id,member_id,pass_id,reason,actor_uid) VALUES($1,$2,$3,$4,$5,$6)',['pr_'+commandHash([c,id]).slice(0,32),c,row.memberId,id,reason,user.id]);await businessAudit(client,c,user.id,operation,id);await rememberCommand(client,c,user.id,operation,requestId,hash,{id})}checkSession();return {pass:await purchase(client,c,id)};
  },{platform,allowInactive:true});
}
