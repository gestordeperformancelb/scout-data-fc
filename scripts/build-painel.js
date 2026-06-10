#!/usr/bin/env node
/**
 * Scout Data F.C. — Build Painel SaaS
 * Combina dados Sofascore + API-Football para gerar public/painel.html
 */

import fs   from 'fs';
import path from 'path';

// ── Carrega dados
const raw        = JSON.parse(fs.readFileSync('./data/todos-jogadores.json', 'utf8'));
const selecoes   = JSON.parse(fs.readFileSync('./data/selecoes.json', 'utf8'));
const standings  = JSON.parse(fs.readFileSync('./data/standings.json', 'utf8'));

// Stats API-Football — cruza por nome
let afStats = {};
const afFile   = './data/api-football/stats-agregadas.json';
const mapaFile = './data/api-football/mapa-nomes.json';
if (fs.existsSync(afFile)) {
  const afData = JSON.parse(fs.readFileSync(afFile));
  for (const j of afData.jogadores) {
    afStats[j.nome.toLowerCase()] = j;
  }
}

// Stats clube Sofascore
let sofaStats = {};
const sofaDir = './data/stats-clube';
if (fs.existsSync(sofaDir)) {
  for (const f of fs.readdirSync(sofaDir)) {
    const d = JSON.parse(fs.readFileSync(path.join(sofaDir, f)));
    if (d.statistics) sofaStats[d.jogador?.id] = d.statistics;
  }
}

const jogadores = raw.jogadores;

// Mapa grupo por selecao_id
const grupoMap = {};
for (const s of selecoes) {
  grupoMap[s.id] = s.grupo?.replace('FIFA World Cup, ', '') ?? '?';
}

// Mapa standings
const standMap = {};
for (const stand of standings.standings ?? []) {
  for (const row of stand.rows ?? []) {
    standMap[row.team?.id] = row;
  }
}

// Seleções únicas
const selecoesMap = {};
for (const j of jogadores) {
  if (!selecoesMap[j.selecao_id]) {
    selecoesMap[j.selecao_id] = {
      id: j.selecao_id, nome: j.selecao_nome,
      grupo: grupoMap[j.selecao_id] ?? '?',
      stand: standMap[j.selecao_id] ?? {},
      jogadores: [],
    };
  }
  selecoesMap[j.selecao_id].jogadores.push(j);
}

const listaSelecoes = Object.values(selecoesMap)
  .sort((a, b) => a.grupo.localeCompare(b.grupo) || a.nome.localeCompare(b.nome));

// ── Helpers
function posLabel(p) {
  return { F: 'Atacante', M: 'Meia', D: 'Defensor', G: 'Goleiro' }[p] || p || '—';
}
function age(ts) {
  if (!ts) return '—';
  return Math.floor((Date.now() - ts * 1000) / (365.25 * 24 * 3600 * 1000));
}
function money(v) {
  if (!v) return null;
  if (v >= 1e6) return `€${(v / 1e6).toFixed(0)}M`;
  return `€${(v / 1e3).toFixed(0)}K`;
}
function fotoUrl(j) {
  const af = afStats[j.name?.toLowerCase()] || afStats[j.shortName?.toLowerCase()];
  if (af?.api_football_id) {
    const local = `./public/assets/players/${af.api_football_id}.png`;
    if (fs.existsSync(local)) return `/assets/players/${af.api_football_id}.png`;
  }
  return null;
}
function avatarDiv(nome, cor, extraStyle = '') {
  const p   = nome.trim().split(' ');
  const ini = p.length >= 2 ? (p[0][0] + p[p.length-1][0]).toUpperCase() : nome.slice(0,2).toUpperCase();
  return `<div class="avatar" style="background:${cor}${extraStyle ? ';' + extraStyle : ''}">${ini}</div>`;
}
const CORES = ['#1a5c2e','#0a3d62','#4a1942','#6b2d2d','#1b4332','#2c3e50','#1e3a5f','#3d2c1a'];

// ── Enriquece jogador com stats
function enrichPlayer(j) {
  const af  = afStats[j.name?.toLowerCase()] || afStats[j.shortName?.toLowerCase()] || {};
  const sof = sofaStats[j.id] || {};
  return {
    ...j, af, sof,
    gols:   af.gols   ?? sof.goals   ?? null,
    assist: af.assistencias ?? sof.assists ?? null,
    rating: af.rating  ? parseFloat(af.rating)  : (sof.rating ? parseFloat(sof.rating) : null),
    faltas: af.faltas_cometidas ?? null,
    pen:    af.penalti_marcado  ?? null,
    foto:   fotoUrl(j),
  };
}

// ── Card jogador
function jogadorCard(j) {
  const e   = enrichPlayer(j);
  const cor = CORES[j.name.charCodeAt(0) % CORES.length];
  const imgEl = e.foto
    ? `<img src="${e.foto}" alt="${j.name}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">${avatarDiv(j.name, cor, 'display:none')}`
    : avatarDiv(j.name, cor);

  const clube  = j.team?.shortName ?? j.team?.name ?? '—';
  const camisa = j.shirtNumber ?? j.jerseyNumber ?? '—';
  const valor  = money(j.proposedMarketValue);
  const anos   = age(j.dateOfBirthTimestamp);
  const ratingFmt = e.rating ? e.rating.toFixed(1) : null;

  const badges = [
    `<span>${anos}a</span>`,
    `<span>${clube}</span>`,
    j.height ? `<span>${j.height}cm</span>` : '',
    valor ? `<span class="val">${valor}</span>` : '',
    e.gols   != null ? `<span class="gol">⚽ ${e.gols}</span>`   : '',
    e.assist != null ? `<span class="ast">🎯 ${e.assist}</span>` : '',
    ratingFmt        ? `<span class="rat">★ ${ratingFmt}</span>` : '',
    e.faltas != null ? `<span class="flt">✋ ${e.faltas}</span>` : '',
    e.pen    != null ? `<span class="pen">🅿 ${e.pen}</span>`    : '',
  ].filter(Boolean).join('');

  return `<div class="jcard" data-pos="${j.position||''}" data-sel="${j.selecao_id}" data-nome="${j.name.toLowerCase()}" data-gols="${e.gols??0}" data-assist="${e.assist??0}" data-rating="${e.rating??0}">
  <div class="jcard-top">${imgEl}<div class="jcard-camisa">#${camisa}</div></div>
  <div class="jcard-body">
    <div class="jcard-nome">${j.shortName ?? j.name}</div>
    <div class="jcard-sub">${j.selecao_nome} · ${posLabel(j.position)}</div>
    <div class="jcard-badges">${badges}</div>
  </div>
</div>`;
}

