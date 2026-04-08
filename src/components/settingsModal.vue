<template>
  <Transition name="fade">
    <div v-if="props.showSettings" class="modal-overlay" @click.self="settings">
      <div class="modal-content fade-up">
        <button class="modal-close" @click="settings">×</button>

        <div class="modal-header">
          <h2 class="modal-title">Settings</h2>
          <p class="modal-subtitle">Manage your application preferences</p>
        </div>

        <div class="settings-section">
          <!-- Appearance -->
          <div class="settings-group">
            <label>Appearance</label>
            <div class="theme-toggle-row">
              <span class="theme-label">
                <svg v-if="props.currentTheme === 'dark'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/></svg>
                <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                {{ props.currentTheme === 'dark' ? 'Dark Mode' : 'Light Mode' }}
              </span>
              <button class="theme-toggle" :class="{ light: props.currentTheme === 'light' }" @click="toggleTheme" :aria-label="props.currentTheme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'">
                <span class="theme-toggle-thumb"></span>
              </button>
            </div>
          </div>

          <div class="settings-group">
            <label>Project Presets</label>
            <div class="preset-toolbar">
              <p class="settings-help">Presets are stored in application data and can be reused across projects.</p>
              <button class="btn-secondary" type="button" @click="addPreset">New Preset</button>
            </div>

            <div v-if="props.hasCurrentProject" class="preset-assignment">
              <span class="preset-assignment-label">Current Project Preset</span>
              <select v-model="projectPresetDraft" class="settings-select">
                <option :value="null">Use app default</option>
                <option v-for="preset in presetDraft.presets" :key="preset.id" :value="preset.id">
                  {{ preset.name }}
                </option>
              </select>
            </div>

            <div class="preset-list">
              <div v-for="(preset, presetIndex) in presetDraft.presets" :key="preset.id" class="preset-card">
                <div class="preset-card-header">
                  <input
                    v-model="preset.name"
                    type="text"
                    class="settings-input preset-name-input"
                    placeholder="Preset name"
                  />
                  <div class="preset-card-actions">
                    <button
                      class="btn-chip"
                      :class="{ active: presetDraft.defaultPresetId === preset.id }"
                      type="button"
                      @click="presetDraft.defaultPresetId = preset.id"
                    >
                      {{ presetDraft.defaultPresetId === preset.id ? 'Default' : 'Set Default' }}
                    </button>
                    <button class="btn-chip btn-chip-danger" type="button" @click="removePreset(presetIndex)">
                      Remove
                    </button>
                  </div>
                </div>

                <div v-if="preset.templates.length > 0" class="template-editor-list">
                  <div v-for="(template, templateIndex) in preset.templates" :key="template.id" class="template-editor">
                    <input
                      v-model="template.name"
                      type="text"
                      class="settings-input"
                      placeholder="Session template name"
                    />
                    <input
                      :value="template.exercises.join(', ')"
                      type="text"
                      class="settings-input"
                      placeholder="Exercises, comma separated"
                      @input="updateTemplateExercises(presetIndex, templateIndex, ($event.target as HTMLInputElement).value)"
                    />
                    <button class="btn-chip btn-chip-danger" type="button" @click="removeTemplate(presetIndex, templateIndex)">
                      Remove
                    </button>
                  </div>
                </div>

                <div v-else class="settings-help">
                  No session templates yet.
                </div>

                <button class="btn-secondary btn-secondary-inline" type="button" @click="addTemplate(presetIndex)">
                  Add Session Template
                </button>
              </div>
            </div>

            <div class="preset-footer">
              <button class="btn-save" type="button" @click="handleSavePresetChanges">
                Save Presets
              </button>
            </div>
          </div>

          <div class="settings-group">
            <label>License Management</label>
            <div class="license-input-wrapper">
              <input
                v-model="licenseKeyInput"
                type="text"
                placeholder="Enter License Key"
                class="license-input"
                :disabled="isChecking"
                @keyup.enter="handleLicenseSubmit"
              />
              <button
                class="btn-activate"
                @click="handleLicenseSubmit"
                :disabled="isChecking || !licenseKeyInput"
              >
                <span v-if="isChecking">Checking...</span>
                <span v-else>{{ isValidLicense ? 'Update' : 'Activate' }}</span>
              </button>
            </div>
            <Transition name="fade">
              <div v-if="licenseError" class="license-msg error">{{ licenseError }}</div>
              <div v-else-if="isValidLicense" class="license-msg success">License active and valid</div>
            </Transition>
          </div>

          <div v-if="isValidLicense" class="settings-actions">
            <button class="btn-deactivate" @click="licenseLogout">Deactivate License</button>
          </div>

          <!-- Upgrade Section -->
          <div v-if="!isPaidLicense" class="settings-footer">
            <div class="divider"><span>Support Us</span></div>
            <button class="btn-buy" @click="buyLicense">
              Get a License
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useLicense } from './../lib/useLicense';
import type { ProjectPresetStore } from '@/lib/useProjectPresets';

