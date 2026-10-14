// C24 disposable drill only. This is not a production restore command.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import pg from 'pg';
import {postgresUrl} from '../../centers/config.js';
import {migrationFiles} from '../../centers/migrate.js';
const execute=promisify(execFile);
export const hash=value=>createHash('sha256').update(value).digest('hex');
export function drillUrl(value,side,role) {
  if(process.env.CENTERS_RECOVERY_DRILL!=='fictional-disposable-only'||!['source','target'].includes(side)||!['centers_app','centers_migrator'].includes(role))throw new Error('explicit disposable drill required');
  const url=postgresUrl(value);
  if(url.hostname!==`recovery-${side}-db`||url.pathname!==`/ft_gym_centers_test_recovery_${side}`||decodeURIComponent(url.username)!==role||url.port&&url.port!=='5432'||url.search)throw new Error('recovery URLs must name the dedicated fixture hosts, databases and roles');
  for(const real of [process.env.CENTERS_DATABASE_URL,process.env.CENTERS_MIGRATION_DATABASE_URL].filter(Boolean)){const parsed=postgresUrl(real);if(parsed.hostname===url.hostname&&parsed.pathname===url.pathname)throw new Error('drill cannot target application data')}
  return url;
}
export async function backupClient(url,side) {
  drillUrl(url,side,'centers_app');const parsed=new URL(url);parsed.username='centers_bootstrap';parsed.password=process.env.CENTERS_RECOVERY_BACKUP_PASSWORD||'';
  if(!parsed.password)throw new Error('separate fixture backup credentials required');
  const client=new pg.Client({connectionString:parsed.href,connectionTimeoutMillis:3000,statement_timeout:30000});await client.connect();
  try{await guardDatabase(client,side);return client}catch(error){await client.end();throw error}
}
export async function guardDatabase(client,side) {
  const {rows}=await client.query('SELECT kind,database_name,current_database() AS current_database FROM public.centers_recovery_guard WHERE singleton');
  if(rows.length!==1||rows[0].kind!=='test'||rows[0].database_name!==`ft_gym_centers_test_recovery_${side}`||rows[0].current_database!==rows[0].database_name)throw new Error('dedicated recovery test marker required');
}
export async function pgTool(tool,url,args) {
  if(!['pg_dump','pg_restore'].includes(tool))throw new Error('unsupported recovery tool');
  const parsed=new URL(url),side=tool==='pg_dump'?'source':'target';drillUrl(url,side,'centers_app');
  return execute(tool,['--host',parsed.hostname,'--port','5432','--username','centers_bootstrap','--dbname',parsed.pathname.slice(1),...args],{env:{...process.env,PGPASSWORD:process.env.CENTERS_RECOVERY_BACKUP_PASSWORD},timeout:60000,maxBuffer:1024*1024});
}
export async function emptyRestoreTarget(client) {
  await guardDatabase(client,'target');
  const {rows}=await client.query("SELECT count(*)::integer AS count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='centers'");
  if(rows[0].count!==0)throw new Error('restore target must have an empty centers schema');
  // No CASCADE: any unanticipated object stops the rehearsal instead of overwriting it.
  await client.query('DROP SCHEMA centers');
}
export function filesBelow(root,prefix='') {
  const result=[];for(const entry of fs.readdirSync(path.join(root,prefix),{withFileTypes:true})){
    const relative=prefix?prefix+'/'+entry.name:entry.name;
    if(entry.isSymbolicLink())throw new Error('symlinks are not recovery fixture files');
    if(entry.isDirectory())result.push(...filesBelow(root,relative));else if(entry.isFile())result.push(relative);else throw new Error('unexpected recovery fixture file');
  }return result.sort();
}
export async function makeManifest(bundle) {
  return {formatVersion:1,migrations:(await migrationFiles()).map(({version,name,checksum})=>({version,name,checksum})),
    files:filesBelow(bundle).filter(file=>file!=='manifest.json').map(file=>({path:file,sha256:hash(fs.readFileSync(path.join(bundle,file)))}))};
}
export async function verifyManifest(bundle,manifest) {
  if(manifest.formatVersion!==1||JSON.stringify(manifest.migrations)!==JSON.stringify((await migrationFiles()).map(({version,name,checksum})=>({version,name,checksum}))))throw new Error('recovery migration manifest differs from this build');
  const actual=filesBelow(bundle).filter(file=>file!=='manifest.json');
  if(!Array.isArray(manifest.files)||JSON.stringify(actual)!==JSON.stringify(manifest.files.map(f=>f.path)))throw new Error('recovery file manifest mismatch');
  for(const file of manifest.files){if(!/^(?:json\/[a-zA-Z0-9_.\/-]+|centers\.dump)$/.test(file.path)||file.path.split('/').some(part=>part==='..'||part===''))throw new Error('unsafe recovery path');if(hash(fs.readFileSync(path.join(bundle,file.path)))!==file.sha256)throw new Error('recovery file hash mismatch')}
}
export async function logicalSnapshot(client) {
  const {rows}=await client.query("SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='centers' AND c.relkind='r' ORDER BY c.relname");
  const snapshot={};for(const row of rows){if(!/^[a-z_]+$/.test(row.relname))throw new Error('unexpected table name');const data=await client.query(`SELECT to_jsonb(t)::text AS row FROM centers.${row.relname} t`);snapshot[row.relname]=hash(data.rows.map(r=>r.row).sort().join('\n'))}return snapshot;
}
export async function verifyRestoredIdentity(client,data) {
  if(!fs.existsSync(path.join(data,'centers-attached')))throw new Error('recovery requires the durable centers marker');
  const parsed=JSON.parse(fs.readFileSync(path.join(data,'db.json'),'utf8'));
  if(!Array.isArray(parsed.users)||parsed.users.some(u=>typeof u.id!=='string')||new Set(parsed.users.map(u=>u.id)).size!==parsed.users.length)throw new Error('invalid recovery identity data');
  const ids=new Set(parsed.users.map(u=>u.id)),{rows}=await client.query('SELECT DISTINCT account_uid FROM centers.account_references WHERE centers.has_account_references(account_uid)');
  if(rows.some(row=>!ids.has(row.account_uid)))throw new Error('recovery has orphaned account references');
  const {rows:managers}=await client.query("SELECT r.account_uid FROM centers.role_assignments r JOIN centers.centers c ON c.id=r.center_id WHERE c.state='active' AND r.role='manager' AND r.revoked_at IS NULL AND r.valid_from<=now() AND (r.valid_until IS NULL OR r.valid_until>now())");
  const enabled=new Set(parsed.users.filter(u=>!u.disabled).map(u=>u.id));if(managers.some(r=>!enabled.has(r.account_uid)))throw new Error('recovery has inactive manager identities');
  return {referencedAccounts:rows.length};
}
