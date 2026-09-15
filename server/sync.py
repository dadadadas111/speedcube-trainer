#!/usr/bin/env python3
"""
The store that lets a phone and a computer be the same trainer.

Solves recorded on a phone have to turn up on the laptop and the other way
round, and a browser's own storage cannot do that — it is per-device by
definition. So this keeps them, one row per record, and hands back whatever has
changed since a client last asked.

PER RECORD, not one blob of the whole database. A whole-database snapshot is
far less code, and it loses data in exactly the situation this exists for:
solve on the phone, solve on the laptop, and whichever pushes second wipes the
other's solves. Merging row by row costs a revision counter and a rule for ties,
and in return two devices used the same afternoon both keep what they did.

The rule for ties is last-write-wins on the client's own `updated_at`, which is
the honest choice for one person with two devices: there is no second opinion to
reconcile, only the same person's newer intention.

Protocol, JSON over HTTP, behind nginx and HTTP Basic:

    GET  /pull?since=<rev>   -> {"rev":N, "records":[...]}
    POST /push {"records":[...]}  -> {"rev":N, "applied":M}
    GET  /health             -> {"ok":true,"records":N,"rev":N}

A record is {"table":..., "uid":..., "updatedAt":ms, "deleted":0|1, "data":{}}.
Deleting keeps the row with deleted=1 rather than removing it: a row that simply
vanished is indistinguishable from one the other device has not seen yet, and
would come straight back on the next sync.
"""

import base64
import hmac
import json
import os
import sqlite3
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

DB_PATH = os.environ.get("SYNC_DB", "/opt/cube-sync/data.db")
HOST = os.environ.get("SYNC_HOST", "127.0.0.1")
PORT = int(os.environ.get("SYNC_PORT", "8788"))
USER = os.environ.get("SYNC_USER", "")
PASSWORD = os.environ.get("SYNC_PASSWORD", "")

# Tables the client is allowed to sync. Anything else is refused rather than
# stored: an open key-value store reachable with one password is a liability,
# and this only ever needs these four.
TABLES = {"sessions", "solves", "algs", "reps"}

# One push is one solve session's worth at most; beyond this something is wrong
MAX_BODY = 32 * 1024 * 1024
MAX_RECORDS = 20000

_lock = threading.Lock()


def connect() -> sqlite3.Connection:
    db = sqlite3.connect(DB_PATH, check_same_thread=False)
    db.execute("PRAGMA journal_mode=WAL")
    db.execute(
        """
        CREATE TABLE IF NOT EXISTS records (
            tbl        TEXT NOT NULL,
            uid        TEXT NOT NULL,
            rev        INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            deleted    INTEGER NOT NULL DEFAULT 0,
            data       TEXT NOT NULL,
            PRIMARY KEY (tbl, uid)
        )
        """
    )
    # Pulling is always "everything newer than the revision I have", so this is
    # the only index that matters and the only query shape there is.
    db.execute("CREATE INDEX IF NOT EXISTS records_rev ON records(rev)")
    db.execute("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value INTEGER NOT NULL)")
    db.execute("INSERT OR IGNORE INTO meta(key, value) VALUES ('rev', 0)")
    db.commit()
    return db


DB = None


def current_rev(db: sqlite3.Connection) -> int:
    row = db.execute("SELECT value FROM meta WHERE key='rev'").fetchone()
    return int(row[0]) if row else 0


def apply_records(db: sqlite3.Connection, records: list) -> tuple[int, int]:
    """
    Store what is newer and leave what is not.

    The revision is bumped ONCE for the whole push rather than per row, so a
    client that pulls at revision N gets a complete push or none of it — never
    half of one, which would leave a solve pointing at a session that had not
    arrived yet.
    """
    with _lock:
        rev = current_rev(db) + 1
        applied = 0
        for r in records:
            tbl = r.get("table")
            uid = r.get("uid")
            if tbl not in TABLES or not isinstance(uid, str) or not uid:
                continue
            updated = int(r.get("updatedAt") or 0)
            deleted = 1 if r.get("deleted") else 0
            data = json.dumps(r.get("data") or {}, separators=(",", ":"))
            existing = db.execute(
                "SELECT updated_at FROM records WHERE tbl=? AND uid=?", (tbl, uid)
            ).fetchone()
            # Strictly newer: a re-push of something already stored must not
            # bump its revision, or every sync would hand it back to everyone
            if existing is not None and int(existing[0]) >= updated:
                continue
            db.execute(
                "INSERT INTO records(tbl, uid, rev, updated_at, deleted, data) VALUES(?,?,?,?,?,?) "
                "ON CONFLICT(tbl, uid) DO UPDATE SET rev=excluded.rev, updated_at=excluded.updated_at, "
                "deleted=excluded.deleted, data=excluded.data",
                (tbl, uid, rev, updated, deleted, data),
            )
            applied += 1
        if applied:
            db.execute("UPDATE meta SET value=? WHERE key='rev'", (rev,))
        db.commit()
        return (rev if applied else rev - 1), applied


