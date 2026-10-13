import {createHash} from 'node:crypto';
import {CentersError} from '../errors.js';
import {recordId} from '../authz.js';
export const cursorScope=values=>createHash('sha256').update(JSON.stringify(values)).digest('hex');
export function readCursor(cursor,scope) {
  if(!cursor)return null;
  try {
    const after=JSON.parse(Buffer.from(cursor,'base64url').toString('utf8'));
    if(after.scope!==scope||!recordId(after.id)||typeof after.at!=='string'||!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{1,6})?[+-]\d{2}(?::\d{2})?$/.test(after.at)||!Number.isFinite(Date.parse(after.at)))throw new Error();
    const [year,month,day]=after.at.slice(0,10).split('-').map(Number);
    if(new Date(Date.UTC(year,month-1,day)).toISOString().slice(0,10)!==after.at.slice(0,10))throw new Error();
    return after;
  }catch{throw new CentersError(400,'invalid-input','invalid list cursor');}
}
export const nextCursor=(scope,row)=>Buffer.from(JSON.stringify({scope,at:row.cursor_at,id:row.cursor_id??row.id})).toString('base64url');
