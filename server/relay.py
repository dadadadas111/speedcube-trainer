#!/usr/bin/env python3
"""
The relay that pairs a phone holding a cube with a computer showing it.

It is deliberately dumb. It hands out room codes, puts two sockets in a room,
and copies messages from one to the other. It never looks inside a `msg`
payload, keeps nothing on disk, and forgets a room as soon as both sides leave.

Protocol, all JSON text frames:

    in   {"t":"host"}                 ask for a room
         {"t":"join","code":"ABC234"} join one
         {"t":"msg","data":...}       send to the other side

    out  {"t":"code","code":"..."}    your room (host only)
         {"t":"joined","code":"..."}  you are in
         {"t":"peer","up":true|false} the other side arrived or left
         {"t":"msg","data":...}       from the other side
         {"t":"error","reason":"..."} and the socket closes
"""

import asyncio
import json
import os
import secrets
import time
from typing import Any, Optional

import websockets

# The name of the connection class moved between websockets releases, and the
# relay does not care which one it gets — anything with .send() and .close()
# will do. Keeping it untyped avoids pinning the server to one version.
Socket = Any

# No 0/O and no 1/I/L: these get read out loud and typed on a phone.
ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
CODE_LENGTH = 6

# A phone that locks its screen drops the socket. Hold the room open long
# enough for it to come back rather than making someone read the code again.
GRACE_SECONDS = 90
# A room nobody ever joins is a leak waiting to happen.
UNUSED_ROOM_SECONDS = 30 * 60
MAX_ROOMS = 500
MAX_MESSAGE_BYTES = 64 * 1024


class Room:
    __slots__ = ("code", "host", "guest", "created", "empty_since")

    def __init__(self, code: str):
        self.code = code
        self.host: Optional[Socket] = None
        self.guest: Optional[Socket] = None
        self.created = time.monotonic()
        self.empty_since: Optional[float] = None

    def peer_of(self, ws: Socket) -> Optional[Socket]:
        if ws is self.host:
            return self.guest
        if ws is self.guest:
            return self.host
        return None

    def occupied(self) -> bool:
        return self.host is not None or self.guest is not None


rooms: dict[str, Room] = {}


def new_code() -> str:
    while True:
        code = "".join(secrets.choice(ALPHABET) for _ in range(CODE_LENGTH))
        if code not in rooms:
            return code


async def send(ws: Socket, payload: dict) -> None:
    try:
        await ws.send(json.dumps(payload))
    except Exception:
        pass  # the socket is going away; the close handler will tidy up


async def fail(ws: Socket, reason: str) -> None:
    await send(ws, {"t": "error", "reason": reason})
    await ws.close()


async def handler(ws: Socket) -> None:
    room: Optional[Room] = None
    try:
        async for raw in ws:
            if isinstance(raw, bytes) or len(raw) > MAX_MESSAGE_BYTES:
                await fail(ws, "Message too large")
                return
            try:
                msg = json.loads(raw)
            except Exception:
                await fail(ws, "Bad message")
                return
            kind = msg.get("t")

            if kind == "host":
                if room is not None:
                    await fail(ws, "Already in a room")
                    return
                if len(rooms) >= MAX_ROOMS:
                    await fail(ws, "The relay is full, try again shortly")
                    return
                room = Room(new_code())
                room.host = ws
                rooms[room.code] = room
                await send(ws, {"t": "code", "code": room.code})

            elif kind == "join":
                if room is not None:
                    await fail(ws, "Already in a room")
                    return
                code = str(msg.get("code", "")).upper()
                target = rooms.get(code)
                if target is None:
                    await fail(ws, "No computer is waiting on that code")
                    return
                # A slot left free by a phone that dropped is reclaimable; two
                # phones fighting over one room is not. A live guest is exactly
                # one whose handler has not reached its finally block yet.
                if target.guest is not None:
                    await fail(ws, "That code is already in use")
                    return
                room = target
                room.guest = ws
                room.empty_since = None
                await send(ws, {"t": "joined", "code": room.code})
                if room.host is not None:
                    await send(room.host, {"t": "peer", "up": True})
                    await send(ws, {"t": "peer", "up": True})

            elif kind == "msg":
                if room is None:
                    await fail(ws, "Not in a room")
                    return
                peer = room.peer_of(ws)
                if peer is not None:
                    await send(peer, {"t": "msg", "data": msg.get("data")})

            else:
                await fail(ws, "Unknown message")
                return
    except Exception:
        pass
    finally:
        if room is not None:
            if room.host is ws:
                room.host = None
            elif room.guest is ws:
                room.guest = None
            peer = room.host or room.guest
            if peer is not None:
                await send(peer, {"t": "peer", "up": False})
            else:
                room.empty_since = time.monotonic()


async def sweep() -> None:
    """Forget rooms nobody is using."""
    while True:
        await asyncio.sleep(20)
        now = time.monotonic()
        for code, room in list(rooms.items()):
            if not room.occupied() and room.empty_since and now - room.empty_since > GRACE_SECONDS:
                rooms.pop(code, None)
            elif room.guest is None and now - room.created > UNUSED_ROOM_SECONDS:
                if room.host is not None:
                    await fail(room.host, "Nobody joined; ask for a new code")
                rooms.pop(code, None)


async def main() -> None:
    host = os.environ.get("RELAY_HOST", "127.0.0.1")
    port = int(os.environ.get("RELAY_PORT", "8787"))
    async with websockets.serve(
        handler,
        host,
        port,
        ping_interval=20,
        ping_timeout=20,
        max_size=MAX_MESSAGE_BYTES,
    ):
        asyncio.create_task(sweep())
        print(f"cube relay listening on {host}:{port}", flush=True)
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
