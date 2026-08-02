import type { ToolDef } from './shared';
import { spec } from './shared';

export const TriangleTool: ToolDef = {
  id: 'triangle',
  model: 'multipoint',
  build: (points, style) => spec('triangle', points.slice(0, 3), style),
};
