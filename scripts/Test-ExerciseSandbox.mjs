// Explicit HTTP smoke against the fixed LOCAL sandbox only. Never accepts a remote URL.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const base = 'http://localhost:5180';
async function request(route, cookie, method = 'GET', body) {
  const response = await fetch(base + route, { method, headers: { Origin: base, ...(cookie ? { Cookie: cookie } : {}),
    ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  assert.equal(response.status, 200, `${method} ${route}: ${response.status} ${JSON.stringify(data)}`);
  return { response, data };
}
const config = (await request('/api/config')).data;
assert.ok(config.media && config.document_login && config.centers);
assert.equal((await fetch(base + '/api/data')).status, 401);
const sessions = [];
try {
  for (const [document, id] of [['00000000T', 'preview_platform'], ['00000001R', 'preview_exercise_alba'], ['00000002W', 'preview_exercise_bruno']]) {
    const login = await request('/api/login/password', null, 'POST', { nationalDocument: document, password: 'Centros-Pruebas-2026!' });
    assert.equal(login.data.user.id, id);
    const cookie = login.response.headers.getSetCookie().map(v => v.split(';')[0]).join('; ');
    assert.ok(cookie); sessions.push(cookie);
    const access = (await request('/api/centers/app-access', cookie)).data;
    assert.equal(access.blocked, false);
    const identity = (await request('/api/centers/me', cookie)).data;
    assert.equal(identity.platformCapabilities.length > 0, id === 'preview_platform');
    const { state } = (await request('/api/data', cookie)).data;
    assert.equal(state.routines.length >= 1, true);
    assert.equal(state.workouts.length >= 12, true);
    assert.equal(state.customEx.some(ex => ex.id === `c_${id}_curl`), true);
    assert.equal(state.customEx.some(ex => ex.id.startsWith('c_preview_') && ex.id !== `c_${id}_curl`), false);
    console.log(`PASS ${id}: login, application access, role, routine, history and private exercise isolation.`);
  }
  // Valid one-pixel PNG. This leaves only an unreferenced synthetic media probe in LOCAL data.
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==', 'base64');
  const hash = createHash('sha256').update(png).digest('hex');
  const uploaded = await fetch(`${base}/api/media/${hash}`, { method: 'PUT', headers: { Origin: base, Cookie: sessions[0], 'Content-Type': 'image/png' }, body: png });
  assert.ok([200, 201].includes(uploaded.status), `media upload: ${uploaded.status}`);
  assert.equal((await fetch(`${base}/api/media/${hash}`, { headers: { Cookie: sessions[0] } })).status, 200);
  assert.equal((await fetch(`${base}/api/media/${hash}`, { headers: { Cookie: sessions[1] } })).status, 404);
  console.log('PASS local multimedia enabled; another account cannot read private uploads.');
} finally {
  for (const cookie of sessions) await request('/api/logout', cookie, 'POST', {});
}
