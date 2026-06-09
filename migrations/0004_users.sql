-- Tabela de usuários com acesso ao painel
CREATE TABLE IF NOT EXISTS users (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  email           TEXT UNIQUE NOT NULL,
  access_token    TEXT UNIQUE NOT NULL,
  nome            TEXT,
  kiwify_order_id TEXT,
  ativo           INTEGER NOT NULL DEFAULT 1,
  perguntas_mister INTEGER NOT NULL DEFAULT 0,
  criado_em       TEXT NOT NULL DEFAULT (datetime('now')),
  ultimo_acesso   TEXT
);
