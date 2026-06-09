// GET /api/auth-check — verifica se o cookie de sessão é válido

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': 'https://scoutdatafc.com.br',
  'Cache-Control': 'no-store',
};

export async function onRequestGet(ctx) {
  const { request, env } = ctx;

  // Lê cookie
  const cookieHeader = request.headers.get('Cookie') || '';
  const match = cookieHeader.match(/sdf_token=([a-f0-9]{64})/);
  if (!match) {
    return new Response(JSON.stringify({ ok: false }), { status: 401, headers: CORS });
  }

  const token = match[1];

  // Valida no D1
  let user;
  try {
    user = await env.DB
      .prepare('SELECT id, email, nome, ativo, plano, limite_mister, perguntas_mister FROM users WHERE access_token = ?')
      .bind(token).first();
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: 'db_error' }), { status: 500, headers: CORS });
  }

  if (!user || !user.ativo) {
    return new Response(JSON.stringify({ ok: false }), { status: 401, headers: CORS });
  }

  return new Response(JSON.stringify({
    ok: true,
    email: user.email,
    nome: user.nome,
    plano: user.plano ?? 'titular',
    limite_mister: user.limite_mister ?? 0,
    perguntas_mister: user.perguntas_mister ?? 0,
  }), { status: 200, headers: CORS });
}
