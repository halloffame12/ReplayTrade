import type { ChartPoint, Drawing, DrawingStyle, DrawingType, InteractionModel } from '../types';

/**
 * A `DrawingSpec` is a drawing without identity/timestamps — the engine stamps
 * id, layerIndex, createdAt/updatedAt at commit time.
 */
export type DrawingSpec = Omit<Drawing, 'id' | 'createdAt' | 'updatedAt' | 'layerIndex'>;

export interface ToolDef {
  id: DrawingType;
  model: InteractionModel;
  build(points: ChartPoint[], style: DrawingStyle): DrawingSpec;
}

/** Base helper shared by every tool definition. */
export function spec(
  type: DrawingType,
  points: ChartPoint[],
  style: DrawingStyle,
  extra?: Partial<DrawingSpec>,
): DrawingSpec {
  return {
    type,
    points,
    style,
    visible: true,
    locked: false,
    ...extra,
  };
}

/** Default measurement labels for the line family. */
export const lineLabels = {
  priceChange: true,
  percent: true,
  bars: true,
  time: true,
};
