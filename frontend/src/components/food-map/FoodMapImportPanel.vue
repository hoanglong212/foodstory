<script setup>
import { nextTick, ref, watch } from 'vue'
import AppIcon from '../AppIcon.vue'

const props = defineProps({
  inputMode: {
    type: String,
    default: 'menu',
  },
  state: {
    type: String,
    default: 'idle',
  },
  url: {
    type: String,
    default: '',
  },
  inputError: {
    type: String,
    default: '',
  },
  sourceSummary: {
    type: Object,
    default: null,
  },
  hasSubmittedSource: Boolean,
  canAnalyze: Boolean,
  analyzingCopy: {
    type: String,
    default: 'Opening your source',
  },
  elapsedSeconds: {
    type: Number,
    default: 0,
  },
})

const emit = defineEmits([
  'open-link',
  'update:url',
  'back',
  'submit',
  'cancel',
  'change-link',
  'clear-link',
])

const defaultTrigger = ref(null)
const linkInput = ref(null)
const editingLink = ref(false)
const panelOpen = ref(false)

const busyStates = new Set(['analyzing', 'fast_analysis', 'deep_analysis', 'resolving', 'dish_analyzing', 'dish_searching'])

function isBusy(state) {
  return busyStates.has(state)
}

function togglePanel() {
  if (isBusy(props.state)) return
  panelOpen.value = !panelOpen.value
  if (panelOpen.value) nextTick(() => defaultTrigger.value?.focus())
}

function openLink() {
  editingLink.value = false
  emit('open-link')
  nextTick(() => linkInput.value?.focus())
}

function returnToChoices() {
  editingLink.value = false
  emit('back')
  nextTick(() => defaultTrigger.value?.focus())
}

function editLink() {
  editingLink.value = true
  emit('change-link')
  nextTick(() => linkInput.value?.focus())
}

function clearLink() {
  editingLink.value = true
  emit('clear-link')
  nextTick(() => linkInput.value?.focus())
}

function focusDefault() {
  panelOpen.value = true
  nextTick(() => defaultTrigger.value?.focus())
}

function focusLink() {
  panelOpen.value = true
  nextTick(() => linkInput.value?.focus())
}

watch(
  () => props.hasSubmittedSource,
  (submitted) => {
    if (submitted) editingLink.value = false
  },
)

watch(
  () => props.inputMode,
  (mode) => {
    if (mode !== 'link') editingLink.value = false
  },
)

watch(
  () => props.state,
  (state, previousState) => {
    if (isBusy(state)) {
      panelOpen.value = true
    } else if (isBusy(previousState)) {
      panelOpen.value = false
    }
  },
)

defineExpose({ focusDefault, focusLink })
</script>

