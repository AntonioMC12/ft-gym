import {CentersError} from '../errors.js';
import {memberFields} from './member-validation.js';

export const CSV_MAX_BYTES=256*1024,CSV_MAX_ROWS=200;
const invalid=()=>{throw new CentersError(400,'invalid-member-csv','invalid UTF-8 member CSV, headers or limits')};
const aliases={name:'name',nombre:'name',nombresocio:'name',email:'email',correo:'email',correoelectronico:'email',phone:'phone',telefono:'phone',nationaldocument:'nationalDocument',documento:'nationalDocument',documentodeidentidad:'nationalDocument',dni:'nationalDocument',nif:'nationalDocument'};

// Bounded RFC4180-style records. Commas or semicolons, CRLF/LF, escaped quotes and
// UTF-8 BOM are accepted; a quote in an unquoted cell is never silently repaired.
export function parseMemberCsv(input){
  if(typeof input!=='string'||Buffer.byteLength(input,'utf8')>CSV_MAX_BYTES||!input.isWellFormed()||input.includes('\0'))invalid();
  const text=input.replace(/^\uFEFF/,''),header=text.split(/\r?\n/,1)[0];
  const separator=header.includes(';')?';':',';
  let cell='',cells=[],quoted=false,closed=false,line=1,startLine=1,rows=[],started=false;
  const finish=()=>{
    cells.push(cell);if(started)rows.push({line:startLine,cells});
    if(rows.length>CSV_MAX_ROWS+1)invalid();cell='';cells=[];closed=false;started=false;
  };
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(ch!=='\n'&&ch!=='\r')started=true;
    if(quoted){
      if(ch==='"'){if(text[i+1]==='"'){cell+='"';i++}else{quoted=false;closed=true}}
      else{cell+=ch;if(ch==='\n')line++}
    }else if(ch===separator){cells.push(cell);if(cells.length>4)invalid();cell='';closed=false}
    else if(ch==='\n'||ch==='\r'){
      if(ch==='\r'&&text[i+1]!=='\n')invalid();if(ch==='\r')i++;
      finish();line++;startLine=line;
    }else if(ch==='"'){if(cell||closed)invalid();quoted=true}
    else{if(closed)invalid();cell+=ch}
  }
  if(quoted)invalid();if(cell||cells.length||closed)finish();
  if(rows.length<2)invalid();
  const columns=rows.shift().cells.map(value=>{const key=value.trim().normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[ _-]/g,'');return Object.hasOwn(aliases,key)?aliases[key]:undefined});
  if(columns.some(key=>!key)||new Set(columns).size!==columns.length||!columns.includes('name'))invalid();
  return rows.map((row,index)=>{
    const record=index+1;
    if(row.cells.length!==columns.length)return {record,line:row.line,fields:null,error:'invalid-columns'};
    const raw=Object.fromEntries(columns.map((key,i)=>[key,row.cells[i]]));
    try{return {record,line:row.line,fields:memberFields(raw),error:null}}catch{return {record,line:row.line,fields:null,error:'invalid-fields'}}
  });
}
