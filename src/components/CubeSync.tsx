/**
 * What to do when the app's state has drifted from the cube in your hands.
 *
 * There are two kinds of drift and two different buttons — picking the right one
 * matters:
 *
 *  - The app drifted from the cube (bluetooth dropped a move): the cube still
 *    remembers correctly, so asking it again is enough.
 *  - THE CUBE ITSELF is wrong (you took it apart, or it missed one of its own
 *    turns): asking again just returns the same wrong answer. You have to solve
 *    the cube and then tell it "this position is solved".
 */

import { useState } from 'react';
import { cubeLink } from '../smartcube/connection';
import { virtualCube } from '../smartcube/virtual';
import { useApp } from '../store/app';

type Result = { tone: 'good' | 'warn' | 'bad'; text: string } | null;

export default function CubeSync({ compact = false }: { compact?: boolean }) {
  const { settings, cubeStatus } = useApp();
  const [busy, setBusy] = useState<'sync' | 'reset' | null>(null);
  const [result, setResult] = useState<Result>(null);
  const usingVirtual = settings.keyboardCube && cubeStatus !== 'connected';

  const resync = async () => {
    setBusy('sync');
    setResult(null);
    try {
      if (usingVirtual) {
        setResult({ tone: 'warn', text: 'Nothing to ask the virtual cube — it always matches the app.' });
      } else {
        await cubeLink.resync();
        setResult({ tone: 'good', text: 'Asked the cube and took the state it remembers.' });
      }
    } catch (e) {
      setResult({ tone: 'bad', text: `Could not reach the cube: ${(e as Error).message}` });
    } finally {
      setBusy(null);
    }
  };

  const markSolved = async () => {
    if (
      !confirm(
        'Is the cube in your hands SOLVED right now?\n\n' +
          'This tells the cube its current position is the solved state. Pressing it while the cube is unsolved makes everything after it wrong.',
      )
    )
      return;
    setBusy('reset');
    setResult(null);
    try {
      if (usingVirtual) {
        virtualCube.reset();
        setResult({ tone: 'good', text: 'The virtual cube is back to solved.' });
      } else {
        const confirmed = await cubeLink.resetToSolved();
        setResult(
          confirmed
            ? { tone: 'good', text: 'Done — the cube confirms it is solved, and so does the app.' }
            : {
                tone: 'bad',
                text: 'The cube did not take the reset. Wake its bluetooth (turn any face) and try again.',
              },
        );
      }
    } catch (e) {
      setResult({ tone: 'bad', text: `Could not reset: ${(e as Error).message}` });
    } finally {
      setBusy(null);
    }
  };

  const tone = { good: 'text-good', warn: 'text-warn', bad: 'text-bad' } as const;

  return (
    <div className={compact ? '' : 'flex flex-col gap-2'}>
      <div className="flex flex-wrap gap-2">
        <button className="btn !py-1 !text-[13px]" disabled={busy !== null} onClick={() => void resync()}>
          {busy === 'sync' ? 'Asking…' : 'Ask the cube'}
        </button>
        <button className="btn btn-danger !py-1 !text-[13px]" disabled={busy !== null} onClick={() => void markSolved()}>
          {busy === 'reset' ? 'Resetting…' : 'Cube is solved → sync'}
        </button>
      </div>
      {!compact && (
        <p className="max-w-[64ch] text-[13px] text-ink-400">
          <span className="text-ink-300">Ask the cube</span> is for when the app shows something different because
          bluetooth dropped a move — the cube still remembers correctly.{' '}
          <span className="text-ink-300">Cube is solved</span> is for when the cube itself is wrong; asking then just
          returns the same error, so solve the cube first and press this to reset the reference.
        </p>
      )}
      {result && <p className={`text-[13px] ${tone[result.tone]}`}>{result.text}</p>}
    </div>
  );
}
