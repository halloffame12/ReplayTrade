import type { ToolDef } from './shared';
import { spec } from './shared';

/** Ellipse stored as the two opposite corners of its bounding box. */
export const EllipseTool: ToolDef = {
  id: 'ellipse',
  model: 'drag',
  build: (points, style) => {
    const p0 = points[0]!;
    const p1 = points[1] ?? p0;
    return spec('ellipse', [p0, p1], style);
  },
};
