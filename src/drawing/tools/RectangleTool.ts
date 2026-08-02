import type { ToolDef } from './shared';
import { spec } from './shared';

export const RectangleTool: ToolDef = {
  id: 'rectangle',
  model: 'drag',
  build: (points, style) => {
    const p0 = points[0]!;
    const p1 = points[1] ?? p0;
    return spec('rectangle', [p0, p1], style, { labels: { price: true } });
  },
};
