import type { ToolDef } from './shared';
import { lineLabels, spec } from './shared';

export const RayTool: ToolDef = {
  id: 'ray',
  model: 'drag',
  build: (points, style) => {
    const p0 = points[0]!;
    const p1 = points[1] ?? p0;
    return spec(
      'ray',
      [p0, p1],
      style,
      { extend: { start: false, end: true }, labels: { ...lineLabels } },
    );
  },
};
