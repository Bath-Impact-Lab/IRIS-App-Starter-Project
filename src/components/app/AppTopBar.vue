<template>
  <nav class="navbar">
    <div class="brand">
      <img
        v-if="!logoError"
        :src="logoSrc"
        :alt="appTitle"
        class="brand-logo"
        @error="logoError = true"
      />
      <template v-else>
        <div class="split">{{ appTitle }}</div>
      </template>
    </div>

    <div class="nav-right">
      <div class="menu-right">
        <button class="btn btn-icon" @click="emit('toggle-settings')" aria-label="Settings" :disabled="disabled">
          <img src="/assets/settings.svg" alt="">
        </button>
      </div>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

interface Props {
  appTitle: string;
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
});

const emit = defineEmits<{
  'toggle-settings': [];
}>();

const logoError = ref(false);
const logoSrc = computed(() => `/assets/logo/${props.appTitle.toLowerCase()}.png`);
</script>

<style scoped>
.btn-icon img {
  filter: none;
}
</style>
