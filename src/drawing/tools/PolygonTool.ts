import type { ToolDef } from './shared';
import { spec } from './shared';

export const PolygonTool: ToolDef = {
  id: 'polygon',
  model: 'multipoint',
  build: (points, style) => spec('polygon', points, style),
};
