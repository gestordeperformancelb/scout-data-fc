// GET /api/analise-dia — retorna análise dos últimos dias (padrão: 5 registros)
const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

export async function onRequestGet(ctx) {
  const { request, env } = ctx;
  const url = new URL(request.url);
  const data = url.searchParams.get('data'); // opcional: YYYY-MM-DD

  try {
    let rows;
    if (data) {
      const row = await env.DB.prepare(
        'SELECT * FROM analise_dia WHERE data = ? ORDER BY generated_at DESC LIMIT 1'
      ).bind(data).first();
      rows = row ? [row] : [];
    } else {
      const res = await env.DB.prepare(
        'SELECT * FROM analise_dia ORDER BY data DESC LIMIT 5'
      ).all();
      rows = res.results ?? [];
    }

    if (!rows.length) {
      return new Response(JSON.stringify({ ok: false, error: 'sem_dados' }), { status: 404, headers: CORS });
    }

    // Junta todos os jogos de todos os dias em um array único
    const todasJogos = [];
    for (const row of rows) {
      const jogos = row.jogos_json ? JSON.parse(row.jogos_json) : [];
      // marca cada jogo com a data de origem
      for (const j of jogos) todasJogos.push({ ...j, _data: row.data });
    }

    // Usa o registro mais recente para análise textual, jogador e standings
    const latest = rows[0];

    return new Response(JSON.stringify({
      ok: true,
      data: latest.data,
      analise_html: latest.analise_html,
      jogador: latest.jogador_nome ? {
        nome:    latest.jogador_nome,
        time:    latest.jogador_time,
        rating:  latest.jogador_rating,
        gols:    latest.jogador_gols,
        assists: latest.jogador_assists,
        foto:    latest.jogador_foto,
        jogo:    latest.jogador_jogo,
      } : null,
      jogos:     todasJogos,
      standings: latest.standings_json ? JSON.parse(latest.standings_json) : null,
      generated_at: latest.generated_at,
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
