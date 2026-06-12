/**
 * Scout Data F.C. — Cron Worker
 * Roda diariamente: busca jogos da Copa 2026, gera análise via Claude, salva no D1
 *
 * Triggers: todo dia às 06:00 UTC (03:00 BRT)
 * Secrets: API_FOOTBALL_KEY, RAPIDAPI_KEY, ANTHROPIC_API_KEY
 */

const AF_BASE      = 'https://v3.football.api-sports.io';
const SOFA_BASE    = 'https://sofascore.p.rapidapi.com';
const LEAGUE       = 1;
const SEASON       = 2026;
const TOURNAMENT_ID = 16;
const SEASON_ID    = 58210;

export default {
  // Acionado pelo cron
  async scheduled(event, env, ctx) {
    const targetDate = yesterdayDate();
    console.log(`[analise-cron] Iniciando análise: ${targetDate}`);
    ctx.waitUntil(gerarAnalise(targetDate, env));
  },

  // Também aceita GET ?date=YYYY-MM-DD&secret=xxx para rodar manualmente
  async fetch(request, env) {
    const url = new URL(request.url);
    const secret = url.searchParams.get('secret');
    if (secret !== env.CRON_SECRET) {
      return new Response('forbidden', { status: 403 });
    }
    const date = url.searchParams.get('date') || yesterdayDate();
    try {
      const result = await gerarAnalise(date, env);
      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },
};

function yesterdayDate() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

async function afGet(endpoint, key) {
  const res = await fetch(`${AF_BASE}/${endpoint}`, {
    headers: { 'x-apisports-key': key },
  });
  if (!res.ok) throw new Error(`AF ${res.status} → ${endpoint}`);
  return res.json();
}

async function sofaGet(endpoint, key) {
  const res = await fetch(`${SOFA_BASE}/${endpoint}`, {
    headers: { 'x-rapidapi-key': key, 'x-rapidapi-host': 'sofascore.p.rapidapi.com' },
  });
  if (!res.ok) throw new Error(`Sofa ${res.status} → ${endpoint}`);
  return res.json();
}

async function gerarAnalise(targetDate, env) {
  const AF_KEY        = env.API_FOOTBALL_KEY;
  const RAPIDAPI_KEY  = env.RAPIDAPI_KEY;
  const ANTHROPIC_KEY = env.ANTHROPIC_API_KEY;

  // ── 1. Jogos do dia
  const fixturesData = await afGet(`fixtures?league=${LEAGUE}&season=${SEASON}&date=${targetDate}`, AF_KEY);
  const fixtures = fixturesData.response ?? [];
  console.log(`[analise-cron] ${fixtures.length} jogo(s) em ${targetDate}`);

  if (fixtures.length === 0) {
    return { ok: false, reason: 'sem_jogos', date: targetDate };
  }

  // ── 2. Stats por jogo
  const jogosDetalhados = [];

  for (const fix of fixtures) {
    const fid  = fix.fixture.id;
    const casa = fix.teams.home.name;
    const fora = fix.teams.away.name;
    const hg   = fix.goals.home ?? 0;
    const ag   = fix.goals.away ?? 0;
    const st   = fix.fixture.status.short;

    if (!['FT', 'AET', 'PEN'].includes(st)) continue;

    let jogadores = [];
    try {
      const pd = await afGet(`fixtures/players?fixture=${fid}`, AF_KEY);
      for (const team of pd.response ?? []) {
        for (const pg of team.players ?? []) {
          const p = pg.player;
          const s = pg.statistics?.[0];
          if (!s?.games?.minutes) continue;
          jogadores.push({
            nome:    p.name,
            time:    team.team.name,
            rating:  parseFloat(s.games?.rating ?? 0),
            gols:    s.goals?.total ?? 0,
            assists: s.goals?.assists ?? 0,
            minutos: s.games?.minutes ?? 0,
            foto:    p.photo ?? null,
          });
        }
      }
    } catch (e) {
      console.warn(`[analise-cron] Stats error ${fid}:`, e.message);
    }

    jogosDetalhados.push({ id: fid, casa, fora, placar: `${hg}–${ag}`, jogadores });
    await new Promise(r => setTimeout(r, 600));
  }

  if (jogosDetalhados.length === 0) {
    return { ok: false, reason: 'nenhum_finalizado', date: targetDate };
  }

  // ── 3. Melhor jogador
  let melhorJogador = null;
  let melhorRating  = 0;
  for (const jogo of jogosDetalhados) {
    for (const j of jogo.jogadores) {
      if (j.rating > melhorRating && j.minutos >= 45) {
        melhorRating  = j.rating;
        melhorJogador = { ...j, jogo: `${jogo.casa} ${jogo.placar} ${jogo.fora}` };
      }
    }
  }

  // ── 4. Standings
  let standingsJson = null;
  try {
    const sd = await sofaGet(
      `tournaments/get-standings?tournamentId=${TOURNAMENT_ID}&seasonId=${SEASON_ID}`,
      RAPIDAPI_KEY
    );
    standingsJson = JSON.stringify(sd);
  } catch (e) {
    console.warn('[analise-cron] Standings error:', e.message);
  }

  // ── 5. Análise via Claude
  const resumo = jogosDetalhados.map(j => {
    const top3 = [...j.jogadores].sort((a, b) => b.rating - a.rating).slice(0, 3)
      .map(p => `${p.nome} (${p.time}, rating ${p.rating.toFixed(1)}, ${p.gols}G ${p.assists}A)`).join(', ');
    return `${j.casa} ${j.placar} ${j.fora}\nDestaques: ${top3 || 'sem dados'}`;
  }).join('\n\n');

  const prompt = `Você é o analista da plataforma Scout Data F.C., focado em apostas esportivas na Copa do Mundo 2026.
Data: ${targetDate}

JOGOS DO DIA:
${resumo}

${melhorJogador ? `MELHOR JOGADOR: ${melhorJogador.nome} (${melhorJogador.time}) — Rating ${melhorJogador.rating.toFixed(1)}, ${melhorJogador.gols} gol(s), ${melhorJogador.assists} assist(s) em ${melhorJogador.jogo}` : ''}

Gere uma análise HTML para apostadores com:
- Parágrafo inicial: resumo do dia (resultados, surpresas)
- Para cada jogo: 2 frases sobre o resultado e o jogador mais impactante
- Parágrafo final: 1 dica de aposta para os próximos jogos com base no padrão visto
- Use <strong> para nomes e números relevantes
- Máximo 350 palavras
- Responda SOMENTE com HTML inline (tags p e strong apenas, sem html/body/head)`;

  const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY.trim(),
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!aiRes.ok) throw new Error(`Claude ${aiRes.status}: ${await aiRes.text()}`);
  const aiData     = await aiRes.json();
  const analiseHtml = aiData.content?.[0]?.text ?? '';

  // ── 6. Salva no D1
  const jogosResumidos = JSON.stringify(
    jogosDetalhados.map(j => ({ casa: j.casa, fora: j.fora, placar: j.placar }))
  );

  await env.DB.prepare(`
    INSERT INTO analise_dia
      (data, analise_html, jogador_nome, jogador_time, jogador_rating,
       jogador_gols, jogador_assists, jogador_foto, jogador_jogo,
       jogos_json, standings_json, generated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(data) DO UPDATE SET
      analise_html    = excluded.analise_html,
      jogador_nome    = excluded.jogador_nome,
      jogador_time    = excluded.jogador_time,
      jogador_rating  = excluded.jogador_rating,
      jogador_gols    = excluded.jogador_gols,
      jogador_assists = excluded.jogador_assists,
      jogador_foto    = excluded.jogador_foto,
      jogador_jogo    = excluded.jogador_jogo,
      jogos_json      = excluded.jogos_json,
      standings_json  = excluded.standings_json,
      generated_at    = excluded.generated_at
  `).bind(
    targetDate,
    analiseHtml,
    melhorJogador?.nome ?? null,
    melhorJogador?.time ?? null,
    melhorJogador?.rating ?? null,
    melhorJogador?.gols ?? 0,
    melhorJogador?.assists ?? 0,
    melhorJogador?.foto ?? null,
    melhorJogador?.jogo ?? null,
    jogosResumidos,
    standingsJson,
    Math.floor(Date.now() / 1000),
  ).run();

  console.log(`[analise-cron] ✅ Salvo. Jogador: ${melhorJogador?.nome ?? 'N/A'}`);
  return {
    ok: true,
    date: targetDate,
    jogos: jogosDetalhados.length,
    jogador: melhorJogador?.nome ?? null,
  };
}
