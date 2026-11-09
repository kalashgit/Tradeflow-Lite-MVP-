'use strict';

function isAccessChallenge(response, expectedHost) {
  const auth = response.headers.get('www-authenticate') || '';
  if (!/^Cloudflare-Access\b/i.test(auth)) return false;
  if (![302, 303, 307, 308, 401, 403].includes(response.status)) return false;
  if (response.status >= 300 && response.status < 400) {
    let target;
    try { target = new URL(response.headers.get('location')); } catch { return false; }
    return target.protocol === 'https:' &&
      target.hostname.endsWith('.cloudflareaccess.com') &&
      target.hostname !== '.cloudflareaccess.com' &&
      target.pathname.startsWith('/cdn-cgi/access/login/') &&
      target.pathname.includes(expectedHost);
  }
  return true;
}

async function verify(url, fetcher = fetch) {
  const target = new URL(url);
  if (target.protocol !== 'https:') throw new Error('Preview URL must be HTTPS');
  const response = await fetcher(target, {
    redirect: 'manual',
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  if (!isAccessChallenge(response, target.hostname)) {
    throw new Error(`Access challenge not proven (HTTP ${response.status})`);
  }
  return response.status;
}

if (require.main === module) {
  verify(process.env.PRIVATE_PREVIEW_URL || '').then(
    status => console.log(`PASS: Cloudflare Access challenge verified (HTTP ${status})`),
    error => { console.error(`BLOCKED: ${error.message}`); process.exitCode = 1; }
  );
}

module.exports = { isAccessChallenge, verify };
