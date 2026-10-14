import {notificationProfiles} from './notification-config.js';
import {stripeProfiles} from './stripe-config.js';
// Read configuration without resolving a database or starting any background work.
export function centersConfig(env = process.env) {
  return Object.freeze({
    enabled: /^(1|true|yes|on)$/i.test(env.CENTERS_ENABLED || ''),
    jobsEnabled: /^(1|true|yes|on)$/i.test(env.CENTERS_JOBS_ENABLED || ''),
    notificationTestCapture: /^(1|true|yes|on)$/i.test(env.CENTERS_NOTIFICATIONS_TEST_CAPTURE || ''),
    mailProfiles: notificationProfiles(env),
    stripeProfiles: stripeProfiles(env),
    databaseUrl: databaseUrlFrom(env),
    superadminUids: Object.freeze(String(env.CENTERS_SUPERADMIN_UIDS || '').split(',').map(s => s.trim()).filter(Boolean)),
  });
}

// Compose supplies credentials separately, so '@', '%' and ':' in passwords are encoded once.
export function databaseUrlFrom(env, explicit = 'CENTERS_DATABASE_URL') {
  if (env[explicit]) return String(env[explicit]).trim();
  if (!env.CENTERS_DATABASE_HOST || !env.CENTERS_DATABASE_USER || !env.CENTERS_DATABASE_PASSWORD || !env.CENTERS_DATABASE_NAME) return '';
  const host = String(env.CENTERS_DATABASE_HOST);
  const port = String(env.CENTERS_DATABASE_PORT || '5432');
  if (!/^[a-zA-Z0-9.-]+$/.test(host) || !/^\d{1,5}$/.test(port) || +port < 1 || +port > 65535) return '';
  const encoded = value => encodeURIComponent(String(value));
  return `postgresql://${encoded(env.CENTERS_DATABASE_USER)}:${encoded(env.CENTERS_DATABASE_PASSWORD)}@${host}:${port}/${encoded(env.CENTERS_DATABASE_NAME)}`;
}

export function publicCentersConfig(config) {
  // Only the module's implemented stage is advertised. No DSN or database health here.
  return config.enabled ? { enabled: true, stage: 'centers' } : null;
}

export function postgresUrl(value, label = 'database URL') {
  let url;
  try { url = new URL(value); } catch { throw new Error(`${label} must be a PostgreSQL URL`); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.username || url.pathname.length < 2) {
    throw new Error(`${label} must identify a PostgreSQL user, host and database`);
  }
  // URL parsing errors must never echo credentials supplied by the operator.
  if (url.hash || url.pathname.slice(1).includes('/')) throw new Error(`${label} has an invalid database name`);
  return url;
}
