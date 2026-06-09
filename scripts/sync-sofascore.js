#!/usr/bin/env node
/**
 * Scout Data F.C. — Sync Sofascore → /data
 *
 * Uso:
 *   RAPIDAPI_KEY=sua_chave node scripts/sync-sofascore.js
 *
 * Endpoints confirmados:
 *   tournaments/get-seasons?tournamentId=16
 *   tournaments/get-standings?tournamentId=16&seasonId=58210
 *   teams/get-squad?teamId=X
 *   teams/get-statistics?teamId=X&tournamentId=16&seasonId=58210
 *   players/get-statistics?playerId=X&tournamentId=16&seasonId=58210
 */

import fs   from 'fs';
import path from 'path';

const RAPIDAPI_KEY  = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = 'sofascore.p.rapidapi.com';
const BASE_URL      = `https://${RAPIDAPI_HOST}`;
const OUT_DIR       = './data';
const TOURNAMENT_ID = 16;
const SEASON_ID     = 58210; // Copa do Mundo 2026

if (!RAPIDAPI_KEY) {
  console.error('❌  Defina: RAPIDAPI_KEY=sua_chave node scripts/sync-sofascore.js');
  process.exit(1);
}

fs.mkdirSync(path.join(OUT_DIR, 'selecoes'), { recursive: true });
fs.mkdirSync(path.join(OUT_DIR, 'jogadores'), { recursive: true });

const headers = {
  'x-rapidapi-key':  RAPIDAPI_KEY,
  'x-rapidapi-host': RAPIDAPI_HOST,
};

let reqCount = 0;

async function get(endpoint) {
  reqCount++;
  const url = `${BASE_URL}/${endpoint}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status} → ${endpoint}`);
  return res.json();
}

function save(filePath, data) {
  const full = path.join(OUT_DIR, filePath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, JSON.stringify(data, null, 2));
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('\n⚽  Scout Data F.C. — Sync Copa do Mundo 2026\n');

  // ── 1. Standings (grupos + IDs das seleções)
  console.log('1. Baixando grupos e seleções...');
  const standingsData = await get(
    `tournaments/get-standings?tournamentId=${TOURNAMENT_ID}&seasonId=${SEASON_ID}`
  );
  save('standings.json', standingsData);

  // Extrai IDs únicos das seleções
  const teamsMap = {};
  for (const standing of standingsData.standings ?? []) {
    const grupo = standing.tournament?.name ?? 'N/A';
    for (const row of standing.rows ?? []) {
      const t = row.team;
      if (t?.id) teamsMap[t.id] = { ...t, grupo, stats_grupo: row };
    }
  }

  const selecoes = Object.values(teamsMap);
  save('selecoes.json', selecoes);
  console.log(`   ✅ ${selecoes.length} seleções nos grupos\n`);

  // ── 2. Elenco de cada seleção
  console.log('2. Baixando elencos...');
  const todosJogadores = [];

  for (const selecao of selecoes) {
    process.stdout.write(`   ${selecao.name.padEnd(25)}`);
    try {
      const squad = await get(`teams/get-squad?teamId=${selecao.id}`);
      save(`selecoes/${selecao.id}-squad.json`, { selecao, squad });

      const jogadores = squad?.players ?? [];
      for (const p of jogadores) {
        todosJogadores.push({
          ...p.player,
          posicao: p.position,
          camisa:  p.jerseyNumber,
          selecao_nome: selecao.name,
          selecao_id:   selecao.id,
          grupo:        selecao.grupo,
        });
      }
      console.log(`${jogadores.length} jogadores`);
    } catch (e) {
      console.log(`⚠️  ${e.message}`);
    }
    await sleep(350); // ~170 req/min máximo no free
  }

  save('todos-jogadores.json', {
    total: todosJogadores.length,
    gerado_em: new Date().toISOString(),
    jogadores: todosJogadores,
  });
  console.log(`\n   ✅ Total: ${todosJogadores.length} jogadores\n`);

  // ── 3. Stats dos top jogadores (por xG, gols, rating)
  console.log('3. Baixando stats individuais dos jogadores...');
  let statsOk = 0, statsFail = 0;

  for (const jogador of todosJogadores) {
    const jid = jogador.id;
    if (!jid) continue;
    try {
      const stats = await get(
        `players/get-statistics?playerId=${jid}&tournamentId=${TOURNAMENT_ID}&seasonId=${SEASON_ID}`
      );
      save(`jogadores/${jid}-stats.json`, { jogador, stats });
      statsOk++;
    } catch (_) {
      statsFail++;
    }
    await sleep(400);

    // Log a cada 20 jogadores
    if ((statsOk + statsFail) % 20 === 0) {
      console.log(`   ${statsOk + statsFail}/${todosJogadores.length} — OK: ${statsOk} | sem dados: ${statsFail}`);
    }
  }
  console.log(`\n   ✅ Stats: ${statsOk} OK · ${statsFail} sem dados na temporada\n`);

  // ── 4. Resumo final
  console.log('─'.repeat(50));
  console.log(`✅  Sync concluído!`);
  console.log(`   📁 Arquivos salvos em: ${path.resolve(OUT_DIR)}`);
  console.log(`   🌐 Requisições feitas: ${reqCount}`);
  console.log(`   ⚽ Seleções: ${selecoes.length}`);
  console.log(`   👤 Jogadores: ${todosJogadores.length}`);
  console.log('\n📌 Próximo passo: npm run build-painel');
}

main().catch(err => {
  console.error('\n❌  Erro:', err.message);
  process.exit(1);
});
