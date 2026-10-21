// Optional local UI rehearsal. Exact fake key + real isolated test SQL + fake
// provider only. Never used by the normal preview or a production entrypoint.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {testUrls} from './helpers.mjs';
import {createCentersDatabase} from '../../centers/db.js';
import {previewOrigin} from './preview-origin.mjs';
const urls=testUrls(process.env,{allowPreview:true}),database=createCentersDatabase({enabled:true,databaseUrl:urls.app});let centers;
try{
  await database.status();
  centers=await database.platformTransaction('preview_platform',async client=>{
    if((await client.query('SELECT kind FROM centers.environment WHERE singleton')).rows[0]?.kind!=='test')throw new Error('preview requires fictional test SQL');
    return (await client.query("SELECT DISTINCT center_id FROM centers.role_assignments WHERE account_uid='preview_manager' AND role='manager' AND revoked_at IS NULL ORDER BY center_id LIMIT 64")).rows.map(row=>row.center_id);
  });
}finally{await database.close()}
if(!centers.length)throw new Error('initialize the ordinary fictional preview first');
const directory=process.env.CENTERS_STRIPE_TEST_FIXTURE||fs.mkdtempSync(path.join(os.tmpdir(),'gym-centers-stripe-fixture-'));
if(!fs.realpathSync(directory).startsWith(path.join(fs.realpathSync(os.tmpdir()),'gym-centers-stripe-fixture-')))throw new Error('preview carrier requires a named temporary fixture');
const marker=path.join(directory,'fixture');if(fs.existsSync(marker)&&fs.readFileSync(marker,'utf8')!=='fictional-disposable-only')throw new Error('unexpected preview fixture marker');fs.writeFileSync(marker,'fictional-disposable-only');
const state=path.join(directory,'provider.json');if(!fs.existsSync(state))fs.writeFileSync(state,JSON.stringify({sessions:{},keys:{},calls:[]}));
const profiles=JSON.stringify([{id:'preview_stripe_sandbox',mode:'test',accountId:'acct_fictionalhttp1234',apiKey:'sk_test_fictional_http_fixture_never_sent',webhookSecrets:['whsec_fictional_preview_signature_key'],centerIds:centers,maxAmountMinor:'100000',dailyLimitMinor:'1000000',returnOrigin:previewOrigin(process.env.CENTERS_PREVIEW_ORIGIN)}]);
fs.writeFileSync(path.join(directory,'profiles.json'),profiles);
Object.assign(process.env,{CENTERS_STRIPE_TEST_FIXTURE:directory,CENTERS_STRIPE_PROFILES_JSON:profiles,CENTERS_DATABASE_URL:urls.app,CENTERS_JOBS_ENABLED:'0',CENTERS_MAIL_PROFILES_JSON:'',CENTERS_NOTIFICATIONS_TEST_CAPTURE:'0'});
await import('./stripe-http-preload.mjs');
// preview.mjs verifies the dedicated test URLs before setting the application URL.
delete process.env.CENTERS_DATABASE_URL;
await import('./preview.mjs');
