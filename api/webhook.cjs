const crypto = require('crypto');

const MAX_BODY_BYTES = 1_000_000; // 1MB — Lemon Squeezy payloads are small; reject anything larger

// Best-effort, single-instance protections. Vercel functions are stateless across cold
// starts/instances, so these maps don't give distributed guarantees — they only protect
// within a warm instance. A real distributed limiter would need Vercel KV/Upstash.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;
const rateLimitState = new Map(); // ip -> { count, resetAt }

const DEDUPE_TTL_MS = 5 * 60_000;
const seenPayloads = new Map(); // sha256(rawBody) -> expiresAt

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const secret = process.env.LS_WEBHOOK_SECRET;
  if (!secret) {
    console.error('Webhook misconfigured: LS_WEBHOOK_SECRET is not set');
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  const ip = getClientIp(req);
  if (!checkRateLimit(ip)) {
    if (typeof res.setHeader === 'function') {
      res.setHeader('Retry-After', String(Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)));
    }
    return res.status(429).json({ error: 'Too many requests' });
  }

  let rawBody;
  try {
    rawBody = await readBody(req, MAX_BODY_BYTES);
  } catch (err) {
    return res.status(413).json({ error: 'Payload too large' });
  }

  const sig = req.headers['x-signature'];
  if (!sig || typeof sig !== 'string' || !isValidSignature(rawBody, sig, secret)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  if (isReplay(rawBody)) {
    return res.status(200).json({ ok: true, duplicate: true });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const event = payload.meta?.event_name;
  const attrs = payload.data?.attributes;
  const orderId = payload.data?.id;

  try {
    if (event === 'order_created') {
      const email = attrs?.user_email;
      const name = attrs?.user_name;
      const variantName = attrs?.first_order_item?.variant_name ?? '';
      const tier = variantName.toLowerCase().includes('team') ? 'Team' : 'Pro';

      const licenseKey = await getLicenseKeyForOrder(orderId);
      if (licenseKey && email) {
        await sendWelcomeEmail(email, name, tier, licenseKey.attributes.key);
      }
    }

    if (event === 'subscription_cancelled' || event === 'subscription_expired') {
      const subOrderId = attrs?.order_id;
      if (subOrderId) {
        const licenseKey = await getLicenseKeyForOrder(subOrderId);
        if (licenseKey) {
          await setLicenseDisabled(licenseKey.id, true);
        }
      }
    }

    if (event === 'subscription_resumed' || event === 'subscription_unpaused') {
      const subOrderId = attrs?.order_id;
      if (subOrderId) {
        const licenseKey = await getLicenseKeyForOrder(subOrderId);
        if (licenseKey) {
          await setLicenseDisabled(licenseKey.id, false);
        }
      }
    }
  } catch (err) {
    console.error('Webhook handler error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }

  return res.status(200).json({ ok: true });
};

module.exports.config = { api: { bodyParser: false } };

// Exposed for tests only.
module.exports._internal = { rateLimitState, seenPayloads };

function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) {
    return fwd.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

function checkRateLimit(ip) {
  const now = Date.now();
  pruneExpired(rateLimitState, now);

  const entry = rateLimitState.get(ip);
  if (!entry || entry.resetAt <= now) {
    rateLimitState.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count += 1;
  return true;
}

function isReplay(rawBody) {
  const now = Date.now();
  pruneExpired(seenPayloads, now);

  const hash = crypto.createHash('sha256').update(rawBody).digest('hex');
  if (seenPayloads.has(hash)) return true;

  seenPayloads.set(hash, now + DEDUPE_TTL_MS);
  return false;
}

function pruneExpired(map, now) {
  for (const [key, value] of map) {
    const expiresAt = typeof value === 'number' ? value : value.resetAt;
    if (expiresAt <= now) map.delete(key);
  }
}

function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let body = '';
    let bytes = 0;
    req.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function isValidSignature(rawBody, sig, secret) {
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  const sigBuf = Buffer.from(sig, 'hex');
  if (expectedBuf.length !== sigBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, sigBuf);
}

const LS_API = 'https://api.lemonsqueezy.com/v1';

async function lsGet(path) {
  const res = await fetch(`${LS_API}${path}`, {
    headers: { Authorization: `Bearer ${process.env.LS_API_KEY}` },
  });
  return res.json();
}

async function lsPatch(path, body) {
  await fetch(`${LS_API}${path}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${process.env.LS_API_KEY}`,
      'Content-Type': 'application/vnd.api+json',
    },
    body: JSON.stringify(body),
  });
}

async function setLicenseDisabled(licenseKeyId, disabled) {
  await lsPatch(`/license-keys/${licenseKeyId}`, {
    data: {
      type: 'license-keys',
      id: String(licenseKeyId),
      attributes: { disabled },
    },
  });
}

async function getLicenseKeyForOrder(orderId, attempts = 3, delayMs = 1500) {
  for (let i = 0; i < attempts; i++) {
    const { data } = await lsGet(`/license-keys?filter[order_id]=${orderId}`);
    if (data?.[0]) return data[0];
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs));
  }
  return null;
}

async function sendWelcomeEmail(to, name, tier, licenseKey) {
  const tools = {
    Pro: '<code>get_portfolio</code> and <code>prepare_transfer</code>',
    Team: 'all 5 tools including <code>deploy_token</code>',
  };

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'wkalidev <onboarding@resend.dev>',
      to: process.env.TEST_EMAIL || to,
      subject: `Your multichain-mcp ${tier} license key`,
      html: `
        <h2>Welcome to multichain-mcp ${tier}!</h2>
        <p>Hi ${name || 'there'},</p>
        <p>Your license key:</p>
        <p style="font-size:18px;font-family:monospace;background:#f4f4f4;padding:12px;border-radius:6px;">
          <strong>${licenseKey}</strong>
        </p>
        <p>This unlocks ${tools[tier] || 'your tier tools'}.</p>
        <h3>Setup (Claude Desktop)</h3>
        <pre style="background:#0f0f1a;color:#fff;padding:16px;border-radius:6px;font-size:13px;">{
  "mcpServers": {
    "multichain": {
      "command": "npx",
      "args": ["-y", "@wkalidev/multichain-mcp"],
      "env": {
        "MULTICHAIN_LICENSE_KEY": "${licenseKey}"
      }
    }
  }
}</pre>
        <p>Restart Claude Desktop or Cursor after adding the key.</p>
        <p>Questions? Reply to this email.</p>
        <p>— wkalidev</p>
      `,
    }),
  });
}
