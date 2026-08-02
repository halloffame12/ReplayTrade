import type { ToolDef } from './shared';
import { spec } from './shared';

export const HorizontalLineTool: ToolDef = {
  id: 'horizontalLine',
  model: 'click',
  build: (points, style) => {
    const p = points[0]!;
    return spec('horizontalLine', [{ time: 0, price: p.price }], style, { labels: { price: true } });
  },
};
