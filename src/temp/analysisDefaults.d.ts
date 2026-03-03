declare module '@/temp/analysisDefaults.js' {
  export interface MetricCategory {
    key: string;
    label: string;
  }

  export interface MetricTemplate {
    title: string;
    unit: string;
    chartType: 'line' | 'boxplot';
    size: 'wide' | 'small';
    xLabels?: string[];
    values?: number[];
    yMin: number;
    yMax: number;
    categories?: string[];
    stats?: number[][];
    accent: string;
    areaStart?: string;
    areaEnd?: string;
    fill?: string;
  }

  export const METRIC_CATEGORIES: MetricCategory[];
  export const METRIC_TEMPLATES: Record<string, MetricTemplate[]>;
  export function getMetricTemplates(categoryKey: string): MetricTemplate[];
  export function buildMetricChartOption(metric: MetricTemplate, echarts: any): any;
}
