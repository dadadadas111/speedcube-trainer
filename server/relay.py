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
# Blocks in one overlay, plus room to spare. An unbounded room is a way to
# spend somebody else's memory; nothing real comes close to this.
MAX_GUESTS = 8
MAX_MESSAGE_BYTES = 64 * 1024


class Room:
    """
    One host and everybody listening to it.

    It used to be one host and one guest, which is all the phone bridge needs
    and one fewer than the stream overlay needs. An overlay is a Browser Source
    per block — a clock, a solve list, a scramble — and with a single guest slot
    the second block to load silently took the first one's place, so the first
    sat there waiting for a trainer that was right in front of it.

    Messages go from anyone to everyone else, which leaves the bridge behaving
    exactly as before: with two sockets in the room, "everyone else" is one.
    """

    __slots__ = ("code", "host", "guests", "created", "empty_since", "max_guests")

    def __init__(self, code: str, max_guests: int = 1):
        self.code = code
        self.host: Optional[Socket] = None
        self.guests: set[Socket] = set()
        self.created = time.monotonic()
        self.empty_since: Optional[float] = None
        # How many may listen at once, which depends on what the room is FOR.
        # A bridge has exactly one phone: a second joining would put two cubes
        # into one app, which is why that was refused and still is. An overlay
        # is several blocks, each its own socket, and they are all read-only.
        self.max_guests = max_guests

    def others(self, ws: Socket) -> list[Socket]:
        out = [g for g in self.guests if g is not ws]
        if self.host is not None and self.host is not ws:
            out.append(self.host)
        return out

    def occupied(self) -> bool:
        return self.host is not None or bool(self.guests)


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
                # The host says what the room is for. Absent means a bridge,
                # so a client that has never heard of this behaves as before.
                many = msg.get("kind") == "stream"
                room = Room(new_code(), MAX_GUESTS if many else 1)
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
                if len(target.guests) >= target.max_guests:
                    # The wording matters for a bridge: a second phone trying to
                    # take a room is a mistake worth naming, not a full room
                    await fail(
                        ws,
                        "That room is full" if target.max_guests > 1 else "That code is already in use",
                    )
                    return
                room = target
                room.guests.add(ws)
                room.empty_since = None
                await send(ws, {"t": "joined", "code": room.code})
                if room.host is not None:
                    # The host hears about the first arrival only: for the
                    # bridge that is the one it cares about, and for an overlay
                    # "something is listening" is all it means either way
                    if len(room.guests) == 1:
                        await send(room.host, {"t": "peer", "up": True})
                    await send(ws, {"t": "peer", "up": True})

            elif kind == "msg":
                if room is None:
                    await fail(ws, "Not in a room")
                    return
                for other in room.others(ws):
                    await send(other, {"t": "msg", "data": msg.get("data")})

            else:
                await fail(ws, "Unknown message")
                return
    except Exception:
        pass
    finally:
        if room is not None:
            if room.host is ws:
                room.host = None
            else:
                room.guests.discard(ws)
            if room.occupied():
                # Only when the LAST listener goes: the host does not need to
                # hear "peer down" because one of five blocks was closed
                if room.host is not None and not room.guests:
                    await send(room.host, {"t": "peer", "up": False})
                for g in room.guests:
                    if room.host is None:
                        await send(g, {"t": "peer", "up": False})
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
            elif not room.guests and now - room.created > UNUSED_ROOM_SECONDS:
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
