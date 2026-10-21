import {CentersError} from '../errors.js';
import {memberFields} from './member-validation.js';

export const CSV_MAX_BYTES=2*1024*1024,CSV_MAX_ROWS=1000;
const invalid=()=>{throw new CentersError(400,'invalid-member-csv','invalid UTF-8 member CSV, headers or limits')};
const aliases={name:'name',nombre:'name',nombresocio:'name',nombrecompleto:'name',email:'email',correo:'email',correoelectronico:'email',phone:'phone',telefono:'phone',nationaldocument:'nationalDocument',documento:'nationalDocument',documentodeidentidad:'nationalDocument',dni:'nationalDocument',nif:'nationalDocument',marcatemporal:'submittedAt','nºabonado':'subscriberNumber','noabonado':'subscriberNumber',direccion:'address',fechanacimiento:'birthDate'};
const conditionsTitle='Condiciones de Inscripción y protección de datos';
const headerKey=value=>value.trim().normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[\s_-]/g,'');
const sourceKeys=['submittedAt','subscriberNumber','address','birthDate','conditionsResponse'];
function sourceDetails(raw,conditionsHeader){
  const limits={submittedAt:80,subscriberNumber:40,address:500,birthDate:10,conditionsResponse:2000};
  const result={};
  for(const key of sourceKeys){
    if(!Object.hasOwn(raw,key))continue;
    const value=raw[key].trim();
    if(value.length>limits[key]||/[\u0000-\u001f\u007f]/.test(value))invalid();
    result[key]=value||null;
  }
  if(result.birthDate){
    const iso=/^(\d{4})-(\d{2})-(\d{2})$/.exec(result.birthDate),es=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(result.birthDate);
    if(!iso&&!es)invalid();
    const [year,month,day]=iso?iso.slice(1).map(Number):[+es[3],+es[2],+es[1]];
    const date=new Date(0);date.setUTCFullYear(year,month-1,day);
    if(year<1||date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)invalid();
    result.birthDate=`${String(year).padStart(4,'0')}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  }
  if(conditionsHeader)result.conditionsText=conditionsHeader.trim();
  return Object.keys(result).length?result:null;
}

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
    }else if(ch===separator){cells.push(cell);if(cells.length>=10)invalid();cell='';closed=false}
    else if(ch==='\n'||ch==='\r'){
      if(ch==='\r'&&text[i+1]!=='\n')invalid();if(ch==='\r')i++;
      finish();line++;startLine=line;
    }else if(ch==='"'){if(cell||closed)invalid();quoted=true}
    else{if(closed)invalid();cell+=ch}
  }
  if(quoted)invalid();if(cell||cells.length||closed)finish();
  if(rows.length<2)invalid();
  let conditionsHeader=null;
  const columns=rows.shift().cells.map(value=>{
    if(value.length>16000)invalid();
    const title=value.split(/\r?\n/,1)[0];
    if(headerKey(title)===headerKey(conditionsTitle)){conditionsHeader=value;return 'conditionsResponse'}
    const key=headerKey(value);return Object.hasOwn(aliases,key)?aliases[key]:undefined;
  });
  if(columns.some(key=>!key)||new Set(columns).size!==columns.length||!columns.includes('name'))invalid();
  return rows.map((row,index)=>{
    const record=index+1;
    if(row.cells.length!==columns.length)return {record,line:row.line,fields:null,error:'invalid-columns'};
    const raw=Object.fromEntries(columns.map((key,i)=>[key,row.cells[i]]));
    try{
      const fields=memberFields(raw),sourceRegistration=sourceDetails(raw,conditionsHeader);
      return {record,line:row.line,fields,...(sourceRegistration?{sourceRegistration}:{}),error:null};
    }catch{return {record,line:row.line,fields:null,error:'invalid-fields'}}
  });
}