interface Props {
  showSettings: boolean,
  currentTheme?: 'dark' | 'light',
  presetStore: ProjectPresetStore,
  currentProjectPresetId?: string | null,
  hasCurrentProject?: boolean,
}

const props = withDefaults(defineProps<Props>(), {
  currentTheme: 'light',
  currentProjectPresetId: null,
  hasCurrentProject: false,
});

const emit = defineEmits<{
  settings: [boolean]
  licenseKey: [string]
  setTheme: ['dark' | 'light']
  'save-presets': [ProjectPresetStore]
  'set-project-preset': [string | null]
}>()

function createId(prefix: string) {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

function syncPresetDraft() {
  presetDraft.value = clonePresetStore(props.presetStore);
  projectPresetDraft.value = props.currentProjectPresetId;
}

const presetDraft = ref<ProjectPresetStore>(clonePresetStore(props.presetStore));
const projectPresetDraft = ref<string | null>(props.currentProjectPresetId);
const licenseKeyInput = ref('');
const {
  licenseKey: storedLicenseKey,
  isValid: isValidLicense,
  isChecking,
  error: licenseError,
  planType,
  validateLicense,
  logout: licenseLogout
} = useLicense();

watch(() => props.showSettings, (isOpen) => {
  if (isOpen) {
    syncPresetDraft();
  }
});

watch(() => props.presetStore, () => {
  if (props.showSettings) {
    syncPresetDraft();
  }
}, { deep: true });

watch(() => props.currentProjectPresetId, (value) => {
  if (props.showSettings) {
    projectPresetDraft.value = value;
  }
});

watch(storedLicenseKey, (value) => {
  licenseKeyInput.value = value ?? '';
}, { immediate: true });

const isPaidLicense = computed(() => {
  if (!isValidLicense.value) return false;
  const plan = planType.value?.toLowerCase();
  return plan === 'creator' || plan === 'studio';
});

async function handleLicenseSubmit() {
  await validateLicense(licenseKeyInput.value);
  emit('licenseKey', licenseKeyInput.value)
}

function addPreset() {
  const presetId = createId('preset');
  presetDraft.value.presets.push({
    id: presetId,
    name: `Preset ${presetDraft.value.presets.length + 1}`,
    templates: [],
  });

  if (!presetDraft.value.defaultPresetId) {
    presetDraft.value.defaultPresetId = presetId;
  }
}

function removePreset(index: number) {
  const [removedPreset] = presetDraft.value.presets.splice(index, 1);
  if (!removedPreset) return;

  if (presetDraft.value.defaultPresetId === removedPreset.id) {
    presetDraft.value.defaultPresetId = presetDraft.value.presets[0]?.id ?? null;
  }

  if (projectPresetDraft.value === removedPreset.id) {
    projectPresetDraft.value = null;
  }
}

function addTemplate(presetIndex: number) {
  const preset = presetDraft.value.presets[presetIndex];
  if (!preset) return;

  preset.templates.push({
    id: createId('template'),
    name: `Session Template ${preset.templates.length + 1}`,
    exercises: [],
  });
}

function removeTemplate(presetIndex: number, templateIndex: number) {
  presetDraft.value.presets[presetIndex]?.templates.splice(templateIndex, 1);
}

function updateTemplateExercises(presetIndex: number, templateIndex: number, value: string) {
  const template = presetDraft.value.presets[presetIndex]?.templates[templateIndex];
  if (!template) return;
  template.exercises = value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function handleSavePresetChanges() {
  emit('save-presets', clonePresetStore(presetDraft.value));
  if (props.hasCurrentProject) {
    emit('set-project-preset', projectPresetDraft.value);
  }
}

async function buyLicense() {
  const url = import.meta.env.VITE_LICENSE_URL || 'https://embodi.ecolizard.com/#pricing';
  console.log('Buy License clicked - opening:', url);

  if (!(window as any).electronAPI?.openExternal) {
    console.error('CRITICAL: electronAPI.openExternal is missing! Please restart the application.');
    return;
  }

  try {
    const result = await (window as any).electronAPI.openExternal(url);
    console.log('Open External Result:', result);
    if (result && !result.ok) {
      console.error('System failed to open URL:', result.error);
    }
  } catch (err) {
    console.error('IPC invocation failed:', err);
  }
}

function settings() {
  emit('settings', !props.showSettings)
}

function toggleTheme() {
  const next = props.currentTheme === 'dark' ? 'light' : 'dark';
  emit('setTheme', next);
}

</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(12px);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}


.modal-content {
  background: var(--modal-bg);
  border: 1px solid var(--modal-border);
  border-radius: 20px;
  width: 100%;
  max-width: 480px;
  max-height: min(85vh, 860px);
  padding: 32px;
  position: relative;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
  transition: background 0.3s ease, border-color 0.3s ease;
  overflow-y: auto;
}

.modal-close {
  position: absolute;
  top: 20px;
  right: 20px;
  background: none;
  border: none;
  color: var(--close-btn-color);
  font-size: 24px;
  cursor: pointer;
  padding: 4px;
  line-height: 1;
}

.modal-close:hover { color: var(--close-btn-hover); }

.modal-header { margin-bottom: 32px; text-align: center; }
.modal-title { font-size: 24px; margin-bottom: 8px; color: var(--modal-title); }
.modal-subtitle { color: var(--modal-subtitle); font-size: 14px; }

.settings-section { display: flex; flex-direction: column; gap: 24px; }
.settings-group { display: flex; flex-direction: column; gap: 12px; }
.settings-group label { font-size: 14px; font-weight: 600; color: var(--label-color); text-transform: uppercase; letter-spacing: 0.5px; }
.settings-help { margin: 0; font-size: 12px; color: var(--muted); line-height: 1.5; }

.settings-input,
.settings-select {
  width: 100%;
  background: var(--input-bg);
  border: 1px solid var(--input-border);
  border-radius: 10px;
  padding: 12px 14px;
  color: var(--input-color);
  font-size: 14px;
}

.settings-select {
  appearance: none;
}

.preset-toolbar,
.preset-card-header,
.preset-card-actions,
.preset-assignment,
.preset-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.preset-assignment {
  flex-wrap: wrap;
}

.preset-assignment-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--fg);
}