<template>
  <section class="vision-import-region" aria-label="Import a food source">
    <section v-if="panelOpen && isBusy(state)" class="vision-import-card vision-analyzing" aria-live="polite">
      <span class="vision-analyzing-spinner" aria-hidden="true"></span>
      <div>
        <strong>{{ analyzingCopy }}</strong>
        <small v-if="elapsedSeconds >= 10">{{ elapsedSeconds }} seconds elapsed</small>
      </div>
      <button type="button" class="vision-text-button" @click="emit('cancel')">Cancel</button>
    </section>

    <section v-else-if="panelOpen && inputMode === 'link'" class="vision-import-card vision-entry-card">
      <header class="vision-entry-header">
        <button type="button" class="vision-back-button" aria-label="Back to import options" @click="returnToChoices">
          <AppIcon name="arrow-left" size="18" />
        </button>
        <div>
          <span>Vision Auto</span>
          <h2>Discover the dish in a food video</h2>
        </div>
      </header>

      <div v-if="hasSubmittedSource && sourceSummary && !editingLink" class="vision-source-summary">
        <AppIcon :name="sourceSummary.icon" size="19" />
        <div>
          <strong>{{ sourceSummary.platform }}</strong>
          <small>{{ sourceSummary.detail }}</small>
        </div>
        <button type="button" @click="editLink">Change link</button>
        <button type="button" class="icon-only" aria-label="Clear link" @click="clearLink">
          <AppIcon name="x" size="16" />
        </button>
      </div>

      <label v-else class="vision-field" for="vision-auto-url">
        <span>Public food link</span>
        <div :class="['vision-url-input', { error: inputError }]">
          <AppIcon name="send" size="18" />
          <input
            id="vision-auto-url"
            ref="linkInput"
            :value="url"
            type="url"
            inputmode="url"
            maxlength="2000"
            autocomplete="url"
            placeholder="Paste social link..."
            :aria-invalid="Boolean(inputError)"
            :aria-describedby="inputError ? 'vision-auto-input-error' : undefined"
            @input="emit('update:url', $event.target.value)"
          />
        </div>
        <small>Currently supported: public YouTube videos and Shorts</small>
      </label>

      <p v-if="inputError" id="vision-auto-input-error" class="vision-input-error" role="alert">
        {{ inputError }}
      </p>

      <footer class="vision-entry-actions">
        <button type="button" class="vision-secondary-button" @click="returnToChoices">Cancel</button>
        <button type="button" class="vision-primary-button" :disabled="!canAnalyze" @click="emit('submit')">
          Identify dish
        </button>
      </footer>
    </section>

    <section v-else-if="panelOpen" class="vision-import-card vision-options-card">
      <header>
        <p>Import from <span aria-hidden="true">✦</span></p>
        <small>Bring a real food clue onto the map.</small>
      </header>
      <div class="vision-option-list">
        <button ref="defaultTrigger" type="button" class="vision-option" @click="openLink">
          <AppIcon name="send" size="19" />
          <span>
            <strong>Paste link</strong>
            <small>Public YouTube video or Shorts link</small>
          </span>
          <AppIcon name="arrow-right" size="17" />
        </button>
        <button type="button" class="vision-option vision-option-ai" @click="openLink">
          <AppIcon name="sparkles" size="19" />
          <span>
            <strong>Dish Vision <em>AI</em></strong>
            <small>Identify the dish, then find places serving it</small>
          </span>
          <AppIcon name="arrow-right" size="17" />
        </button>
      </div>
    </section>

    <button
      class="vision-map-action"
      type="button"
      :aria-label="panelOpen ? 'Close food source import' : 'Open food source import'"
      :aria-expanded="panelOpen"
      :disabled="isBusy(state)"
      @click="togglePanel"
    >
      <AppIcon :name="panelOpen ? 'x' : 'send'" size="23" stroke-width="2.3" />
    </button>
  </section>
</template>

