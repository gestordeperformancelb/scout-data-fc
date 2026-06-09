// POST /api/lead — captura lead, salva no D1, dispara evento Lead para Meta + GA4
import { hashEmail, hashPhone, getClientIP, genEventId } from '../_utils.js';

export async function onRequestPost(ctx) {
  const { request, env } = ctx;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'invalid json' }, 400);
  }

  const { name, email, phone, fbp, fbc, url, utm_source, utm_medium, utm_campaign } = body;

  if (!email) return json({ ok: false, error: 'email required' }, 400);

  const emailHash = hashEmail(email);
  const phoneHash = phone ? hashPhone(phone) : null;
  const ip = getClientIP(request);
  const ua = request.headers.get('user-agent') || '';
  const event_id = genEventId('lead');

  // Upsert lead
  await env.DB.prepare(
    `INSERT INTO leads (email, name, phone, fbp, fbc, utm_source, utm_medium, utm_campaign)
     VALUES (?,?,?,?,?,?,?,?)
     ON CONFLICT(email) DO UPDATE SET
       name=excluded.name, fbp=excluded.fbp, fbc=excluded.fbc`
  ).bind(email, name ?? null, phone ?? null, fbp ?? null, fbc ?? null, utm_source ?? null, utm_medium ?? null, utm_campaign ?? null).run();

  // Salva evento
  await env.DB.prepare(
    `INSERT OR IGNORE INTO events (event_id, event_name, source, url, user_agent, ip, fbp, fbc, email_hash, phone_hash)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  ).bind(event_id, 'Lead', 'web', url ?? null, ua, ip, fbp ?? null, fbc ?? null, emailHash, phoneHash).run();

  const ts = Math.floor(Date.now() / 1000);

  await Promise.allSettled([
    // Meta CAPI
    fetch(
      `https://graph.facebook.com/v19.0/${env.META_PIXEL_ID}/events?access_token=${env.META_ACCESS_TOKEN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: [{
            event_name: 'Lead',
            event_time: ts,
            event_id,
            action_source: 'website',
            event_source_url: url,
            user_data: {
              em: [emailHash],
              ...(phoneHash && { ph: [phoneHash] }),
              client_ip_address: ip,
              client_user_agent: ua,
              ...(fbp && { fbp }),
              ...(fbc && { fbc }),
            },
          }],
        }),
      }
    ),
    // GA4
    fetch(
      `https://www.google-analytics.com/mp/collect?measurement_id=${env.GA4_MEASUREMENT_ID}&api_secret=${env.GA4_API_SECRET}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: event_id,
          timestamp_micros: ts * 1_000_000,
          events: [{ name: 'generate_lead', params: { page_location: url } }],
        }),
      }
    ),
  ]);

  return json({ ok: true, event_id });
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
