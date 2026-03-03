const frames = (count) => Array.from({ length: count }, (_, i) => `F${i + 1}`);

export const METRIC_CATEGORIES = [
  { key: 'gait', label: 'Gait' },
  { key: 'throwing', label: 'Throwing' },
  { key: 'flexibility', label: 'Flexibility' },
];

export const METRIC_TEMPLATES = {
  gait: [
    {
      title: 'Left Knee Flexion',
      unit: 'deg / frame',
      chartType: 'line',
      size: 'wide',
      xLabels: frames(20),
      values: [41, 43, 46, 49, 45, 47, 50, 54, 56, 52, 51, 55, 58, 60, 57, 59, 62, 61, 58, 56],
      yMin: 35,
      yMax: 65,
      accent: '#5db2ff',
      areaStart: 'rgba(86, 179, 255, 0.35)',
      areaEnd: 'rgba(86, 179, 255, 0.02)',
    },
    {
      title: 'Stride Length Distribution',
      unit: 'cm',
      chartType: 'boxplot',
      size: 'small',
      categories: ['Patient A'],
      stats: [[58, 63, 69, 74, 81]],
      yMin: 55,
      yMax: 85,
      accent: '#f7c469',
      fill: 'rgba(247, 196, 105, 0.2)',
    },
    {
      title: 'Cadence Stability',
      unit: 'steps/min',
      chartType: 'line',
      size: 'small',
      xLabels: frames(16),
      values: [104, 105, 107, 109, 108, 110, 111, 110, 112, 113, 114, 112, 113, 115, 114, 116],
      yMin: 100,
      yMax: 120,
      accent: '#76d8b0',
      areaStart: 'rgba(118, 216, 176, 0.35)',
      areaEnd: 'rgba(118, 216, 176, 0.02)',
    },
  ],
  throwing: [
    {
      title: 'Shoulder External Rotation',
      unit: 'deg',
      chartType: 'line',
      size: 'wide',
      xLabels: frames(18),
      values: [74, 76, 80, 84, 88, 91, 94, 96, 99, 102, 100, 98, 95, 92, 89, 86, 82, 79],
      yMin: 65,
      yMax: 110,
      accent: '#ff8f70',
      areaStart: 'rgba(255, 143, 112, 0.35)',
      areaEnd: 'rgba(255, 143, 112, 0.02)',
    },
    {
      title: 'Release Velocity Spread',
      unit: 'm/s',
      chartType: 'boxplot',
      size: 'small',
      categories: ['Set 1'],
      stats: [[28, 31, 34, 37, 41]],
      yMin: 24,
      yMax: 44,
      accent: '#f9b45e',
      fill: 'rgba(249, 180, 94, 0.2)',
    },
    {
      title: 'Elbow Extension Timing',
      unit: 'ms',
      chartType: 'line',
      size: 'small',
      xLabels: frames(14),
      values: [182, 178, 176, 172, 169, 165, 163, 161, 159, 162, 164, 166, 170, 173],
      yMin: 150,
      yMax: 190,
      accent: '#e3a1ff',
      areaStart: 'rgba(227, 161, 255, 0.3)',
      areaEnd: 'rgba(227, 161, 255, 0.02)',
    },
  ],
  flexibility: [
    {
      title: 'Hamstring ROM',
      unit: 'deg',
      chartType: 'line',
      size: 'wide',
      xLabels: frames(15),
      values: [42, 43, 44, 46, 47, 49, 50, 52, 53, 55, 54, 56, 57, 59, 60],
      yMin: 38,
      yMax: 64,
      accent: '#86d0ff',
      areaStart: 'rgba(134, 208, 255, 0.32)',
      areaEnd: 'rgba(134, 208, 255, 0.02)',
    },
    {
      title: 'Sit-and-Reach Distribution',
      unit: 'cm',
      chartType: 'boxplot',
      size: 'small',
      categories: ['Session'],
      stats: [[17, 20, 24, 27, 31]],
      yMin: 12,
      yMax: 34,
      accent: '#ffd27d',
      fill: 'rgba(255, 210, 125, 0.2)',
    },
    {
      title: 'Ankle Dorsiflexion',
      unit: 'deg',
      chartType: 'line',
      size: 'small',
      xLabels: frames(12),
      values: [11, 12, 12, 13, 14, 15, 15, 16, 17, 17, 18, 19],
      yMin: 8,
      yMax: 22,
      accent: '#82ebb7',
      areaStart: 'rgba(130, 235, 183, 0.32)',
      areaEnd: 'rgba(130, 235, 183, 0.02)',
    },
  ],
};

