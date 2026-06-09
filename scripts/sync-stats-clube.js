#!/usr/bin/env node
/**
 * Scout Data F.C. — Sync stats do clube atual de cada jogador
 * Usa o uniqueTournament do clube para pegar a temporada atual
 */

import fs   from 'fs';
import path from 'path';

const RAPIDAPI_KEY  = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = 'sofascore.p.rapidapi.com';
const BASE_URL      = `https://${RAPIDAPI_HOST}`;

if (!RAPIDAPI_KEY) {
  console.error('❌  Defina: RAPIDAPI_KEY=sua_chave node scripts/sync-stats-clube.js');
  process.exit(1);
}

fs.mkdirSync('./data/stats-clube', { recursive: true });

const headers = {
  'x-rapidapi-key':  RAPIDAPI_KEY,
  'x-rapidapi-host': RAPIDAPI_HOST,
};

let reqCount = 0;

async function get(endpoint) {
  reqCount++;
  const res = await fetch(`${BASE_URL}/${endpoint}`, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Cache de season_id por tournament_id
const seasonCache = {};

async function getSeasonId(tournamentId) {
  if (seasonCache[tournamentId]) return seasonCache[tournamentId];
  try {
    const data = await get(`tournaments/get-seasons?tournamentId=${tournamentId}`);
    const seasons = data?.seasons ?? [];
    // Pega a temporada mais recente
    const season = seasons[0];
    if (season?.id) {
      seasonCache[tournamentId] = season.id;
      return season.id;
    }
  } catch (_) {}
  return null;
}

async function main() {
  console.log('\n⚽  Scout Data F.C. — Sync Stats Clube 2024/25\n');

  const raw = JSON.parse(fs.readFileSync('./data/todos-jogadores.json', 'utf8'));
  const jogadores = raw.jogadores;
  console.log(`Total de jogadores: ${jogadores.length}\n`);

  let ok = 0, sem = 0, erros = 0;
  const statsAgregadas = [];

  for (let i = 0; i < jogadores.length; i++) {
    const j = jogadores[i];
    const jid = j.id;
    const tournamentId = j.team?.primaryUniqueTournament?.id ?? j.team?.tournament?.uniqueTournament?.id;

    if (!jid || !tournamentId) { sem++; continue; }

    // Verifica se já tem stats salvas
    const outFile = `./data/stats-clube/${jid}.json`;
    if (fs.existsSync(outFile)) {
      const existing = JSON.parse(fs.readFileSync(outFile, 'utf8'));
      if (existing?.statistics && !existing.error) {
        statsAgregadas.push({ jogador: j, stats: existing.statistics });
        ok++;
        continue;
      }
    }

    try {
      const seasonId = await getSeasonId(tournamentId);
      await sleep(150);
      if (!seasonId) { sem++; continue; }

      const data = await get(`players/get-statistics?playerId=${jid}&tournamentId=${tournamentId}&seasonId=${seasonId}`);

      if (data?.statistics) {
        fs.writeFileSync(outFile, JSON.stringify({ jogador: j, statistics: data.statistics }, null, 2));
        statsAgregadas.push({ jogador: j, stats: data.statistics });
        ok++;
      } else {
        sem++;
      }
    } catch (e) {
      erros++;
    }

    await sleep(350);

    if ((i + 1) % 50 === 0) {
      console.log(`  ${i + 1}/${jogadores.length} → ✅ ${ok} | sem dados: ${sem} | erros: ${erros} | reqs: ${reqCount}`);
    }
  }

  console.log(`\n✅ Concluído!`);
  console.log(`   Com stats: ${ok} | Sem dados: ${sem} | Erros: ${erros}`);
  console.log(`   Requisições: ${reqCount}`);

  // Salva agregado
  fs.writeFileSync('./data/stats-clube-agregadas.json', JSON.stringify({
    total: statsAgregadas.length,
    gerado_em: new Date().toISOString(),
    jogadores: statsAgregadas,
  }, null, 2));

  console.log('\n📌 Agora rode: npm run build-painel');
}

main().catch(err => {
  console.error('\n❌  Erro:', err.message);
  process.exit(1);
});
