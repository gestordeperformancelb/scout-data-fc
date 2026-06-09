// GET /api/acesso?token=xxx — valida token, seta cookie de sessão, redireciona para painel

export async function onRequestGet(ctx) {
  const { request, env } = ctx;
  const url   = new URL(request.url);
  const token = url.searchParams.get('token')?.trim();

  if (!token) {
    return Response.redirect('https://scoutdatafc.com.br/login?erro=token_invalido', 302);
  }

  // Busca usuário pelo token
  let user;
  try {
    user = await env.DB
      .prepare('SELECT id, email, nome, ativo FROM users WHERE access_token = ?')
      .bind(token).first();
  } catch (e) {
    console.error('D1 error:', e?.message);
    return Response.redirect('https://scoutdatafc.com.br/login?erro=erro_interno', 302);
  }

  if (!user || !user.ativo) {
    return Response.redirect('https://scoutdatafc.com.br/login?erro=acesso_negado', 302);
  }

  // Atualiza último acesso
  await env.DB
    .prepare(`UPDATE users SET ultimo_acesso = datetime('now') WHERE id = ?`)
    .bind(user.id).run().catch(() => {});

  // Cookie de sessão — 30 dias
  const expiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toUTCString();

  return new Response(null, {
    status: 302,
    headers: {
      'Location': 'https://scoutdatafc.com.br/painel',
      'Set-Cookie': `sdf_token=${token}; Path=/; Expires=${expiry}; HttpOnly; Secure; SameSite=Lax`,
    },
  });
}
