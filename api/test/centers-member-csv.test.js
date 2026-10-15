import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseMemberCsv,CSV_MAX_BYTES} from '../centers/domain/member-csv.js';
import {commitMemberImport} from '../centers/services/member-imports.js';

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