// ── Aba Rankings por seleção
function rankingSelecao(s) {
  const jogs = s.jogadores.map(j => ({
    ...j,
    af:  afStats[j.name?.toLowerCase()] || afStats[j.shortName?.toLowerCase()] || {},
    sof: sofaStats[j.id] || {},
  }));

  const top = (arr, key, label, emoji) => {
    const sorted = arr
      .filter(j => (j.af[key] ?? j.sof[key]) != null && (j.af[key] ?? 0) > 0)
      .sort((a, b) => (b.af[key] ?? 0) - (a.af[key] ?? 0))
      .slice(0, 5);
    if (!sorted.length) return '';
    const rows = sorted.map((j, i) => {
      const val = j.af[key] ?? '—';
      return `<tr><td>${i+1}</td><td><strong>${j.shortName ?? j.name}</strong></td><td>${val}</td></tr>`;
    }).join('');
    return `<div class="rank-bloco"><div class="rank-titulo">${emoji} ${label}</div><table><tbody>${rows}</tbody></table></div>`;
  };

  return `<div class="sel-ranking" id="rank-${s.id}" style="display:none">
  <div class="rank-grid">
    ${top(jogs,'gols','Artilheiros','⚽')}
    ${top(jogs,'assistencias','Assistências','🎯')}
    ${top(jogs,'penalti_marcado','Pênaltis marcados','🅿️')}
    ${top(jogs,'faltas_sofridas','Mais faltados','🤕')}
    ${top(jogs,'faltas_cometidas','Mais faltosos','✋')}
    ${top(jogs,'chutes_alvo','Chutes ao gol','🎯')}
    ${top(jogs,'dribles','Dribles certos','🕹️')}
    ${top(jogs,'amarelos','Cartões amarelos','🟨')}
  </div>
</div>`;
}

// ── Linha tabela seleções
function selecaoRow(s) {
  const st = s.stand;
  return `<tr class="sel-row" onclick="toggleRanking(${s.id})" style="cursor:pointer">
  <td><strong>${s.nome}</strong> <span class="expand-ico" id="ico-${s.id}">▶</span></td>
  <td>${s.grupo}</td><td>${s.jogadores.length}</td>
  <td>${st.wins??0}</td><td>${st.draws??0}</td><td>${st.losses??0}</td>
  <td>${st.scoresFor??0}</td><td>${st.scoresAgainst??0}</td>
  <td><strong>${st.points??0}</strong></td>
</tr>
<tr><td colspan="9" style="padding:0">${rankingSelecao(s)}</td></tr>`;
}

// ── Aba: Maiores Notas por Posição
const enriched = jogadores.map(enrichPlayer).filter(j => j.rating && j.rating > 0);

function topPorPosicao(posCode, posNome, emoji) {
  const top = enriched
    .filter(j => j.position === posCode)
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 10);

  if (!top.length) return '';

  const rows = top.map((j, i) => {
    const foto = j.foto
      ? `<img src="${j.foto}" class="rank-foto" onerror="this.style.display='none'">`
      : `<div class="rank-avatar" style="background:${CORES[j.name.charCodeAt(0)%CORES.length]}">${(j.shortName??j.name).slice(0,2).toUpperCase()}</div>`;

    const medalha = ['🥇','🥈','🥉'][i] ?? `<span class="rank-num">${i+1}</span>`;
    const clube   = j.team?.shortName ?? j.team?.name ?? '—';
    const gols    = j.gols  ?? '—';
    const assist  = j.assist ?? '—';

    return `<div class="np-row">
      <div class="np-pos">${medalha}</div>
      <div class="np-foto">${foto}</div>
      <div class="np-info">
        <div class="np-nome">${j.shortName ?? j.name}</div>
        <div class="np-sub">${j.selecao_nome} · ${clube}</div>
      </div>
      <div class="np-stats">
        <span class="rat">★ ${j.rating.toFixed(1)}</span>
        ${j.gols  != null ? `<span class="gol">⚽${gols}</span>` : ''}
        ${j.assist != null ? `<span class="ast">🎯${assist}</span>` : ''}
      </div>
    </div>`;
  }).join('');

  return `<div class="np-card">
    <div class="np-header">${emoji} ${posNome}</div>
    <div class="np-lista">${rows}</div>
  </div>`;
}

const notasPorPosicao = `
  <div class="np-intro">
    <p>Rankings baseados na <strong>média de rating</strong> dos jogadores convocados, considerando a temporada 2025/26 nos clubes. Atualizado com dados da Copa conforme os jogos acontecerem.</p>
  </div>
  <div class="np-grid">
    ${topPorPosicao('G','Goleiros','🧤')}
    ${topPorPosicao('D','Defensores','🛡️')}
    ${topPorPosicao('M','Meias','🎮')}
    ${topPorPosicao('F','Atacantes','⚡')}
  </div>`;

// ── Aba: Análise do Dia / Jogador da Rodada (dinâmico — placeholder até Copa)
const copaStart  = new Date('2026-06-11T18:00:00-03:00');
const agora      = new Date();
const diasParaCopa = Math.ceil((copaStart - agora) / 86400000);
const copaAtiva    = agora >= copaStart;

