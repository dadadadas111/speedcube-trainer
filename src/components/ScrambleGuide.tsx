/**
 * The scramble with guidance: how far you have got, what comes next, and what
 * to undo if you turned the wrong way.
 */

import type { ScrambleProgress } from '../analysis/scrambleGuide';

interface Props {
  moves: string[];
  /** null without a smart cube, in which case the scramble shows unguided */
  progress: ScrambleProgress | null;
}

export default function ScrambleGuide({ moves, progress }: Props) {
  const done = progress?.done ?? -1;
  const lost = progress?.status === 'off-track';
  const partial = progress?.status === 'partial';
  const complete = progress?.status === 'complete';

  return (
    <div>
      <p
        className="flex flex-wrap gap-x-1 gap-y-1.5 font-mono text-[clamp(1rem,2.2vw,1.5rem)] leading-none transition-opacity"
        style={{ opacity: lost ? 0.4 : 1 }}
      >
        {moves.map((m, i) => {
          const isDone = progress ? i < done : false;
          const isNext = progress ? i === done && !lost && !complete : false;
          // Partway through the current move goes amber, not red — a cube reports
          // a half turn as two events, so being mid-turn is perfectly normal.
          const bg = isNext ? (partial ? 'var(--color-warn)' : 'var(--color-cube-blue)') : 'transparent';
          return (
            <span
              key={i}
              className="rounded-[4px] px-1.5 py-1 transition-colors"
              style={{
                background: bg,
                color: isNext ? (partial ? '#10141a' : '#fff') : isDone ? 'var(--color-ink-500)' : 'var(--color-ink-100)',
              }}
            >
              {m}
            </span>
          );
        })}
      </p>

      {progress && (
        <div className="mt-3">
          <div className="flex items-center gap-3">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-ink-800">
              <div
                className="h-full transition-[width,background-color]"
                style={{
                  width: `${(done / Math.max(1, progress.total)) * 100}%`,
                  background: lost
                    ? 'var(--color-bad)'
                    : partial
                      ? 'var(--color-warn)'
                      : complete
                        ? 'var(--color-good)'
                        : 'var(--color-cube-blue)',
                }}
              />
            </div>
            <span className="tnum shrink-0 font-mono text-[13px] text-ink-400">
              {done}/{progress.total}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/** The guidance line for the current situation. */
export function ScrambleHint({ progress, notReady }: { progress: ScrambleProgress | null; notReady: boolean }) {
  if (notReady) {
    return (
      <div>
        <p className="text-[15px] font-semibold text-warn">The cube is not solved</p>
        <p className="mt-1 max-w-[52ch] text-sm text-ink-300">
          Scrambles start from a solved cube, so solve it first. If the cube in your hands is already solved and
          the app still says this, the two are out of sync — use the buttons below.
        </p>
      </div>
    );
  }
  if (!progress) {
    return (
      <p className="text-sm text-ink-300">
        Connect a smart cube and the app will guide you through the scramble, catching every wrong turn.
      </p>
    );
  }
  if (progress.status === 'complete') {
    return <p className="armed text-lg font-semibold text-good">Scramble done — the first turn starts the timer</p>;
  }
  if (progress.status === 'partial') {
    return (
      <div>
        <p className="text-[13px] text-ink-400">Mid-turn</p>
        <p className="font-mono text-4xl font-semibold leading-none text-warn">{progress.remaining}</p>
        <p className="mt-2 max-w-[46ch] text-[13px] text-ink-400">
          Finish the turn to complete <span className="font-mono text-ink-200">{progress.next}</span>. A cube
          reports a half turn as two beats, so being mid-turn is normal.
        </p>
      </div>
    );
  }
  if (progress.status === 'off-track') {
    return (
      <div>
        <p className="text-[15px] font-semibold text-bad">
          Wrong turn{progress.wrongMoves > 1 ? `s — ${progress.wrongMoves} of them` : ''}
        </p>
        {progress.fix.length > 0 ? (
          <>
            <p className="mt-1 text-sm text-ink-300">
              {progress.done === 0
                ? 'Undo this to get back to a solved cube:'
                : `Undo this to get back to move ${progress.done}:`}
            </p>
            <p className="mt-1.5 font-mono text-xl text-bad">{progress.fix.join(' ')}</p>
          </>
        ) : (
          <p className="mt-1 max-w-[52ch] text-sm text-ink-300">
            The app does not know what you turned — the connection may have dropped. Solve the cube and start
            the scramble again, or pick a different one.
          </p>
        )}
      </div>
    );
  }
  return (
    <div>
      <p className="text-[13px] text-ink-400">Next move</p>
      <p className="font-mono text-4xl font-semibold leading-none text-cube-blue">{progress.next}</p>
      <p className="mt-2 text-[13px] text-ink-400">
        {progress.done === 0 ? 'Starting from a solved cube.' : `${progress.total - progress.done} moves to go.`}
      </p>
    </div>
  );
}
