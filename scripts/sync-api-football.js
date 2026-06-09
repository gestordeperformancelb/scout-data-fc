#!/usr/bin/env node
/**
 * Scout Data F.C. — Sync API-Football v2
 * Busca elencos por seleção → baixa fotos e stats via league+season
 */

import fs from 'fs';

const API_KEY  = process.env.API_FOOTBALL_KEY;
const BASE_URL = 'https://v3.football.api-sports.io';
const LEAGUE   = 1;     // Copa do Mundo
const SEASON   = 2026;

if (!API_KEY) {
  console.error('❌  Defina: API_FOOTBALL_KEY=sua_chave node scripts/sync-api-football.js');
  process.exit(1);
}

fs.mkdirSync('./data/api-football',     { recursive: true });
fs.mkdirSync('./public/assets/players', { recursive: true });

const headers = { 'x-apisports-key': API_KEY };
let reqCount = 0;

async function get(endpoint) {
  reqCount++;
  const res = await fetch(`${BASE_URL}/${endpoint}`, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status} → ${endpoint}`);
  return res.json();
}

async function downloadFoto(playerId, photoUrl) {
  const out = `./public/assets/players/${playerId}.png`;
  if (fs.existsSync(out)) return true;
  try {
    const res = await fetch(photoUrl || `https://media.api-sports.io/football/players/${playerId}.png`);
    if (!res.ok) return false;
    fs.writeFileSync(out, Buffer.from(await res.arrayBuffer()));
    return true;
  } catch { return false; }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('\n⚽  Scout Data F.C. — Sync API-Football v2\n');

  // 1. Busca todas as seleções da Copa 2026
  console.log('1. Buscando seleções da Copa 2026...');
  const teamsData = await get(`teams?league=${LEAGUE}&season=${SEASON}`);
  const selecoes = teamsData.response || [];
  console.log(`   ${selecoes.length} seleções encontradas\n`);
  fs.writeFileSync('./data/api-football/selecoes.json', JSON.stringify(selecoes, null, 2));

  const statsAgregadas = [];
  let fotos = 0, statsOk = 0;

  // 2. Para cada seleção, busca elenco + stats
  for (const sel of selecoes) {
    const teamId   = sel.team.id;
    const teamNome = sel.team.name;
    process.stdout.write(`   ${teamNome.padEnd(25)}`);

    // Elenco
    const squadData = await get(`players/squads?team=${teamId}`);
    const players   = squadData.response?.[0]?.players || [];
    await sleep(300);

    // Stats dos jogadores na Copa
    const statsData = await get(`players?league=${LEAGUE}&season=${SEASON}&team=${teamId}`);
    const statsMap  = {};
    for (const r of statsData.response || []) {
      statsMap[r.player.id] = r;
    }
    await sleep(300);

    let fotosTime = 0;
    for (const p of players) {
      // Baixa foto
      const baixou = await downloadFoto(p.id, p.photo);
      if (baixou) { fotos++; fotosTime++; }
      await sleep(50);

      // Monta stats
      const sr = statsMap[p.id];
      const s  = sr?.statistics?.[0] || {};
      statsAgregadas.push({
        api_football_id: p.id,
        nome:            p.name,
        selecao:         teamNome,
        selecao_id_af:   teamId,
        posicao:         p.position,
        foto_url:        `/assets/players/${p.id}.png`,
        clube:           s.team?.name,
        liga:            s.league?.name,
        jogos:           s.games?.appearences,
        minutos:         s.games?.minutes,
        rating:          s.games?.rating,
        gols:            s.goals?.total,
        assistencias:    s.goals?.assists,
        chutes:          s.shots?.total,
        chutes_alvo:     s.shots?.on,
        passes_chave:    s.passes?.key,
        dribles:         s.dribbles?.success,
        duelos_ganhos:   s.duels?.won,
        faltas_cometidas: s.fouls?.committed,
        faltas_sofridas: s.fouls?.drawn,
        amarelos:        s.cards?.yellow,
        vermelhos:       s.cards?.red,
        penalti_marcado: s.penalty?.scored,
        penalti_perdido: s.penalty?.missed,
      });
      if (sr) statsOk++;
    }

    console.log(`${players.length} jogadores · 📸 ${fotosTime}`);
  }

  // Salva agregado
  fs.writeFileSync('./data/api-football/stats-agregadas.json', JSON.stringify({
    total: statsAgregadas.length,
    gerado_em: new Date().toISOString(),
    jogadores: statsAgregadas,
  }, null, 2));

  // Cria mapa nome → api_football_id para cruzar com Sofascore
  const mapaIds = {};
  for (const j of statsAgregadas) {
    mapaIds[j.nome.toLowerCase()] = j.api_football_id;
  }
  fs.writeFileSync('./data/api-football/mapa-nomes.json', JSON.stringify(mapaIds, null, 2));

  console.log(`\n✅ Concluído!`);
  console.log(`   📸 Fotos: ${fotos}`);
  console.log(`   📊 Jogadores com stats: ${statsOk}`);
  console.log(`   🌐 Requisições: ${reqCount}`);
  console.log('\n📌 Próximo: node scripts/build-painel.js');
}

main().catch(err => {
  console.error('\n❌', err.message);
  process.exit(1);
});