function abaEmBreve(titulo, descricao, icone) {
  if (copaAtiva) {
    return `<div class="em-breve-wrap">
      <div class="em-breve-card">
        <div class="eb-icone">${icone}</div>
        <div class="eb-titulo">${titulo}</div>
        <div class="eb-desc">Atualizando com os dados da rodada mais recente...</div>
        <div class="eb-badge live">🔴 AO VIVO — Copa em andamento</div>
      </div>
    </div>`;
  }
  return `<div class="em-breve-wrap">
    <div class="em-breve-card">
      <div class="eb-icone">${icone}</div>
      <div class="eb-titulo">${titulo}</div>
      <div class="eb-desc">${descricao}</div>
      <div class="eb-countdown">
        <div class="eb-badge">⚽ Copa começa em <strong>${diasParaCopa} dia${diasParaCopa !== 1 ? 's' : ''}</strong> — 11 de junho de 2026</div>
      </div>
      <div class="eb-sub">Esta aba será ativada automaticamente assim que a Copa começar.</div>
    </div>
  </div>`;
}

// ── Gera contexto compacto para o Mister (salvo como JSON estático)
const topGoleiros  = [...enriched].sort((a,b)=>(b.gols??0)-(a.gols??0)).slice(0,20);
const topAssists   = [...enriched].sort((a,b)=>(b.assist??0)-(a.assist??0)).slice(0,20);
const topRatings   = [...enriched].sort((a,b)=>(b.rating??0)-(a.rating??0)).slice(0,20);
const topPenaltis  = [...enriched].filter(j=>j.pen>0).sort((a,b)=>(b.pen??0)-(a.pen??0)).slice(0,10);

const misterContext = {
  total_jogadores: jogadores.length,
  total_selecoes: listaSelecoes.length,
  gerado_em: new Date().toISOString(),
  top_artilheiros: topGoleiros.map(j=>({ nome: j.shortName??j.name, selecao: j.selecao_nome, clube: j.team?.name, gols: j.gols, assist: j.assist, rating: j.rating?.toFixed(1) })),
  top_assistencias: topAssists.map(j=>({ nome: j.shortName??j.name, selecao: j.selecao_nome, clube: j.team?.name, gols: j.gols, assist: j.assist, rating: j.rating?.toFixed(1) })),
  top_ratings: topRatings.map(j=>({ nome: j.shortName??j.name, selecao: j.selecao_nome, clube: j.team?.name, pos: posLabel(j.position), gols: j.gols, assist: j.assist, rating: j.rating?.toFixed(1) })),
  top_penaltis: topPenaltis.map(j=>({ nome: j.shortName??j.name, selecao: j.selecao_nome, penaltis: j.pen })),
  selecoes: listaSelecoes.map(s=>({ nome: s.nome, grupo: s.grupo, jogadores: s.jogadores.length })),
};

fs.mkdirSync('./public/assets', { recursive: true });
fs.writeFileSync('./public/assets/mister-context.json', JSON.stringify(misterContext));

// ── Gera o Worker do Mister com contexto embutido (evita self-fetch em produção)
const artilheirosTxt = (misterContext.top_artilheiros).slice(0,15)
  .map(j=>`${j.nome} (${j.selecao}, ${j.clube}): ${j.gols} gols, ${j.assist} assists, rating ${j.rating}`).join('\n');
const ratingsTxt = (misterContext.top_ratings).slice(0,15)
  .map(j=>`${j.nome} (${j.selecao}, ${j.pos}): rating ${j.rating}, ${j.gols} gols, ${j.assist} assists`).join('\n');
const penaltisTxt = (misterContext.top_penaltis)
  .map(j=>`${j.nome} (${j.selecao}): ${j.penaltis} pênaltis`).join('\n');
const assistTxt = (misterContext.top_assistencias).slice(0,10)
  .map(j=>`${j.nome} (${j.selecao}, ${j.clube}): ${j.assist} assists, ${j.gols} gols`).join('\n');

const contextoEmbutido = `TOTAL: ${misterContext.total_jogadores} jogadores de ${misterContext.total_selecoes} seleções.

TOP ARTILHEIROS (temporada 25/26 no clube):
${artilheirosTxt}

TOP ASSISTÊNCIAS:
${assistTxt}

TOP RATINGS:
${ratingsTxt}

TOP PÊNALTIS:
${penaltisTxt}`;

