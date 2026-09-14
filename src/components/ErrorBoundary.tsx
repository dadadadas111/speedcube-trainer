/**
 * A crash in one page should not take the whole app down with it.
 *
 * Without this, an exception thrown during render unmounts everything and
 * leaves a blank page — which, when a cube is connected, is easy to read as
 * "the cube disconnected". Showing what actually happened, and keeping the
 * error where it can be copied, is the difference between a bug report and a
 * guess.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { cubeLink } from '../smartcube/connection';
import { recordCrash } from '../store/crashLog';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  stack: string | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, stack: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ stack: info.componentStack ?? null });
    // Put it in the connection log too, so it sits next to the cube events it
    // may well have been caused by.
    cubeLink.log.push({ t: Date.now(), kind: 'ui-error', detail: error.message });
    // And to storage, because the first thing anyone does with this screen is
    // press Reload — which empties the log above along with everything else.
    recordCrash(
      error.message,
      `${location.hash || location.pathname}`,
      `${error.stack ?? ''}\n${info.componentStack ?? ''}`,
    );
  }

  render() {
    const { error, stack } = this.state;
    if (!error) return this.props.children;
    const text = `${error.message}\n${error.stack ?? ''}\n${stack ?? ''}`;
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4 p-6">
        <h1 className="text-lg font-semibold text-bad">Something in the app broke</h1>
        <p className="text-sm text-ink-300">
          Your solves are safe — they live in the browser, not in this screen. Reloading gets you back.
        </p>
        <div className="flex gap-2">
          <button className="btn btn-primary" onClick={() => location.reload()}>
            Reload
          </button>
          <button className="btn" onClick={() => void navigator.clipboard?.writeText(text)}>
            Copy the error
          </button>
        </div>
        <pre className="max-h-80 overflow-auto rounded-lg border border-ink-700 bg-ink-900 p-3 font-mono text-[12px] text-ink-400">
          {text}
        </pre>
      </div>
    );
  }
}
