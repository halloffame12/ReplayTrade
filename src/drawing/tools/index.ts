import type { ToolDef } from './shared';
import { ArrowTool } from './ArrowTool';
import { CircleTool } from './CircleTool';
import { EllipseTool } from './EllipseTool';
import { ExtendedLineTool } from './ExtendedLineTool';
import { FibRetracementTool } from './FibRetracementTool';
import { HorizontalLineTool } from './HorizontalLineTool';
import { LongPositionTool } from './LongPositionTool';
import { MeasureTool } from './MeasureTool';
import { PathTool } from './PathTool';
import { PolygonTool } from './PolygonTool';
import { RayTool } from './RayTool';
import { RectangleTool } from './RectangleTool';
import { RiskRewardTool } from './RiskRewardTool';
import { ShortPositionTool } from './ShortPositionTool';
import { TextTool } from './TextTool';
import { TrendLineTool } from './TrendLineTool';
import { TriangleTool } from './TriangleTool';
import { VerticalLineTool } from './VerticalLineTool';

const TOOL_DEFS: Record<string, ToolDef> = {
  trendLine: TrendLineTool,
  ray: RayTool,
  extendedLine: ExtendedLineTool,
  horizontalLine: HorizontalLineTool,
  verticalLine: VerticalLineTool,
  fibRetracement: FibRetracementTool,
  rectangle: RectangleTool,
  circle: CircleTool,
  ellipse: EllipseTool,
  triangle: TriangleTool,
  polygon: PolygonTool,
  path: PathTool,
  arrow: ArrowTool,
  text: TextTool,
  longPosition: LongPositionTool,
  shortPosition: ShortPositionTool,
  riskReward: RiskRewardTool,
  measure: MeasureTool,
};

export function getToolDef(id: string): ToolDef | undefined {
  return TOOL_DEFS[id];
}

export const ALL_TOOL_DEFS: ToolDef[] = Object.values(TOOL_DEFS);

export type { ToolDef, DrawingSpec } from './shared';
