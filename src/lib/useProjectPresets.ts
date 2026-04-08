import { computed, ref } from 'vue';

export interface ProjectSessionTemplate {
  id: string;
  name: string;
  exercises: string[];
}

export interface ProjectPreset {
  id: string;
  name: string;
  templates: ProjectSessionTemplate[];
}

export interface ProjectPresetStore {
  defaultPresetId: string | null;
  presets: ProjectPreset[];
}

function createId(prefix: string) {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createDefaultPresetStore(): ProjectPresetStore {
  return {
    defaultPresetId: 'preset-standard',
    presets: [{
      id: 'preset-standard',
      name: 'Standard Capture',
      templates: [
        { id: 'template-baseline', name: 'Baseline', exercises: ['Static calibration'] },
        { id: 'template-walk', name: 'Walking Trial', exercises: ['Walk', 'Turn', 'Return'] },
        { id: 'template-balance', name: 'Balance Trial', exercises: ['Single leg stance'] },
      ],
    }],
  };
}

function sanitizeTemplate(template: Partial<ProjectSessionTemplate> | null | undefined, index: number): ProjectSessionTemplate {
  return {
    id: template?.id || createId(`template-${index + 1}`),
    name: typeof template?.name === 'string' && template.name.trim()
      ? template.name.trim()
      : `Template ${index + 1}`,
    exercises: Array.isArray(template?.exercises)
      ? template.exercises.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [],
  };
}

function sanitizePreset(preset: Partial<ProjectPreset> | null | undefined, index: number): ProjectPreset {
  return {
    id: preset?.id || createId(`preset-${index + 1}`),
    name: typeof preset?.name === 'string' && preset.name.trim()
      ? preset.name.trim()
      : `Preset ${index + 1}`,
    templates: Array.isArray(preset?.templates)
      ? preset.templates.map((template, templateIndex) => sanitizeTemplate(template, templateIndex))
      : [],
  };
}

function sanitizePresetStore(raw: Partial<ProjectPresetStore> | null | undefined): ProjectPresetStore {
  const fallback = createDefaultPresetStore();
  const presets = Array.isArray(raw?.presets) && raw.presets.length > 0
    ? raw.presets.map((preset, index) => sanitizePreset(preset, index))
    : fallback.presets;
  const defaultPresetId = typeof raw?.defaultPresetId === 'string' && presets.some((preset) => preset.id === raw.defaultPresetId)
    ? raw.defaultPresetId
    : presets[0]?.id ?? null;

  return { defaultPresetId, presets };
}

function clonePresetStore(store: ProjectPresetStore): ProjectPresetStore {
  return {
    defaultPresetId: store.defaultPresetId,
    presets: store.presets.map((preset) => ({
      id: preset.id,
      name: preset.name,
      templates: preset.templates.map((template) => ({
        id: template.id,
        name: template.name,
        exercises: [...template.exercises],
      })),
    })),
  };
}

const presetStore = ref<ProjectPresetStore>(createDefaultPresetStore());
const isPresetStoreLoaded = ref(false);

async function loadPresetStore() {
  const result = await window.ipc?.presetStoreLoad?.();
  presetStore.value = sanitizePresetStore(result?.store);
  isPresetStoreLoaded.value = true;
  return presetStore.value;
}

async function savePresetStore(nextStore: ProjectPresetStore) {
  const sanitized = sanitizePresetStore(nextStore);
  if (window.ipc?.presetStoreSave) {
    const result = await window.ipc.presetStoreSave(sanitized);
    if (!result?.ok) {
      return { ok: false, error: result?.error ?? 'Unable to save preset store.' };
    }
    presetStore.value = sanitizePresetStore(result.store);
    return { ok: true, store: presetStore.value };
  }

  presetStore.value = sanitized;
  return { ok: true, store: presetStore.value };
}

export function useProjectPresets() {
  return {
    presetStore,
    isPresetStoreLoaded,
    presets: computed(() => presetStore.value.presets),
    defaultPresetId: computed(() => presetStore.value.defaultPresetId),
    loadPresetStore,
    savePresetStore,
    sanitizePresetStore,
    clonePresetStore,
    createId,
  };
}
