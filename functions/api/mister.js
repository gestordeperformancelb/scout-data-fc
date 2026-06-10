/**
 * POST /api/mister — Scout Data F.C.
 * Contexto embutido gerado em: 2026-06-09T21:17:37.066Z
 */

const CORS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

const CONTEXTO = "TOTAL: 1253 jogadores de 48 seleções.\n\nTOP ARTILHEIROS (temporada 25/26 no clube):\nH. Kane (England, FC Bayern München): 36 gols, 5 assists, rating 7.8\nJ. Quiñones (Mexico, Al-Qadsiah): 33 gols, 4 assists, rating 7.6\nI. Toney (England, Al-Ahli): 32 gols, 7 assists, rating 7.4\nC. Ronaldo (Portugal, Al-Nassr): 28 gols, 2 assists, rating 7.2\nL. J. Suárez  (Colombia, Sporting CP): 28 gols, 6 assists, rating 7.4\nE. Haaland (Norway, Manchester City): 27 gols, 8 assists, rating 7.3\nK. Mbappé (France, Real Madrid): 25 gols, 5 assists, rating 7.6\nA. Ueda (Japan, Feyenoord): 25 gols, 1 assists, rating 7.2\nE. Shomurodov (Uzbekistan, Başakşehir FK): 22 gols, 5 assists, rating 7.2\nI. Thiago (Brazil, Brentford): 22 gols, 1 assists, rating 6.9\nJ. Félix (Portugal, Al-Nassr): 20 gols, 13 assists, rating 7.8\nD. Undav (Germany, VfB Stuttgart): 19 gols, 6 assists, rating 7.2\nJ. Lukić (Bosnia & Herzegovina, FC Universitatea Cluj): 18 gols, 2 assists, rating 7.2\nC. Fassnacht (Switzerland, BSC Young Boys): 18 gols, 7 assists, rating 7.0\nA. E. Kaabi (Morocco, Olympiacos FC): 18 gols, 2 assists, rating 6.8\n\nTOP ASSISTÊNCIAS:\nB. Fernandes (Portugal, Manchester United): 21 assists, 9 gols\nM. Olise (France, FC Bayern München): 19 assists, 15 gols\nJ. Ryerson (Norway, Borussia Dortmund): 15 assists, 0 gols\nL. Díaz (Colombia, FC Bayern München): 14 assists, 15 gols\nJ. Félix (Portugal, Al-Nassr): 13 assists, 20 gols\nR. Cherki (France, Manchester City): 12 assists, 4 gols\nI. Perišić (Croatia, PSV Eindhoven): 12 assists, 7 gols\nC. Baah (Ghana, Al-Qadsiah): 12 assists, 3 gols\nA. Afif (Qatar, Al-Sadd): 12 assists, 15 gols\nJ. Margaritha (Curaçao, SK Beveren): 12 assists, 7 gols\n\nTOP RATINGS:\nS. Tangvik (Norway, Goleiro): rating 8.8, 0 gols, 0 assists\nL. Messi (Argentina, Atacante): rating 8.6, 12 gols, 7 assists\nH. Souttar (Australia, Defensor): rating 8.2, 0 gols, 0 assists\nJ. Arévalo (Ecuador, Atacante): rating 8.2, 5 gols, 1 assists\nA. Afif (Qatar, Meia): rating 8.0, 15 gols, 12 assists\nL. Yamal (Spain, Meia): rating 7.9, 16 gols, 11 assists\nM. Olise (France, Meia): rating 7.9, 15 gols, 19 assists\nR. Neves (Portugal, Meia): rating 7.9, 11 gols, 6 assists\nS. Berhalter (USA, Meia): rating 7.8, 6 gols, 4 assists\nH. Kane (England, Atacante): rating 7.8, 36 gols, 5 assists\nL. Mpasi Nzau (DR Congo, Goleiro): rating 7.8, 0 gols, 0 assists\nL. Paredes (Argentina, Meia): rating 7.8, 2 gols, 3 assists\nJ. Félix (Portugal, Atacante): rating 7.8, 20 gols, 13 assists\nY. Diomande (Côte d'Ivoire, Atacante): rating 7.7, 12 gols, 8 assists\nJ. Kimmich (Germany, Meia): rating 7.7, 2 gols, 8 assists\n\nTOP PÊNALTIS:\n";

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
      message: `Você atingiu seu limite de ${limite} perguntas ao Mister.`,
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

  const systemPrompt = `Você é o "Mister" — analista tático da plataforma Scout Data F.C.
Você tem acesso aos dados dos jogadores convocados para a Copa do Mundo 2026.
Responda de forma direta, objetiva e com base nos dados. Máximo 3 parágrafos.
Use emojis com moderação. Mencione nomes e números concretos.
Não invente dados. Se não existir, diga "ainda não disponível".
Se a pergunta não for sobre futebol/Copa 2026/apostas, recuse educadamente.

${CONTEXTO}`;

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
