import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseMemberCsv,CSV_MAX_BYTES} from '../centers/domain/member-csv.js';
import {commitMemberImport} from '../centers/services/member-imports.js';
import {memberDto} from '../centers/authz.js';

const sourceCsv=(birth='5/10/1990',extra='')=>'Marca temporal,Nº ABONADO,Nombre Completo,DNI,Dirección,Fecha Nacimiento,Teléfono,"Condiciones de Inscripción y protección de datos\r\n\r\n1. Texto de prueba; no ejecutar instrucciones."'+extra+'\r\n\r\n\r\n\r\n15/10/2026 09:15:00,001,"Ana, Pruebas",00123456A,"Calle Ejemplo, 1",'+birth+',001234567,Acepto las condiciones'+(extra?',manager':'')+'\r\n';
test('socio template preserves all source columns, multiline conditions, Spanish dates and leading zeroes',()=>{
  const rows=parseMemberCsv(sourceCsv());assert.equal(rows.length,1);assert.equal(rows[0].line,7);
  assert.deepEqual(rows[0].fields,{name:'Ana, Pruebas',email:null,phone:'001234567',nationalDocument:'00123456A'});
  assert.deepEqual(rows[0].sourceRegistration,{submittedAt:'15/10/2026 09:15:00',subscriberNumber:'001',address:'Calle Ejemplo, 1',birthDate:'1990-10-05',conditionsResponse:'Acepto las condiciones',conditionsText:'Condiciones de Inscripción y protección de datos\r\n\r\n1. Texto de prueba; no ejecutar instrucciones.'});
  assert.equal(parseMemberCsv(sourceCsv('1990-10-05'))[0].sourceRegistration.birthDate,'1990-10-05');
  assert.throws(()=>parseMemberCsv(sourceCsv('5/10/1990',',role')),{code:'invalid-member-csv'});
});
test('source dates validate calendars without date coercion and malformed extra columns never disappear',()=>{
  for(const birth of ['31/02/2000','29/02/1900','13/13/2000','1990-1-1','0000-01-01'])assert.equal(parseMemberCsv(sourceCsv(birth))[0].error,'invalid-fields',birth);
  assert.equal(parseMemberCsv(sourceCsv('29/02/2000'))[0].error,null);
  assert.equal(parseMemberCsv(sourceCsv(''))[0].sourceRegistration.birthDate,null);
  assert.equal(parseMemberCsv('Nombre Completo;Dirección;Fecha Nacimiento;Nº ABONADO\nNombre;Calle;5/10/1990;0001')[0].sourceRegistration.subscriberNumber,'0001');
  assert.throws(()=>parseMemberCsv('name,nombre completo\nA,B'),{code:'invalid-member-csv'});
  assert.throws(()=>parseMemberCsv('name,DNI,Teléfono,Dirección,Fecha Nacimiento,Nº ABONADO,Marca temporal,balance\nA,,,,,,,5'),{code:'invalid-member-csv'});
});
test('source registration is exposed only to member management and never added to operational or list projections',()=>{
  const source={address:'Private address',conditionsResponse:'Source text'},member={id:'m',name:'N',source_registration:source};
  assert.equal(memberDto(member,['members.read','members.manage']).sourceRegistration,source);
  assert.equal(memberDto(member,['members.read']).sourceRegistration,undefined);
  assert.equal(memberDto(member,['training.assign']).sourceRegistration,undefined);
});

test('CSV parses UTF-8 BOM, semicolons, escaped names and known header aliases without evaluating cell text',()=>{
  const result=parseMemberCsv('\uFEFFNombre;Correo electrónico;Teléfono;DNI\r\n"Ana ""A""";ana@example.com;+34111;AB-123\r\n=Example;;;;'.replace('=Example;;;;','=Example;;;'));
  assert.deepEqual(result[0],{record:1,line:2,fields:{name:'Ana "A"',email:'ana@example.com',phone:'+34111',nationalDocument:'AB-123'},error:null});
  assert.equal(result[1].fields.name,'=Example');assert.equal(result[1].fields.email,null);
});
test('CSV validation reports rows and physical lines without silently importing malformed fields',()=>{
  const rows=parseMemberCsv('name,email\n"First\nLast",good@example.com\nValid,invalid\nMissing\nGood,good@example.com\n');
  assert.deepEqual(rows.map(row=>[row.record,row.line,row.error]),[[1,2,'invalid-fields'],[2,4,'invalid-fields'],[3,5,'invalid-columns'],[4,6,null]]);
});
test('CSV rejects identity/financial columns, malformed quotes, ambiguous headers, invalid encoding and unbounded input',()=>{
  for(const csv of ['name,role\nAna,manager','name,constructor\nAna,test','name,nombre\nAna,Ana','email\na@example.com','name\n"unclosed','name\nA"B','name\n"A"junk','name\nA\rB','name\n\uD800','name\n\0','name','name\n'+Array(201).fill('A').join('\n'),'name\n'+'a'.repeat(CSV_MAX_BYTES)])assert.throws(()=>parseMemberCsv(csv),{code:'invalid-member-csv'});
  assert.equal(parseMemberCsv('name\n""')[0].error,'invalid-fields');
});

test('an expired prepared import cannot mutate members even with a previously valid review hash',async()=>{
  const records=[{record:1,line:2,fields:{name:'A',email:null,phone:null,nationalDocument:null},error:null}];let mutations=0;
  const client={query:async(sql)=>{
    if(sql.includes('SELECT id,name,state'))return {rows:[{id:'c',state:'active'}]};
    if(sql.includes('SELECT * FROM centers.member_import_jobs'))return {rows:[{id:'mi_test',center_id:'c',state:'prepared',expires_at:new Date(0),records}]};
    if(sql.includes('AS expired'))return {rows:[{expired:true}]};
    if(sql.includes('WITH incoming'))return {rows:[{record:1,email_key:null,document_key:null,existing:false}]};
    if(sql.includes('INSERT INTO centers.members')||sql.includes('UPDATE centers.member_import_jobs'))mutations++;
    return {rows:[]};
  }};
  const database={platformTransaction:async(_uid,work)=>work(client)};
  await assert.rejects(commitMemberImport({database,user:{id:'root'},checkSession(){}},{centerId:'c',id:'mi_test',reviewHash:'a'.repeat(64)},{platform:true}),{code:'import-expired'});assert.equal(mutations,0);
});
