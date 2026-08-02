import type { ToolDef } from './shared';
import { spec } from './shared';

export const PathTool: ToolDef = {
  id: 'path',
  model: 'freehand',
  build: (points, style) => spec('path', points, style),
};
