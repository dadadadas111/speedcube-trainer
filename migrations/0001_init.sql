-- The same two tables sync.py made, because the client protocol is unchanged.
-- D1 is SQLite, so this is the original schema with nothing translated.
CREATE TABLE IF NOT EXISTS records (
    tbl        TEXT    NOT NULL,
    uid        TEXT    NOT NULL,
    rev        INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted    INTEGER NOT NULL DEFAULT 0,
    data       TEXT    NOT NULL,
    PRIMARY KEY (tbl, uid)
);

-- Pulling is always "everything newer than the revision I have", so this is the
-- only index that matters and the only query shape there is.
CREATE INDEX IF NOT EXISTS records_rev ON records(rev);

CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value INTEGER NOT NULL);
INSERT OR IGNORE INTO meta(key, value) VALUES ('rev', 0);
