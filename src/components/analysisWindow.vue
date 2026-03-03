<template>
  <section class="analysis-window">
    <header class="analysis-header">
      <div class="analysis-title-block">
        <h2>Biomechanics Analysis</h2>
        <p>Session Snapshot</p>
        <div class="metric-categories">
          <button
            v-for="category in categoryOptions"
            :key="category.key"
            class="metric-category-btn"
            :class="{ active: activeCategory === category.key }"
            type="button"
            @click="selectCategory(category.key)"
          >
            {{ category.label }}
          </button>
        </div>
      </div>

      <div class="analysis-actions">
        <span class="analysis-chip">{{ activeCategoryLabel }}</span>
      </div>
    </header>

    <div class="analysis-grid">
      <article
        v-for="card in chartCards"
        :key="card.id"
        class="analysis-card"
        :class="`size-${card.size}`"
        :data-template-data="serializeTemplateData(card.templateData)"
      >
        <div class="card-head">
          <h3>{{ card.title }}</h3>
          <div class="card-head-actions">
            <span>{{ card.unit }}</span>
            <button class="remove-chart-btn" type="button" :aria-label="`Remove ${card.title}`" @click="removeChart(card.id)">
              x
            </button>
          </div>
        </div>
        <div :ref="(el) => setChartHost(card.id, el)" class="chart-host"></div>
      </article>
    </div>

    <div ref="addChartDockRef" class="add-chart-dock">
      <Transition name="add-chart-modal">
        <div
          v-if="showAddChartModal"
          id="add-chart-modal"
          class="add-chart-modal"
          role="dialog"
          aria-label="Choose chart layout"
        >
          <button
            v-for="option in addChartOptions"
            :key="option.id"
            class="chart-option-btn"
            type="button"
            @click="selectAddChartOption(option)"
          >
            <span class="chart-option-graphic" :class="[`type-${option.chartType}`, `size-${option.size}`]" aria-hidden="true">
              <svg
                v-if="option.chartType === 'line'"
                class="chart-preview chart-preview-line"
                viewBox="0 0 120 48"
              >
                <path class="area" d="M8 37 L28 24 L48 28 L70 14 L90 20 L112 11 L112 42 L8 42 Z" />
                <polyline class="trend" points="8,37 28,24 48,28 70,14 90,20 112,11" />
                <circle class="point" cx="70" cy="14" r="2.2" />
                <circle class="point" cx="90" cy="20" r="2.2" />
              </svg>
              <svg
                v-else
                class="chart-preview chart-preview-box"
                viewBox="0 0 120 48"
              >
                <line class="whisker" x1="20" y1="10" x2="20" y2="38" />
                <line class="whisker" x1="92" y1="12" x2="92" y2="40" />
                <line class="cap" x1="14" y1="10" x2="26" y2="10" />
                <line class="cap" x1="14" y1="38" x2="26" y2="38" />
                <line class="cap" x1="86" y1="12" x2="98" y2="12" />
                <line class="cap" x1="86" y1="40" x2="98" y2="40" />
                <rect class="box" x="34" y="18" width="44" height="16" rx="3" />
                <line class="median" x1="56" y1="18" x2="56" y2="34" />
              </svg>
            </span>
            <span class="chart-option-text">
              <span class="chart-option-title">{{ option.label }}</span>
              <span class="chart-option-subtitle">{{ option.subtitle }}</span>
            </span>
          </button>
        </div>
      </Transition>

      <button
        ref="addChartButtonRef"
        class="add-chart-btn"
        type="button"
        aria-label="Add chart"
        aria-haspopup="dialog"
        aria-controls="add-chart-modal"
        :aria-expanded="showAddChartModal"
        @click="toggleAddChartModal"
      >
        <span class="add-chart-icon">+</span>
        <span>Add Chart</span>
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import * as echarts from 'echarts';
import { METRIC_CATEGORIES, buildMetricChartOption, getMetricTemplates } from '@/temp/analysisDefaults.js';
import type { MetricTemplate } from '@/temp/analysisDefaults.js';

