// POST /api/track — recebe eventos do browser, envia para Meta CAPI + GA4 + D1
import { hashEmail, hashPhone, getClientIP } from '../_utils.js';

export async function onRequestPost(ctx) {
  const { request, env } = ctx;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'invalid json' }, 400);
  }

  const {
    event_name,
    event_id,
    url,
    referrer,
    fbp,
    fbc,
    email,
    phone,
    value,
    currency = 'BRL',
  } = body;

  if (!event_name || !event_id) return json({ ok: false, error: 'missing fields' }, 400);

  const ip = getClientIP(request);
  const ua = request.headers.get('user-agent') || '';
  const emailHash = email ? hashEmail(email) : null;
  const phoneHash = phone ? hashPhone(phone) : null;
  const ts = Math.floor(Date.now() / 1000);

  // Salva no D1
  await env.DB.prepare(
    `INSERT OR IGNORE INTO events
     (event_id, event_name, source, url, referrer, user_agent, ip, fbp, fbc, email_hash, phone_hash, value, currency)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(event_id, event_name, 'web', url, referrer, ua, ip, fbp, fbc, emailHash, phoneHash, value ?? null, currency).run();

  // Meta CAPI
  const metaPromise = sendMeta({ env, event_name, event_id, url, ip, ua, fbp, fbc, emailHash, phoneHash, value, currency, ts });

  // GA4 Measurement Protocol
  const ga4Promise = sendGA4({ env, event_name, event_id, url, value, currency, ts });

  await Promise.allSettled([metaPromise, ga4Promise]);

  return json({ ok: true });
}

async function sendMeta({ env, event_name, event_id, url, ip, ua, fbp, fbc, emailHash, phoneHash, value, currency, ts }) {
  const userData = {
    client_ip_address: ip,
    client_user_agent: ua,
    ...(fbp && { fbp }),
    ...(fbc && { fbc }),
    ...(emailHash && { em: [emailHash] }),
    ...(phoneHash && { ph: [phoneHash] }),
  };

  const eventData = {
    event_name,
    event_time: ts,
    event_id,
    action_source: 'website',
    event_source_url: url,
    user_data: userData,
    ...(value != null && { custom_data: { value, currency } }),
  };

  return fetch(
    `https://graph.facebook.com/v19.0/${env.META_PIXEL_ID}/events?access_token=${env.META_ACCESS_TOKEN}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: [eventData] }),
    }
  );
}

async function sendGA4({ env, event_name, event_id, url, value, currency, ts }) {
  const ga4Name = {
    PageView: 'page_view',
    Lead: 'generate_lead',
    Purchase: 'purchase',
    InitiateCheckout: 'begin_checkout',
    ViewContent: 'view_item',
  }[event_name] || event_name.toLowerCase();

  const payload = {
    client_id: event_id,
    timestamp_micros: ts * 1_000_000,
    events: [{
      name: ga4Name,
      params: {
        page_location: url,
        ...(value != null && { value, currency }),
      },
    }],
  };

  return fetch(
    `https://www.google-analytics.com/mp/collect?measurement_id=${env.GA4_MEASUREMENT_ID}&api_secret=${env.GA4_API_SECRET}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
