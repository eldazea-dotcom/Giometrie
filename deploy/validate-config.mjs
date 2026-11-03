import { pathToFileURL } from 'node:url';

export function validateConfig(env) {
  const required = ['DEPLOY_HOST', 'DEPLOY_USER', 'DEPLOY_PATH', 'DEPLOY_SSH_KEY', 'DEPLOY_KNOWN_HOSTS'];
  const missing = required.filter(key => !env[key]?.trim());
  if (missing.length) throw new Error(`Missing GitHub Actions secrets: ${missing.join(', ')}. See deploy/README.md.`);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(env.DEPLOY_HOST)) throw new Error('DEPLOY_HOST must be an IPv4 address or hostname, without a URL or port.');
  if (!/^[a-z_][a-z0-9_-]*\$?$/i.test(env.DEPLOY_USER)) throw new Error('Invalid DEPLOY_USER.');
  const dir = env.DEPLOY_PATH;
  if (!/^\/[a-zA-Z0-9_./-]+$/.test(dir) || dir.endsWith('/') || dir.split('/').some(part => part === '.' || part === '..') || dir.split('/').filter(Boolean).length < 2 || ['/', '/var/www', '/srv/www', '/home', '/root', '/usr/local'].includes(dir)) {
    throw new Error('DEPLOY_PATH must name the existing application directory, not a system directory; no spaces, traversal or trailing slash.');
  }
  const port = env.DEPLOY_PORT || '22';
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new Error('Invalid DEPLOY_PORT.');
  const url = new URL(env.DEPLOY_SITE_URL || 'https://www.giometrie.uz');
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('DEPLOY_SITE_URL must be an HTTPS origin.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { validateConfig(process.env); console.log('Deployment configuration is present and valid.'); }
  catch (error) { console.error(`::error::${error.message}`); process.exitCode = 1; }
}
