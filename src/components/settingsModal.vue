<template>
  <Transition name="fade">
    <div v-if="props.showSettings" class="modal-overlay" @click.self="settings">
      <div class="modal-content fade-up">
        <button class="modal-close" @click="settings">×</button>
        
        <div class="modal-header">
          <h2 class="modal-title">Settings</h2>
          <p class="modal-subtitle">Manage your license key</p>
        </div>

        <div class="settings-section">
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
}

const props = defineProps<Props>()

const emit = defineEmits<{
  settings: [boolean]
  licenseKey: [string]
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
  const url = import.meta.env.VITE_LICENSE_URL || 'https://iris.cs.bath.ac.uk/#pricing';
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
  background: rgba(22, 30, 41, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  width: 100%;
  max-width: 480px;
  padding: 32px;
  position: relative;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
}

.modal-close {
  position: absolute;
  top: 20px;
  right: 20px;
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  font-size: 24px;
  cursor: pointer;
  padding: 4px;
  line-height: 1;
}

.modal-close:hover { color: #fff; }

.modal-header { margin-bottom: 32px; text-align: center; }
.modal-title { font-size: 24px; margin-bottom: 8px; color: #fff; }
.modal-subtitle { color: rgba(255, 255, 255, 0.5); font-size: 14px; }

.settings-section { display: flex; flex-direction: column; gap: 24px; }
.settings-group { display: flex; flex-direction: column; gap: 12px; }
.settings-group label { font-size: 14px; font-weight: 600; color: rgba(255,255,255,0.7); }

.license-input-wrapper { display: flex; gap: 12px; }

.license-input {
  flex: 1;
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  padding: 12px 16px;
  color: #fff;
  font-family: monospace;
  font-size: 16px;
}

.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.fade-up { animation: fadeUp 0.4s ease-out; }
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.btn-activate {
  background: #6be675;
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

.license-msg { font-size: 13px; margin-top: 4px; }
.license-msg.error { color: #ff9a5c; }
.license-msg.success { color: #6be675; }

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
  color: rgba(255, 255, 255, 0.2);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.divider::before, .divider::after {
  content: '';
  flex: 1;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.divider:not(:empty)::before { margin-right: 12px; }
.divider:not(:empty)::after { margin-left: 12px; }

</style>
