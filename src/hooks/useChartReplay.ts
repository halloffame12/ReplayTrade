import { useCallback, useEffect, useRef, useState } from 'react';
import type { Candle } from '../types/market';
import type { ReplayControls, ReplayState } from '../types/replay';
import {
  advanceReplay,
  createReplayState,
  exitReplay,
  jumpToLiveReplay,
  pauseReplay,
  playReplay,
  resetReplay,
  REPLAY_INTERVALS_MS,
  skipBackwardReplay,
  skipForwardReplay,
  stepBackReplay,
} from '../utils/replayEngine';

/**
 * TradingView Bar Replay-style engine.
 *
 * The full candle set lives in memory, but only candles up to
 * `currentReplayIndex` are ever handed to the chart. `maxRevealedIndex`
 * tracks how far the user has actually seen, so "previous candle" can never
 * reveal fresh data.
 */
export function useChartReplay() {
  const [state, setState] = useState<ReplayState>(() => createReplayState([]));
  const [autoFollow, setAutoFollow] = useState(true);
  const [followSignal, setFollowSignal] = useState(0);

  const stateRef = useRef(state);
  stateRef.current = state;

  const timerRef = useRef<number | null>(null);

  const setCandles = useCallback((candles: Candle[]) => {
    setState(createReplayState(candles));
    setFollowSignal((n) => n + 1);
  }, []);

  const enterReplayMode = useCallback(() => {
    setState((s) => (s.candles.length === 0 ? s : { ...s, mode: 'selecting' }));
  }, []);

  const cancelSelecting = useCallback(() => {
    setState((s) => ({ ...s, mode: 'idle', replayStartIndex: null }));
  }, []);

  const confirmStart = useCallback((index: number) => {
    setState((s) => {
      const candles = s.candles;
      if (index < 0 || index >= candles.length) return s;
      const visibleStartIndex = Math.max(0, index - 200);
      return {
        ...s,
        mode: 'ready',
        replayStartIndex: index,
        currentReplayIndex: index,
        maxRevealedIndex: index,
        visibleStartIndex,
      };
    });
  }, []);

  const play = useCallback(() => {
    setState((s) => {
      if (s.candles.length === 0) return s;
      if (s.currentReplayIndex >= s.candles.length - 1) {
        return { ...s, isPlaying: false, mode: 'completed' };
      }
      return { ...s, isPlaying: true, mode: 'playing' };
    });
  }, []);

  const pause = useCallback(() => setState(pauseReplay), []);

  const togglePlay = useCallback(() => {
    setState((s) => (s.isPlaying ? pauseReplay(s) : playReplay(s)));
  }, []);

  const nextCandle = useCallback(() => setState(advanceReplay), []);

  const previousCandle = useCallback(() => {
    setState((s) => {
      const stepped = stepBackReplay(s);
      return s.isPlaying ? pauseReplay(stepped) : stepped;
    });
  }, []);

  const skipBackward = useCallback((count: number) => {
    setState((s) => {
      const stepped = skipBackwardReplay(s, count);
      return s.isPlaying ? pauseReplay(stepped) : stepped;
    });
  }, []);

  const skipForward = useCallback(
    (count: number) => setState((s) => skipForwardReplay(s, count)),
    [],
  );

  const resetReplayAction = useCallback(() => setState(resetReplay), []);

  const exitReplayAction = useCallback(() => setState(exitReplay), []);

  const setSpeed = useCallback((speed: number) => {
    setState((s) => ({ ...s, speed }));
  }, []);

  const jumpToLive = useCallback(() => {
    setState((s) => jumpToLiveReplay(s));
    setFollowSignal((n) => n + 1);
  }, []);

  // Playback timer — drift-free: uses a self-correcting timeout and catches
  // up (bounded) if the tab was backgrounded so playback stays accurate.
  useEffect(() => {
    if (!state.isPlaying) {
      timerRef.current = null;
      return;
    }
    const intervalMs = Math.max(30, REPLAY_INTERVALS_MS[state.speed] ?? 500);
    let lastTick = performance.now();
    const tick = (): void => {
      const now = performance.now();
      const elapsed = now - lastTick;
      lastTick = now;
      let steps = 1;
      if (elapsed > intervalMs * 1.5) {
        steps = Math.min(240, Math.max(1, Math.floor(elapsed / intervalMs)));
      }
      const s = stateRef.current;
      let cur = s;
      for (let i = 0; i < steps; i++) {
        const next = advanceReplay(cur);
        if (next.currentReplayIndex === cur.currentReplayIndex) break;
        cur = next;
      }
      setState(cur);
      timerRef.current = window.setTimeout(tick, intervalMs);
    };
    timerRef.current = window.setTimeout(tick, intervalMs);
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [state.isPlaying, state.speed]);

  const revealedPct =
    state.candles.length > 0
      ? ((state.currentReplayIndex + 1) / state.candles.length) * 100
      : 0;
  const remaining = state.candles.length > 0 ? state.candles.length - state.currentReplayIndex - 1 : 0;

  return {
    state,
    enterReplayMode,
    cancelSelecting,
    confirmStart,
    play,
    pause,
    togglePlay,
    nextCandle,
    previousCandle,
    skipBackward,
    skipForward,
    resetReplay: resetReplayAction,
    exitReplay: exitReplayAction,
    setSpeed,
    jumpToLive,
    setCandles,
    autoFollow,
    setAutoFollow,
    followSignal,
    revealedPct,
    remaining,
  } as ReplayControls & {
    setCandles: (candles: Candle[]) => void;
    autoFollow: boolean;
    setAutoFollow: (v: boolean) => void;
    followSignal: number;
    revealedPct: number;
    remaining: number;
  };
}
