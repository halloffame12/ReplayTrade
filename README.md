# ReplayTrade

A TradingView-style **bar-replay paper-trading terminal** for the browser. Study historical
market data bar-by-bar, place simulated orders with stop-loss and take-profit, and build a full
paper-trading record — no real money involved.

Built with React 18, TypeScript, Vite, Tailwind CSS, and lightweight-charts v5.

## Features

- **Bar replay** — pick a starting candle, then step forward (or autoplay) one bar at a time.
  Only already-revealed candles are shown, so you never see the future.
- **Paper trading** — place buy/sell orders with SL/TP during a replay. Positions are evaluated
  deterministically on each new candle (stop-loss is assumed to hit first on a same-candle SL/TP
  overlap). Open positions auto-close at replay end.
- **Risk tooling** — R-multiple tracking, quick sizing tools (SL 1%, TP 2/3%, 1:2, 1:3, quantity
  by 1% risk), live order preview, and validation on every field.
- **Real market data** — loads ~6 months of history from public Binance klines (no API key), with
  optional OANDA v20 for XAU/USD spot (personal token, stored only in your browser) and a local
  deterministic **demo** mode when the network is unavailable.
- **TradingView-parity chart** — candlesticks + volume, SMA20/EMA50 overlays, dashed crosshair
  with OHLC legend, manual price-scale pan/zoom, TradingView tick-mark labels, current-price line,
  Entry/SL/TP price lines for open positions, and entry/exit markers.
- **Drawing tools** — trendline, ray, horizontal/vertical lines, rectangle, Fibonacci retracement
  with OHLC magnet snapping, draggable handles, Ctrl+Z undo, persisted per symbol + timeframe.
- **Statistics** — equity curve, win rate, profit factor, average R, total R, max drawdown, and
  more, plus a completion modal at the end of each replay.
- **Keyboard-first** — full shortcut set, onboarding tour on first run, and inline help.
- **Responsive** — 3-pane desktop layout, bottom-sheet trade ticket on mobile, safe-area aware.

## Getting Started

Requires Node.js 18+.

```bash
npm install
npm run dev       # start the Vite dev server
npm run build     # type-check + production build (tsc -b && vite build)
npm run preview   # preview the production build
```

Open the printed local URL. On first launch a quick tour explains replay trading and the trade
panel.

## Markets & Data Sources

| Market | Binance | OANDA | Decimals |
| ------ | ------- | ----- | -------- |
| XAU/USD | PAXGUSDT (gold token) | XAU_USD (gold spot) | 2 |
| BTC/USDT | BTCUSDT | — | 1 |
| ETH/USDT | ETHUSDT | — | 2 |
| SOL/USDT | SOLUSDT | — | 3 |

- The per-symbol source choice is remembered across reloads.
- For XAU/USD via OANDA, paste your v20 access token under **Session → OANDA API key**. The token
  is stored in `localStorage` only.
- If the data service is unreachable, use **Use Demo Data** — generated locally and clearly
  labelled, not real market prices.

## Keyboard Shortcuts

| Keys | Action |
| ---- | ------ |
| `Space` | Play / pause |
| `←` / `→` | Previous / next candle |
| `Shift + ←` / `Shift + →` | Skip back / forward 5 candles |
| `+` / `-` | Increase / decrease replay speed |
| `1 – 7` | Switch timeframe |
| `F` | Toggle fullscreen |
| `Alt + H` | Open shortcuts help |
| `Ctrl + Z` | Undo last drawing |
| `Esc` | Cancel selection / exit replay |

Shortcuts are ignored while typing in an input field.

## Project Structure

```
src/
  components/       UI: Header, TradingChart, TradePanel, PositionsPanel, TradeHistory,
                    StatisticsPanel, ReplayToolbar, ReplayStartSelector, ReplayCompleteModal,
                    MarketSelector, OnboardingOverlay, ShortcutsHelp, DrawingToolbar, ui
  hooks/            usePaperTrading, useChartReplay, useMarketData
  services/         marketDataService (Binance + OANDA fetchers)
  types/            market, trading, replay, drawings
  utils/            replayEngine, tradingCalculations, drawingManager, indicators,
                    candleUtils, demoDataGenerator
docs/               engineering prompts used to build/audit the app
```

## Disclaimer

Simulated trading environment for educational use. Market data may be delayed or unavailable, and
the paper-trading engine does **not** guarantee realistic slippage or execution. Not financial
advice.
