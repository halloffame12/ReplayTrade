# REPLAYTRADE — TradingView-Grade Rebuild Prompt

You are a senior trading-platform engineer with deep expertise in TradingView's
UX, lightweight-charts v5, and React 18 + TypeScript + Tailwind. Your job is to
take the existing "ReplayTrade" app (React + Vite + TypeScript + Tailwind CSS +
lightweight-charts v5 + zustand + lucide-react) and rebuild/polish its entire
UI so it looks, feels, and behaves like TradingView — or better. Work through
this prompt in ONE continuous pass, fix every item listed, and verify with
`npm run build` (tsc + vite) before finishing. Do not skip sections. Do not
add libraries that are not already installed unless strictly necessary.

===================================================================
0. DESIGN PRINCIPLES (apply everywhere)
===================================================================
- "Information density with elegance": dark theme, high contrast, no clutter,
  generous micro-spacing, everything monospaced for numbers, sans-serif for prose.
- Every interactive element must have hover state, active state, focus ring,
  and disabled state. Consistent border radius (2-4px, "rounded-sm" feel).
- Beginner-friendly: every concept is explained in one line via a tooltip or
  helper text; nothing requires prior trading knowledge. Add a built-in
  first-run guide (onboarding) and per-feature hint pills.
- Pro-grade: power users can do everything from the keyboard; no dead clicks;
  no layout shift; smooth 60fps.

===================================================================
1. DESIGN SYSTEM (TradingView dark theme)
===================================================================
Colors (Tailwind tokens, keep the existing tailwind.config mapping):
- Background base: #0b0f19  | panel: #111827  | elevated: #1a2233  | hover: #1e2a44
- Borders: #232c3f   | text primary: #e5eaf3  | secondary: #9aa6bd  | muted: #5b6b84
- Up (bullish): #22c55e   Down (bearish): #ef4444   Accent (brand): #4f8cff
- Accent-dim, up-dim, down-dim at ~10-12% opacity for chips/badges.
Typography: font-mono for all numbers/prices/symbols; font-sans for labels.
Every component must be extracted into a reusable piece and consistent:
  Button (primary/ghost/danger), Input, Select, SegmentedControl, Tabs,
  Tooltip (hover + focus), Badge/Chip, DataTable, StatCard, Modal, Sheet,
  Toast, ProgressBar, SkeletonLoader.

===================================================================
2. APP LAYOUT (TradingView classic 3-pane)
===================================================================
- Top: app header.
- Middle: 3 columns —
  LEFT (watchlist / market selector + account mini-card, ~260px, collapsible),
  CENTER (chart, flex-1),
  RIGHT (trade ticket + account summary + details, ~300px, collapsible).
- Bottom: tabbed strip (Positions / History / Statistics / Session) + a
  collapsible quick-trade button on mobile.
- On <md: left column collapses into the bottom strip; right column becomes a
  bottom-sheet "Trade" drawer. Chart must always stay usable.
- All panels: overflow correctly, min-h-0, no page scroll — only inner scroll.
- Safe-area insets respected on mobile (env(safe-area-inset-*)).
- A "collapse/expand" chevron on each pane border (TradingView splitter feel).

===================================================================
3. HEADER
===================================================================
Left: logo/wordmark + symbol selector (dropdown with search) + timeframe
segmented control (1m 5m 15m 30m 1h 4h 1D) + data-source badge
(Binance / OANDA / Demo).
Center: last price, daily change ($ and %), high/low, and account equity summary.
Right: Start Replay / Exit Replay button, fullscreen toggle, settings gear
(indicators, balance, OANDA token, theme accent), user/help.
Header shows loading state (skeleton) and error state (retry) inline.

===================================================================
4. CHART (lightweight-charts v5) — TradingView parity
===================================================================
- Candles + volume (bottom 20%) + SMA20/EMA50 overlays toggled from settings.
- Crosshair: dashed both axes, OHLC legend in the top-left exactly like TV
  (O H L C colored, V, time, % change arrow), crosshair price label on axis.
- Right price axis: TV-style labels, auto-fitted on load, precision per symbol,
  current price line (dotted, labeled), Entry/SL/TP lines for open positions
  with colored axis tags.
