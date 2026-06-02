<script setup>
import Chart from 'chart.js/auto'
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

function renderChart() {
  if (!canvasRef.value) {
    return
  }

  destroyChart()
  chartError.value = ''

  try {
    chart = new Chart(canvasRef.value, {
      type: 'doughnut',
      data: {
        labels: ['Protein', 'Carbs', 'Fat'],
        datasets: [
          {
            data: displayChartData.value,
            backgroundColor: ['#67985c', '#e39142', '#c95f78'],
            borderColor: ['#fff8f2', '#fff8f2', '#fff8f2'],
            borderWidth: 2,
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
              color: getComputedStyle(document.documentElement).getPropertyValue('--text') || '#111',
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

onMounted(renderChart)
watch(chartData, renderChart)
onBeforeUnmount(destroyChart)
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
  color: var(--text);
  font-size: 26px;
  line-height: 1;
}

.nutrition-chart-center span {
  color: var(--muted);
  font-size: 12px;
  font-weight: 850;
  text-transform: uppercase;
}

.nutrition-chart-fallback {
  display: grid;
  min-height: 220px;
  place-items: center;
  color: var(--muted);
  text-align: center;
}
</style>
