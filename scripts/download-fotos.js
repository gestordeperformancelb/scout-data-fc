#!/usr/bin/env node
/**
 * Baixa fotos dos jogadores e salva em public/assets/players/
 * Assim as imagens são servidas como arquivos estáticos — sem depender do Sofascore
 */

import fs   from 'fs';
import path from 'path';

const OUT_DIR = './public/assets/players';
fs.mkdirSync(OUT_DIR, { recursive: true });

const raw = JSON.parse(fs.readFileSync('./data/todos-jogadores.json', 'utf8'));
const jogadores = raw.jogadores;

console.log(`\n📸 Baixando fotos de ${jogadores.length} jogadores...\n`);

let ok = 0, skip = 0, fail = 0;

for (let i = 0; i < jogadores.length; i++) {
  const j = jogadores[i];
  const id = j.id;
  if (!id) { skip++; continue; }

  const outFile = path.join(OUT_DIR, `${id}.png`);
  if (fs.existsSync(outFile)) { skip++; continue; }

  try {
    const res = await fetch(`https://api.sofascore.app/api/v1/player/${id}/image`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.sofascore.com/',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
      },
    });

    if (res.ok) {
      const buf = await res.arrayBuffer();
      fs.writeFileSync(outFile, Buffer.from(buf));
      ok++;
    } else {
      fail++;
    }
  } catch (_) {
    fail++;
  }

  // Log a cada 50
  if ((i + 1) % 50 === 0) {
    process.stdout.write(`  ${i + 1}/${jogadores.length} → ✅ ${ok} | skip: ${skip} | fail: ${fail}\n`);
  }

  await new Promise(r => setTimeout(r, 80));
}

console.log(`\n✅ Concluído! Fotos: ${ok} | já existiam: ${skip} | falhas: ${fail}`);
console.log('📌 Agora rode: node scripts/build-painel.js');
