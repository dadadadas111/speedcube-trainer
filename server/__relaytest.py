#!/usr/bin/env python3
"""
The relay, driven through a real socket from both ends.

Everything here is the behaviour the two browsers depend on: that a code only
works once, that a phone which drops can come back to the same room, and that a
message from one side arrives unaltered at the other.

    server/venv/bin/python server/__relaytest.py
"""

import asyncio
import json
import sys

import websockets

sys.path.insert(0, __file__.rsplit("/", 1)[0])
import relay  # noqa: E402

fails = 0


def check(name: str, ok: bool, extra: str = "") -> None:
    global fails
    if ok:
        print(f"ok   {name}")
    else:
        fails += 1
        print(f"FAIL {name}" + (f"  <{extra}>" if extra else ""))


async def recv(ws, timeout=2.0):
    return json.loads(await asyncio.wait_for(ws.recv(), timeout))


async def main() -> None:
    async with websockets.serve(relay.handler, "127.0.0.1", 8799):
        url = "ws://127.0.0.1:8799"

        # ---- A computer asks for a room
        host = await websockets.connect(url)
        await host.send(json.dumps({"t": "host"}))
        msg = await recv(host)
        code = msg.get("code", "")
        check("hosting hands back a code", msg["t"] == "code" and len(code) == relay.CODE_LENGTH, str(msg))
        check("the code avoids characters that get misread",
              not (set(code) & set("01OIL")), code)

        # ---- A wrong code is refused, and does not create a room
        wrong = await websockets.connect(url)
        await wrong.send(json.dumps({"t": "join", "code": "ZZZZZZ"}))
        msg = await recv(wrong)
        check("an unknown code is refused", msg["t"] == "error", str(msg))
        check("and no room is conjured up for it", "ZZZZZZ" not in relay.rooms)
        await wrong.close()

        # ---- The phone joins
        phone = await websockets.connect(url)
        await phone.send(json.dumps({"t": "join", "code": code}))
        check("joining is accepted", (await recv(phone))["t"] == "joined")
        check("the phone is told the computer is there", (await recv(phone)) == {"t": "peer", "up": True})
        check("the computer is told the phone arrived", (await recv(host)) == {"t": "peer", "up": True})

        # ---- Messages cross in both directions, untouched
        payload = {"k": "event", "e": {"type": "MOVE", "move": "R'", "serial": 42, "cubeTimestamp": 1234}}
        await phone.send(json.dumps({"t": "msg", "data": payload}))
        got = await recv(host)
        check("a cube event reaches the computer exactly as sent", got == {"t": "msg", "data": payload}, str(got))

        await host.send(json.dumps({"t": "msg", "data": {"k": "command", "type": "REQUEST_FACELETS"}}))
        got = await recv(phone)
        check("a command reaches the phone", got["data"]["type"] == "REQUEST_FACELETS", str(got))

        # ---- The room is full
        second = await websockets.connect(url)
        await second.send(json.dumps({"t": "join", "code": code}))
        msg = await recv(second)
        check("a second phone cannot take over the room", msg["t"] == "error", str(msg))
        await second.close()

        # ---- The phone drops; the computer hears about it and the room waits
        await phone.close()
        check("the computer is told the phone went away", (await recv(host)) == {"t": "peer", "up": False})
        await asyncio.sleep(0.1)
        check("the room is kept for it to come back to", code in relay.rooms)

        # ---- ...and the same code still works
        again = await websockets.connect(url)
        await again.send(json.dumps({"t": "join", "code": code}))
        check("the phone can rejoin on the same code", (await recv(again))["t"] == "joined")
        check("both are told they are linked again", (await recv(again)) == {"t": "peer", "up": True})
        await recv(host)

        # ---- Nonsense is rejected rather than crashing anything
        junk = await websockets.connect(url)
        await junk.send("not json at all")
        check("a malformed message is refused", (await recv(junk))["t"] == "error")
        await junk.close()

        other = await websockets.connect(url)
        await other.send(json.dumps({"t": "msg", "data": {}}))
        check("sending before joining is refused", (await recv(other))["t"] == "error")
        await other.close()

        # ---- Both sides gone, the room goes with them
        await again.close()
        await host.close()
        await asyncio.sleep(0.2)
        room = relay.rooms.get(code)
        check("an empty room is marked for collection", room is None or room.empty_since is not None)

    
# ---- A stream room broadcasts to every block; a bridge still takes one phone ----
async def stream_rooms() -> None:
    async with websockets.serve(relay.handler, "127.0.0.1", 8798):
        url = "ws://127.0.0.1:8798"

        # An overlay is one host and several read-only blocks
        host = await websockets.connect(url)
        await host.send(json.dumps({"t": "host", "kind": "stream"}))
        code = (await recv(host))["code"]
        blocks = []
        for _ in range(3):
            g = await websockets.connect(url)
            await g.send(json.dumps({"t": "join", "code": code}))
            blocks.append((g, await recv(g)))
        check("three blocks all join one stream room",
              all(j.get("t") == "joined" for _, j in blocks), str([j for _, j in blocks]))
        for g, _ in blocks:
            await recv(g)  # each is told the trainer is there
        check("the host is told something is listening", (await recv(host)) == {"t": "peer", "up": True})

        await host.send(json.dumps({"t": "msg", "data": {"kind": "stream", "state": {"seq": 1}}}))
        got = [await recv(g) for g, _ in blocks]
        check("one message reaches every block",
              all(m.get("t") == "msg" and m["data"]["state"]["seq"] == 1 for m in got), str(got))

        # Closing one block leaves the others alone
        await blocks[0][0].close()
        await asyncio.sleep(0.2)
        await host.send(json.dumps({"t": "msg", "data": {"kind": "stream", "state": {"seq": 2}}}))
        rest = [await recv(g) for g, _ in blocks[1:]]
        check("closing one block does not disturb the rest",
              all(m["data"]["state"]["seq"] == 2 for m in rest), str(rest))
        for g, _ in blocks[1:]:
            await g.close()
        await host.close()

        # A bridge room is unchanged: a second phone would put two cubes into
        # one app, so it is still refused
        pc = await websockets.connect(url)
        await pc.send(json.dumps({"t": "host"}))
        bcode = (await recv(pc))["code"]
        phone = await websockets.connect(url)
        await phone.send(json.dumps({"t": "join", "code": bcode}))
        check("the first phone joins a bridge", (await recv(phone)).get("t") == "joined")
        await recv(phone)
        await recv(pc)
        second = await websockets.connect(url)
        await second.send(json.dumps({"t": "join", "code": bcode}))
        refused = await recv(second)
        check("a second phone is still refused", refused.get("t") == "error", str(refused))
        check("and told why", "already in use" in str(refused.get("reason", "")), str(refused))
        for c in (pc, phone, second):
            await c.close()


asyncio.run(main())
asyncio.run(stream_rooms())

print("\nALL PASS" if fails == 0 else f"\n{fails} FAILED")
sys.exit(1 if fails else 0)
