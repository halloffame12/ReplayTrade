import type { ToolDef } from './shared';
import { spec } from './shared';

/** Points: [0]=entry, [1]=stop-loss, [2]=take-profit. */
export const LongPositionTool: ToolDef = {
  id: 'longPosition',
  model: 'multipoint',
  build: (points, style) => spec('longPosition', points.slice(0, 3), style),
};
