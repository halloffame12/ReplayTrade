import type { ToolDef } from './shared';
import { lineLabels, spec } from './shared';

export const ExtendedLineTool: ToolDef = {
  id: 'extendedLine',
  model: 'drag',
  build: (points, style) => {
    const p0 = points[0]!;
    const p1 = points[1] ?? p0;
    return spec(
      'extendedLine',
      [p0, p1],
      style,
      { extend: { start: true, end: true }, labels: { ...lineLabels } },
    );
  },
};
