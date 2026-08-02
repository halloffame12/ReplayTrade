import { DEFAULT_FIB_LEVELS } from '../types';
import type { ToolDef } from './shared';
import { spec } from './shared';

export const FibRetracementTool: ToolDef = {
  id: 'fibRetracement',
  model: 'drag',
  build: (points, style) => {
    const p0 = points[0]!;
    const p1 = points[1] ?? p0;
    return spec('fibRetracement', [p0, p1], style, { fibLevels: [...DEFAULT_FIB_LEVELS] });
  },
};
