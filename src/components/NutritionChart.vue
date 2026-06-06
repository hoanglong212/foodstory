<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps({
  calories: {
    type: [Number, String],
    default: 0,
  },
  protein: {
    type: [Number, String],
    default: 0,
  },
  carbs: {
    type: [Number, String],
    default: 0,
  },
  fat: {
    type: [Number, String],
    default: 0,
  },
})

const canvasRef = ref(null)
const chartError = ref('')
let chart
let chartModulePromise = null
let intersectionObserver = null
let hasEnteredViewport = false
let renderRequestId = 0

function toSafeNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : 0
}

function destroyChart() {
  if (!chart) {
    return
  }

  try {
    chart.destroy()
  } catch {
    // Ignore cleanup failures so chart internals cannot affect navigation.
  } finally {
    chart = null
  }
}

function loadChart() {
  if (!chartModulePromise) {
    chartModulePromise = import('chart.js/auto').then((module) => module.default)
  }

  return chartModulePromise
}

function getThemeColor(name, fallback) {
  const scope = canvasRef.value?.closest('.recipe-detail-magazine') || document.documentElement
  const value = getComputedStyle(scope).getPropertyValue(name).trim()
  return value || fallback
}

const safeCalories = computed(() => Math.round(toSafeNumber(props.calories)))
const chartData = computed(() => [
  toSafeNumber(props.protein),
  toSafeNumber(props.carbs),
  toSafeNumber(props.fat),
])

const displayChartData = computed(() => {
  const total = chartData.value.reduce((sum, value) => sum + value, 0)
  return total > 0 ? chartData.value : [1, 0, 0]
})

async function renderChart() {
  if (!canvasRef.value || !hasEnteredViewport) {
    return
  }

  const requestId = ++renderRequestId
  destroyChart()
  chartError.value = ''

  try {
    const Chart = await loadChart()
    if (requestId !== renderRequestId || !canvasRef.value || !hasEnteredViewport) {
      return
    }

    chart = new Chart(canvasRef.value, {
      type: 'doughnut',
      data: {
        labels: ['Protein', 'Carbs', 'Fat'],
        datasets: [
          {
            data: displayChartData.value,
            backgroundColor: ['#52745d', '#d68c35', '#b9482f'],
            borderColor: getThemeColor('--recipe-paper', '#fffdf8'),
            borderWidth: 3,
            hoverOffset: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              boxWidth: 10,
              boxHeight: 10,
              color: getThemeColor('--recipe-body', '#3d3028'),
              font: {
                size: 12,
                weight: '700',
              },
            },
          },
          tooltip: {
            callbacks: {
              label(context) {
                const value = chartData.value[context.dataIndex] || 0
                return `${context.label}: ${value}g`
              },
            },
          },
        },
      },
    })
  } catch (error) {
    chartError.value = 'Nutrition chart is unavailable.'
    console.warn('Nutrition chart failed to render.', error)
  }
}

function renderWhenVisible() {
  if (!canvasRef.value) {
    return
  }

  if (!('IntersectionObserver' in window)) {
    hasEnteredViewport = true
    renderChart()
    return
  }

  intersectionObserver = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) {
        return
      }

      hasEnteredViewport = true
      intersectionObserver?.disconnect()
      intersectionObserver = null
      renderChart()
    },
    { rootMargin: '160px' },
  )
  intersectionObserver.observe(canvasRef.value)
}

onMounted(renderWhenVisible)
watch(chartData, () => {
  renderChart()
})
onBeforeUnmount(() => {
  renderRequestId += 1
  intersectionObserver?.disconnect()
  destroyChart()
})
</script>

<template>
  <div class="nutrition-chart" aria-label="Nutrition doughnut chart">
    <canvas ref="canvasRef"></canvas>
    <p v-if="chartError" class="nutrition-chart-fallback">{{ chartError }}</p>
    <div class="nutrition-chart-center" aria-hidden="true">
      <strong>{{ safeCalories }}</strong>
      <span>calories</span>
    </div>
  </div>
</template>

<style scoped>
.nutrition-chart {
  position: relative;
  width: min(320px, 100%);
  min-height: 300px;
  margin: 0 auto;
}

.nutrition-chart canvas {
  width: 100% !important;
  height: 300px !important;
}

.nutrition-chart-center {
  position: absolute;
  top: 42%;
  left: 50%;
  display: grid;
  place-items: center;
  transform: translate(-50%, -50%);
  pointer-events: none;
  text-align: center;
}

.nutrition-chart-center strong {
  color: var(--recipe-ink, var(--text));
  font-size: 26px;
  line-height: 1;
}

.nutrition-chart-center span {
  color: var(--recipe-muted, var(--muted));
  font-size: 12px;
  font-weight: 850;
  text-transform: uppercase;
}

.nutrition-chart-fallback {
  display: grid;
  min-height: 220px;
  place-items: center;
  color: var(--recipe-muted, var(--muted));
  text-align: center;
}
</style>
