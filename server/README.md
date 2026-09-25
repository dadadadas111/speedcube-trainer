# The phone relay

A computer without a bluetooth adapter can still use a smart cube: a phone holds
the cube and forwards what it sees. This is the thing in the middle that pairs
the two.

It is a single file with one dependency (`websockets`), listening on loopback
only, with nginx terminating TLS and proxying `/relay` to it. Since the app
moved to Cloudflare Pages this box serves no files at all, only this and the
sync store; `nginx-api.conf` in this directory is the whole server block.

## Installing

```bash
ssh deploy@API_HOST
adduser --system --group --home /opt/cube-relay cuberelay
python3 -m venv /opt/cube-relay/venv
/opt/cube-relay/venv/bin/pip install websockets
# copy relay.py to /opt/cube-relay/relay.py and the unit to /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now cube-relay
```

nginx: copy `nginx-api.conf` to `/etc/nginx/sites-available/api.cube.dash.id.vn`,
symlink it into `sites-enabled`, then `certbot --nginx -d api.cube.dash.id.vn`.
It carries both `/relay` and `/sync`, and the CORS headers the sync client needs
now that the app is served from another origin.

## What it can and cannot see

Room codes are six characters from a 31-character alphabet, handed out by the
server rather than chosen by clients, so they cannot be squatted. A room takes
exactly two sockets and is forgotten when both leave.

The relay never opens a `msg` payload, writes nothing to disk, and holds no
state beyond the live rooms. What flows through it is cube moves — but anyone
who guessed a live code while a session was open could watch those moves, so
treat a code as good for one session and no longer.

## Checking on it

```bash
systemctl status cube-relay
journalctl -u cube-relay -n 50
```