- Time axis: TV tick marks (14:35 / Aug / '26), timeVisible per timeframe,
  date formatting for 1D.
- Pan: drag moves time+price together (TradingView). Vertical drag shifts price
  range (already implemented — keep autoScale false + manual refits working).
- Zoom: wheel zooms around cursor; pinch on touch; double-click axis resets.
- Keyboard: ← → step bars, Shift+←/→ skip 10, + / - zoom, 1-7 select timeframe.
- Drawing toolbar (bottom-center on chart): select, trendline, ray, horizontal,
  vertical, rectangle, fibonacci retracement, delete, clear all, undo (Ctrl+Z).
  Draggable handles, OHLC magnet snapping, per-drawing axis labels, persisted
  per symbol+timeframe in localStorage.
- Markers: replay-start marker, live trade entry/exit markers on chart.
- Empty/loading/error chart states with friendly copy and CTA buttons.
- Watermark (faint symbol name) center of chart, like TV.

===================================================================
5. BAR REPLAY ENGINE (the app's core differentiator)
===================================================================
- "Start Replay": enter select mode → user clicks a candle (chart pans there,
  marker shows "Replay starts here") → confirm → Bar-Replay begins.
- Controls (floating top-center on desktop, inline strip on mobile): play/pause,
  step back/forward, skip ±10/±100, jump to end, speed 1x/2x/5x/10x, exit.
- Auto-follow ON by default: newest revealed candle pinned to right edge;
  scrolling away pauses follow; scrolling back resumes (already implemented).
- Replay progress bar showing % revealed, and remaining candle count.
- Paper trading advances candle-by-candle: SL/TP hit detection (SL precedence
  on same candle), toasts on closes, replay-end auto-close of open positions.
- "Replay again", "Choose another start", "New session" from the completion modal.

===================================================================
6. LEFT PANEL — Watchlist / Market Selector
===================================================================
- List of markets (XAU/USD OANDA, XAU/USD PAXG, BTC, ETH, SOL) with last price
  and daily % (colored), active-row highlight, click to switch symbol.
- Per-symbol data source selector (Binance/OANDA) when both are available.
- Loaded-range card: candles count, from→to dates, source, status.
- Account mini-card: Balance, Equity, Available, Unrealized, Open positions.
- Skeleton while loading; inline error with Retry / Use Demo buttons.

===================================================================
7. RIGHT PANEL — Trade Ticket + Details
===================================================================
- Direction segmented control (Buy/Long green, Sell/Short red).
- Fields: Quantity, Entry (auto-filled with current price), Stop-loss,
  Take-profit — all with TV-style labels and inline validation.
- Risk tools row (pro + beginner friendly): "SL 1%", "TP 2%", "TP 3%",
  "1:2", "1:3", "Qty = 1% risk" — each tooltip explains what it does.
- Live preview card: Position value, Est. risk, Potential reward,
  Risk:Reward, Risk % of balance — updated as you type.
- Confirm modal with full order summary ("Simulated only, no real money").
- Below ticket: Account summary (Equity/Available/Open value/Unrealized)
  and a Details section (market, timeframe, source, range, replay state,
  balance presets, OANDA token + practice/live, indicator toggle).

===================================================================
8. BOTTOM TABS
===================================================================
- Positions: card per open position (symbol, dir badge, P&L $ and %,
  Entry/Mark/Qty/Value/Stop/TP/Risk/R), Close, Close 50%, Move SL→Entry.
- Trade History: table (#, symbol, dir, entry, exit, qty, P&L, ret, R,
  reason, closed-at) — newest first, capped at 50 visible, scrollable.
- Statistics: Total trades, Win rate, Net P&L, Return, Equity curve chart,
  Winning/Losing, Avg win/loss, Best/Worst, Profit factor, Avg R/trade,
  Total R, Max drawdown, Realized P&L.
- Session: full session details grid + settings (balance, OANDA, indicators).

===================================================================
9. BEGINNER-FRIENDLY FEATURES
===================================================================
- Onboarding overlay on first run: 3-4 quick steps explaining replay trading,
  the trade panel, and risk tools; dismissible, stored in localStorage.
- A small "?" help popover in each major area.
- Every abbreviated metric has a tooltip with plain-English definition
  (e.g. Win rate, Profit factor, R, Drawdown).
- All destructive actions require confirmation; all orders are clearly labeled
  "simulated".
- Safe defaults: 1% risk sizing, reasonable default balance, confirmations on.
- Friendly empty states with an obvious next action ("Place a trade…", etc.).
- No jargon without explanation; toast messages read like plain English.

===================================================================
10. ADVANCED / PRO FEATURES (make it "supreme grade")
===================================================================
- Full keyboard shortcut list (viewable in help): Space, ←→, Shift+←→,
  +/- zoom, 1-7 timeframes, Ctrl+Z undo drawing, Esc cancel/exit.
- Chart persistence: symbol, timeframe, drawings, OANDA token, source choice,
  balance, indicator toggle — all remembered across reloads.
- Smooth micro-animations (fade/slide) on modals, sheets, toasts only; no
  animation on price data.
- Performance: memoized heavy children, stable series refs, no re-render
  storms during replay ticks, debounced localStorage writes, visible-slice
  series updates only.
- Accessibility: aria labels on all controls, keyboard navigable tabs/toolbar,
  focus trap in modals, contrast ≥ WCAG AA on text.

===================================================================
11. RESPONSIVE BEHAVIOR
===================================================================
- Desktop ≥1024: full 3-pane layout with floating replay toolbar.
- Tablet 768-1024: chart + right ticket; watchlist in bottom strip.
- Mobile <768: chart full width, drawing toolbar at chart bottom-center,
  replay toolbar inline below chart, Trade as bottom-sheet.
- Touch: 44px min touch targets on the drawing toolbar; drawing drags
  override page scroll (touch-action handling); chart pan/zoom via touch.
- No horizontal page overflow anywhere; fonts never trigger iOS zoom
  (16px inputs).

===================================================================
12. DEFINITION OF DONE (verify all)
===================================================================
1. `npm run build` passes with zero errors.
2. Manually verify: symbol/timeframe switching updates chart + all panels
   without stale view or wrong price precision.
3. Verify drag-pan (horizontal + vertical) and wheel zoom around cursor.
4. Verify replay start/play/pause/step/skip/jump/exit + auto-follow +
   paper-trading closes + completion modal.
5. Verify drawings (draw, drag, snap, labels, undo, persist, clear).
6. Verify trade ticket validation, risk tools, confirm modal, positions,
   history, stats (incl. R metrics), session settings.
7. Verify onboarding, tooltips, empty states, error states, toasts.
8. Verify mobile layout at 375px and 768px widths.
9. No console errors/warnings during a full usage pass.
