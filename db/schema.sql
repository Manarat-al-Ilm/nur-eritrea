CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_text TEXT NOT NULL,
  status TEXT DEFAULT 'open',
  answer_text TEXT,
  answer_audio_key TEXT,
  title TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  answered_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_questions_status_answered
  ON questions(status, answered_at DESC);

CREATE TABLE IF NOT EXISTS rate_limits (
  ip TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  window TEXT NOT NULL,
  count INTEGER DEFAULT 1,
  PRIMARY KEY (ip, endpoint, window)
);
