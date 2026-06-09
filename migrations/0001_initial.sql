-- Scout Data F.C. — schema inicial D1

CREATE TABLE IF NOT EXISTS events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id    TEXT NOT NULL UNIQUE,          -- deduplicação Meta/GA4
  event_name  TEXT NOT NULL,                 -- PageView, Lead, Purchase, etc.
  source      TEXT NOT NULL DEFAULT 'web',   -- web | kiwify | server
  url         TEXT,
  referrer    TEXT,
  user_agent  TEXT,
  ip          TEXT,
  fbp         TEXT,
  fbc         TEXT,
  email_hash  TEXT,                          -- SHA-256 normalizado
  phone_hash  TEXT,
  value       REAL,
  currency    TEXT DEFAULT 'BRL',
  payload     TEXT,                          -- JSON bruto do evento
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_events_name       ON events(event_name);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);
CREATE INDEX IF NOT EXISTS idx_events_source     ON events(source);

CREATE TABLE IF NOT EXISTS leads (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT NOT NULL UNIQUE,
  name       TEXT,
  phone      TEXT,
  fbp        TEXT,
  fbc        TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS purchases (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id       TEXT NOT NULL UNIQUE,
  email_hash     TEXT,
  value          REAL NOT NULL,
  currency       TEXT DEFAULT 'BRL',
  product        TEXT,
  status         TEXT DEFAULT 'approved',   -- approved | refunded | chargeback
  kiwify_payload TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