const misterWorker = `/**
 * POST /api/mister — Scout Data F.C.
 * Contexto embutido gerado em: ${new Date().toISOString()}
 */

const CORS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

const CONTEXTO = ${JSON.stringify(contextoEmbutido)};

// Lê cookie sdf_token do request
function getToken(request) {
  const cookie = request.headers.get('cookie') || '';
  const m = cookie.match(/sdf_token=([a-f0-9]{64})/);
  return m ? m[1] : null;
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export async function onRequestPost(ctx) {
  const { request, env } = ctx;

  // ── Autenticação via cookie
  const token = getToken(request);
  if (!token) {
    return new Response(JSON.stringify({ error: 'auth', message: 'Não autenticado' }), { status: 401, headers: CORS });
  }

  // ── Busca usuário no D1
  let user;
  try {
    user = await env.DB.prepare(
      'SELECT email, plano, limite_mister, perguntas_mister FROM users WHERE access_token = ? AND ativo = 1'
    ).bind(token).first();
  } catch (e) {
    console.error('D1 auth error:', e?.message);
    return new Response(JSON.stringify({ error: 'Erro interno' }), { status: 500, headers: CORS });
  }

  if (!user) {
    return new Response(JSON.stringify({ error: 'auth', message: 'Token inválido' }), { status: 401, headers: CORS });
  }

  // ── Verifica plano (Titular não tem acesso)
  if (user.plano === 'titular' || user.limite_mister === 0) {
    return new Response(JSON.stringify({
      error: 'plan',
      message: 'O Pergunte ao Mister está disponível nos planos Craque e Capitão. Faça upgrade para acessar!',
    }), { status: 403, headers: CORS });
  }

  // ── Verifica limite de perguntas
  const usadas = user.perguntas_mister ?? 0;
  const limite = user.limite_mister ?? 0;
  if (usadas >= limite) {
    return new Response(JSON.stringify({
      error: 'limit',
      message: \`Você atingiu seu limite de \${limite} perguntas ao Mister.\`,
    }), { status: 429, headers: CORS });
  }

  let body;
  try { body = await request.json(); }
  catch { return new Response(JSON.stringify({ error: 'JSON inválido' }), { status: 400, headers: CORS }); }

  const { question } = body ?? {};
  if (!question?.trim()) {
    return new Response(JSON.stringify({ error: 'question é obrigatório' }), { status: 400, headers: CORS });
  }
  if (question.length > 500) {
    return new Response(JSON.stringify({ error: 'Pergunta muito longa (máx. 500 chars)' }), { status: 400, headers: CORS });
  }

  const anthropicKey = env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return new Response(JSON.stringify({ error: 'Serviço temporariamente indisponível' }), { status: 503, headers: CORS });
  }

  const systemPrompt = \`Você é o "Mister" — analista tático da plataforma Scout Data F.C.
Você tem acesso aos dados dos jogadores convocados para a Copa do Mundo 2026.
Responda de forma direta, objetiva e com base nos dados. Máximo 3 parágrafos.
Use emojis com moderação. Mencione nomes e números concretos.
Não invente dados. Se não existir, diga "ainda não disponível".
Se a pergunta não for sobre futebol/Copa 2026/apostas, recuse educadamente.

\${CONTEXTO}\`;

  let answer;
  try {
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey.trim(),
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        system: systemPrompt,
        messages: [{ role: 'user', content: question.trim() }],
      }),
    });

    if (!aiRes.ok) {
      const err = await aiRes.text().catch(() => '');
      console.error('Anthropic error:', aiRes.status, err);
      return new Response(JSON.stringify({ error: 'Erro ao consultar IA' }), { status: 502, headers: CORS });
    }

    const aiData = await aiRes.json();
    answer = aiData.content?.[0]?.text;
    if (!answer) return new Response(JSON.stringify({ error: 'Resposta vazia' }), { status: 502, headers: CORS });
  } catch (e) {
    console.error('Fetch error:', e?.message);
    return new Response(JSON.stringify({ error: 'Erro de conexão com IA' }), { status: 502, headers: CORS });
  }

  // ── Incrementa perguntas_mister no D1
  try {
    await env.DB.prepare(
      'UPDATE users SET perguntas_mister = perguntas_mister + 1 WHERE access_token = ?'
    ).bind(token).run();
  } catch (e) { console.error('D1 increment error:', e?.message); }

  const novasUsadas = usadas + 1;
  return new Response(JSON.stringify({
    answer,
    used: novasUsadas,
    remaining: limite - novasUsadas,
    limite,
  }), { status: 200, headers: CORS });
}
`;

fs.writeFileSync('./functions/api/mister.js', misterWorker);
console.log(`   Contexto do Mister: ${JSON.stringify(misterContext).length} bytes → Worker gerado`);

