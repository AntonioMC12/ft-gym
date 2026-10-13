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

const urls=testUrls();
const migrator=new pg.Client({connectionString:urls.migration,connectionTimeoutMillis:3000});
await migrator.connect();
try {
  const {rows}=await migrator.query('SELECT kind FROM centers.environment WHERE singleton');
  if(rows[0]?.kind!=='test')throw new Error('preview requires the isolated test database');
} finally {await migrator.end();}
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'ft-gym-centers-preview-'));
const password='Centros-Pruebas-2026!';
const h=await hashPassword(password),now=new Date().toISOString();
const users=[{id:'preview_platform',name:'Plataforma Centros'},{id:'preview_manager',name:'Responsable Pruebas'},{id:'preview_trainer',name:'Entrenador Pruebas'}].map(user=>({...user,created:now,pw:{h,set:now}}));
fs.writeFileSync(path.join(directory,'db.json'),JSON.stringify({users,creds:[],subs:[],invites:[]}));
const db=createCentersDatabase({enabled:true,databaseUrl:urls.app});
try {
  await db.status();
  const existing=await db.platformTransaction(users[0].id,client=>client.query(`SELECT c.id FROM centers.centers c WHERE c.name='Centro de pruebas' AND c.state='active'
    AND EXISTS(SELECT 1 FROM centers.role_assignments r WHERE r.center_id=c.id AND r.account_uid='preview_manager' AND r.role='manager' AND r.revoked_at IS NULL)
    ORDER BY c.created_at DESC LIMIT 1`));
  if(!existing.rows.length)await createCenter({database:db,accountLocks:createAccountLocks(uid=>users.find(u=>u.id===uid)),lookupAccount:uid=>users.find(u=>u.id===uid),user:users[0],checkSession:()=>{}},
    {name:'Centro de pruebas',capacity:120,managerUid:'preview_manager',requestId:'preview_'+randomUUID(),openingHours:{1:[['08:00','22:00']],2:[['08:00','22:00']],3:[['08:00','22:00']],4:[['08:00','22:00']],5:[['08:00','22:00']]}});
}finally{await db.close();}
Object.assign(process.env,{DATA_DIR:directory,CENTERS_ENABLED:'1',CENTERS_DATABASE_URL:urls.app,CENTERS_SUPERADMIN_UIDS:'preview_platform',
  PASSWORD_LOGIN:'1',FIRST_USER_ADMIN:'0',INVITE_ONLY:'1',ALLOW_GUEST:'0',COACH_DISABLED:'1',MEDIA_UPLOADS:'0',DEFAULT_LANG:'es',ORIGIN:'http://localhost:5178',RP_ID:'localhost',PORT:'3000'});
await import('../../server.js');
