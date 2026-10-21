// Explicit test-only bootstrap; isolatedDatabase validates test URLs/environment.
// Leaves all existing members, accounts, training and carrier files in place.
import {isolatedDatabase} from './helpers.mjs';
const {migrator}=await isolatedDatabase({allowPreview:true});
await migrator.end();
process.env.CENTERS_PREVIEW_INIT_ONLY='1';
await import('./preview.mjs');
console.log('Fictional centers preview initialized; existing data retained.');
