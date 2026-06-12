CREATE TABLE IF NOT EXISTS analise_dia (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  data             TEXT NOT NULL UNIQUE,
  analise_html     TEXT,
  jogador_nome     TEXT,
  jogador_time     TEXT,
  jogador_rating   REAL,
  jogador_gols     INTEGER DEFAULT 0,
  jogador_assists  INTEGER DEFAULT 0,
  jogador_foto     TEXT,
  jogador_jogo     TEXT,
  jogos_json       TEXT,
  standings_json   TEXT,
  generated_at     INTEGER
);
