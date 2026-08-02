import type { ToolDef } from './shared';
import { spec } from './shared';

export const ArrowTool: ToolDef = {
  id: 'arrow',
  model: 'drag',
  build: (points, style) => {
    const p0 = points[0]!;
    const p1 = points[1] ?? p0;
    return spec('arrow', [p0, p1], style, { data: { arrowheadSize: 10 } });
  },
};