def read_since(db: sqlite3.Connection, since: int, limit: int = MAX_RECORDS) -> tuple[int, list]:
    rows = db.execute(
        "SELECT tbl, uid, rev, updated_at, deleted, data FROM records WHERE rev > ? ORDER BY rev LIMIT ?",
        (since, limit),
    ).fetchall()
    out = [
        {
            "table": t,
            "uid": u,
            "rev": rv,
            "updatedAt": ua,
            "deleted": d,
            "data": json.loads(dt),
        }
        for (t, u, rv, ua, d, dt) in rows
    ]
    # The revision reported is the highest actually handed over, so a client
    # that was cut short asks again from where it got to instead of skipping
    highest = out[-1]["rev"] if out else since
    return highest, out


def authorised(header: str | None) -> bool:
    if not USER or not PASSWORD:
        return False
    if not header or not header.startswith("Basic "):
        return False
    try:
        raw = base64.b64decode(header[6:]).decode("utf-8")
    except Exception:
        return False
    user, _, password = raw.partition(":")
    # Constant time, so a wrong password cannot be found one character at a time
    return hmac.compare_digest(user, USER) and hmac.compare_digest(password, PASSWORD)


class Handler(BaseHTTPRequestHandler):
    server_version = "cube-sync"

    def log_message(self, fmt, *args):
        # What was synced is the user's business; the journal gets the shape only
        sys.stderr.write("%s %s\n" % (self.command, urlparse(self.path).path))

    def send_json(self, code: int, payload: dict):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def deny(self):
        self.send_response(401)
        self.send_header("WWW-Authenticate", 'Basic realm="cube"')
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        url = urlparse(self.path)
        if url.path.endswith("/health"):
            if not authorised(self.headers.get("Authorization")):
                return self.deny()
            n = DB.execute("SELECT COUNT(*) FROM records").fetchone()[0]
            return self.send_json(200, {"ok": True, "records": n, "rev": current_rev(DB)})
        if not url.path.endswith("/pull"):
            return self.send_json(404, {"error": "no such thing"})
        if not authorised(self.headers.get("Authorization")):
            return self.deny()
        try:
            since = int(parse_qs(url.query).get("since", ["0"])[0])
        except ValueError:
            return self.send_json(400, {"error": "since must be a number"})
        rev, records = read_since(DB, since)
        self.send_json(200, {"rev": rev, "records": records, "more": len(records) >= MAX_RECORDS})

    def do_POST(self):
        url = urlparse(self.path)
        if not url.path.endswith("/push"):
            return self.send_json(404, {"error": "no such thing"})
        if not authorised(self.headers.get("Authorization")):
            return self.deny()
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            return self.send_json(400, {"error": "bad length"})
        if length <= 0 or length > MAX_BODY:
            return self.send_json(413, {"error": "too big"})
        try:
            payload = json.loads(self.rfile.read(length))
        except Exception:
            return self.send_json(400, {"error": "not json"})
        records = payload.get("records")
        if not isinstance(records, list) or len(records) > MAX_RECORDS:
            return self.send_json(400, {"error": "records must be a list"})
        rev, applied = apply_records(DB, records)
        self.send_json(200, {"rev": rev, "applied": applied})


def main():
    global DB
    if not USER or not PASSWORD:
        sys.stderr.write("SYNC_USER and SYNC_PASSWORD must be set; refusing to run open\n")
        raise SystemExit(2)
    os.makedirs(os.path.dirname(DB_PATH) or ".", exist_ok=True)
    DB = connect()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    sys.stderr.write(f"cube-sync on {HOST}:{PORT}, db {DB_PATH}\n")
    server.serve_forever()


if __name__ == "__main__":
    main()
