// Synthetic training content only. No database, credentials or network on import.
import fs from 'node:fs';
import path from 'node:path';
export const sandboxAccounts = [
  { id: 'preview_exercise_alba', name: 'Alba Pruebas', document: '00000001R' },
  { id: 'preview_exercise_bruno', name: 'Bruno Pruebas', document: '00000002W' },
];
export const trainingAccounts = [{ id: 'preview_platform', name: 'Plataforma Centros', document: '00000000T' }, ...sandboxAccounts];

export function fictionalTraining(uid, today) {
  if (!trainingAccounts.some(user => user.id === uid) || !/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new Error('fictional account/date required');
  const custom = { id: `c_${uid}_curl`, n: uid === 'preview_platform' ? 'Prueba FT · Curl en polea' : `Privado · Curl ${uid.endsWith('alba') ? 'Alba' : 'Bruno'}`,
    bp: 'upper arms', tg: 'biceps', eq: 'cable', custom: true, primaries: ['biceps'], secondaries: [], sm: [], desc: 'Ejercicio ficticio para probar creación, publicación y aislamiento. Actualmente privado.' };
  const main = uid.endsWith('bruno') ? '0861' : '0025';
  const routine = { id: `r_${uid}_a`, name: 'Pruebas · Fuerza A', emoji: 'dumbbell', prog: 'linear',
    ex: [{ id: main, mode: 'reps', sets: 3, reps: 8, weight: 40, inc: 2.5 }, { id: custom.id, mode: 'reps', sets: 3, reps: 10, weight: 10, inc: 2.5 }] };
  const workouts = Array.from({ length: 12 }, (_, i) => {
    const date = new Date(`${today}T12:00:00Z`); date.setUTCDate(date.getUTCDate() - (12 - i) * 3);
    const w = 25 + i * 2.5;
    const entries = routine.ex.map((cfg, n) => ({ id: cfg.id, rid: routine.id, target: { ...cfg, weight: n ? 10 + Math.floor(i / 3) * 2.5 : w },
      sets: Array.from({ length: 3 }, () => ({ w: n ? 10 + Math.floor(i / 3) * 2.5 : w, r: n ? 10 : 8, done: true })),
      ...(n ? { muscleSnapshot: { n: custom.n, bp: custom.bp, primaries: ['biceps'], muscleWeights: { biceps: 1 } } } : {}) }));
    return { id: `w_${uid}_${i}`, name: routine.name, d: date.toISOString().slice(0, 10), start: +date, end: +date + 45 * 60000,
      routineIds: [routine.id], entries, prs: i ? [main] : [], vol: entries.reduce((sum, e) => sum + e.sets.reduce((total, s) => total + s.w * s.r, 0), 0) };
  });
  return { unit: 'kg', lang: 'es', setupDone: true, routines: [routine], week: { 1: [routine.id], 3: [routine.id], 5: [routine.id] },
    customEx: [custom], workouts, exWeights: {}, favEx: [main], active: null, bodyweight: [], measurements: [], _rev: 1, _ts: Date.now() };
}

// Called before the HTTP process starts; exclusive creation never replaces manual test work.
export function seedTrainingFiles(directory, today) {
  let created = 0;
  for (const user of trainingAccounts) {
    const file = path.join(directory, `state-${user.id}.json`);
    try { fs.writeFileSync(file, JSON.stringify(fictionalTraining(user.id, today)), { flag: 'wx', mode: 0o600 }); created++; }
    catch (error) { if (error.code !== 'EEXIST') throw error; JSON.parse(fs.readFileSync(file, 'utf8')); }
  }
  return created;
}

export function assertSandboxEnvironment(env) {
  if (env.EXERCISE_SANDBOX !== 'fictional-local-only' || env.CENTERS_PREVIEW_ORIGIN !== 'http://localhost:5180' ||
      env.CENTERS_PREVIEW_DATA_DIR !== '/tmp/ft-gym-centers-preview-data') throw new Error('explicit local exercise sandbox required');
  for (const [key, role] of [['CENTERS_TEST_DATABASE_URL', 'centers_app'], ['CENTERS_TEST_MIGRATION_DATABASE_URL', 'centers_migrator']]) {
    const url = new URL(env[key]);
    if (url.protocol !== 'postgresql:' || url.hostname !== 'centers-test-db' || url.pathname !== '/ft_gym_exercises_centers_test' ||
      url.username !== role || url.port || url.search || url.hash) throw new Error('dedicated exercise test database required');
  }
  if (env.CENTERS_DATABASE_URL || env.CENTERS_MIGRATION_DATABASE_URL || env.DATA_DIR) throw new Error('application data configuration is forbidden in sandbox bootstrap');
}