<style scoped>
.vision-import-region {
  position: fixed;
  z-index: 30;
  top: calc(var(--nav-height) + 20px);
  right: 28px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.vision-file-input {
  position: fixed;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
}

.vision-import-card {
  width: min(360px, calc(100vw - 116px));
  border: 1px solid rgba(255, 255, 255, 0.13);
  border-radius: 16px;
  color: #fffaf4;
  background: #202124;
  box-shadow: 0 8px 14px rgba(20, 15, 11, 0.2);
}

.vision-options-card {
  padding: 18px;
}

.vision-options-card header p,
.vision-entry-header h2 {
  margin: 0;
  color: #fffaf4;
  font-size: 1rem;
  font-weight: 800;
  letter-spacing: -0.01em;
}

.vision-options-card header p span {
  color: #f3964d;
}

.vision-options-card header small,
.vision-entry-header span,
.vision-field > small {
  display: block;
  margin-top: 5px;
  color: rgba(255, 250, 244, 0.64);
  font-size: 0.75rem;
  line-height: 1.35;
}

.vision-option-list {
  display: grid;
  margin-top: 15px;
  gap: 4px;
}

.vision-option {
  display: grid;
  grid-template-columns: 21px minmax(0, 1fr) 17px;
  align-items: center;
  min-height: 58px;
  gap: 12px;
  padding: 8px 7px;
  border: 1px solid transparent;
  border-radius: 10px;
  color: rgba(255, 250, 244, 0.82);
  background: transparent;
  text-align: left;
  transition:
    background-color 180ms cubic-bezier(0.16, 1, 0.3, 1),
    border-color 180ms cubic-bezier(0.16, 1, 0.3, 1),
    color 180ms cubic-bezier(0.16, 1, 0.3, 1),
    transform 180ms cubic-bezier(0.16, 1, 0.3, 1);
}

.vision-option > span {
  display: grid;
  gap: 3px;
}

.vision-option strong {
  color: #fffaf4;
  font-size: 0.8125rem;
  font-weight: 750;
}

.vision-option small {
  color: rgba(255, 250, 244, 0.6);
  font-size: 0.6875rem;
  line-height: 1.3;
}

.vision-option em {
  display: inline-flex;
  align-items: center;
  min-height: 17px;
  margin-left: 5px;
  padding: 1px 5px;
  border: 1px solid rgba(243, 150, 77, 0.32);
  border-radius: 999px;
  color: #f5ad73;
  background: rgba(243, 150, 77, 0.08);
  font-size: 0.5625rem;
  font-style: normal;
  font-weight: 800;
  letter-spacing: 0.04em;
  vertical-align: middle;
}

.vision-option:focus-visible,
.vision-back-button:focus-visible,
.vision-source-summary button:focus-visible,
.vision-map-action:focus-visible,
.vision-entry-actions button:focus-visible,
.vision-image-actions button:focus-visible,
.vision-image-empty:focus-visible {
  outline: 3px solid rgba(249, 151, 76, 0.85);
  outline-offset: 2px;
}

@media (hover: hover) and (pointer: fine) {
  .vision-option:hover {
    border-color: rgba(243, 150, 77, 0.18);
    color: #f5a464;
    background: rgba(243, 150, 77, 0.08);
    transform: translateX(1px);
  }
}

.vision-entry-card {
  padding: 16px;
}

.vision-entry-header {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr);
  align-items: center;
  gap: 9px;
  margin-bottom: 17px;
}

.vision-entry-header span {
  margin: 0 0 3px;
  color: #f4a261;
  font-size: 0.6875rem;
  font-weight: 750;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.vision-back-button,
.vision-source-summary .icon-only {
  display: inline-grid;
  width: 36px;
  height: 36px;
  place-items: center;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.13);
  border-radius: 9px;
  color: rgba(255, 250, 244, 0.86);
  background: rgba(255, 255, 255, 0.04);
}

.vision-field {
  display: grid;
  gap: 7px;
}

.vision-field > span {
  color: rgba(255, 250, 244, 0.82);
  font-size: 0.75rem;
  font-weight: 750;
}

.vision-url-input {
  display: flex;
  align-items: center;
  gap: 9px;
  min-height: 46px;
  padding: 0 12px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 10px;
  color: rgba(255, 250, 244, 0.55);
  background: #151619;
  transition: border-color 180ms cubic-bezier(0.16, 1, 0.3, 1);
}

.vision-url-input:focus-within {
  border-color: #f19a55;
}

.vision-url-input.error {
  border-color: #e6736a;
}

.vision-url-input input {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  color: #fffaf4;
  background: transparent;
  font-size: 0.875rem;
}

.vision-url-input input::placeholder {
  color: rgba(255, 250, 244, 0.55);
}

.vision-input-error {
  margin: 10px 0 0;
  color: #ffb4aa;
  font-size: 0.75rem;
  line-height: 1.35;
}

.vision-entry-actions {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-top: 17px;
}

