// Break-glass recovery for the installation owner, including passkey-only admins.
// Run only after stopping API writers. Never changes UIDs or personal training files.
import fs from 'node:fs';
import path from 'node:path';
import {hashResetCode,makeResetCode} from '../password.js';
import {atomicWrite} from '../durable.js';
const args=process.argv.slice(2),uid=args[args.indexOf('--uid')+1],dir=process.env.DATA_DIR;
if(!args.includes('--api-stopped')||!args.includes('--uid')||!uid||!dir)throw Error('Stop the API, set DATA_DIR, then run node scripts/recover-account.mjs --api-stopped --uid ACCOUNT_UID');
const file=path.join(path.resolve(dir),'db.json'),raw=fs.readFileSync(file,'utf8'),db=JSON.parse(raw),user=db.users?.find(u=>u.id===uid);
if(!user||user.disabled)throw Error('Active account not found');
fs.writeFileSync(file+'.before-recovery-'+Date.now(),raw,{flag:'wx',mode:0o600});

const code=makeResetCode();delete user.pw;user.pwReset={h:hashResetCode(code),exp:Date.now()+30*60*1000,by:'installation-owner'};user.sv=(user.sv||0)+1;
db.deviceLinks=(db.deviceLinks||[]).filter(link=>link.userId!==uid);
atomicWrite(file,JSON.stringify(db,null,2),0o600);atomicWrite(file+'.bak',JSON.stringify(db,null,2),0o600);
fs.appendFileSync(path.join(dir,'account-recovery-operations.log'),JSON.stringify({at:new Date().toISOString(),action:'operator.recovery.issued',uid})+'\n',{mode:0o600});
console.log('One-time recovery code (30 minutes): '+code);
