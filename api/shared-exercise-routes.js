import fs from 'node:fs';
import { Readable } from 'node:stream';
import { SharedExerciseError } from './shared-exercises.js';
export function sharedExerciseRoutes({ catalogue, json, readSession, readBody, manage, sendFile, privateMedia, readOwn, audit, throttle }) {
  function actor(req, res, write = false) {
    const user = readSession(req);
    if (!user) { json(res, 401, { error: 'not signed in' }); return null; }
    if (write && !manage(user)) { json(res, 403, { error: 'forbidden', code: 'forbidden' }); return null; }
    return user;
  }
  function current(req, user) { if (readSession(req) !== user || !manage(user)) throw new SharedExerciseError(403, 'forbidden'); }
  const mutate = (archive = false) => async (req, res) => {
    const user = actor(req, res, true); if (!user) return;
    const body = await readBody(req); current(req, user);
    const result = catalogue.mutate(user.id, body, { id: req.sharedId, archive });
    audit(req, archive ? 'exercises.archive' : 'exercises.save', { user, msg: result.exercise.id });
    json(res, 200, result);
  };
  return {
    'GET /api/exercises/shared': async (req, res) => {
      const user = actor(req, res); if (!user) return;
      const data = catalogue.snapshot(), canManage = manage(user);
      const etag = `"${data.instance}:${data.rev}:${canManage}"`;
      if (req.headers['if-none-match'] === etag) { res.writeHead(304, { ETag: etag, 'Cache-Control': 'private, no-cache' }); return res.end(); }
      json(res, 200, { ...data, canManage }, { ETag: etag, 'Cache-Control': 'private, no-cache' });
    },
    'POST /api/exercises/shared': mutate(),
    'PATCH /api/exercises/shared/{id}': mutate(),
    'POST /api/exercises/shared/{id}/archive': mutate(true),
    'PUT /api/exercises/shared/media/{hash}': async (req, res) => {
      const user = actor(req, res, true); if (!user) { catalogue.media.discard(req); return; }
      throttle(req, user); req.allowSlowBody?.();
      const result = await catalogue.media.receive('catalogue', req.mediaHash, req);
      current(req, user); json(res, result.status, result.body);
    },
    'GET /api/exercises/shared/media/{hash}': async (req, res) => {
      if (!actor(req, res)) return;
      const file = catalogue.referenced(req.mediaHash) && catalogue.media.file('catalogue', req.mediaHash);
      if (!file) throw new SharedExerciseError(404, 'media-missing');
      await sendFile(res, file, req.mediaHash);
    },
    'POST /api/exercises/shared/publish': async (req, res) => {
      const user = actor(req, res, true); if (!user) return;
      const body = await readBody(req); current(req, user);
      const candidates = catalogue.preview(user.id, body.ids, readOwn(user.id));
      for (const c of candidates) if (c.missingMedia) c.missingMedia = c.missingMedia.filter(hash => !privateMedia.file(user.id, hash));
      if (body.commit !== true) return json(res, 200, { candidates, simulation: true });
      if (typeof body.requestId !== 'string' || !/^[a-zA-Z0-9_-]{8,30}$/.test(body.requestId) || candidates.some(c => c.issue && c.issue !== 'already-published' || c.missingMedia?.length)) throw new SharedExerciseError(409, 'publication-conflict');
      const result = [];
      for (const candidate of candidates) {
        if (candidate.issue === 'already-published') { result.push({ id: candidate.id, alreadyPublished: true }); continue; }
        for (const ref of [candidate.exercise.media, candidate.exercise.media?.poster].filter(Boolean)) {
          if (catalogue.media.file('catalogue', ref.hash)) continue;
          const file = privateMedia.file(user.id, ref.hash);
          if (!file) throw new SharedExerciseError(409, 'private-media-missing');
          // Reuse the streaming validator/hash/quota gates when promoting a private file.
          const stream = Readable.from(fs.createReadStream(file.path)); stream.headers = { 'content-type': file.mime, 'content-length': String(file.size) };
          await catalogue.media.receive('catalogue', ref.hash, stream); current(req, user);
        }
        result.push(catalogue.mutate(user.id, { requestId: `${body.requestId}_${candidate.id}`, exercise: candidate.exercise }, { id: candidate.id, preserveId: true }));
      }
      audit(req, 'exercises.publish', { user, msg: `${result.length} exercises` });
      json(res, 200, { result, simulation: false });
    }
  };
}