interface ChartCard extends MetricTemplate {
  id: string;
  templateData: MetricTemplate;
}

interface AddChartOption {
  id: string;
  chartType: MetricTemplate['chartType'];
  size: MetricTemplate['size'];
  label: string;
  subtitle: string;
}

const addChartOptions: AddChartOption[] = [
  { id: 'wide-line', chartType: 'line', size: 'wide', label: 'Wide Line Chart', subtitle: 'Full-width trend' },
  { id: 'small-line', chartType: 'line', size: 'small', label: 'Small Line Chart', subtitle: 'Compact trend' },
  { id: 'wide-box', chartType: 'boxplot', size: 'wide', label: 'Wide Box Plot', subtitle: 'Full-width spread' },
  { id: 'small-box', chartType: 'boxplot', size: 'small', label: 'Small Box Plot', subtitle: 'Compact spread' },
];

const categoryOptions = METRIC_CATEGORIES;
const activeCategory = ref(categoryOptions[0]?.key ?? 'gait');
const categoryCursor = ref(0);
const categoryCursorByType = ref<Record<MetricTemplate['chartType'], number>>({ line: 0, boxplot: 0 });
const chartCards = ref<ChartCard[]>([]);
const showAddChartModal = ref(false);
const addChartDockRef = ref<HTMLDivElement | null>(null);
const addChartButtonRef = ref<HTMLButtonElement | null>(null);

const chartHosts = new Map<string, HTMLDivElement>();
const chartInstances = new Map<string, echarts.ECharts>();
let hostResizeObserver: ResizeObserver | null = null;

const activeCategoryLabel = computed(
  () => categoryOptions.find((option) => option.key === activeCategory.value)?.label ?? activeCategory.value,
);

function nextMetricTemplate(chartType?: MetricTemplate['chartType']): MetricTemplate | null {
  const templates = chartType
    ? getMetricTemplates(activeCategory.value).filter((template) => template.chartType === chartType)
    : getMetricTemplates(activeCategory.value);

  if (templates.length === 0) return null;

  if (!chartType) {
    const template = templates[categoryCursor.value % templates.length];
    categoryCursor.value += 1;
    return template;
  }

  const cursor = categoryCursorByType.value[chartType] ?? 0;
  const template = templates[cursor % templates.length];
  categoryCursorByType.value[chartType] = cursor + 1;
  return template;
}

function cloneMetricTemplate(template: MetricTemplate): MetricTemplate {
  return {
    ...template,
    xLabels: template.xLabels ? [...template.xLabels] : undefined,
    values: template.values ? [...template.values] : undefined,
    categories: template.categories ? [...template.categories] : undefined,
    stats: template.stats ? template.stats.map((stat) => [...stat]) : undefined,
  };
}

