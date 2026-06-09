// GET /dash?key=DASH_KEY — dashboard de tracking protegido por chave
export async function onRequestGet(ctx) {
  const { request, env } = ctx;
  const url = new URL(request.url);
  const key = url.searchParams.get('key');

  if (!key || key !== env.DASH_KEY) {
    return new Response('Acesso negado', { status: 401 });
  }

  const [eventsRes, leadsRes, purchasesRes, dailyRes] = await Promise.all([
    env.DB.prepare(`SELECT event_name, source, COUNT(*) as total
                    FROM events GROUP BY event_name, source ORDER BY total DESC`).all(),
    env.DB.prepare(`SELECT COUNT(*) as total FROM leads`).first(),
    env.DB.prepare(`SELECT COUNT(*) as total, SUM(value) as receita FROM purchases WHERE status='approved'`).first(),
    env.DB.prepare(`SELECT DATE(created_at) as dia, event_name, COUNT(*) as total
                    FROM events WHERE created_at >= datetime('now', '-14 days')
                    GROUP BY dia, event_name ORDER BY dia DESC`).all(),
  ]);

  const html = buildDash({
    events: eventsRes.results,
    leads: leadsRes,
    purchases: purchasesRes,
    daily: dailyRes.results,
    key,
  });

  return new Response(html, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
}

function buildDash({ events, leads, purchases, daily, key }) {
  const eventRows = events.map(e =>
    `<tr><td>${e.event_name}</td><td>${e.source}</td><td><strong>${e.total}</strong></td></tr>`
  ).join('');

  const dailyRows = daily.map(d =>
    `<tr><td>${d.dia}</td><td>${d.event_name}</td><td>${d.total}</td></tr>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Scout Data F.C. — Dashboard</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'DM Sans',system-ui,sans-serif;background:#0a0f0a;color:#e8f5e9;padding:2rem}
    h1{color:#c9a227;font-size:1.6rem;margin-bottom:.25rem}
    .sub{color:#66bb6a;font-size:.85rem;margin-bottom:2rem}
    .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1rem;margin-bottom:2rem}
    .card{background:#111b11;border:1px solid #1b3d1b;border-radius:10px;padding:1.2rem}
    .card-val{font-size:2rem;font-weight:700;color:#c9a227}
    .card-lbl{font-size:.8rem;color:#81c784;margin-top:.25rem}
    table{width:100%;border-collapse:collapse;margin-bottom:2rem}
    th{text-align:left;padding:.6rem .8rem;background:#111b11;color:#66bb6a;font-size:.8rem;text-transform:uppercase;letter-spacing:.05em}
    td{padding:.55rem .8rem;border-bottom:1px solid #1b3d1b;font-size:.9rem}
    tr:hover td{background:#111b11}
    h2{color:#a5d6a7;font-size:1rem;margin-bottom:.75rem;margin-top:1.5rem}
  </style>
</head>
<body>
  <h1>Scout Data F.C.</h1>
  <div class="sub">Dashboard de Tracking · Atualizado agora</div>

  <div class="cards">
    <div class="card">
      <div class="card-val">${leads?.total ?? 0}</div>
      <div class="card-lbl">Leads Capturados</div>
    </div>
    <div class="card">
      <div class="card-val">${purchases?.total ?? 0}</div>
      <div class="card-lbl">Vendas Aprovadas</div>
    </div>
    <div class="card">
      <div class="card-val">R$&nbsp;${Number(purchases?.receita ?? 0).toFixed(2)}</div>
      <div class="card-lbl">Receita Total</div>
    </div>
    <div class="card">
      <div class="card-val">${events.reduce((a, e) => a + e.total, 0)}</div>
      <div class="card-lbl">Eventos Totais</div>
    </div>
  </div>

  <h2>Eventos por tipo</h2>
  <table>
    <thead><tr><th>Evento</th><th>Fonte</th><th>Total</th></tr></thead>
    <tbody>${eventRows || '<tr><td colspan="3">Sem dados ainda</td></tr>'}</tbody>
  </table>

  <h2>Últimos 14 dias</h2>
  <table>
    <thead><tr><th>Data</th><th>Evento</th><th>Total</th></tr></thead>
    <tbody>${dailyRows || '<tr><td colspan="3">Sem dados ainda</td></tr>'}</tbody>
  </table>
</body>
</html>`;
}