.vision-primary-button,
.vision-secondary-button,
.vision-text-button,
.vision-source-summary button,
.vision-image-actions button {
  min-height: 40px;
  border-radius: 9px;
  font-size: 0.75rem;
  font-weight: 800;
}

.vision-primary-button {
  padding: 0 14px;
  border: 1px solid #f08b43;
  color: #2a160b;
  background: #f29a55;
}

.vision-primary-button:disabled {
  border-color: rgba(255, 255, 255, 0.1);
  color: rgba(255, 250, 244, 0.38);
  background: rgba(255, 255, 255, 0.07);
}

.vision-secondary-button {
  padding: 0 12px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: rgba(255, 250, 244, 0.82);
  background: transparent;
}

.vision-source-summary {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) auto 36px;
  align-items: center;
  gap: 10px;
  padding: 11px;
  border: 1px solid rgba(243, 150, 77, 0.2);
  border-radius: 10px;
  color: #f3a263;
  background: rgba(243, 150, 77, 0.06);
}

.vision-source-summary div {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.vision-source-summary strong,
.vision-image-preview strong {
  overflow: hidden;
  color: #fffaf4;
  font-size: 0.8125rem;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vision-source-summary small,
.vision-image-preview small {
  overflow: hidden;
  color: rgba(255, 250, 244, 0.6);
  font-size: 0.6875rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vision-source-summary button:not(.icon-only),
.vision-image-actions button {
  min-height: 32px;
  padding: 0 7px;
  border: 0;
  color: #f4aa70;
  background: transparent;
  font-weight: 750;
}

.vision-image-preview {
  display: grid;
  grid-template-columns: 82px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  min-height: 94px;
  padding: 8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  background: #151619;
}

.vision-image-preview img {
  width: 82px;
  height: 76px;
  border-radius: 7px;
  object-fit: cover;
}

.vision-image-preview > div {
  display: grid;
  min-width: 0;
  gap: 5px;
}

.vision-image-actions {
  display: flex;
  gap: 5px;
}

.vision-image-empty {
  display: grid;
  min-height: 118px;
  place-items: center;
  gap: 5px;
  width: 100%;
  padding: 15px;
  border: 1px dashed rgba(255, 255, 255, 0.22);
  border-radius: 10px;
  color: #f2a161;
  background: rgba(255, 255, 255, 0.025);
}

.vision-image-empty span {
  color: #fffaf4;
  font-size: 0.8125rem;
  font-weight: 800;
}

.vision-image-empty small {
  color: rgba(255, 250, 244, 0.6);
  font-size: 0.6875rem;
}

.vision-analyzing {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 15px;
}

.vision-analyzing > div {
  display: grid;
  gap: 4px;
}

.vision-analyzing strong {
  color: #fffaf4;
  font-size: 0.8125rem;
}

.vision-analyzing small {
  color: rgba(255, 250, 244, 0.6);
  font-size: 0.6875rem;
}

.vision-analyzing-spinner {
  width: 22px;
  height: 22px;
  border: 2px solid rgba(242, 154, 85, 0.28);
  border-top-color: #f29a55;
  border-radius: 50%;
  animation: vision-spin 820ms linear infinite;
}

.vision-text-button {
  padding: 0 5px;
  border: 0;
  color: #f2a161;
  background: transparent;
}

.vision-map-action {
  display: inline-grid;
  width: 58px;
  height: 58px;
  flex: 0 0 auto;
  place-items: center;
  padding: 0;
  border: 1px solid #ec8037;
  border-radius: 50%;
  color: #2a150a;
  background: #f28b43;
  box-shadow: 0 7px 13px rgba(105, 44, 13, 0.23);
  transition:
    background-color 180ms cubic-bezier(0.16, 1, 0.3, 1),
    transform 180ms cubic-bezier(0.16, 1, 0.3, 1),
    box-shadow 180ms cubic-bezier(0.16, 1, 0.3, 1);
}

@media (hover: hover) and (pointer: fine) {
  .vision-map-action:not(:disabled):hover,
  .vision-primary-button:not(:disabled):hover {
    background: #f7a464;
    transform: translateY(-1px);
  }
}

.vision-map-action:active,
.vision-primary-button:not(:disabled):active {
  transform: translateY(1px);
}

.vision-map-action:disabled {
  opacity: 0.52;
}

@keyframes vision-spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 1200px) {
  .vision-import-region {
    right: 20px;
  }
}

@media (max-width: 768px) {
  .vision-import-region {
    top: auto;
    right: 12px;
    bottom: calc(170px + env(safe-area-inset-bottom));
    left: 12px;
    justify-content: flex-end;
  }

  .vision-import-card {
    width: min(100%, 440px);
  }

  .vision-map-action {
    position: absolute;
    top: -54px;
    right: 0;
    width: 50px;
    height: 50px;
  }
}

@media (max-width: 480px) {
  .vision-import-region {
    bottom: calc(155px + env(safe-area-inset-bottom));
  }

  .vision-source-summary {
    grid-template-columns: 20px minmax(0, 1fr) 36px;
  }

  .vision-source-summary button:not(.icon-only) {
    grid-column: 2;
    justify-self: start;
  }
}

:global(:root[data-theme="light"]) .vision-import-card {
  border-color: rgba(68, 45, 28, 0.15);
  color: #302219;
  background: #fff;
  box-shadow: 0 5px 10px rgba(72, 48, 29, 0.11);
}

:global(:root[data-theme="light"]) .vision-options-card header p,
:global(:root[data-theme="light"]) .vision-entry-header h2,
:global(:root[data-theme="light"]) .vision-option strong,
:global(:root[data-theme="light"]) .vision-source-summary strong,
:global(:root[data-theme="light"]) .vision-image-preview strong,
:global(:root[data-theme="light"]) .vision-analyzing strong,
:global(:root[data-theme="light"]) .vision-image-empty span {
  color: #302219;
}

:global(:root[data-theme="light"]) .vision-options-card header small,
:global(:root[data-theme="light"]) .vision-field > small,
:global(:root[data-theme="light"]) .vision-option small,
:global(:root[data-theme="light"]) .vision-source-summary small,
:global(:root[data-theme="light"]) .vision-image-preview small,
:global(:root[data-theme="light"]) .vision-analyzing small,
:global(:root[data-theme="light"]) .vision-image-empty small {
  color: #705d4f;
}

:global(:root[data-theme="light"]) .vision-option,
:global(:root[data-theme="light"]) .vision-field > span,
:global(:root[data-theme="light"]) .vision-secondary-button {
  color: #594638;
}

:global(:root[data-theme="light"]) .vision-url-input,
:global(:root[data-theme="light"]) .vision-image-preview {
  border-color: rgba(68, 45, 28, 0.16);
  color: #705d4f;
  background: #f7f3ee;
}

:global(:root[data-theme="light"]) .vision-url-input input {
  color: #302219;
}

:global(:root[data-theme="light"]) .vision-url-input input::placeholder {
  color: #78685d;
}

:global(:root[data-theme="light"]) .vision-back-button,
:global(:root[data-theme="light"]) .vision-source-summary .icon-only,
:global(:root[data-theme="light"]) .vision-secondary-button {
  border-color: rgba(68, 45, 28, 0.16);
  background: #f8f4ef;
}

:global(:root[data-theme="light"]) .vision-primary-button:disabled {
  border-color: rgba(68, 45, 28, 0.12);
  color: #8a7b70;
  background: #ebe6e0;
}

@media (prefers-reduced-motion: reduce) {
  .vision-option,
  .vision-map-action {
    transition-duration: 0.01ms;
  }

  .vision-analyzing-spinner {
    animation-duration: 1ms;
    animation-iteration-count: 1;
  }
}
</style>