function buildCard(template: MetricTemplate): ChartCard {
  const templateData = cloneMetricTemplate(template);
  return {
    ...cloneMetricTemplate(template),
    id: `${activeCategory.value}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    templateData,
  };
}

function serializeTemplateData(templateData: MetricTemplate): string {
  return JSON.stringify(templateData);
}

function ensureHostResizeObserver() {
  if (hostResizeObserver || typeof ResizeObserver === 'undefined') return;

  hostResizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      if (entry.contentRect.width <= 0 || entry.contentRect.height <= 0) continue;
      const host = entry.target;
      if (!(host instanceof HTMLDivElement)) continue;
      const id = host.dataset.chartId;
      if (!id) continue;
      const card = chartCards.value.find((item) => item.id === id);
      if (card) renderChart(card);
    }
  });
}

function setChartHost(id: string, element: Element | null) {
  if (element instanceof HTMLDivElement) {
    ensureHostResizeObserver();
    element.dataset.chartId = id;
    hostResizeObserver?.observe(element);
    chartHosts.set(id, element);
    const card = chartCards.value.find((item) => item.id === id);
    if (card) renderChart(card);
    return;
  }
  const host = chartHosts.get(id);
  if (host) {
    hostResizeObserver?.unobserve(host);
    delete host.dataset.chartId;
  }
  chartHosts.delete(id);
  disposeChart(id);
}

function renderChart(card: ChartCard) {
  const host = chartHosts.get(card.id);
  if (!host) return;
  if (host.clientWidth <= 0 || host.clientHeight <= 0) return;
  let chart = chartInstances.get(card.id);
  if (!chart) {
    chart = echarts.init(host);
    chartInstances.set(card.id, chart);
  } else {
    chart.resize();
  }
  chart.setOption(buildMetricChartOption(card, echarts), { notMerge: true });
}

function renderAllCharts() {
  chartCards.value.forEach((card) => renderChart(card));
}

function disposeChart(id: string) {
  const chart = chartInstances.get(id);
  if (!chart) return;
  chart.dispose();
  chartInstances.delete(id);
}

function disposeAllCharts() {
  for (const id of Array.from(chartInstances.keys())) {
    disposeChart(id);
  }
}

function addChart(chartType?: MetricTemplate['chartType'], size?: MetricTemplate['size']) {
  const template = nextMetricTemplate(chartType);
  if (!template) return;
  const chartTemplate = size ? { ...template, size } : template;
  chartCards.value.push(buildCard(chartTemplate));
  nextTick(() => renderAllCharts());
}

function removeChart(id: string) {
  const host = chartHosts.get(id);
  if (host) {
    hostResizeObserver?.unobserve(host);
    delete host.dataset.chartId;
  }
  chartCards.value = chartCards.value.filter((card) => card.id !== id);
  chartHosts.delete(id);
  disposeChart(id);
}

function closeAddChartModal() {
  showAddChartModal.value = false;
}

function toggleAddChartModal() {
  showAddChartModal.value = !showAddChartModal.value;
}

function selectAddChartOption(option: AddChartOption) {
  addChart(option.chartType, option.size);
  closeAddChartModal();
}

function seedCategory() {
  chartCards.value = [];
  chartHosts.clear();
  disposeAllCharts();
  categoryCursor.value = 0;
  categoryCursorByType.value = { line: 0, boxplot: 0 };
  addChart('line', 'wide');
  addChart('boxplot', 'small');
}

function handleDocumentPointerDown(event: PointerEvent) {
  if (!showAddChartModal.value) return;
  const dock = addChartDockRef.value;
  if (!dock) return;
  if (event.target instanceof Node && !dock.contains(event.target)) {
    closeAddChartModal();
  }
}

function handleDocumentKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !showAddChartModal.value) return;
  closeAddChartModal();
  addChartButtonRef.value?.focus();
}

function selectCategory(key: string) {
  if (key === activeCategory.value) return;
  activeCategory.value = key;
  closeAddChartModal();
  seedCategory();
}

function handleResize() {
  chartInstances.forEach((chart) => chart.resize());
}

onMounted(() => {
  ensureHostResizeObserver();
  seedCategory();
  window.addEventListener('resize', handleResize);
  window.addEventListener('pointerdown', handleDocumentPointerDown);
  window.addEventListener('keydown', handleDocumentKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize);
  window.removeEventListener('pointerdown', handleDocumentPointerDown);
  window.removeEventListener('keydown', handleDocumentKeydown);
  hostResizeObserver?.disconnect();
  hostResizeObserver = null;
  disposeAllCharts();
  chartHosts.clear();
});
</script>

<style scoped>
.analysis-window {
  position: absolute;
  inset: 63px 250px 0 220px;
  padding: 16px 16px 86px;
  overflow: auto;
  background: radial-gradient(120% 120% at 15% 0%, rgba(45, 87, 138, 0.15) 0%, rgba(8, 13, 20, 0.95) 62%);
}

.analysis-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}

.analysis-title-block h2 {
  margin: 0;
  font-size: 1.1rem;
  color: #f2f6fa;
}

.analysis-title-block p {
  margin: 2px 0 10px;
  font-size: 0.82rem;
  color: rgba(255, 255, 255, 0.55);
}

.metric-categories {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.metric-category-btn {
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(12, 20, 30, 0.6);
  color: rgba(230, 237, 243, 0.82);
  padding: 5px 10px;
  border-radius: 999px;
  font-size: 0.76rem;
  font-weight: 600;
  cursor: pointer;
}

.metric-category-btn.active {
  color: #0d1722;
  border-color: rgba(128, 215, 255, 0.8);
  background: rgba(128, 215, 255, 0.9);
}

.analysis-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.analysis-chip {
  padding: 5px 10px;
  border-radius: 999px;
  font-size: 0.7rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #a2ffd8;
  border: 1px solid rgba(97, 232, 170, 0.4);
  background: rgba(69, 212, 163, 0.12);
}

.add-chart-dock {
  position: absolute;
  left: 50%;
  bottom: 16px;
  transform: translateX(-50%);
  z-index: 8;
  display: flex;
  align-items: center;
}

.add-chart-modal {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 10px);
  transform: translateX(-50%);
  width: min(560px, calc(100vw - 120px));
  padding: 12px;
  border-radius: 14px;
  border: 1px solid rgba(140, 235, 175, 0.34);
  background: linear-gradient(160deg, rgba(13, 26, 36, 0.96), rgba(11, 18, 27, 0.94));
  box-shadow: 0 16px 34px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(180, 255, 210, 0.12);
  backdrop-filter: blur(12px);
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.chart-option-btn {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  border: 1px solid rgba(145, 230, 176, 0.25);
  background: rgba(20, 33, 46, 0.75);
  color: #e7fff0;
  border-radius: 10px;
  padding: 10px;
  text-align: left;
  cursor: pointer;
  transition: transform 0.14s ease, border-color 0.18s ease, background-color 0.18s ease;
}

.chart-option-btn:hover {
  transform: translateY(-1px);
  border-color: rgba(151, 243, 187, 0.52);
  background: rgba(26, 43, 59, 0.88);
}

.chart-option-btn:focus-visible {
  outline: 2px solid rgba(151, 243, 187, 0.9);
  outline-offset: 2px;
}

.chart-option-graphic {
  height: 56px;
  border-radius: 8px;
  border: 1px solid rgba(143, 212, 255, 0.2);
  background: linear-gradient(180deg, rgba(26, 45, 64, 0.7), rgba(16, 30, 44, 0.55));
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.chart-preview {
  width: 88px;
  height: 34px;
}

.chart-option-graphic.size-wide .chart-preview {
  width: 114px;
}

.chart-option-graphic.size-small .chart-preview {
  width: 82px;
}

.chart-preview-line .area {
  fill: rgba(104, 194, 255, 0.2);
}

.chart-option-graphic.type-line .chart-preview-line .trend {
  fill: none;
  stroke: #7bc8ff;
  stroke-width: 3;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.chart-option-graphic.type-line .chart-preview-line .point {
  fill: #d8f5ff;
  stroke: #7bc8ff;
  stroke-width: 1.2;
}

.chart-option-graphic.type-boxplot .chart-preview-box .whisker,
.chart-option-graphic.type-boxplot .chart-preview-box .cap,
.chart-option-graphic.type-boxplot .chart-preview-box .median {
  stroke: #f8ce84;
  stroke-width: 2.4;
  stroke-linecap: round;
}

.chart-option-graphic.type-boxplot .chart-preview-box .box {
  fill: rgba(247, 196, 105, 0.22);
  stroke: #f8ce84;
  stroke-width: 2.2;
}

.chart-option-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.chart-option-title {
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.01em;
}

.chart-option-subtitle {
  font-size: 0.67rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: rgba(204, 228, 214, 0.73);
}

.add-chart-modal-enter-active,
.add-chart-modal-leave-active {
  transition: opacity 0.18s ease, transform 0.22s cubic-bezier(0.2, 0.7, 0.2, 1);
}

.add-chart-modal-enter-from,
.add-chart-modal-leave-to {
  opacity: 0;
  transform: translate(-50%, 8px) scale(0.96);
}

.add-chart-modal-enter-to,
.add-chart-modal-leave-from {
  opacity: 1;
  transform: translate(-50%, 0) scale(1);
}

.add-chart-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid rgba(103, 233, 148, 0.55);
  background: linear-gradient(135deg, rgba(74, 184, 120, 0.28), rgba(58, 140, 95, 0.2));
  color: #d6ffe6;
  padding: 7px 13px;
  border-radius: 10px;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.02em;
  cursor: pointer;
  box-shadow: 0 8px 22px rgba(50, 138, 89, 0.28), inset 0 1px 0 rgba(210, 255, 228, 0.15);
  transition: transform 0.15s ease, box-shadow 0.2s ease, filter 0.2s ease, border-color 0.2s ease;
}

.add-chart-icon {
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  font-size: 0.92rem;
  line-height: 1;
  background: rgba(215, 255, 230, 0.16);
  border: 1px solid rgba(215, 255, 230, 0.36);
}

.add-chart-btn:hover {
  transform: translateY(-1px);
  filter: brightness(1.05);
  border-color: rgba(130, 241, 173, 0.75);
  box-shadow: 0 12px 24px rgba(52, 155, 101, 0.32), inset 0 1px 0 rgba(220, 255, 235, 0.25);
}

.add-chart-btn:active {
  transform: translateY(0);
  filter: brightness(0.98);
}

.add-chart-btn:focus-visible {
  outline: 2px solid rgba(130, 241, 173, 0.85);
  outline-offset: 2px;
}

.analysis-grid {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 12px;
  align-items: start;
}

.analysis-card {
  grid-column: span 6;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  background: rgba(14, 24, 36, 0.7);
  backdrop-filter: blur(6px);
  padding: 12px;
}

.analysis-card.size-wide {
  grid-column: span 12;
}

.analysis-card.size-small {
  grid-column: span 6;
}

.card-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 6px;
}

.card-head-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.card-head h3 {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
}

.card-head span {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.55);
}

.remove-chart-btn {
  width: 22px;
  height: 22px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(13, 22, 33, 0.65);
  color: rgba(236, 246, 255, 0.86);
  font-size: 0.86rem;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  transition: border-color 0.15s ease, background-color 0.15s ease, transform 0.15s ease;
}

.remove-chart-btn:hover {
  border-color: rgba(255, 128, 128, 0.55);
  background: rgba(65, 24, 24, 0.7);
  transform: translateY(-1px);
}

.remove-chart-btn:active {
  transform: translateY(0);
}

.remove-chart-btn:focus-visible {
  outline: 2px solid rgba(255, 128, 128, 0.75);
  outline-offset: 2px;
}

.chart-host {
  width: 100%;
  height: 235px;
}

.analysis-card.size-wide .chart-host {
  height: 300px;
}

@media (max-width: 1200px) {
  .analysis-card,
  .analysis-card.size-small,
  .analysis-card.size-wide {
    grid-column: span 12;
  }
}

@media (max-width: 768px) {
  .analysis-window {
    inset: 63px 0 0 0;
    padding: 12px 12px 78px;
  }

  .analysis-header {
    flex-direction: column;
    align-items: stretch;
  }

  .analysis-actions {
    justify-content: space-between;
  }

  .add-chart-dock {
    bottom: 12px;
  }

  .add-chart-modal {
    width: min(540px, calc(100vw - 28px));
    bottom: calc(100% + 8px);
    padding: 10px;
    gap: 8px;
  }

  .chart-option-btn {
    padding: 8px;
    gap: 6px;
  }

  .chart-option-graphic {
    height: 48px;
  }

  .chart-option-graphic.size-wide .chart-preview {
    width: 98px;
  }

  .chart-option-graphic.size-small .chart-preview {
    width: 74px;
  }
}
</style>
