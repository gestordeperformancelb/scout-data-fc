#!/usr/bin/env node
/**
 * Baixa fotos dos jogadores via API-Football CDN e salva em public/assets/players/
 * URL pública: https://media.api-sports.io/football/players/{api_football_id}.png
 * Nomeados pelo api_football_id para bater com fotoUrl() no build-painel.js
 */

import fs   from 'fs';
import path from 'path';

const OUT_DIR = './public/assets/players';
fs.mkdirSync(OUT_DIR, { recursive: true });

// Carrega mapa API-Football (tem api_football_id e nome)
const afData = JSON.parse(fs.readFileSync('./data/api-football/stats-agregadas.json', 'utf8'));
const jogadores = afData.jogadores.filter(j => j.api_football_id);

console.log(`\n📸 Baixando fotos de ${jogadores.length} jogadores via API-Football CDN...\n`);

let ok = 0, skip = 0, fail = 0;

for (let i = 0; i < jogadores.length; i++) {
  const j   = jogadores[i];
  const id  = j.api_football_id;
  const out = path.join(OUT_DIR, `${id}.png`);

  if (fs.existsSync(out)) { skip++; continue; }

  try {
    const res = await fetch(`https://media.api-sports.io/football/players/${id}.png`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
      },
    });

    if (res.ok) {
      const buf = await res.arrayBuffer();
      fs.writeFileSync(out, Buffer.from(buf));
      ok++;
    } else {
      fail++;
      if (fail <= 5) console.log(`  ⚠️  ${j.nome} (id ${id}) → HTTP ${res.status}`);
    }
  } catch (e) {
    fail++;
    if (fail <= 5) console.log(`  ❌ ${j.nome} (id ${id}) → ${e.message}`);
  }

  if ((i + 1) % 50 === 0) {
    process.stdout.write(`  ${i + 1}/${jogadores.length} → ✅ ${ok} baixadas | ⏭ ${skip} já existiam | ❌ ${fail} falhas\n`);
  }

  // Pequena pausa para não sobrecarregar o CDN
  await new Promise(r => setTimeout(r, 60));
}

console.log(`\n✅ Concluído!`);
console.log(`   Novas fotos: ${ok} | Já existiam: ${skip} | Falhas: ${fail}`);
if (ok > 0) console.log('📌 Rode agora: node scripts/build-painel.js');
