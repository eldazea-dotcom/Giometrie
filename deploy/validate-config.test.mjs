import assert from 'node:assert/strict';
import test from 'node:test';
import { validateConfig } from './validate-config.mjs';

const fixture = { DEPLOY_HOST: 'server.example.com', DEPLOY_USER: 'deploy', DEPLOY_PATH: '/var/www/giometrie', DEPLOY_SSH_KEY: 'fixture-key', DEPLOY_KNOWN_HOSTS: 'fixture-host-key' };
test('missing credentials stop deployment without disclosing values', () => {
  assert.throws(() => validateConfig({ ...fixture, DEPLOY_HOST: '' }), /Missing GitHub Actions secrets: DEPLOY_HOST/);
});
test('destructive destinations and shell metacharacters are rejected', () => {
  for (const dir of ['/', '/var', '/var/www', '/root', '/srv/../root', '/srv/./app', '/srv/app/', '/srv/app;id', '/srv/app name', '/srv/$(id)']) {
    assert.throws(() => validateConfig({ ...fixture, DEPLOY_PATH: dir }), /DEPLOY_PATH/);
  }
  assert.throws(() => validateConfig({ ...fixture, DEPLOY_HOST: '-oProxyCommand=anything' }), /DEPLOY_HOST/);
  assert.throws(() => validateConfig({ ...fixture, DEPLOY_USER: 'root;id' }), /DEPLOY_USER/);
});
test('existing application path and HTTPS origin are accepted', () => {
  assert.doesNotThrow(() => validateConfig(fixture));
  assert.doesNotThrow(() => validateConfig({ ...fixture, DEPLOY_PORT: '2222', DEPLOY_PATH: '/srv/giometrie', DEPLOY_SITE_URL: 'https://www.giometrie.uz/' }));
  assert.throws(() => validateConfig({ ...fixture, DEPLOY_SITE_URL: 'http://example.com' }), /HTTPS/);
  assert.throws(() => validateConfig({ ...fixture, DEPLOY_PORT: '65536' }), /DEPLOY_PORT/);
});
