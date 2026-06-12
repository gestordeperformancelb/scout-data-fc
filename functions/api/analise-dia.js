// GET /api/analise-dia — retorna análise do dia atual ou de uma data específica
const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

export async function onRequestGet(ctx) {
  const { request, env } = ctx;
  const url = new URL(request.url);
  const data = url.searchParams.get('data'); // opcional: YYYY-MM-DD

  try {
    let row;
    if (data) {
      row = await env.DB.prepare(
        'SELECT * FROM analise_dia WHERE data = ? ORDER BY generated_at DESC LIMIT 1'
      ).bind(data).first();
    } else {
      row = await env.DB.prepare(
        'SELECT * FROM analise_dia ORDER BY data DESC, generated_at DESC LIMIT 1'
      ).first();
    }

    if (!row) {
      return new Response(JSON.stringify({ ok: false, error: 'sem_dados' }), { status: 404, headers: CORS });
    }

    return new Response(JSON.stringify({
      ok: true,
      data: row.data,
      analise_html: row.analise_html,
      jogador: row.jogador_nome ? {
        nome:    row.jogador_nome,
        time:    row.jogador_time,
        rating:  row.jogador_rating,
        gols:    row.jogador_gols,
        assists: row.jogador_assists,
        foto:    row.jogador_foto,
        jogo:    row.jogador_jogo,
      } : null,
      jogos:     row.jogos_json     ? JSON.parse(row.jogos_json)     : [],
      standings: row.standings_json ? JSON.parse(row.standings_json) : null,
      generated_at: row.generated_at,
    }), { status: 200, headers: CORS });
  } catch (e) {
    console.error('analise-dia error:', e?.message);
    return new Response(JSON.stringify({ ok: false, error: 'Erro interno' }), { status: 500, headers: CORS });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
