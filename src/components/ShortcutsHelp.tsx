import { Button, Modal } from './ui';

const GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: 'Replay',
    items: [
      ['Space', 'Play / pause'],
      ['→', 'Next candle'],
      ['←', 'Previous candle'],
      ['Shift + →', 'Skip 5 candles'],
      ['Shift + ←', 'Skip back 5 candles'],
      ['+ / -', 'Replay speed'],
      ['Esc', 'Exit replay'],
    ],
  },
  {
    title: 'Markets',
    items: [
      ['1 – 7', 'Switch timeframe'],
      ['F', 'Toggle fullscreen'],
      ['Alt + H', 'This help panel'],
      ['Ctrl + Z', 'Undo drawing'],
    ],
  },
];

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-block rounded-sm border border-bg-border bg-bg-elevated px-1.5 py-0.5 font-mono text-[10px] text-text-secondary">
      {children}
    </kbd>
  );
}

export function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      title="Keyboard Shortcuts"
      subtitle="Drive the terminal like a pro"
      labelledBy="shortcuts-title"
      onClose={onClose}
      footer={
        <Button variant="primary" onClick={onClose} autoFocus>
          Got it
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {GROUPS.map((g) => (
          <div key={g.title}>
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              {g.title}
            </div>
            <dl className="space-y-1.5">
              {g.items.map(([key, desc]) => (
                <div key={key} className="flex items-center justify-between gap-3">
                  <Kbd>{key}</Kbd>
                  <dd className="text-[11px] text-text-secondary">{desc}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
      <p className="mt-4 border-t border-bg-border pt-3 text-[11px] leading-snug text-text-muted">
        Shortcuts are ignored while typing in an input field. Tip: the right arrow reveals one
        candle at a time — the core of bar replay.
      </p>
    </Modal>
  );
}
