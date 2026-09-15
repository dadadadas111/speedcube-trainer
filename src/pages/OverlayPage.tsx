/**
 * One block of the overlay, as OBS loads it.
 *
 * Transparent, no chrome, nothing interactive: a picture of one part of the
 * session, drawn over whatever the camera is showing. Which part is in the
 * address, so OBS gets one Browser Source per block and does the positioning
 * itself — see stream/widgets.tsx for why that is its job rather than ours.
 *
 * The clock counts on its own from the last thing it was told, so it stays
 * smooth without sixty messages a second and without the two machines having to
 * agree what time it is. Everything is sized in em against one font size, so a
 * streamer who wants it bigger changes one number in the address rather than
 * fighting OBS's scaling.
 */

import { useEffect, useRef, useState } from 'react';
import { RelayLink } from '../remote/relay';
import { decodeState, isStreamMessage, isNewer, EMPTY_STATE, type StreamState } from '../stream/protocol';
import { widgetById } from '../stream/widgets';

export interface Props {
  code: string;
  /** Which block; anything unknown falls back to the first one */
  widget: string;
  scale: number;
  /** A soft dark panel behind it. On by default — see below. */
  backdrop?: boolean;
  /** Rows, for the blocks that show a list */
  rows?: number;
}

export default function OverlayPage({ code, widget, scale, backdrop = true, rows = 5 }: Props) {
  const [state, setState] = useState<StreamState>(EMPTY_STATE);
  const [linked, setLinked] = useState(false);
  /** performance.now() when the running state arrived, for counting on */
  const startedAt = useRef<number | null>(null);
  const [shownMs, setShownMs] = useState(0);

  useEffect(() => {
    const link = new RelayLink();
    const off = link.on({
      status: (s) => setLinked(s === 'linked'),
      message: (m) => {
        if (!isStreamMessage(m)) return;
        const next = decodeState(m.state);
        if (!next) return;
        setState((cur) => {
          if (!isNewer(next, cur)) return cur;
          // The clock restarts from whatever had already passed when this was
          // sent, so nothing absolute has to cross the wire
          startedAt.current = next.phase === 'running' ? performance.now() - next.elapsedMs : null;
          return next;
        });
      },
    });
    link.join(code);
    return () => {
      off();
      link.stop();
    };
  }, [code]);

  // Counting on locally: smooth, and costs the network nothing
  useEffect(() => {
    if (state.phase !== 'running') return;
    let raf = 0;
    const tick = () => {
      if (startedAt.current !== null) setShownMs(performance.now() - startedAt.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state.phase]);

  const block = widgetById(widget);

  return (
    /**
     * The backdrop is on by default, because legibility over arbitrary video is
     * the whole job of an overlay and a drop shadow alone loses to a bright
     * frame. `&bg=0` turns it off for anyone compositing it themselves.
     */
    <div
      style={{
        fontSize: `${scale}px`,
        background: backdrop ? 'rgba(10,14,20,0.62)' : 'transparent',
        borderRadius: backdrop ? '0.5em' : 0,
        backdropFilter: backdrop ? 'blur(0.25em)' : undefined,
      }}
      className="pointer-events-none inline-flex select-none flex-col gap-[0.4em] p-[0.7em] font-sans"
    >
      {block.render({ state, shownMs, rows })}
      {!linked && (
        <span style={{ color: 'var(--color-warn)', fontSize: '0.62em', opacity: 0.85 }}>
          waiting for the trainer…
        </span>
      )}
    </div>
  );
}
