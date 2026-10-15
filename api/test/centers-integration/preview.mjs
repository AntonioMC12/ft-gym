// Explicit developer-only preview: test database, synthetic identities, temporary training data.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { testUrls } from './helpers.mjs';
import { createCentersDatabase } from '../../centers/db.js';
import { createAccountLocks } from '../../centers/account-links.js';
import { createCenter } from '../../centers/services/centers.js';
import { hashPassword } from '../../password.js';
import {previewOrigin} from './preview-origin.mjs';

const urls=testUrls();
const migrator=new pg.Client({connectionString:urls.migration,connectionTimeoutMillis:3000});
await migrator.connect();
try {
  const {rows}=await migrator.query('SELECT kind FROM centers.environment WHERE singleton');
  if(rows[0]?.kind!=='test')throw new Error('preview requires the isolated test database');
} finally {await migrator.end();}
const origin=previewOrigin(process.env.CENTERS_PREVIEW_ORIGIN);
const saved=process.env.CENTERS_PREVIEW_DATA_DIR;
if(saved&&saved!=='/tmp/ft-gym-centers-preview-data')throw new Error('unexpected fictional preview data directory');
const directory=saved||fs.mkdtempSync(path.join(os.tmpdir(),'ft-gym-centers-preview-'));
fs.mkdirSync(directory,{recursive:true});
const password='Centros-Pruebas-2026!';
const h=await hashPassword(password),now=new Date().toISOString();
const users=[{id:'preview_platform',name:'Plataforma Centros'},{id:'preview_manager',name:'Responsable Pruebas'},{id:'preview_trainer',name:'Entrenador Pruebas'}].map(user=>({...user,created:now,pw:{h,set:now}}));
if(!saved||!fs.existsSync(path.join(directory,'db.json')))fs.writeFileSync(path.join(directory,'db.json'),JSON.stringify({users,creds:[],subs:[],invites:[]}));
else{
  const existing=JSON.parse(fs.readFileSync(path.join(directory,'db.json'),'utf8'));
  if(!users.every(user=>existing.users?.some(row=>row.id===user.id)))throw new Error('saved data lacks fictional preview identities');
}
const db=createCentersDatabase({enabled:true,databaseUrl:urls.app});
const lookup=uid=>JSON.parse(fs.readFileSync(path.join(directory,'db.json'),'utf8')).users.find(user=>user.id===uid);
try {
  await db.status();
  const existing=await db.platformTransaction(users[0].id,client=>client.query(`SELECT c.id FROM centers.centers c WHERE
    EXISTS(SELECT 1 FROM centers.role_assignments r WHERE r.center_id=c.id AND r.account_uid='preview_manager' AND r.role='manager')
    ORDER BY c.created_at DESC LIMIT 1`));
  if(!existing.rows.length)await createCenter({database:db,accountLocks:createAccountLocks(lookup),lookupAccount:lookup,user:users[0],checkSession:()=>{}},
    {name:'Centro de pruebas',capacity:120,managerUid:'preview_manager',requestId:'preview_'+randomUUID(),openingHours:{1:[['08:00','22:00']],2:[['08:00','22:00']],3:[['08:00','22:00']],4:[['08:00','22:00']],5:[['08:00','22:00']]}});
}finally{await db.close();}
Object.assign(process.env,{DATA_DIR:directory,CENTERS_ENABLED:'1',CENTERS_DATABASE_URL:urls.app,CENTERS_SUPERADMIN_UIDS:'preview_platform',
  CENTERS_MAINTENANCE_ENABLED:process.env.CENTERS_PREVIEW_MAINTENANCE_ENABLED==='1'?'1':'0',
  PASSWORD_LOGIN:'1',FIRST_USER_ADMIN:'0',INVITE_ONLY:'1',ALLOW_GUEST:'0',COACH_DISABLED:'1',MEDIA_UPLOADS:'0',DEFAULT_LANG:'es',ORIGIN:origin,RP_ID:new URL(origin).hostname,PORT:'3000'});
if(process.env.CENTERS_PREVIEW_INIT_ONLY!=='1')await import('../../server.js');
