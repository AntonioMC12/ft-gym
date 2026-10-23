// Installation-wide training catalogue. One API writer, durable JSON; never personal state.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { atomicWrite } from './durable.js';
import { createMediaStore, HASH_RE, referencedHashes } from './media.js';
export class SharedExerciseError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
const fail = (status, code) => { throw new SharedExerciseError(status, code); };
const object = x => x && typeof x === 'object' && !Array.isArray(x);
const text = (x, max, required = false, multiline = false) => {
  if (typeof x !== 'string' || x.length > max || (multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/ : /[\u0000-\u001f]/).test(x) || required && !x.trim()) fail(400, 'invalid-exercise');
  return x.trim();
};
const MIME = new Set(['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/quicktime','video/webm']);
function mediaRef(value, poster = false) {
  if (!object(value) || !HASH_RE.test(value.hash) || !MIME.has(value.mime) || !Number.isSafeInteger(value.size) || value.size < 1 || value.size > 128 * 1024 * 1024) fail(400, 'invalid-media');
  if (poster && !value.mime.startsWith('image/')) fail(400, 'invalid-media');
  const out = { hash: value.hash, mime: value.mime, size: value.size, kind: value.mime.startsWith('video/') ? 'video' : value.mime === 'image/gif' ? 'gif' : 'image' };
  for (const k of ['width','height','dur','at']) if (value[k] != null) {
    const max = k === 'at' ? Number.MAX_SAFE_INTEGER : k === 'dur' ? 3600 : 16384;
    if (!Number.isFinite(value[k]) || value[k] < (k === 'width' || k === 'height' ? 1 : 0) || value[k] > max) fail(400, 'invalid-media');
    out[k] = value[k];
  }
  if (value.codec != null) { if (!['avc1','hvc1','av01','vp09','vp8','vp9','other'].includes(value.codec)) fail(400, 'invalid-media'); out.codec = value.codec; }
  if (!poster && value.poster) out.poster = mediaRef(value.poster, true);
  return out;
}
export function cleanSharedExercise(value) {
  if (!object(value) || Object.keys(value).some(k => !['n','bp','tg','eq','desc','primaries','secondaries','muscleGroups','sm','assisted','url','media'].includes(k))) fail(400, 'invalid-exercise');
  const out = { n: text(value.n, 80, true), bp: text(value.bp, 40, true), eq: text(value.eq, 60, true), tg: text(value.tg || '', 64), desc: text(value.desc || '', 1000, false, true) };
  for (const key of ['primaries','secondaries','muscleGroups','sm']) if (value[key] != null) {
    if (!Array.isArray(value[key]) || value[key].length > 32) fail(400, 'invalid-exercise');
    out[key] = [...new Set(value[key].map(x => text(x, 64, true)))];
  }
  if (value.assisted != null && typeof value.assisted !== 'boolean') fail(400, 'invalid-exercise');
  out.assisted = value.assisted ?? (out.eq === 'leverage machine' && /\bassist(ed)?\b/i.test(out.n));
  if (value.url) { let u; try { u = new URL(value.url); } catch { fail(400, 'invalid-url'); }
    if (!['https:','http:'].includes(u.protocol) || u.username || u.password || u.href.length > 2048) fail(400, 'invalid-url'); out.url = u.href; }
  if (value.media) out.media = mediaRef(value.media);
  return out;
}
const dto = ({ authorUid, legacySource, ...row }) => row;
export function createSharedExercises({ dir, limits, builtinHas = () => false, changed = () => {} }) {
  const file = path.join(dir, 'shared-exercises.json');
  let broken = false;
  const empty = () => ({ version: 1, instance: crypto.randomUUID(), rev: 0, entries: [], operations: {} });
  let state;
  function parse(fileName) {
    const s = JSON.parse(fs.readFileSync(fileName, 'utf8'));
    if (s.version !== 1 || typeof s.instance !== 'string' || !Number.isSafeInteger(s.rev) || !Array.isArray(s.entries) || !object(s.operations)) throw new Error('invalid catalogue');
    for (const e of s.entries) if (!object(e) || !/^[a-zA-Z0-9_-]{1,64}$/.test(e.id) || !Number.isInteger(e.revision) || !Array.isArray(e.versions)) throw new Error('invalid entry');
    return s;
  }
  try { state = parse(file); }
  catch (error) {
    if (error.code === 'ENOENT' && !fs.existsSync(file + '.bak')) { state = empty(); atomicWrite(file, JSON.stringify(state), 0o600); }
    else { try { state = parse(file + '.bak'); broken = true; } catch { throw new Error('shared catalogue unreadable; restore shared-exercises.json with its backup'); } }
  }
  const definitions = () => state.entries.flatMap(e => [e, ...e.versions]);
  const media = createMediaStore({ dir: path.join(dir, 'shared-exercise-media'), limits, readState: () => broken ? null : ({ customEx: definitions() }) });
  media.cleanTmp();
  const snapshot = () => ({ instance: state.instance, rev: state.rev, entries: state.entries.map(e => { const { versions, ...row } = e; return dto(row); }), degraded: broken });
  const notify = () => changed(snapshot());
  notify();
  function commit(next) {
    if (broken) fail(503, 'catalogue-recovery-required');
    atomicWrite(file + '.bak', JSON.stringify(state), 0o600);
    atomicWrite(file, JSON.stringify(next), 0o600);
    state = next; notify();
  }
  function referenced(hash) { return referencedHashes({ customEx: definitions() }).has(hash); }
  function available(definition) {
    for (const ref of [definition.media, definition.media?.poster].filter(Boolean)) {
      const stored = media.file('catalogue', ref.hash);
      if (!stored || stored.size !== ref.size || stored.mime !== ref.mime) fail(409, 'shared-media-missing');
    }
  }
  function mutate(uid, raw, { id, archive = false, preserveId = false } = {}) {
    if (!object(raw) || typeof raw.requestId !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(raw.requestId)) fail(400, 'request-id-required');
    const op = `${uid}:${raw.requestId}`;
    const hash = crypto.createHash('sha256').update(JSON.stringify([id, archive, raw])).digest('hex');
    if (state.operations[op]) { if (state.operations[op].hash !== hash) fail(409, 'idempotency-conflict'); return state.operations[op].result; }
    const old = id && state.entries.find(e => e.id === id);
    if (id && !old && !preserveId) fail(404, 'exercise-not-found');
    if (old && raw.revision !== old.revision) fail(409, 'exercise-version-conflict');
    const definition = archive ? old : cleanSharedExercise(raw.exercise);
    // Load semantics identify a movement. Changing these creates a different exercise, not a rename.
    if (old && !archive && ['bp','eq','assisted'].some(k => old[k] !== definition[k])) fail(409, 'exercise-semantics-immutable');
    if (!archive) available(definition);
    const chosen = old?.id || (preserveId ? id : 'ft_' + crypto.randomBytes(12).toString('hex'));
    if (builtinHas(chosen) || !/^[a-zA-Z0-9_-]{1,64}$/.test(chosen)) fail(409, 'exercise-id-conflict');
    const now = new Date().toISOString();
    const { versions: ignored, ...prior } = old || {};
    const row = { ...definition, id: chosen, origin: 'platform', revision: (old?.revision || 0) + 1,
      archived: archive || old?.archived || false, createdAt: old?.createdAt || now, updatedAt: now, authorUid: old?.authorUid || uid,
      versions: old ? [...old.versions, dto(prior)] : [] };
    if (old?.legacySource || preserveId) row.legacySource = old?.legacySource || { uid, id: chosen };
    const { versions, ...visible } = row;
    const result = { exercise: dto(visible), instance: state.instance, rev: state.rev + 1 };
    const next = structuredClone(state); next.rev++; next.entries = [...next.entries.filter(e => e.id !== chosen), row];
    next.operations[op] = { hash, result }; commit(next); return result;
  }
  return { snapshot, mutate, media, referenced, allDefinitions: definitions, broken: () => broken,
    sweep() { return media.sweep('catalogue'); },
    preview(uid, ids, personal) {
      if (!Array.isArray(ids) || !ids.length || ids.length > 100 || new Set(ids).size !== ids.length || !ids.every(id => typeof id === 'string')) fail(400, 'invalid-selection');
      return ids.map(id => {
        const ex = personal?.customEx?.find(e => e.id === id);
        if (!ex) return { id, issue: 'not-owned' };
        let clean; try { const { id: _, custom, _ts, ...fields } = ex; clean = cleanSharedExercise(fields); } catch { return { id, issue: 'invalid-exercise' }; }
        const present = state.entries.find(e => e.id === id);
        return { id, n: clean.n, exercise: clean, issue: builtinHas(id) ? 'id-conflict' : present ? (present.legacySource?.uid === uid ? 'already-published' : 'id-conflict') :
          state.entries.some(e => e.n.toLowerCase() === clean.n.toLowerCase()) ? 'duplicate-name' : null,
          missingMedia: [clean.media, clean.media?.poster].filter(Boolean).filter(r => !media.file('catalogue', r.hash)).map(r => r.hash) };
      });
    }
  };
}
