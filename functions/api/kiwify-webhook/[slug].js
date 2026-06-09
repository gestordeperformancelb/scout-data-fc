// POST /api/kiwify-webhook/[slug] — recebe webhook da Kiwify, dispara Purchase + cria acesso
import { hashEmail, hashPhone, getClientIP, genEventId } from '../../_utils.js';

function gerarToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2,'0')).join('');
}

async function enviarEmailAcesso(env, email, nome, token) {
  if (!env.RESEND_API_KEY) return;
  const link = `https://scoutdatafc.com.br/api/acesso?token=${token}`;
  const nomeExib = nome || 'Torcedor';

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Scout Data F.C. <acesso@scoutdatafc.com.br>',
      to: [email],
      subject: '⚽ Seu acesso ao Scout Data F.C. está pronto!',
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#080d08;font-family:'Segoe UI',Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px">
    <div style="text-align:center;margin-bottom:32px">
      <h1 style="font-size:28px;font-weight:900;color:#c9a227;margin:0;letter-spacing:2px">SCOUT DATA F.C.</h1>
      <p style="color:#4caf50;margin:4px 0 0;font-size:13px;letter-spacing:1px">COPA DO MUNDO 2026</p>
    </div>
    <div style="background:#0d1a0d;border:1px solid #1a3d1a;border-radius:12px;padding:32px 28px">
      <p style="color:#f4f9f4;font-size:16px;margin:0 0 8px">Olá, <strong>${nomeExib}</strong>! 👋</p>
      <p style="color:#8a9a8a;font-size:14px;line-height:1.6;margin:0 0 28px">
        Sua compra foi confirmada. Clique no botão abaixo para acessar o painel completo com dados dos <strong style="color:#f4f9f4">1.253 jogadores</strong> convocados para a Copa do Mundo 2026.
      </p>
      <div style="text-align:center;margin-bottom:28px">
        <a href="${link}" style="display:inline-block;background:#c9a227;color:#080d08;text-decoration:none;padding:16px 36px;border-radius:8px;font-weight:900;font-size:15px;letter-spacing:1px">
          ⚽ ACESSAR O PAINEL
        </a>
      </div>
      <p style="color:#4a6a4a;font-size:12px;text-align:center;margin:0">
        Ou copie este link: <span style="color:#c9a227;word-break:break-all">${link}</span>
      </p>
    </div>
    <div style="margin-top:24px;padding-top:20px;border-top:1px solid #1a3d1a">
      <p style="color:#4a6a4a;font-size:12px;text-align:center;margin:0">
        Este link é pessoal e intransferível. Dúvidas? Responda este email.
      </p>
    </div>
  </div>
</body>
</html>`,
    }),
  }).catch(e => console.error('Resend error:', e?.message));
}

export async function onRequestPost(ctx) {
  const { request, env, params } = ctx;

  if (params.slug !== env.KIWIFY_WEBHOOK_SLUG) {
    return new Response('forbidden', { status: 403 });
  }

  let body;
  try { body = await request.json(); }
  catch { return new Response('invalid json', { status: 400 }); }

  // A Kiwify pode enviar os campos na raiz ou dentro de "order"
  const data = body?.order ?? body;

  // Só processa compras aprovadas
  const status = data?.order_status ?? data?.status;
  if (status !== 'paid' && status !== 'approved') {
    return new Response('ignored', { status: 200 });
  }

  const orderId = data?.order_id ?? data?.id ?? genEventId('order');
  const email   = data?.Customer?.email ?? null;
  const nome    = data?.Customer?.full_name ?? null;
  const phone   = data?.Customer?.mobile ?? null;
  const value   = parseFloat(data?.Commissions?.charge_amount ?? data?.charges?.[0]?.amount ?? 0) / 100;
  const product = data?.Product?.product_name ?? data?.Product?.name ?? 'Scout Data F.C.';
  const event_id = `purchase_${orderId}`;
  const ts  = Math.floor(Date.now() / 1000);
  const ip  = getClientIP(request);
  const ua  = request.headers.get('user-agent') || 'kiwify-webhook';

  const emailHash = email ? await hashEmail(email) : null;
  const phoneHash = phone ? await hashPhone(phone) : null;

  // ── Detecta plano pelo nome do produto
  const nomeProd = product.toLowerCase();
  let plano = 'titular';
  let limiteMister = 0;
  if (nomeProd.includes('capitão') || nomeProd.includes('capitao')) {
    plano = 'capitao';
    limiteMister = 117; // 3/dia × 39 dias
  } else if (nomeProd.includes('craque')) {
    plano = 'craque';
    limiteMister = 30;
  }

  // ── Cria/atualiza acesso do usuário
  if (email) {
    const token = gerarToken();
    try {
      await env.DB.prepare(`
        INSERT INTO users (email, access_token, nome, kiwify_order_id, plano, limite_mister)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(email) DO UPDATE SET
          access_token    = excluded.access_token,
          nome            = excluded.nome,
          kiwify_order_id = excluded.kiwify_order_id,
          plano           = excluded.plano,
          limite_mister   = excluded.limite_mister,
          ativo           = 1
      `).bind(email, token, nome, orderId, plano, limiteMister).run();

      // Envia email de acesso
      await enviarEmailAcesso(env, email, nome, token);
    } catch (e) {
      console.error('Erro ao criar usuário:', e?.message);
    }
  }

  // ── Salva purchase e evento
  await env.DB.prepare(
    `INSERT OR IGNORE INTO purchases (order_id, email_hash, value, product, kiwify_payload)
     VALUES (?,?,?,?,?)`
  ).bind(orderId, emailHash, value, product, JSON.stringify(body)).run();

  await env.DB.prepare(
    `INSERT OR IGNORE INTO events (event_id, event_name, source, user_agent, ip, email_hash, phone_hash, value, currency, payload)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  ).bind(event_id, 'Purchase', 'kiwify', ua, ip, emailHash, phoneHash, value, 'BRL', JSON.stringify(body)).run();

  // ── Dispara Meta CAPI + GA4
  await Promise.allSettled([
    fetch(
      `https://graph.facebook.com/v19.0/${env.META_PIXEL_ID}/events?access_token=${env.META_ACCESS_TOKEN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: [{
            event_name: 'Purchase', event_time: ts, event_id,
            action_source: 'website',
            user_data: {
              client_ip_address: ip, client_user_agent: ua,
              ...(emailHash && { em: [emailHash] }),
              ...(phoneHash && { ph: [phoneHash] }),
            },
            custom_data: { value, currency: 'BRL' },
          }],
        }),
      }
    ),
    fetch(
      `https://www.google-analytics.com/mp/collect?measurement_id=${env.GA4_MEASUREMENT_ID}&api_secret=${env.GA4_API_SECRET}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: event_id,
          timestamp_micros: ts * 1_000_000,
          events: [{ name: 'purchase', params: { value, currency: 'BRL', transaction_id: orderId } }],
        }),
      }
    ),
  ]);

  return new Response('ok', { status: 200 });
}
