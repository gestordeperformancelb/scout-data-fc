-- Tabelas para dados da Sofascore API

CREATE TABLE IF NOT EXISTS selecoes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  sofascore_id  INTEGER UNIQUE,
  nome          TEXT NOT NULL,
  sigla         TEXT,
  pais          TEXT,
  grupo         TEXT,
  ranking_fifa  INTEGER,
  logo_url      TEXT,
  dados_json    TEXT,   -- payload completo da API
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS jogadores (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  sofascore_id  INTEGER UNIQUE,
  nome          TEXT NOT NULL,
  posicao       TEXT,
  nacionalidade TEXT,
  data_nasc     TEXT,
  altura        INTEGER,  -- em cm
  selecao_id    INTEGER REFERENCES selecoes(sofascore_id),
  clube_atual   TEXT,
  numero_camisa INTEGER,
  foto_url      TEXT,
  dados_json    TEXT,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stats_jogadores (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  jogador_id   INTEGER REFERENCES jogadores(sofascore_id),
  temporada    TEXT,                    -- ex: "2025/2026"
  competicao   TEXT,                    -- ex: "Copa do Mundo 2026"
  jogos        INTEGER DEFAULT 0,
  minutos      INTEGER DEFAULT 0,
  gols         INTEGER DEFAULT 0,
  assistencias INTEGER DEFAULT 0,
  amarelos     INTEGER DEFAULT 0,
  vermelhos    INTEGER DEFAULT 0,
  chutes       REAL,
  chutes_alvo  REAL,
  xg           REAL,                    -- expected goals
  xa           REAL,                    -- expected assists
  passes_certos REAL,
  dribbles_ok  INTEGER DEFAULT 0,
  duelos_aereos REAL,
  intercept    INTEGER DEFAULT 0,
  dados_json   TEXT,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(jogador_id, temporada, competicao)
);

CREATE TABLE IF NOT EXISTS stats_selecoes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  selecao_id    INTEGER REFERENCES selecoes(sofascore_id),
  competicao    TEXT,
  jogos         INTEGER DEFAULT 0,
  vitorias      INTEGER DEFAULT 0,
  empates       INTEGER DEFAULT 0,
  derrotas      INTEGER DEFAULT 0,
  gols_marcados INTEGER DEFAULT 0,
  gols_sofridos INTEGER DEFAULT 0,
  posse_media   REAL,
  dados_json    TEXT,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(selecao_id, competicao)
);

CREATE INDEX IF NOT EXISTS idx_jogadores_selecao ON jogadores(selecao_id);
CREATE INDEX IF NOT EXISTS idx_stats_jogador     ON stats_jogadores(jogador_id);
CREATE INDEX IF NOT EXISTS idx_stats_selecao     ON stats_selecoes(selecao_id);
