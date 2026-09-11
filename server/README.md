# The phone relay

A computer without a bluetooth adapter can still use a smart cube: a phone holds
the cube and forwards what it sees. This is the thing in the middle that pairs
the two.

It is a single file with one dependency (`websockets`), listening on loopback
only, with nginx terminating TLS and proxying `/relay` to it.

## Installing

```bash
ssh root@160.187.247.2
adduser --system --group --home /opt/cube-relay cuberelay
python3 -m venv /opt/cube-relay/venv
/opt/cube-relay/venv/bin/pip install websockets
# copy relay.py to /opt/cube-relay/relay.py and the unit to /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now cube-relay
```

nginx, inside the `cube.dash.id.vn` server block:

```nginx
location /relay {
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
}
```

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
