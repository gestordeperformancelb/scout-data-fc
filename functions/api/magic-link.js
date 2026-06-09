// POST /api/magic-link — envia novo link de acesso para email cadastrado

const CORS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

export async function onRequestPost(ctx) {
  const { request, env } = ctx;

  let body;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'JSON inválido' }), { status: 400, headers: CORS });
  }

  const email = body?.email?.trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return new Response(JSON.stringify({ error: 'Email inválido' }), { status: 400, headers: CORS });
  }

  // Busca usuário
  let user;
  try {
    user = await env.DB
      .prepare('SELECT id, email, nome, access_token, ativo FROM users WHERE email = ?')
      .bind(email).first();
  } catch {
    return new Response(JSON.stringify({ error: 'Erro interno' }), { status: 500, headers: CORS });
  }

  // Responde igual independente de encontrar — evita enumeração de emails
  if (!user || !user.ativo) {
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: CORS });
  }

  // Envia email com link de acesso
  if (env.RESEND_API_KEY) {
    const link    = `https://scoutdatafc.com.br/api/acesso?token=${user.access_token}`;
    const nomeExib = user.nome || 'Torcedor';

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Scout Data F.C. <acesso@scoutdatafc.com.br>',
        to: [email],
        subject: '🔑 Seu link de acesso ao Scout Data F.C.',
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#080d08;font-family:'Segoe UI',Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px">
    <div style="text-align:center;margin-bottom:32px">
      <h1 style="font-size:28px;font-weight:900;color:#c9a227;margin:0;letter-spacing:2px">SCOUT DATA F.C.</h1>
    </div>
    <div style="background:#0d1a0d;border:1px solid #1a3d1a;border-radius:12px;padding:32px 28px">
      <p style="color:#f4f9f4;font-size:16px;margin:0 0 8px">Olá, <strong>${nomeExib}</strong>! 👋</p>
      <p style="color:#8a9a8a;font-size:14px;line-height:1.6;margin:0 0 28px">
        Aqui está o seu link de acesso ao painel. Clique abaixo para entrar:
      </p>
      <div style="text-align:center;margin-bottom:24px">
        <a href="${link}" style="display:inline-block;background:#c9a227;color:#080d08;text-decoration:none;padding:16px 36px;border-radius:8px;font-weight:900;font-size:15px;letter-spacing:1px">
          ⚽ ACESSAR O PAINEL
        </a>
      </div>
      <p style="color:#4a6a4a;font-size:12px;text-align:center;margin:0">
        Link: <span style="color:#c9a227;word-break:break-all">${link}</span>
      </p>
    </div>
  </div>
</body>
</html>`,
      }),
    }).catch(e => console.error('Resend error:', e?.message));
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: CORS });
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
