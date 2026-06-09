-- Tabela para controlar perguntas do "Pergunte ao Mister"
CREATE TABLE IF NOT EXISTS mister_sessions (
  session_id TEXT PRIMARY KEY,
  count      INTEGER NOT NULL DEFAULT 0,
  criado_em  TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado TEXT NOT NULL DEFAULT (datetime('now'))
);
