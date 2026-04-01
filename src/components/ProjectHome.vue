<template>
  <div class="project-home">
    <div class="home-container">

      <header class="home-header">
        <h1 class="home-title">Welcome to ReCapture</h1>
        <p class="home-subtitle">Select an option to begin your biomechanics session.</p>
        <button class="quick-demo-button" @click="emit('quick-demo')">Quick Demo</button>
      </header>

      <div class="action-cards">
        <button class="action-card" @click="emit('new-project')">
          <div class="card-icon new-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="12" y1="8" x2="12" y2="16"></line>
              <line x1="8" y1="12" x2="16" y2="12"></line>
            </svg>
          </div>
          <div class="card-text">
            <h3>New Project</h3>
            <p>Create a fresh tracking workspace</p>
          </div>
        </button>

        <button class="action-card" @click="emit('open-project')">
          <div class="card-icon open-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
          </div>
          <div class="card-text">
            <h3>Open Existing</h3>
            <p>Browse for a saved recording or folder</p>
          </div>
        </button>
      </div>

      <div class="recent-projects">
        <h2 class="section-title">Recent Projects</h2>

        <div v-if="recentProjects.length > 0" class="recent-list">
          <button
            v-for="project in recentProjects"
            :key="project.id"
            class="recent-item"
            @click="emit('open-recent', project.path)"
          >
            <div class="recent-info">
              <svg class="recent-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
              </svg>
              <span class="recent-name">{{ project.name }}</span>
            </div>
            <span class="recent-date">{{ project.date }}</span>
          </button>
        </div>

        <div v-else class="empty-state">
          No recent projects found.
        </div>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const emit = defineEmits<{
  'quick-demo': [];
  'new-project': [];
  'open-project': [];
  'open-recent': [path: string];
}>();

// Mock data for recent projects - you can replace this with data from IPC / local storage
const recentProjects = ref([
  { id: '1', name: 'Gait Analysis - Subject A', date: '2 hours ago', path: 'C:/recordings/gait_A' },
  { id: '2', name: 'Deadlift Form Correction', date: 'Yesterday', path: 'C:/recordings/deadlift_01' },
  { id: '3', name: 'Pitching Mechanics Review', date: 'Apr 12, 2026', path: 'C:/recordings/pitching_rev' },
  { id: '4', name: 'Baseline Flexibility Test', date: 'Apr 08, 2026', path: 'C:/recordings/baseline_flex' },
]);
</script>

<style scoped>
/* Container & Background */
.project-home {
  position: absolute;
  inset: var(--app-topbar-height, 63px) 0 0 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(120% 120% at 50% -10%, rgba(45, 87, 138, 0.15) 0%, var(--bg) 60%);
  overflow-y: auto;
  padding: 40px 20px;
}

[data-theme="light"] .project-home {
  background: radial-gradient(120% 120% at 50% -10%, rgba(46, 134, 193, 0.08) 0%, var(--bg) 60%);
}

.home-container {
  width: 100%;
  max-width: 640px;
  display: flex;
  flex-direction: column;
  gap: 48px;
  animation: fadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

/* Header */
.home-header {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.home-title {
  margin: 0 0 8px 0;
  font-size: 2rem;
  font-weight: 800;
  color: var(--fg);
  letter-spacing: -0.02em;
}

.home-subtitle {
  margin: 0;
  font-size: 1.05rem;
  color: var(--muted);
}

.quick-demo-button {
  margin-top: 20px;
  padding: 12px 20px;
  border: 1px solid rgba(107, 230, 117, 0.28);
  border-radius: 999px;
  background: linear-gradient(135deg, rgba(107, 230, 117, 0.24), rgba(68, 176, 255, 0.18));
  color: var(--fg);
  font-size: 0.92rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}

.quick-demo-button:hover {
  transform: translateY(-2px);
  border-color: rgba(107, 230, 117, 0.5);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.18);
}

.quick-demo-button:active {
  transform: translateY(0);
}

[data-theme="light"] .quick-demo-button {
  background: linear-gradient(135deg, rgba(46, 134, 193, 0.16), rgba(56, 189, 248, 0.14));
  border-color: rgba(31, 78, 121, 0.18);
}

/* Action Cards */
.action-cards {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
}

.action-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  text-align: left;
  gap: 16px;
  padding: 24px;
  background: rgba(20, 30, 44, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  backdrop-filter: blur(12px);
  cursor: pointer;
  transition: transform 0.25s ease, background 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease;
}

[data-theme="light"] .action-card {
  background: #ffffff;
  border-color: rgba(31, 78, 121, 0.12);
  box-shadow: 0 4px 20px rgba(31, 78, 121, 0.05);
}

.action-card:hover {
  transform: translateY(-4px);
  background: rgba(28, 42, 60, 0.8);
  border-color: rgba(107, 230, 117, 0.3);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.2);
}

[data-theme="light"] .action-card:hover {
  background: #f8fbff;
  border-color: var(--accent);
  box-shadow: 0 12px 30px rgba(31, 78, 121, 0.1);
}

.action-card:active {
  transform: translateY(-1px);
}

.card-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 12px;
}

.new-icon {
  background: rgba(107, 230, 117, 0.15);
  color: #6be675;
}

.open-icon {
  background: rgba(68, 176, 255, 0.15);
  color: #44b0ff;
}

[data-theme="light"] .new-icon {
  background: rgba(46, 134, 193, 0.12);
  color: #2E86C1;
}
[data-theme="light"] .open-icon {
  background: rgba(56, 189, 248, 0.15);
  color: #0284c7;
}

.card-text h3 {
  margin: 0 0 6px 0;
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--fg);
}

.card-text p {
  margin: 0;
  font-size: 0.85rem;
  color: var(--muted);
  line-height: 1.4;
}

/* Recent Projects */
.recent-projects {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.section-title {
  margin: 0;
  font-size: 0.85rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
  padding-bottom: 8px;
  border-bottom: 1px solid var(--divider-line);
}

.recent-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.recent-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 14px 16px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease;
}

.recent-item:hover {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.08);
}

[data-theme="light"] .recent-item:hover {
  background: #ffffff;
  border-color: rgba(31, 78, 121, 0.12);
  box-shadow: 0 2px 8px rgba(31, 78, 121, 0.04);
}

.recent-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.recent-icon {
  color: var(--muted);
}

.recent-name {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--fg);
}

.recent-date {
  font-size: 0.8rem;
  color: var(--muted);
}

.empty-state {
  padding: 24px;
  text-align: center;
  font-size: 0.9rem;
  color: var(--muted);
  background: rgba(255, 255, 255, 0.02);
  border-radius: 12px;
  border: 1px dashed rgba(255, 255, 255, 0.1);
}

[data-theme="light"] .empty-state {
  background: rgba(31, 78, 121, 0.02);
  border-color: rgba(31, 78, 121, 0.15);
}

/* Animations */
@keyframes fadeUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Mobile Responsiveness */
@media (max-width: 600px) {
  .action-cards {
    grid-template-columns: 1fr;
  }

  .home-title {
    font-size: 1.6rem;
  }

  .recent-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
  }
}
</style>
