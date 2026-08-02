import type { ToolDef } from './shared';
import { spec } from './shared';

/** Points: [0]=entry, [1]=stop-loss, [2]=take-profit. */
export const ShortPositionTool: ToolDef = {
  id: 'shortPosition',
  model: 'multipoint',
  build: (points, style) => spec('shortPosition', points.slice(0, 3), style),
};
