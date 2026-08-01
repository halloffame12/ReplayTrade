export type TwoPointDrawingType = 'trendLine' | 'ray' | 'rectangle' | 'fibRetracement';

export type DrawingTool =
  | 'select'
  | 'trendLine'
  | 'horzLine'
  | 'vertLine'
  | 'ray'
  | 'rectangle'
  | 'fibRetracement'
  | 'delete';

export interface DrawingPoint {
  time: number;
  price: number;
}

export interface BaseDrawing {
  id: string;
  color: string;
}

export interface TwoPointDrawing extends BaseDrawing {
  type: TwoPointDrawingType;
  p0: DrawingPoint;
  p1: DrawingPoint;
}

export interface HorzDrawing extends BaseDrawing {
  type: 'horzLine';
  price: number;
}

export interface VertDrawing extends BaseDrawing {
  type: 'vertLine';
  time: number;
}

export type Drawing = TwoPointDrawing | HorzDrawing | VertDrawing;

export const DRAWING_TOOL_LABELS: Record<DrawingTool, string> = {
  select: 'Select / move',
  trendLine: 'Trend line',
  horzLine: 'Horizontal line',
  vertLine: 'Vertical line',
  ray: 'Ray',
  rectangle: 'Rectangle',
  fibRetracement: 'Fibonacci retracement',
  delete: 'Delete drawing',
};
