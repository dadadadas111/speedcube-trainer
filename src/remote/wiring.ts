/**
 * Joining the two halves: a phone with the radio, a computer with the screen.
 *
 * Each side is a few lines because the event shapes never change along the way.
 * The phone forwards what the cube said; the computer feeds it into the same
 * handler a local cube's events go through.
 */

import { cubeLink, type CubeInfo } from '../smartcube/connection';
import { virtualCube } from '../smartcube/virtual';
import { SOLVED_STATE, toKociemba } from '../cube/cube';
import { relay } from './relay';
import type { BridgeMessage } from './protocol';

/**
 * The computer's side: take over the cube link and fill it from the relay.
 *
 * Returns a function that gives the link back.
 */
export function startHost(): () => void {
  cubeLink.attachRemote((type) => relay.post({ k: 'command', type }));

  const off = relay.on({
    message: (m: BridgeMessage) => {
      if (m.k === 'info') cubeLink.setRemoteCube(m.connected ? (m.info as CubeInfo) : null);
      else if (m.k === 'event') cubeLink.acceptRemoteEvent(m.e as Parameters<typeof cubeLink.acceptRemoteEvent>[0]);
    },
    status: (s) => {
      // The phone going away leaves the cube unreachable, which is worth
      // showing as such rather than pretending the last state still holds.
      if (s !== 'linked') {
        cubeLink.setRemoteCube(null);
        return;
      }
      // Never assume the cube on the other end is solved. Ask what it is
      // actually showing, the same way the app would ask a local one.
      relay.post({ k: 'command', type: 'REQUEST_FACELETS' });
    },
  });

  return () => {
    off();
    cubeLink.detachRemote();
  };
}

/**
 * The phone's side: forward everything the cube says, and pass on whatever the
 * computer asks for.
 */
export function startBridge(): () => void {
  // Only send this when it actually changes: the computer treats it as the
  // cube appearing or going away, and a repeat would flap its status.
  let announced = '';
  const announce = () => {
    const info = cubeLink.info
      ? { ...cubeLink.info }
      : virtualCube.active
        ? { name: 'Keyboard cube', mac: '' }
        : null;
    const next = JSON.stringify(info);
    if (next === announced) return;
    announced = next;
    relay.post({ k: 'info', connected: info !== null, info });
  };

  const offCube = cubeLink.on({
    raw: (e) => relay.post({ k: 'event', e }),
    status: () => announce(),
  });

  /**
   * The keyboard cube goes across too, dressed as cube events.
   *
   * Partly so the bridge can be tried without a cube in the room, and partly
   * because it exercises the whole path — if a keyboard turn shows up on the
   * computer, a real one will.
   */
  let serial = 0;

  /** Answer a state request for the keyboard cube, which cannot answer itself. */
  const sendVirtualState = () => {
    serial = (serial + 1) % 256;
    relay.post({
      k: 'event',
      e: { type: 'FACELETS', serial, facelets: toKociemba(virtualCube.getState()), timestamp: Math.round(performance.now()) },
    });
  };

  const offVirtual = virtualCube.on({
    active: () => {
      announce();
      if (virtualCube.active) sendVirtualState();
    },
    move: (m, state) => {
      // The keyboard cube has no connect step, so the first turn is what tells
      // the computer there is anything on this end at all.
      announce();
      serial = (serial + 1) % 256;
      const t = Math.round(performance.now());
      relay.post({
        k: 'event',
        e: { type: 'MOVE', serial, move: m.move, timestamp: t, localTimestamp: t, cubeTimestamp: t, direction: 0 },
      });
      relay.post({ k: 'event', e: { type: 'FACELETS', serial, facelets: toKociemba(state), timestamp: t } });
    },
  });

  const offRelay = relay.on({
    message: (m: BridgeMessage) => {
      if (m.k !== 'command') return;
      if (cubeLink.status !== 'connected' && virtualCube.active) {
        // No radio on this end either — the keyboard cube is standing in
        if (m.type === 'REQUEST_RESET') virtualCube.setState(SOLVED_STATE);
        sendVirtualState();
        return;
      }
      if (m.type === 'REQUEST_RESET') void cubeLink.resetToSolved();
      else void cubeLink.resync();
    },
    status: (s) => {
      // Tell a computer that has just arrived what it is looking at
      if (s === 'linked') {
        announced = '';
        announce();
      }
    },
  });

  announce();

  return () => {
    offCube();
    offVirtual();
    offRelay();
  };
}