.preset-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.preset-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--input-border);
  border-radius: 14px;
}

:global([data-theme="light"]) .preset-card {
  background: rgba(31, 78, 121, 0.03);
}

.preset-name-input {
  font-weight: 600;
}

.template-editor-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.template-editor {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr) auto;
  gap: 10px;
  align-items: center;
}

.btn-secondary,
.btn-save,
.btn-chip {
  border: 1px solid var(--input-border);
  border-radius: 10px;
  padding: 10px 14px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease, opacity 0.2s ease;
}

.btn-secondary,
.btn-chip {
  background: transparent;
  color: var(--fg);
}

.btn-secondary:hover,
.btn-chip:hover {
  border-color: var(--accent);
}

.btn-secondary-inline {
  align-self: flex-start;
}

.btn-save {
  background: var(--accent);
  color: #0b0f14;
  border-color: transparent;
}

.btn-chip {
  padding: 8px 12px;
}

.btn-chip.active {
  background: rgba(107, 230, 117, 0.14);
  border-color: rgba(107, 230, 117, 0.32);
}

.btn-chip-danger {
  color: #ff8b8b;
}

.btn-chip-danger:hover {
  border-color: rgba(255, 59, 48, 0.45);
}

.license-input-wrapper { display: flex; gap: 12px; }

