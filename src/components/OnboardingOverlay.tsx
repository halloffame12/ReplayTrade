import { CandlestickChart, Keyboard, Play, Target } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Modal, Stat } from './ui';

const ONBOARDED_KEY = 'replaytrade:onboarded';

export function isOnboarded(): boolean {
  try {
    return localStorage.getItem(ONBOARDED_KEY) === '1';
  } catch {
    return true;
  }
}

export function markOnboarded(): void {
  try {
    localStorage.setItem(ONBOARDED_KEY, '1');
  } catch {
    /* ignore */
  }
}

interface Step {
  id: string;
  icon: React.ReactNode;
  title: string;
  body: string;
  kbd: string[];
  stats: { label: string; value: string; tone?: 'up' | 'down' }[];
}

const STEPS: Step[] = [
  {
    id: 'welcome',
    icon: <CandlestickChart size={22} className="text-accent" />,
    title: 'Welcome to ReplayTrade',
    body: 'A practice trading terminal for bar-by-bar replay. Study any supported market, backtest your decisions, and keep a full paper-trading record — all in your browser.',
    kbd: ['Alt+H', 'Shortcuts'],
    stats: [
      { label: 'Markets', value: '5' },
      { label: 'Timeframes', value: '7' },
      { label: 'Demo balance', value: '$10k' },
    ],
  },
  {
    id: 'replay',
    icon: <Play size={22} className="text-accent" />,
    title: 'Bar-by-bar replay',
    body: 'Click "Start Replay", hover any candle to pick the starting bar, then step forward at your own speed. Only revealed candles are shown, so you never see the future.',
    kbd: ['Space', 'Play / pause'],
    stats: [
      { label: 'Reveal', value: 'Step-by-step' },
      { label: 'Speeds', value: '0.25x – 10x' },
    ],
  },
  {
    id: 'trading',
    icon: <Target size={22} className="text-accent" />,
    title: 'Paper trading with risk built in',
    body: 'Place orders with stop-loss and take-profit from the Trade Panel. Every closed trade is scored with its R-multiple and feeds your statistics and equity curve.',
    kbd: ['→', 'Next candle'],
    stats: [
      { label: 'R-multiple', value: 'Tracked' },
      { label: 'Stats', value: 'Live' },
    ],
  },
  {
    id: 'shortcuts',
    icon: <Keyboard size={22} className="text-accent" />,
    title: 'Keyboard-first, like a real terminal',
    body: 'Timeframes 1–7, arrow keys to step, +/- for speed, F for fullscreen. Open this tour again any time with Alt+H.',
    kbd: ['1–7', 'Timeframes'],
    stats: [
      { label: 'Shortcuts', value: '12+' },
      { label: 'Undo drawings', value: 'Ctrl+Z' },
    ],
  },
];

interface OnboardingOverlayProps {
  open: boolean;
  onClose: () => void;
}

export function OnboardingOverlay({ open, onClose }: OnboardingOverlayProps) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  if (!current) return null;

  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  const finish = useCallback(() => {
    markOnboarded();
    onClose();
  }, [onClose]);

  if (!open) return null;

  const isLast = step === STEPS.length - 1;

  return (
    <Modal
      title={
        <span className="flex items-center gap-2">
          <CandlestickChart size={16} className="text-accent" />
          ReplayTrade Quick Tour
        </span>
      }
      subtitle="Takes about 20 seconds"
      labelledBy="onboarding-title"
      onClose={finish}
      footer={
        <>
          {isLast ? (
            <Button variant="primary" size="lg" onClick={finish} autoFocus>
              Start Trading
            </Button>
          ) : (
            <Button variant="primary" size="lg" onClick={() => setStep((s) => s + 1)} autoFocus>
              Next
            </Button>
          )}
          <div className="flex items-center justify-between">
            <button
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0}
              className="text-[11px] font-semibold text-text-secondary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              Back
            </button>
            <div className="flex items-center gap-1.5" aria-hidden="true">
              {STEPS.map((s, i) => (
                <span
                  key={s.id}
                  className={`h-1.5 w-4 rounded-full transition-colors ${
                    i === step ? 'bg-accent' : i < step ? 'bg-accent/40' : 'bg-bg-hover'
                  }`}
                />
              ))}
            </div>
            <button
              onClick={finish}
              className="text-[11px] font-semibold text-text-muted hover:text-text-secondary"
            >
              Skip
            </button>
          </div>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border border-bg-border bg-bg-elevated">
            {current.icon}
          </div>
          <div>
            <Badge tone="accent">Step {step + 1} of {STEPS.length}</Badge>
            <h3 className="mt-1 text-[15px] font-bold text-text-primary">{current.title}</h3>
          </div>
        </div>
        <p className="text-[12px] leading-relaxed text-text-secondary">{current.body}</p>
        <div className="grid grid-cols-2 gap-2">
          {current.stats.map((s) => (
            <Stat key={s.label} label={s.label} value={s.value} tone={s.tone ?? 'default'} />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {current.kbd.map((k) => (
            <kbd
              key={k}
              className="rounded-sm border border-bg-border bg-bg-elevated px-1.5 py-0.5 font-mono text-[10px] text-text-secondary"
            >
              {k}
            </kbd>
          ))}
        </div>
      </div>
    </Modal>
  );
}
