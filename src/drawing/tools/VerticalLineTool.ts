import type { ToolDef } from './shared';
import { spec } from './shared';

export const VerticalLineTool: ToolDef = {
  id: 'verticalLine',
  model: 'click',
  build: (points, style) => {
    const p = points[0]!;
    return spec('verticalLine', [{ time: p.time, price: 0 }], style, { labels: { time: true } });
  },
};
