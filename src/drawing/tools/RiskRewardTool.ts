import type { ToolDef } from './shared';
import { spec } from './shared';

/** Points: [0]=entry, [1]=stop-loss, [2]=take-profit. */
export const RiskRewardTool: ToolDef = {
  id: 'riskReward',
  model: 'multipoint',
  build: (points, style) =>
    spec('riskReward', points.slice(0, 3), style, {
      risk: { accountSize: 10_000, riskPct: 1, positionSize: 0 },
    }),
};
