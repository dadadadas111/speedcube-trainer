/**
 * The scramble, with the correction shown IN the scramble.
 *
 * When a turn goes wrong your eyes are already on the scramble, so that is
 * where the fix belongs — spliced in at the point you went off, in red. Putting
 * it in a panel somewhere below means looking away to find out what happened.
 */

import type { ScrambleProgress } from '../analysis/scrambleGuide';

interface Props {
  moves: string[];
  /** null without a smart cube, in which case the scramble shows unguided */
  progress: ScrambleProgress | null;
}

const CHIP = 'rounded-[5px] px-1.5 py-1 transition-colors';

export default function ScrambleGuide({ moves, progress }: Props) {
  const done = progress?.done ?? -1;
  const lost = progress?.status === 'off-track';
  const partial = progress?.status === 'partial';
  const complete = progress?.status === 'complete';
  const fix = lost ? (progress?.fix ?? []) : [];

  return (
    <p className="flex flex-wrap items-center gap-x-1 gap-y-1.5 font-mono text-[clamp(1.05rem,2.4vw,1.6rem)] leading-none">
      {moves.map((m, i) => {
        const here = progress && i === done;
        // The fix goes exactly where the solve went off the rails
        const splice = here && fix.length > 0;
        const isDone = progress ? i < done : false;
        const isNext = here && !lost && !complete;
        return (
          <span key={i} className="flex items-center gap-x-1">
            {splice && (
              <>
                <span className="flex items-center gap-x-1 rounded-[6px] bg-bad/15 px-1 py-0.5 text-bad ring-1 ring-bad/40">
                  <span className="px-0.5 text-[0.62em] uppercase tracking-wide opacity-80">undo</span>
                  {fix.map((f, k) => (
                    <span key={k} className="font-semibold">
                      {f}
                    </span>
                  ))}
                </span>
              </>
            )}
            <span
              className={CHIP}
              style={{
                background: isNext ? (partial ? 'var(--color-warn)' : 'var(--color-cube-blue)') : 'transparent',
                color: isNext
                  ? partial
                    ? '#10141a'
                    : '#fff'
                  : isDone
                    ? 'var(--color-ink-600)'
                    : 'var(--color-ink-100)',
              }}
            >
              {m}
            </span>
            {/* Mid-turn: say what is still missing, right next to the move */}
            {here && partial && progress?.remaining && (
              <span className="text-[0.7em] text-warn">+{progress.remaining}</span>
            )}
          </span>
        );
      })}

      {/* Off track with nothing recognisable turned — the connection dropped */}
      {lost && fix.length === 0 && (
        <span className="ml-1 rounded-[6px] bg-bad/15 px-2 py-1 text-[0.7em] text-bad ring-1 ring-bad/40">
          lost track — solve the cube and start again
        </span>
      )}
    </p>
  );
}

/**
 * Just the next move, large.
 *
 * Only for the case trainer, where the sequence is deliberately hidden — seeing
 * all of it would give the case away. Everywhere else the scramble itself is on
 * screen, so repeating the next move under it is noise.
 */
export function NextMove({ progress }: { progress: ScrambleProgress | null }) {
  if (!progress) return null;
  if (progress.status === 'complete') return null;
  if (progress.status === 'off-track') {
    return (
      <p className="font-mono text-3xl font-semibold leading-none text-bad">
        {progress.fix.length ? progress.fix.join(' ') : 'lost track'}
      </p>
    );
  }
  const partial = progress.status === 'partial';
  return (
    <p className={`font-mono text-4xl font-semibold leading-none ${partial ? 'text-warn' : 'text-cube-blue'}`}>
      {partial ? progress.remaining : progress.next}
    </p>
  );
}
