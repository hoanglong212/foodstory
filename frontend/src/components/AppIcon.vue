<script setup>
import { computed } from 'vue'

const props = defineProps({
  name: {
    type: String,
    required: true,
  },
  size: {
    type: [Number, String],
    default: 20,
  },
  strokeWidth: {
    type: [Number, String],
    default: 2,
  },
})

const icons = {
  'arrow-left': [{ type: 'path', d: 'M19 12H5' }, { type: 'path', d: 'm12 19-7-7 7-7' }],
  'arrow-right': [{ type: 'path', d: 'M5 12h14' }, { type: 'path', d: 'm12 5 7 7-7 7' }],
  'book-open': [
    { type: 'path', d: 'M12 7v14' },
    { type: 'path', d: 'M3 18a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z' },
  ],
  bookmark: [
    { type: 'path', d: 'M6 3h12a1 1 0 0 1 1 1v18l-7-4-7 4V4a1 1 0 0 1 1-1z' },
  ],
  bowl: [
    { type: 'path', d: 'M4 11h16a8 8 0 0 1-16 0Z' },
    { type: 'path', d: 'M7 11V9a5 5 0 0 1 10 0v2' },
    { type: 'path', d: 'M9 3v2' },
    { type: 'path', d: 'M15 3v2' },
  ],
  calendar: [
    { type: 'path', d: 'M8 2v4' },
    { type: 'path', d: 'M16 2v4' },
    { type: 'rect', x: 3, y: 4, width: 18, height: 18, rx: 2 },
    { type: 'path', d: 'M3 10h18' },
  ],
  camera: [
    { type: 'path', d: 'M14.5 4 16 7h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3l1.5-3z' },
    { type: 'circle', cx: 12, cy: 13, r: 3.5 },
  ],
  'chef-hat': [
    { type: 'path', d: 'M6 13.8a5 5 0 0 1 .8-9.9A5.5 5.5 0 0 1 17.2 4a5 5 0 0 1 .8 9.8' },
    { type: 'path', d: 'M6 13h12v7H6z' },
    { type: 'path', d: 'M9 17h6' },
  ],
  clock: [
    { type: 'circle', cx: 12, cy: 12, r: 9 },
    { type: 'path', d: 'M12 7v5l3 2' },
  ],
  check: [
    { type: 'path', d: 'M20 6 9 17l-5-5' },
  ],
  code: [
    { type: 'path', d: 'm16 18 6-6-6-6' },
    { type: 'path', d: 'm8 6-6 6 6 6' },
    { type: 'path', d: 'm14 4-4 16' },
  ],
  crown: [
    { type: 'path', d: 'm2 6 5 5 5-8 5 8 5-5-2 13H4z' },
    { type: 'path', d: 'M4 19h16' },
  ],
  facebook: [
    { type: 'path', d: 'M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z' },
  ],
  filter: [
    { type: 'path', d: 'M22 3H2l8 9.5V19l4 2v-8.5z' },
  ],
  heart: [
    { type: 'path', d: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 1 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z' },
  ],
  home: [
    { type: 'path', d: 'm3 10 9-7 9 7' },
    { type: 'path', d: 'M5 10v10h14V10' },
    { type: 'path', d: 'M9 20v-6h6v6' },
  ],
  instagram: [
    { type: 'rect', x: 3, y: 3, width: 18, height: 18, rx: 5 },
    { type: 'circle', cx: 12, cy: 12, r: 4 },
    { type: 'path', d: 'M17.5 6.5h.01' },
  ],
  leaf: [
    { type: 'path', d: 'M11 20A7 7 0 0 1 4 13C4 7 12 3 21 3c0 9-4 17-10 17Z' },
    { type: 'path', d: 'M4 13c4 0 8 0 13-6' },
  ],
  mail: [
    { type: 'rect', x: 3, y: 5, width: 18, height: 14, rx: 2 },
    { type: 'path', d: 'm3 7 9 6 9-6' },
  ],
  menu: [
    { type: 'path', d: 'M4 6h16' },
    { type: 'path', d: 'M4 12h16' },
    { type: 'path', d: 'M4 18h16' },
  ],
  'map-pin': [
    { type: 'path', d: 'M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z' },
    { type: 'circle', cx: 12, cy: 10, r: 3 },
  ],
  message: [
    { type: 'path', d: 'M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z' },
  ],
  moon: [{ type: 'path', d: 'M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z' }],
  newspaper: [
    { type: 'path', d: 'M4 22h16a2 2 0 0 0 2-2V4H6v16a2 2 0 0 1-4 0V8h4' },
    { type: 'path', d: 'M10 8h8' },
    { type: 'path', d: 'M10 12h8' },
    { type: 'path', d: 'M10 16h5' },
  ],
  palette: [
    { type: 'circle', cx: 13.5, cy: 6.5, r: 0.5 },
    { type: 'circle', cx: 17.5, cy: 10.5, r: 0.5 },
    { type: 'circle', cx: 8.5, cy: 7.5, r: 0.5 },
    { type: 'circle', cx: 6.5, cy: 12.5, r: 0.5 },
    { type: 'path', d: 'M12 22a10 10 0 1 1 10-10 3.5 3.5 0 0 1-3.5 3.5h-1.2a2 2 0 0 0-1.5 3.3l.3.4A1.7 1.7 0 0 1 14.8 22z' },
  ],
  pen: [
    { type: 'path', d: 'M17 3a2.8 2.8 0 0 1 4 4L8 20l-5 1 1-5z' },
    { type: 'path', d: 'm15 5 4 4' },
  ],
  search: [
    { type: 'circle', cx: 11, cy: 11, r: 8 },
    { type: 'path', d: 'm21 21-4.3-4.3' },
  ],
  send: [
    { type: 'path', d: 'm22 2-7 20-4-9-9-4z' },
    { type: 'path', d: 'M22 2 11 13' },
  ],
  sparkles: [
    { type: 'path', d: 'M12 3 9.7 8.5 4 11l5.7 2.5L12 19l2.3-5.5L20 11l-5.7-2.5z' },
    { type: 'path', d: 'M5 3v4' },
    { type: 'path', d: 'M3 5h4' },
    { type: 'path', d: 'M19 17v4' },
    { type: 'path', d: 'M17 19h4' },
  ],
  star: [
    { type: 'path', d: 'm12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.2L5.8 21 7 14.2 2 9.3l6.9-1z' },
  ],
  store: [
    { type: 'path', d: 'M4 10h16l-1-6H5z' },
    { type: 'path', d: 'M6 10v10h12V10' },
    { type: 'path', d: 'M9 20v-6h6v6' },
    { type: 'path', d: 'M4 10a2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0' },
  ],
  sun: [
    { type: 'circle', cx: 12, cy: 12, r: 4 },
    { type: 'path', d: 'M12 2v2' },
    { type: 'path', d: 'M12 20v2' },
    { type: 'path', d: 'm4.93 4.93 1.41 1.41' },
    { type: 'path', d: 'm17.66 17.66 1.41 1.41' },
    { type: 'path', d: 'M2 12h2' },
    { type: 'path', d: 'M20 12h2' },
    { type: 'path', d: 'm6.34 17.66-1.41 1.41' },
    { type: 'path', d: 'm19.07 4.93-1.41 1.41' },
  ],
  tags: [
    { type: 'path', d: 'M9 5H4v5l9 9 5-5z' },
    { type: 'path', d: 'M7 8h.01' },
    { type: 'path', d: 'm14 5 6 6-5 5' },
  ],
  'trending-up': [
    { type: 'path', d: 'm22 7-8.5 8.5-5-5L2 17' },
    { type: 'path', d: 'M16 7h6v6' },
  ],
  trash: [
    { type: 'path', d: 'M3 6h18' },
    { type: 'path', d: 'M8 6V4h8v2' },
    { type: 'path', d: 'M19 6l-1 14H6L5 6' },
    { type: 'path', d: 'M10 11v5' },
    { type: 'path', d: 'M14 11v5' },
  ],
  users: [
    { type: 'path', d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' },
    { type: 'circle', cx: 9, cy: 7, r: 4 },
    { type: 'path', d: 'M22 21v-2a4 4 0 0 0-3-3.87' },
    { type: 'path', d: 'M16 3.13a4 4 0 0 1 0 7.75' },
  ],
  x: [
    { type: 'path', d: 'M18 6 6 18' },
    { type: 'path', d: 'm6 6 12 12' },
  ],
  utensils: [
    { type: 'path', d: 'M4 3v7' },
    { type: 'path', d: 'M8 3v7' },
    { type: 'path', d: 'M4 7h4' },
    { type: 'path', d: 'M6 10v11' },
    { type: 'path', d: 'M17 3v18' },
    { type: 'path', d: 'M17 3c2.8 1.7 4 4 4 7h-4' },
  ],
  youtube: [
    { type: 'path', d: 'M22 12s0-3.4-.4-5a3 3 0 0 0-2.1-2.1C17.9 4.5 12 4.5 12 4.5s-5.9 0-7.5.4A3 3 0 0 0 2.4 7C2 8.6 2 12 2 12s0 3.4.4 5a3 3 0 0 0 2.1 2.1c1.6.4 7.5.4 7.5.4s5.9 0 7.5-.4a3 3 0 0 0 2.1-2.1c.4-1.6.4-5 .4-5Z' },
    { type: 'polygon', points: '10 9 16 12 10 15 10 9' },
  ],
}

const icon = computed(() => icons[props.name] || icons.sparkles)
</script>

<template>
  <svg
    class="app-icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <template v-for="shape in icon" :key="`${shape.type}-${shape.d || shape.points || shape.cx}`">
      <path v-if="shape.type === 'path'" :d="shape.d" />
      <rect
        v-else-if="shape.type === 'rect'"
        :x="shape.x"
        :y="shape.y"
        :width="shape.width"
        :height="shape.height"
        :rx="shape.rx"
      />
      <circle v-else-if="shape.type === 'circle'" :cx="shape.cx" :cy="shape.cy" :r="shape.r" />
      <polygon v-else-if="shape.type === 'polygon'" :points="shape.points" />
    </template>
  </svg>
</template>
