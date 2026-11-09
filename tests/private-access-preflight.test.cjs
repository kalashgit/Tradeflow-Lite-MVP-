'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isAccessChallenge, verify } = require('../scripts/verify-private-access.cjs');

const host = 'tradeflow-pr16-private.bartoszszarafinski.workers.dev';
const url = `https://${host}`;
const accessLogin = `https://team.cloudflareaccess.com/cdn-cgi/access/login/${host}`;
const response = (status, headers = {}) => new Response(null, { status, headers });
const access = { 'www-authenticate': 'Cloudflare-Access resource_metadata="example"' };

test('recognizes a real Cloudflare Access login challenge', () => {
  assert.equal(isAccessChallenge(response(302, { ...access, location: accessLogin }), host), true);
  assert.equal(isAccessChallenge(response(403, access), host), true);
});

test('rejects application redirects, generic denials, and spoofed destinations', () => {
  const invalid = [
    response(200),
    response(302, { location: '/login' }),
    response(302, { ...access, location: 'https://example.com/login' }),
    response(302, { ...access, location: `http://team.cloudflareaccess.com/cdn-cgi/access/login/${host}` }),
    response(302, { ...access, location: `https://team.cloudflareaccess.com.evil.test/cdn-cgi/access/login/${host}` }),
    response(302, { ...access, location: 'https://team.cloudflareaccess.com/cdn-cgi/access/login/other.worker.dev' }),
    response(302, { ...access, location: `https://team.cloudflareaccess.com/cdn-cgi/access/login/${host}.evil.test` }),
    response(403),
    response(500, access),
  ];
  for (const item of invalid) assert.equal(isAccessChallenge(item, host), false);
});

test('verification is fail closed and avoids following redirects', async () => {
  let options;
  const status = await verify(url, async (_url, request) => {
    options = request;
    return response(302, { ...access, location: accessLogin });
  });
  assert.equal(status, 302);
  assert.equal(options.redirect, 'manual');
  await assert.rejects(verify(url, async () => response(302, { location: '/app' })), /not proven/);
  await assert.rejects(verify('http://example.com'), /HTTPS/);
});
