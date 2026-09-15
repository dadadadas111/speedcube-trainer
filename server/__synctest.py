#!/usr/bin/env python3
"""
The sync store: what it keeps, what it refuses, and what it hands back.

Run against a temporary database so it never touches a real one.
"""
import base64, json, os, sqlite3, sys, tempfile, threading, urllib.error, urllib.request
from http.server import ThreadingHTTPServer

os.environ["SYNC_USER"] = "cuber"
os.environ["SYNC_PASSWORD"] = "hunter2"
_tmp = tempfile.mkdtemp()
os.environ["SYNC_DB"] = os.path.join(_tmp, "t.db")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sync  # noqa: E402

fails = 0
def check(name, cond, extra=""):
    global fails
    if cond:
        print("ok   " + name)
    else:
        fails += 1
        print("FAIL " + name + (("  <" + str(extra) + ">") if extra else ""))

sync.DB = sync.connect()
srv = ThreadingHTTPServer(("127.0.0.1", 0), sync.Handler)
port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = f"http://127.0.0.1:{port}"
AUTH = "Basic " + base64.b64encode(b"cuber:hunter2").decode()

def call(method, path, body=None, auth=AUTH):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    if auth:
        req.add_header("Authorization", auth)
    if data:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, (json.loads(e.read() or b"{}") if e.headers.get("Content-Type") == "application/json" else {})

rec = lambda tbl, uid, at, data=None, deleted=0: {
    "table": tbl, "uid": uid, "updatedAt": at, "deleted": deleted, "data": data or {"x": uid},
}

# ---- Nothing without the password ----
check("pull without auth is refused", call("GET", "/pull?since=0", auth=None)[0] == 401)
check("push without auth is refused", call("POST", "/push", {"records": []}, auth=None)[0] == 401)
check("a wrong password is refused",
      call("GET", "/pull?since=0", auth="Basic " + base64.b64encode(b"cuber:wrong").decode())[0] == 401)
check("a wrong user is refused",
      call("GET", "/pull?since=0", auth="Basic " + base64.b64encode(b"someone:hunter2").decode())[0] == 401)
check("rubbish in the header is refused", call("GET", "/pull?since=0", auth="Bearer nope")[0] == 401)

# ---- Round trip ----
st, r1 = call("POST", "/push", {"records": [rec("solves", "a", 100), rec("sessions", "s1", 100)]})
check("a push is accepted", st == 200 and r1["applied"] == 2, r1)
st, p = call("GET", "/pull?since=0")
check("everything comes back", st == 200 and len(p["records"]) == 2, p)
check("and the revision with it", p["rev"] == r1["rev"], p)
check("pulling from that revision returns nothing", call("GET", f"/pull?since={p['rev']}")[1]["records"] == [])

# ---- Newer wins; older is ignored ----
call("POST", "/push", {"records": [rec("solves", "a", 200, {"x": "newer"})]})
got = {x["uid"]: x for x in call("GET", "/pull?since=0")[1]["records"]}
check("a newer write replaces an older one", got["a"]["data"] == {"x": "newer"}, got["a"])
st, r = call("POST", "/push", {"records": [rec("solves", "a", 150, {"x": "stale"})]})
check("an older write is ignored", r["applied"] == 0, r)
got = {x["uid"]: x for x in call("GET", "/pull?since=0")[1]["records"]}
check("and does not overwrite", got["a"]["data"] == {"x": "newer"})

# ---- Re-pushing the same thing does not churn the revision ----
before = call("GET", "/pull?since=0")[1]["rev"]
call("POST", "/push", {"records": [rec("solves", "a", 200, {"x": "newer"})]})
after = call("GET", "/pull?since=0")[1]["rev"]
check("re-pushing an unchanged record does not move the revision", before == after, f"{before} -> {after}")

# ---- Deleting is a tombstone, not a hole ----
call("POST", "/push", {"records": [rec("solves", "a", 300, {}, deleted=1)]})
got = {x["uid"]: x for x in call("GET", "/pull?since=0")[1]["records"]}
check("a delete is kept as a tombstone", got["a"]["deleted"] == 1)
check("so the other device is told about it", "a" in got)

# ---- Only the tables that are meant to be there ----
st, r = call("POST", "/push", {"records": [rec("secrets", "x", 400)]})
check("an unknown table is refused", r["applied"] == 0, r)
check("and is not stored", all(x["table"] != "secrets" for x in call("GET", "/pull?since=0")[1]["records"]))
st, r = call("POST", "/push", {"records": [{"table": "solves", "updatedAt": 1}]})
check("a record with no uid is refused", r["applied"] == 0, r)

# ---- One push arrives whole or not at all ----
call("POST", "/push", {"records": [rec("sessions", "s2", 500), rec("solves", "b", 500)]})
revs = {x["uid"]: x["rev"] for x in call("GET", "/pull?since=0")[1]["records"] if x["uid"] in ("s2", "b")}
check("everything in one push shares a revision", len(set(revs.values())) == 1, revs)

# ---- Incremental ----
mark = call("GET", "/pull?since=0")[1]["rev"]
call("POST", "/push", {"records": [rec("reps", "r1", 600)]})
inc = call("GET", f"/pull?since={mark}")[1]
check("only what is new comes back", [x["uid"] for x in inc["records"]] == ["r1"], inc)

# ---- Rubbish in ----
check("a body that is not json is refused", call("POST", "/push", None)[0] in (400, 413))
st, _ = call("POST", "/push", {"records": "not a list"})
check("records must be a list", st == 400)
check("a bad since is refused", call("GET", "/pull?since=abc")[0] == 400)
check("an unknown path is a 404", call("GET", "/nonsense")[0] == 404)

# ---- Health ----
st, h = call("GET", "/health")
check("health reports what is stored", st == 200 and h["ok"] and h["records"] > 0, h)

srv.shutdown()
print("\nALL PASS" if fails == 0 else f"\n{fails} FAILED")
sys.exit(1 if fails else 0)
