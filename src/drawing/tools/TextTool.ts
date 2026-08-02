import type { ToolDef } from './shared';
import { spec } from './shared';

export const TextTool: ToolDef = {
  id: 'text',
  model: 'click',
  build: (points, style) => spec('text', [points[0]!], style, { text: '' }),
};