export function getMetricTemplates(categoryKey) {
  return METRIC_TEMPLATES[categoryKey] ?? [];
}

function getLineChartOption(metric, echarts) {
  const axis = metric.xLabels ?? frames(metric.values?.length ?? 0);
  return {
    backgroundColor: 'transparent',
    grid: { left: 44, right: 18, top: 20, bottom: 36 },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(15, 24, 35, 0.95)',
      borderColor: 'rgba(150, 199, 255, 0.35)',
      textStyle: { color: '#e8f2ff' },
    },
    xAxis: {
      type: 'category',
      data: axis,
      boundaryGap: false,
      axisLabel: { color: 'rgba(230, 237, 243, 0.6)', fontSize: 11 },
      axisLine: { lineStyle: { color: 'rgba(230, 237, 243, 0.25)' } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      min: metric.yMin,
      max: metric.yMax,
      axisLabel: { color: 'rgba(230, 237, 243, 0.6)', fontSize: 11 },
      splitLine: { lineStyle: { color: 'rgba(114, 146, 178, 0.2)' } },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [
      {
        type: 'line',
        data: metric.values ?? [],
        smooth: true,
        showSymbol: true,
        symbolSize: 6,
        lineStyle: { width: 3, color: metric.accent },
        itemStyle: { color: '#dff2ff', borderColor: metric.accent, borderWidth: 1 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: metric.areaStart ?? 'rgba(120, 191, 255, 0.35)' },
            { offset: 1, color: metric.areaEnd ?? 'rgba(120, 191, 255, 0.02)' },
          ]),
        },
      },
    ],
  };
}

function getBoxChartOption(metric) {
  const stats = metric.stats ?? [[0, 0, 0, 0, 0]];
  return {
    backgroundColor: 'transparent',
    grid: { left: 44, right: 18, top: 20, bottom: 38 },
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(15, 24, 35, 0.95)',
      borderColor: `${metric.accent}66`,
      textStyle: { color: '#fff5de' },
      formatter: (params) => {
        const values = params?.data;
        if (!values || values.length < 5) return '';
        return [
          metric.title,
          `Min: ${values[0]} ${metric.unit}`,
          `Q1: ${values[1]} ${metric.unit}`,
          `Median: ${values[2]} ${metric.unit}`,
          `Q3: ${values[3]} ${metric.unit}`,
          `Max: ${values[4]} ${metric.unit}`,
        ].join('<br/>');
      },
    },
    xAxis: {
      type: 'category',
      data: metric.categories ?? ['Sample'],
      axisLabel: { color: 'rgba(230, 237, 243, 0.65)', fontSize: 11 },
      axisLine: { lineStyle: { color: 'rgba(230, 237, 243, 0.25)' } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      min: metric.yMin,
      max: metric.yMax,
      axisLabel: { color: 'rgba(230, 237, 243, 0.65)', fontSize: 11 },
      splitLine: { lineStyle: { color: 'rgba(114, 146, 178, 0.2)' } },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [
      {
        type: 'boxplot',
        data: stats,
        itemStyle: {
          color: metric.fill ?? 'rgba(247, 196, 105, 0.2)',
          borderColor: metric.accent,
          borderWidth: 2,
        },
      },
    ],
  };
}

export function buildMetricChartOption(metric, echarts) {
  if (metric.chartType === 'boxplot') return getBoxChartOption(metric);
  return getLineChartOption(metric, echarts);
}