// ── HTML principal
const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Scout Data F.C. — Painel Copa 2026</title>
<script>
// Guard de autenticação — roda antes de qualquer coisa
(async()=>{
  try{
    const r=await fetch('/api/auth-check',{credentials:'include'});
    const d=await r.json();
    if(!d.ok){window.location.replace('/login');return;}
    // Exibe nome do usuário na nav se disponível
    window.__sdfUser = d;
  }catch{window.location.replace('/login');}
})();
</script>
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{--verde:#1a3d1a;--verde-md:#2d6a2d;--verde-lt:#4caf50;--ouro:#c9a227;--ouro-lt:#f0c040;--preto:#080d08;--branco:#f4f9f4;--cinza:#8a9a8a}
body{font-family:'DM Sans',sans-serif;background:var(--preto);color:var(--branco);min-height:100vh}
nav{display:flex;align-items:center;justify-content:space-between;padding:.75rem 1.5rem;background:rgba(8,13,8,.95);border-bottom:1px solid #1a3d1a;position:sticky;top:0;z-index:100}
.logo{font-family:'Bebas Neue',sans-serif;font-size:1.4rem;color:var(--ouro)}
.logo span{color:var(--verde-lt)}
.nav-badge{background:rgba(201,162,39,.15);border:1px solid var(--ouro);color:var(--ouro);font-size:.7rem;padding:.25rem .7rem;border-radius:12px;letter-spacing:.08em}
.tabs{display:flex;gap:0;border-bottom:2px solid #1a3d1a;background:#0d1a0d;padding:0 1.5rem;overflow-x:auto;scrollbar-width:none}
.tabs::-webkit-scrollbar{display:none}
.tab{padding:.85rem 1.1rem;cursor:pointer;font-size:.8rem;font-weight:600;color:var(--cinza);border-bottom:2px solid transparent;margin-bottom:-2px;transition:color .2s;white-space:nowrap;flex-shrink:0}
.tab.active,.tab:hover{color:var(--ouro);border-bottom-color:var(--ouro)}
.filtros{padding:1rem 1.5rem;background:#0a100a;display:flex;flex-wrap:wrap;gap:.75rem;align-items:center}
input[type=text]{background:#111b11;border:1px solid #2d6a2d;color:var(--branco);border-radius:6px;padding:.55rem .9rem;font-size:.875rem;font-family:inherit;outline:none;width:220px}
input[type=text]:focus{border-color:var(--ouro)}
select{background:#111b11;border:1px solid #2d6a2d;color:var(--branco);border-radius:6px;padding:.55rem .75rem;font-size:.875rem;font-family:inherit;outline:none;cursor:pointer}
.badge-total{background:#1a3d1a;color:var(--verde-lt);font-size:.75rem;padding:.3rem .7rem;border-radius:10px;font-weight:600}
.painel{display:none;padding:1.5rem}
.painel.active{display:block}
/* CARDS */
.jgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(175px,1fr));gap:.9rem}
.jcard{background:#0d1a0d;border:1px solid #1a3d1a;border-radius:10px;overflow:hidden;transition:border-color .2s,transform .15s}
.jcard:hover{border-color:var(--ouro);transform:translateY(-2px)}
.jcard-top{position:relative;background:#111b11;height:110px;display:flex;align-items:center;justify-content:center}
.jcard-top img{height:100px;width:auto;object-fit:cover}
.avatar{width:80px;height:80px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:'Bebas Neue',sans-serif;font-size:2rem;color:var(--ouro);border:2px solid rgba(201,162,39,.3)}
.jcard-camisa{position:absolute;top:6px;right:8px;font-family:'Bebas Neue',sans-serif;font-size:1.1rem;color:var(--ouro);opacity:.8}
.jcard-body{padding:.75rem}
.jcard-nome{font-size:.875rem;font-weight:700;margin-bottom:.2rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.jcard-sub{font-size:.72rem;color:var(--cinza);margin-bottom:.5rem}
.jcard-badges{display:flex;flex-wrap:wrap;gap:.3rem}
.jcard-badges span{background:#1a3d1a;color:#a5d6a7;font-size:.68rem;padding:.2rem .5rem;border-radius:4px;white-space:nowrap}
.jcard-badges .val{background:rgba(201,162,39,.15);color:var(--ouro)}
.jcard-badges .gol{background:rgba(76,175,80,.2);color:#81c784}
.jcard-badges .ast{background:rgba(33,150,243,.2);color:#90caf9}
.jcard-badges .rat{background:rgba(255,193,7,.2);color:#ffd54f}
.jcard-badges .flt{background:rgba(244,67,54,.15);color:#ef9a9a}
.jcard-badges .pen{background:rgba(156,39,176,.2);color:#ce93d8}
/* TABELA SELEÇÕES */
.sel-table-wrap{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:.875rem}
th{text-align:left;padding:.65rem .85rem;background:#0d1a0d;color:var(--verde-lt);font-size:.75rem;text-transform:uppercase;letter-spacing:.06em;white-space:nowrap}
td{padding:.6rem .85rem;border-bottom:1px solid #1a3d1a}
tr.sel-row:hover td{background:#0d1a0d}
.expand-ico{color:var(--ouro);font-size:.7rem;margin-left:.4rem;transition:transform .2s}
.expand-ico.open{transform:rotate(90deg)}
.rank-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:1rem;padding:1rem;background:#070d07}
.rank-bloco{background:#0d1a0d;border:1px solid #1a3d1a;border-radius:8px;overflow:hidden}
.rank-titulo{padding:.6rem .85rem;background:#111b11;color:var(--ouro);font-size:.8rem;font-weight:700;border-bottom:1px solid #1a3d1a}
.rank-bloco table{font-size:.8rem}
.rank-bloco td{padding:.4rem .75rem;border-bottom:1px solid #0d1a0d}
.rank-bloco td:first-child{color:var(--cinza);width:24px}
.rank-bloco td:last-child{color:var(--verde-lt);font-weight:700;text-align:right}
/* MAIORES NOTAS POR POSIÇÃO */
.np-intro{background:#0d1a0d;border:1px solid #1a3d1a;border-radius:8px;padding:1rem 1.25rem;margin-bottom:1.5rem;font-size:.85rem;color:var(--cinza);line-height:1.6}
.np-intro strong{color:var(--branco)}
.np-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:1.25rem}
.np-card{background:#0d1a0d;border:1px solid #1a3d1a;border-radius:10px;overflow:hidden}
.np-header{padding:.75rem 1rem;background:#111b11;border-bottom:1px solid #1a3d1a;font-family:'Bebas Neue',sans-serif;font-size:1.1rem;color:var(--ouro);letter-spacing:.05em}
.np-lista{padding:.5rem 0}
.np-row{display:flex;align-items:center;gap:.75rem;padding:.5rem 1rem;transition:background .15s}
.np-row:hover{background:#111b11}
.np-pos{width:28px;text-align:center;font-size:1rem}
.rank-num{background:#1a3d1a;color:var(--cinza);font-size:.75rem;font-weight:700;padding:.15rem .4rem;border-radius:4px}
.np-foto{width:40px;height:40px;flex-shrink:0}
.rank-foto{width:40px;height:40px;border-radius:50%;object-fit:cover;border:2px solid #1a3d1a}
.rank-avatar{width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:'Bebas Neue',sans-serif;font-size:.9rem;color:var(--ouro);border:2px solid #1a3d1a}
.np-info{flex:1;min-width:0}
.np-nome{font-size:.85rem;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.np-sub{font-size:.7rem;color:var(--cinza)}
.np-stats{display:flex;gap:.35rem;flex-shrink:0}
.np-stats .rat{background:rgba(255,193,7,.2);color:#ffd54f;font-size:.72rem;padding:.2rem .45rem;border-radius:4px;font-weight:700}
.np-stats .gol{background:rgba(76,175,80,.2);color:#81c784;font-size:.72rem;padding:.2rem .45rem;border-radius:4px}
.np-stats .ast{background:rgba(33,150,243,.2);color:#90caf9;font-size:.72rem;padding:.2rem .45rem;border-radius:4px}
/* EM BREVE */
.em-breve-wrap{display:flex;justify-content:center;align-items:center;min-height:360px}
.em-breve-card{text-align:center;max-width:480px;background:#0d1a0d;border:1px solid #1a3d1a;border-radius:16px;padding:2.5rem 2rem}
.eb-icone{font-size:3.5rem;margin-bottom:1rem}
.eb-titulo{font-family:'Bebas Neue',sans-serif;font-size:1.8rem;color:var(--ouro);margin-bottom:.75rem;letter-spacing:.05em}
.eb-desc{font-size:.9rem;color:var(--cinza);line-height:1.6;margin-bottom:1.25rem}
.eb-badge{display:inline-block;background:rgba(201,162,39,.15);border:1px solid var(--ouro);color:var(--ouro-lt);padding:.5rem 1.1rem;border-radius:20px;font-size:.82rem;font-weight:600;margin-bottom:1rem}
.eb-badge.live{background:rgba(244,67,54,.15);border-color:#f44336;color:#ff8a80}
.eb-sub{font-size:.78rem;color:#4a6a4a}
/* PERGUNTE AO MISTER */
.mister-wrap{max-width:720px;margin:0 auto}
.mister-header{background:linear-gradient(135deg,#0d1a0d,#1a3d1a);border:1px solid var(--ouro);border-radius:12px;padding:1.5rem;margin-bottom:1.5rem;display:flex;gap:1.25rem;align-items:center}
.mister-avatar{width:64px;height:64px;border-radius:50%;background:var(--ouro);display:flex;align-items:center;justify-content:center;font-size:2rem;flex-shrink:0;border:3px solid var(--ouro-lt)}
.mister-bio h2{font-family:'Bebas Neue',sans-serif;font-size:1.5rem;color:var(--ouro);letter-spacing:.05em}
.mister-bio p{font-size:.82rem;color:var(--cinza);margin-top:.25rem;line-height:1.5}
.mister-limit{display:flex;align-items:center;gap:.5rem;margin-top:.75rem}
.limit-pip{width:10px;height:10px;border-radius:50%;background:var(--verde-md)}
.limit-pip.used{background:#333}
.limit-txt{font-size:.78rem;color:var(--cinza)}
.chat-area{background:#0a100a;border:1px solid #1a3d1a;border-radius:12px;min-height:200px;max-height:420px;overflow-y:auto;padding:1rem;margin-bottom:1rem;display:flex;flex-direction:column;gap:.75rem}
.msg{max-width:88%;padding:.75rem 1rem;border-radius:10px;font-size:.875rem;line-height:1.6;animation:fadeIn .25s ease}
.msg-user{background:rgba(201,162,39,.15);border:1px solid rgba(201,162,39,.3);color:var(--branco);align-self:flex-end;border-radius:10px 10px 3px 10px}
.msg-mister{background:#0d1a0d;border:1px solid #1a3d1a;color:var(--branco);align-self:flex-start;border-radius:10px 10px 10px 3px}
.msg-mister .msg-label{font-size:.7rem;color:var(--ouro);font-weight:700;margin-bottom:.4rem}
.msg-loading{opacity:.6;font-style:italic;color:var(--cinza)}
.chat-input-row{display:flex;gap:.75rem}
.chat-input{flex:1;background:#111b11;border:1px solid #2d6a2d;color:var(--branco);border-radius:8px;padding:.75rem 1rem;font-size:.875rem;font-family:inherit;outline:none;resize:none;height:52px;line-height:1.4}
.chat-input:focus{border-color:var(--ouro)}
.chat-input:disabled{opacity:.5;cursor:not-allowed}
.btn-enviar{background:var(--ouro);color:#080d08;border:none;border-radius:8px;padding:.75rem 1.25rem;font-family:'Bebas Neue',sans-serif;font-size:1rem;letter-spacing:.05em;cursor:pointer;transition:background .2s;flex-shrink:0}
.btn-enviar:hover:not(:disabled){background:var(--ouro-lt)}
.btn-enviar:disabled{opacity:.5;cursor:not-allowed}
.sugestoes{display:flex;flex-wrap:wrap;gap:.5rem;margin-bottom:1rem}
.sug-btn{background:#0d1a0d;border:1px solid #2d6a2d;color:var(--cinza);border-radius:20px;padding:.4rem .9rem;font-size:.78rem;cursor:pointer;transition:all .2s;font-family:inherit}
.sug-btn:hover{border-color:var(--ouro);color:var(--ouro-lt)}
.mister-aviso{background:rgba(244,67,54,.1);border:1px solid rgba(244,67,54,.3);border-radius:8px;padding:.75rem 1rem;text-align:center;font-size:.82rem;color:#ff8a80;margin-bottom:1rem;display:none}
@keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
.hidden{display:none!important}
@media(max-width:600px){.jgrid{grid-template-columns:repeat(auto-fill,minmax(145px,1fr))}.mister-header{flex-direction:column;text-align:center}.np-grid{grid-template-columns:1fr}}
</style>
</head>
<body>

<nav>
  <div class="logo">Scout Data <span>F.C.</span></div>
  <div style="display:flex;align-items:center;gap:.75rem">
    <div class="nav-badge">COPA DO MUNDO 2026</div>
    <div id="nav-user" style="font-size:.75rem;color:var(--cinza);display:none">
      <span id="nav-email"></span>
      <button onclick="logout()" style="background:none;border:1px solid #2d6a2d;color:var(--cinza);border-radius:4px;padding:.2rem .5rem;font-size:.7rem;cursor:pointer;margin-left:.5rem;font-family:inherit">Sair</button>
    </div>
  </div>
</nav>

<div class="tabs" id="tabs">
  <div class="tab active" onclick="trocarTab('jogadores',this)">Jogadores</div>
  <div class="tab" onclick="trocarTab('selecoes',this)">Seleções & Rankings</div>
  <div class="tab" onclick="trocarTab('notas',this)">⭐ Notas por Posição</div>
  <div class="tab" onclick="trocarTab('analise',this)">📊 Análise do Dia</div>
  <div class="tab" onclick="trocarTab('rodada',this)">🏆 Jogador da Rodada</div>
  <div class="tab tab-mister" onclick="trocarTab('mister',this)">🧠 Pergunte ao Mister</div>
</div>

<!-- JOGADORES -->
<div id="tab-jogadores" class="painel active">
  <div class="filtros">
    <input type="text" id="busca" placeholder="Buscar jogador..." oninput="filtrar()">
    <select id="fil-pos" onchange="filtrar()">
      <option value="">Todas posições</option>
      <option value="G">Goleiros</option>
      <option value="D">Defensores</option>
      <option value="M">Meias</option>
      <option value="F">Atacantes</option>
    </select>
    <select id="fil-sel" onchange="filtrar()">
      <option value="">Todas seleções</option>
      ${listaSelecoes.map(s => `<option value="${s.id}">${s.nome}</option>`).join('\n      ')}
    </select>
    <select id="fil-ord" onchange="ordenar()">
      <option value="">Ordenar por...</option>
      <option value="gols">⚽ Mais gols</option>
      <option value="assist">🎯 Mais assistências</option>
      <option value="rating">★ Melhor rating</option>
    </select>
    <span class="badge-total" id="badge-total">${jogadores.length} jogadores</span>
  </div>
  <div style="padding:1.5rem 1.5rem 0">
    <div class="jgrid" id="jgrid">
      ${jogadores.map(jogadorCard).join('\n      ')}
    </div>
  </div>
</div>

<!-- SELEÇÕES & RANKINGS -->
<div id="tab-selecoes" class="painel">
  <div class="filtros">
    <input type="text" id="busca-sel" placeholder="Buscar seleção..." oninput="filtrarSel()">
    <span class="badge-total">${listaSelecoes.length} seleções · 8 grupos</span>
  </div>
  <div style="padding:1.5rem">
    <div class="sel-table-wrap">
      <table>
        <thead><tr><th>Seleção</th><th>Grupo</th><th>Elenco</th><th>V</th><th>E</th><th>D</th><th>GM</th><th>GS</th><th>Pts</th></tr></thead>
        <tbody id="sel-body">
          ${listaSelecoes.map(selecaoRow).join('\n          ')}
        </tbody>
      </table>
    </div>
  </div>
</div>

<!-- MAIORES NOTAS POR POSIÇÃO -->
<div id="tab-notas" class="painel">
  ${notasPorPosicao}
</div>

<!-- ANÁLISE DO DIA -->
<div id="tab-analise" class="painel">
  ${abaEmBreve('Análise do Dia', 'A cada rodada da Copa do Mundo, esta aba exibirá os melhores desempenhos, destaques táticos e análises dos jogadores com maior impacto no dia.', '📊')}
</div>

<!-- JOGADOR DA RODADA -->
<div id="tab-rodada" class="painel">
  ${abaEmBreve('Jogador da Rodada', 'Após cada rodada da Copa do Mundo, o jogador com maior nota Sofascore será destacado aqui com análise completa de desempenho, stats e relevância para apostas.', '🏆')}
</div>

<!-- PERGUNTE AO MISTER -->
<div id="tab-mister" class="painel">
  <div class="mister-wrap">

    <div class="mister-header">
      <div class="mister-avatar">🧠</div>
      <div class="mister-bio">
        <h2>Pergunte ao Mister</h2>
        <p>Inteligência artificial treinada com os dados dos <strong>${jogadores.length} jogadores</strong> convocados para a Copa 2026. Pergunte sobre stats, comparações, tendências e dicas para apostas.</p>
        <div class="mister-limit">
          <div class="limit-pip" id="pip0"></div>
          <div class="limit-pip" id="pip1"></div>
          <div class="limit-pip" id="pip2"></div>
          <span class="limit-txt" id="limit-txt">3 perguntas disponíveis nesta sessão</span>
        </div>
      </div>
    </div>

    <div class="mister-aviso" id="mister-aviso"></div>

    <p style="font-size:.78rem;color:var(--cinza);margin-bottom:.75rem">💡 Sugestões de perguntas:</p>
    <div class="sugestoes">
      <button class="sug-btn" onclick="usarSugestao(this)">Quem são os maiores artilheiros convocados?</button>
      <button class="sug-btn" onclick="usarSugestao(this)">Qual atacante tem melhor aproveitamento de chutes?</button>
      <button class="sug-btn" onclick="usarSugestao(this)">Quais jogadores marcam mais pênaltis?</button>
      <button class="sug-btn" onclick="usarSugestao(this)">Me dê uma dica de jogador para apostar em gols</button>
      <button class="sug-btn" onclick="usarSugestao(this)">Compare Vinicius Jr e Kylian Mbappé em stats</button>
      <button class="sug-btn" onclick="usarSugestao(this)">Qual seleção tem o ataque mais poderoso?</button>
    </div>

    <div class="chat-area" id="chat-area">
      <div class="msg msg-mister">
        <div class="msg-label">🧠 MISTER</div>
        Olá! Sou o Mister, seu analista de dados da Copa do Mundo 2026. Tenho acesso às estatísticas de todos os <strong>${jogadores.length} jogadores convocados</strong>. Pode me perguntar sobre artilheiros, assistências, ratings, comparações entre jogadores ou dicas para apostas. Como posso ajudar?
      </div>
    </div>

    <div class="chat-input-row">
      <textarea class="chat-input" id="chat-input" placeholder="Digite sua pergunta sobre os jogadores da Copa..." rows="1" onkeydown="chatKeydown(event)"></textarea>
      <button class="btn-enviar" id="btn-enviar" onclick="enviarPergunta()">ENVIAR</button>
    </div>

  </div>
</div>

<script>
// ── Tabs
const cards = Array.from(document.querySelectorAll('.jcard'));
const badge = document.getElementById('badge-total');

function trocarTab(id, el) {
  document.querySelectorAll('.painel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + id).classList.add('active');
  el.classList.add('active');
}

// ── Filtros jogadores
function filtrar() {
  const busca = document.getElementById('busca').value.toLowerCase();
  const pos   = document.getElementById('fil-pos').value;
  const sel   = document.getElementById('fil-sel').value;
  let vis = 0;
  cards.forEach(c => {
    const ok = (!busca || c.dataset.nome.includes(busca)) &&
               (!pos   || c.dataset.pos === pos) &&
               (!sel   || c.dataset.sel === sel);
    c.classList.toggle('hidden', !ok);
    if (ok) vis++;
  });
  badge.textContent = vis + ' jogadores';
}
function ordenar() {
  const ord = document.getElementById('fil-ord').value;
  if (!ord) return;
  const grid  = document.getElementById('jgrid');
  const vis   = cards.filter(c => !c.classList.contains('hidden'));
  vis.sort((a,b) => parseFloat(b.dataset[ord]||0) - parseFloat(a.dataset[ord]||0));
  vis.forEach(c => grid.appendChild(c));
}

// ── Filtro seleções
function filtrarSel() {
  const busca = document.getElementById('busca-sel').value.toLowerCase();
  document.querySelectorAll('.sel-row').forEach(r => {
    const nome = r.querySelector('td strong').textContent.toLowerCase();
    const next = r.nextElementSibling;
    const hide = busca && !nome.includes(busca);
    r.classList.toggle('hidden', hide);
    if (next) next.classList.toggle('hidden', hide);
  });
}
function toggleRanking(id) {
  const el  = document.getElementById('rank-' + id);
  const ico = document.getElementById('ico-' + id);
  const aberto = el.style.display !== 'none';
  el.style.display = aberto ? 'none' : 'block';
  ico.classList.toggle('open', !aberto);
}

// ── Mister chat
let misterUsadas = window.__sdfUser?.perguntas_mister ?? 0;
let misterLimite = window.__sdfUser?.limite_mister ?? 0;
let misterPlano  = window.__sdfUser?.plano || 'titular';

function atualizarPips() {
  const maxPips = 3; // visual apenas
  for (let i = 0; i < maxPips; i++) {
    const pip = document.getElementById('pip' + i);
    if (!pip) continue;
    if (misterPlano === 'titular') { pip.classList.add('used'); continue; }
    pip.classList.toggle('used', i < Math.min(misterUsadas, maxPips));
  }
  const txt = document.getElementById('limit-txt');
  if (!txt) return;
  if (misterPlano === 'titular') {
    txt.textContent = 'Disponível nos planos Craque e Capitão';
  } else {
    const rest = Math.max(0, misterLimite - misterUsadas);
    txt.textContent = rest > 0
      ? rest + ' pergunta' + (rest !== 1 ? 's' : '') + ' restante' + (rest !== 1 ? 's' : '')
      : 'Limite de perguntas atingido';
  }
  if (misterPlano === 'titular' || (misterLimite > 0 && misterUsadas >= misterLimite)) bloquearChat();
}

function bloquearChat() {
  const inp = document.getElementById('chat-input');
  const btn = document.getElementById('btn-enviar');
  if (inp) inp.disabled = true;
  if (btn) btn.disabled = true;
  const av = document.getElementById('mister-aviso');
  if (!av) return;
  if (misterPlano === 'titular') {
    av.innerHTML = '🔒 O <strong>Pergunte ao Mister</strong> está disponível nos planos <strong>Craque</strong> e <strong>Capitão</strong>. <a href="/" style="color:#c9a227">Fazer upgrade →</a>';
  } else {
    av.innerHTML = '⚠️ Você usou todas as suas ' + misterLimite + ' perguntas ao Mister.';
  }
  av.style.display = 'block';
}

function adicionarMsg(texto, tipo, loading = false) {
  const area = document.getElementById('chat-area');
  const div  = document.createElement('div');
  div.className = 'msg msg-' + tipo + (loading ? ' msg-loading' : '');
  if (tipo === 'mister') div.innerHTML = '<div class="msg-label">🧠 MISTER</div>' + texto;
  else div.textContent = texto;
  area.appendChild(div);
  area.scrollTop = area.scrollHeight;
  return div;
}

function usarSugestao(btn) {
  const inp = document.getElementById('chat-input');
  if (inp && !inp.disabled) inp.value = btn.textContent;
}

function chatKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarPergunta(); }
}

async function enviarPergunta() {
  const inp = document.getElementById('chat-input');
  const btn = document.getElementById('btn-enviar');
  const q   = inp?.value?.trim();
  if (!q || !inp || inp.disabled) return;

  inp.value = '';
  btn.disabled = true;
  inp.disabled = true;

  adicionarMsg(q, 'user');
  const loading = adicionarMsg('Analisando dados...', 'mister', true);

  try {
    const res = await fetch('/api/mister', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: q }),
    });

    const data = await res.json();
    loading.remove();

    if (res.status === 401 || data.error === 'auth') {
      adicionarMsg('Sessão expirada. Faça login novamente.', 'mister');
      setTimeout(() => window.location.replace('/login'), 2000);
      return;
    }

    if (res.status === 403 || data.error === 'plan') {
      bloquearChat();
      adicionarMsg(data.message || 'Seu plano não inclui o Pergunte ao Mister.', 'mister');
      return;
    }

    if (res.status === 429 || data.error === 'limit') {
      misterUsadas = misterLimite;
      atualizarPips();
      adicionarMsg(data.message || 'Limite de perguntas atingido.', 'mister');
      return;
    }

    if (!res.ok || data.error) {
      adicionarMsg('Desculpe, ocorreu um erro. Tente novamente em instantes.', 'mister');
      btn.disabled = false;
      inp.disabled = false;
      return;
    }

    adicionarMsg(data.answer, 'mister');
    misterUsadas  = data.used ?? (misterUsadas + 1);
    misterLimite  = data.limite ?? misterLimite;
    atualizarPips();

    if (data.remaining === 0) {
      bloquearChat();
    } else {
      btn.disabled = false;
      inp.disabled = false;
    }
  } catch (err) {
    loading.remove();
    adicionarMsg('Erro de conexão. Verifique sua internet e tente novamente.', 'mister');
    btn.disabled = false;
    inp.disabled = false;
  }
}

// Exibe usuário na nav
if(window.__sdfUser){
  const el = document.getElementById('nav-user');
  const em = document.getElementById('nav-email');
  if(el && em){ em.textContent = window.__sdfUser.email; el.style.display='flex'; el.style.alignItems='center'; }
}

function logout(){
  document.cookie='sdf_token=;Path=/;Expires=Thu, 01 Jan 1970 00:00:00 GMT;Secure;SameSite=Lax';
  window.location.href='/login';
}

// Init
atualizarPips();
</script>
</body>
</html>`;

fs.writeFileSync('./public/painel.html', html);
console.log(`✅ Painel gerado: public/painel.html`);
console.log(`   ${jogadores.length} jogadores · ${listaSelecoes.length} seleções`);
console.log(`   Stats API-Football: ${Object.keys(afStats).length} jogadores`);
console.log(`   Stats Sofascore: ${Object.keys(sofaStats).length} jogadores`);
console.log(`   Copa em ${diasParaCopa > 0 ? diasParaCopa + ' dias' : 'andamento'}`);
