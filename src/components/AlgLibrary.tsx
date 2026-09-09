/**
 * A two-level alg library: open a family (Sune, EOLR, ...) then pick a case.
 *
 * A flat list is unusable once you have hundreds of algs, so there is a search
 * box and a per-family count of how many cases you have drilled.
 */

import { useEffect, useMemo, useState } from 'react';
import type { AlgEntry } from '../store/db';

interface Props {
  algs: AlgEntry[];
  /** algId -> number of drill reps */
  repCounts: Map<number, number>;
  selectedId: number | null;
  onSelect: (id: number) => void;
  onAdd: () => void;
}

interface Family {
  key: string;
  group: string;
  family: string;
  items: AlgEntry[];
  practiced: number;
}

export default function AlgLibrary({ algs, repCounts, selectedId, onSelect, onAdd }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());

  const q = query.trim().toLowerCase();
  const matches = useMemo(
    () => (q ? algs.filter((a) => [a.family, a.name, a.alg, a.group].some((f) => f?.toLowerCase().includes(q))) : algs),
    [algs, q],
  );

  const families = useMemo(() => {
    const map = new Map<string, Family>();
    for (const a of matches) {
      const key = a.group + ' / ' + a.family;
      if (!map.has(key)) map.set(key, { key, group: a.group, family: a.family, items: [], practiced: 0 });
      const f = map.get(key)!;
      f.items.push(a);
      if (a.id && (repCounts.get(a.id) ?? 0) > 0) f.practiced++;
    }
    return [...map.values()];
  }, [matches, repCounts]);

  const groups = useMemo(() => {
    const map = new Map<string, Family[]>();
    for (const f of families) {
      if (!map.has(f.group)) map.set(f.group, []);
      map.get(f.group)!.push(f);
    }
    return [...map.entries()];
  }, [families]);

  // Always keep the family holding the selected alg open
  const selectedKey = useMemo(() => {
    const sel = algs.find((a) => a.id === selectedId);
    return sel ? sel.group + ' / ' + sel.family : null;
  }, [algs, selectedId]);

  useEffect(() => {
    if (selectedKey) setOpen((o) => (o.has(selectedKey) ? o : new Set(o).add(selectedKey)));
  }, [selectedKey]);

  // While searching, open everything so results are visible
  const isOpen = (key: string) => q !== '' || open.has(key);
  const toggle = (key: string) =>
    setOpen((o) => {
      const next = new Set(o);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <aside className="panel flex max-h-[55vh] flex-col overflow-hidden lg:max-h-[calc(100vh-8rem)]">
      <header className="flex items-center justify-between gap-2 border-b border-ink-700 px-3 py-2.5">
        <h2 className="text-sm font-semibold">Alg library</h2>
        <button className="btn btn-ghost !px-2 !py-0.5 !text-[13px]" onClick={onAdd}>
          Add
        </button>
      </header>

      <div className="border-b border-ink-700 px-3 py-2">
        <input
          className="input !py-1 !text-[13px]"
          placeholder="Search family, case or notation..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search algs"
        />
      </div>

      <div className="overflow-y-auto py-1">
        {groups.length === 0 && (
          <p className="px-3 py-6 text-[13px] text-ink-400">No algs match.</p>
        )}
        {groups.map(([group, fams]) => (
          <div key={group} className="mb-1">
            <p className="px-3 py-1.5 text-[12px] font-medium text-ink-400">{group}</p>
            {fams.map((f) => {
              const single = f.items.length === 1;
              const expanded = isOpen(f.key);
              const activeHere = f.items.some((a) => a.id === selectedId);
              return (
                <div key={f.key}>
                  <button
                    onClick={() => (single ? onSelect(f.items[0].id!) : toggle(f.key))}
                    aria-expanded={single ? undefined : expanded}
                    className={
                      'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] ' +
                      (single && activeHere ? 'bg-ink-700 text-ink-100' : 'text-ink-200 hover:bg-ink-800')
                    }
                  >
                    <span aria-hidden="true" className="w-3 shrink-0 text-[10px] text-ink-500">
                      {single ? '' : expanded ? '▾' : '▸'}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{f.family}</span>
                    {!single && (
                      <span
                        className="tnum shrink-0 text-[11px] text-ink-500"
                        title={f.practiced + '/' + f.items.length + ' cases drilled'}
                      >
                        {f.practiced}/{f.items.length}
                      </span>
                    )}
                  </button>
                  {!single && expanded && (
                    <div className="ml-[1.15rem] border-l border-ink-700 pl-1">
                      {f.items.map((a) => (
                        <button
                          key={a.id}
                          onClick={() => onSelect(a.id!)}
                          className={
                            'flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[13px] ' +
                            (selectedId === a.id ? 'bg-ink-700 text-ink-100' : 'text-ink-300 hover:bg-ink-800')
                          }
                        >
                          <span className="min-w-0 flex-1 truncate">{a.name}</span>
                          {a.id && (repCounts.get(a.id) ?? 0) === 0 && (
                            <span aria-hidden="true" title="Never drilled" className="size-1.5 shrink-0 rounded-full bg-ink-500" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </aside>
  );
}
