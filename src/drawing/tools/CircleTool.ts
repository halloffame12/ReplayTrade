import type { ToolDef } from './shared';
import { spec } from './shared';

/** Circle is stored as centre + a point on the circle (radius anchor). */
export const CircleTool: ToolDef = {
  id: 'circle',
  model: 'drag',
  build: (points, style) => {
    const p0 = points[0]!;
    const p1 = points[1] ?? p0;
    return spec('circle', [p0, p1], style, { showRadius: true });
  },
};
