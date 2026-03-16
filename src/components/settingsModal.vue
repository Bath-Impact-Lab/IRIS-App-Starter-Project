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
import { onMounted, onBeforeUnmount, ref, watch, nextTick, computed } from 'vue';
import { useLicense } from './../lib/useLicense';

interface Props {
  showSettings: boolean,
  currentTheme?: 'dark' | 'light',
}

const props = defineProps<Props>()

const emit = defineEmits<{
  settings: [boolean]
  licenseKey: [string]
  setTheme: ['dark' | 'light']
}>()


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

const isPaidLicense = computed(() => {
  if (!isValidLicense.value) return false;
  const plan = planType.value?.toLowerCase();
  return plan === 'creator' || plan === 'studio';
});

async function handleLicenseSubmit() {
  await validateLicense(licenseKeyInput.value);
  emit('licenseKey', licenseKeyInput.value)
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
  padding: 32px;
  position: relative;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
  transition: background 0.3s ease, border-color 0.3s ease;
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

:global([data-theme="light"]) .btn-buy {
  background: rgba(46, 134, 193, 0.08);
  border: 1px solid rgba(46, 134, 193, 0.25);
  color: #2E86C1;
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

</style>