.license-input {
  flex: 1;
  background: var(--input-bg);
  border: 1px solid var(--input-border);
  border-radius: 10px;
  padding: 12px 16px;
  color: var(--input-color);
  font-family: monospace;
  font-size: 16px;
  transition: background 0.3s ease, border-color 0.3s ease, color 0.3s ease;
}

.license-input::placeholder {
  color: var(--muted);
}

.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.fade-up { animation: fadeUp 0.4s ease-out; }
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.btn-activate {
  background: var(--accent);
  color: #0b0f14;
  border: none;
  border-radius: 10px;
  padding: 0 20px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}

.btn-activate:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-deactivate {
  background: transparent;
  border: 1px solid rgba(255, 59, 48, 0.3);
  color: #ff3b30;
  border-radius: 10px;
  padding: 10px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-deactivate:hover { background: rgba(255, 59, 48, 0.1); border-color: #ff3b30; }

.btn-buy {
  background: rgba(107, 230, 117, 0.1);
  border: 1px solid rgba(107, 230, 117, 0.2);
  color: #6be675;
  border-radius: 12px;
  padding: 14px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  transition: all 0.2s ease;
}


.btn-buy:hover {
  background: rgba(107, 230, 117, 0.15);
  border-color: #6be675;
  transform: translateY(-1px);
}

:global([data-theme="light"]) .btn-buy:hover {
  background: rgba(46, 134, 193, 0.15);
  border-color: #2E86C1;
}

.license-msg { font-size: 13px; margin-top: 4px; }
.license-msg.error { color: #ff9a5c; }
.license-msg.success { color: var(--accent); }

.license-badge-container.clickable:hover .upgrade-action {
  transform: translateX(2px);
  filter: brightness(1.1);
  box-shadow: 0 4px 15px rgba(107, 230, 117, 0.4);
}

.settings-footer {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.divider {
  display: flex;
  align-items: center;
  text-align: center;
  color: var(--divider-color);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.divider::before, .divider::after {
  content: '';
  flex: 1;
  border-bottom: 1px solid var(--divider-line);
}

.divider:not(:empty)::before { margin-right: 12px; }
.divider:not(:empty)::after { margin-left: 12px; }

/* ── Theme Toggle ── */
.theme-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: var(--input-bg);
  border: 1px solid var(--input-border);
  border-radius: 12px;
  transition: background 0.3s ease;
}

.theme-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--fg);
}

.theme-toggle {
  position: relative;
  width: 48px;
  height: 26px;
  border: none;
  border-radius: 13px;
  background: var(--theme-toggle-track);
  cursor: pointer;
  transition: background 0.3s ease;
  padding: 0;
  flex-shrink: 0;
}

.theme-toggle.light {
  background: linear-gradient(135deg, #2E86C1, #1F4E79);
}

.theme-toggle-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--theme-toggle-thumb);
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), background 0.3s ease;
  box-shadow: 0 1px 4px rgba(0,0,0,0.3);
}

.theme-toggle.light .theme-toggle-thumb {
  transform: translateX(22px);
  background: #ffffff;
}

@media (max-width: 720px) {
  .modal-content {
    max-width: calc(100vw - 24px);
    padding: 24px;
  }

  .preset-toolbar,
  .preset-card-header,
  .preset-card-actions,
  .preset-assignment,
  .preset-footer {
    align-items: stretch;
    flex-direction: column;
  }

  .template-editor {
    grid-template-columns: 1fr;
  }

  .btn-secondary,
  .btn-save,
  .btn-chip {
    width: 100%;
  }
}

</style>
