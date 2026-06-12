#!/usr/bin/env node
/**
 * Scout Data F.C. — Análise do Dia
 * Busca jogos da Copa 2026, gera análise via Claude, salva no D1
 *
 * Uso:
 *   API_FOOTBALL_KEY=xxx RAPIDAPI_KEY=xxx ANTHROPIC_API_KEY=xxx node scripts/analise-dia.js [YYYY-MM-DD]
 *
 * Por padrão analisa o dia anterior. Passe uma data para reprocessar.
 */

import fs   from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const AF_KEY       = process.env.API_FOOTBALL_KEY;
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const DB_NAME      = 'scout-data-fc-db';

const AF_BASE   = 'https://v3.football.api-sports.io';
const SOFA_BASE = 'https://sofascore.p.rapidapi.com';
const LEAGUE    = 1;
const SEASON    = 2026;
const TOURNAMENT_ID = 16;
const SEASON_ID     = 58210;

// Data alvo: ontem ou argumento CLI
const targetDate = process.argv[2] ?? (() => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
})();

if (!AF_KEY)        { console.error('❌  API_FOOTBALL_KEY ausente'); process.exit(1); }
if (!ANTHROPIC_KEY) { console.error('❌  ANTHROPIC_API_KEY ausente'); process.exit(1); }

async function afGet(endpoint) {
  const res = await fetch(`${AF_BASE}/${endpoint}`, { headers: { 'x-apisports-key': AF_KEY } });
  if (!res.ok) throw new Error(`AF ${res.status} → ${endpoint}`);
  return res.json();
}

async function sofaGet(endpoint) {
  const res = await fetch(`${SOFA_BASE}/${endpoint}`, {
    headers: { 'x-rapidapi-key': RAPIDAPI_KEY, 'x-rapidapi-host': 'sofascore.p.rapidapi.com' },
  });
  if (!res.ok) throw new Error(`Sofa ${res.status} → ${endpoint}`);
  return res.json();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log(`\n⚽  Scout Data F.C. — Análise do Dia: ${targetDate}\n`);

  // ── 1. Jogos do dia
  console.log('1. Buscando jogos...');
  const fixturesData = await afGet(`fixtures?league=${LEAGUE}&season=${SEASON}&date=${targetDate}`);
  const fixtures = fixturesData.response ?? [];
  console.log(`   ${fixtures.length} jogo(s) encontrado(s)`);

  if (fixtures.length === 0) {
    console.log('   ⚠️  Dia sem jogos. Encerrando.');
    process.exit(0);
  }

  // ── 2. Stats por jogo
  console.log('\n2. Buscando stats dos jogadores...');
  const jogosDetalhados = [];

  for (const fix of fixtures) {
    const fid  = fix.fixture.id;
    const casa = fix.teams.home.name;
    const fora = fix.teams.away.name;
    const hg   = fix.goals.home ?? 0;
    const ag   = fix.goals.away ?? 0;
    const st   = fix.fixture.status.short;

    if (!['FT','AET','PEN'].includes(st)) {
      console.log(`   ⏭️  ${casa} x ${fora} — ${st} (não finalizado)`);
      continue;
    }

    console.log(`   📊 ${casa} ${hg}–${ag} ${fora}`);

    let jogadores = [];
    try {
      const pd = await afGet(`fixtures/players?fixture=${fid}`);
      for (const team of pd.response ?? []) {
        for (const pg of team.players ?? []) {
          const p = pg.player;
          const s = pg.statistics?.[0];
          if (!s || !s.games?.minutes) continue;
          jogadores.push({
            nome:     p.name,
            time:     team.team.name,
            rating:   parseFloat(s.games?.rating ?? 0),
            gols:     s.goals?.total ?? 0,
            assists:  s.goals?.assists ?? 0,
            minutos:  s.games?.minutes ?? 0,
            foto:     p.photo ?? null,
          });
        }
      }
    } catch (e) {
      console.log(`      ⚠️  Stats indisponíveis: ${e.message}`);
    }

    jogosDetalhados.push({ id: fid, casa, fora, placar: `${hg}–${ag}`, jogadores });
    await sleep(600);
  }

  if (jogosDetalhados.length === 0) {
    console.log('\n⚠️  Nenhum jogo finalizado. Encerrando.');
    process.exit(0);
  }

  // ── 3. Melhor jogador do dia
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

  // ── 4. Standings atualizados
  let standingsJson = null;
  if (RAPIDAPI_KEY) {
    try {
      console.log('\n3. Atualizando classificação...');
      const sd = await sofaGet(
        `tournaments/get-standings?tournamentId=${TOURNAMENT_ID}&seasonId=${SEASON_ID}`
      );
      standingsJson = JSON.stringify(sd);
      console.log('   ✅ Classificação atualizada');
    } catch (e) {
      console.log(`   ⚠️  Standings error: ${e.message}`);
    }
  }

  // ── 5. Gera análise via Claude
  console.log('\n4. Gerando análise com Claude...');

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

  if (!aiRes.ok) {
    console.error('❌  Claude error:', await aiRes.text());
    process.exit(1);
  }

  const aiData   = await aiRes.json();
  const analiseHtml = aiData.content?.[0]?.text ?? '';
  console.log('   ✅ Análise gerada');

  // ── 6. Salva no D1 via arquivo SQL temporário
  console.log('\n5. Salvando no D1...');

  const jogosResumidos = JSON.stringify(
    jogosDetalhados.map(j => ({ casa: j.casa, fora: j.fora, placar: j.placar }))
  );

  const esc = (s) => s?.replace(/'/g, "''") ?? '';

  const sql = `
INSERT INTO analise_dia
  (data, analise_html, jogador_nome, jogador_time, jogador_rating,
   jogador_gols, jogador_assists, jogador_foto, jogador_jogo,
   jogos_json, standings_json, generated_at)
VALUES (
  '${targetDate}',
  '${esc(analiseHtml)}',
  ${melhorJogador ? `'${esc(melhorJogador.nome)}'` : 'NULL'},
  ${melhorJogador ? `'${esc(melhorJogador.time)}'` : 'NULL'},
  ${melhorJogador ? melhorJogador.rating : 'NULL'},
  ${melhorJogador?.gols ?? 0},
  ${melhorJogador?.assists ?? 0},
  ${melhorJogador?.foto ? `'${esc(melhorJogador.foto)}'` : 'NULL'},
  ${melhorJogador ? `'${esc(melhorJogador.jogo)}'` : 'NULL'},
  '${esc(jogosResumidos)}',
  ${standingsJson ? `'${esc(standingsJson)}'` : 'NULL'},
  ${Math.floor(Date.now() / 1000)}
)
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
  generated_at    = excluded.generated_at;
`.trim();

  const tmpFile = path.join('/tmp', `analise_${targetDate}.sql`);
  fs.writeFileSync(tmpFile, sql);

  try {
    execSync(`npx wrangler d1 execute ${DB_NAME} --remote --file="${tmpFile}"`, { stdio: 'inherit' });
    console.log('\n✅  Análise do dia salva com sucesso!');
  } finally {
    fs.unlinkSync(tmpFile);
  }

  if (melhorJogador) {
    console.log(`🏆  Jogador do dia: ${melhorJogador.nome} (${melhorJogador.time}) — Rating ${melhorJogador.rating.toFixed(1)}`);
  }
  console.log(`📅  Data: ${targetDate} | Jogos: ${jogosDetalhados.length}`);
}

main().catch(err => {
  console.error('\n❌  Erro:', err.message);
  process.exit(1);
});
