import type { ToolDef } from './shared';
import { lineLabels, spec } from './shared';

export const TrendLineTool: ToolDef = {
  id: 'trendLine',
  model: 'drag',
  build: (points, style) => {
    const p0 = points[0]!;
    const p1 = points[1] ?? p0;
    return spec(
      'trendLine',
      [p0, p1],
      style,
      { extend: { start: false, end: false }, labels: { ...lineLabels } },
    );
  },
};
