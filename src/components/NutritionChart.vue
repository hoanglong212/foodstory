<script setup>
import { Chart, ArcElement, Tooltip, Legend } from 'chart.js'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

Chart.register(ArcElement, Tooltip, Legend)

const props = defineProps({
  protein: {
    type: Number,
    default: 0,
  },
  carbs: {
    type: Number,
    default: 0,
  },
  fat: {
    type: Number,
    default: 0,
  },
})

const canvasRef = ref(null)
let chart

const chartData = computed(() => [props.protein, props.carbs, props.fat])

function renderChart() {
  if (!canvasRef.value) {
    return
  }

  chart?.destroy()
  chart = new Chart(canvasRef.value, {
    type: 'doughnut',
    data: {
      labels: ['Protein', 'Carbs', 'Fat'],
      datasets: [
        {
          data: chartData.value,
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
              return `${context.label}: ${context.parsed}g`
            },
          },
        },
      },
    },
  })
}

onMounted(renderChart)
watch(chartData, renderChart)
onBeforeUnmount(() => chart?.destroy())
</script>

<template>
  <div class="nutrition-chart" aria-label="Nutrition doughnut chart">
    <canvas ref="canvasRef"></canvas>
  </div>
</template>
