// TIER 1D — useVisionAuto lifecycle behaviour, measured rather than asserted.
//
// The composable takes every network function by injection, so the whole surface can
// be driven deterministically with no provider, no HTTP, and no wall-clock coupling
// to a real backend.
//
// Measures:
//   1. Cancel latency: cancel() -> HTTP abort, all timers cleared, state back to idle.
//      30 iterations, each recorded individually.
//   2. Lifecycle leak: 50 mount/unmount cycles; leftover listeners, live timers,
//      retained DOM nodes, and heap after global.gc() recorded per cycle.
//   3. Stale-run guard: a superseded run resolving late must never write state.
//   4. Polling cost: poll count and total wait for a job that runs 10s.
//
// Results are written to benchmark/out/vision-lifecycle-raw.json.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import fs from 'node:fs';
import { useVisionAuto } from '../../frontend/src/composables/useVisionAuto.js';

const OUT = 'C:/COS30043/foodstory/benchmark/out/vision-lifecycle-raw.json';
const collected = {};

// ---------------------------------------------------------------- timer tracking
const liveTimeouts = new Set();
const liveIntervals = new Set();
let origSetTimeout, origClearTimeout, origSetInterval, origClearInterval;

function installTimerTracking() {
  origSetTimeout = window.setTimeout.bind(window);
  origClearTimeout = window.clearTimeout.bind(window);
  origSetInterval = window.setInterval.bind(window);
  origClearInterval = window.clearInterval.bind(window);

  window.setTimeout = (fn, ms, ...rest) => {
    const id = origSetTimeout((...a) => { liveTimeouts.delete(id); return fn?.(...a); }, ms, ...rest);
    liveTimeouts.add(id);
    return id;
  };
  window.clearTimeout = (id) => { liveTimeouts.delete(id); return origClearTimeout(id); };
  window.setInterval = (fn, ms, ...rest) => {
    const id = origSetInterval(fn, ms, ...rest);
    liveIntervals.add(id);
    return id;
  };
  window.clearInterval = (id) => { liveIntervals.delete(id); return origClearInterval(id); };
}
function restoreTimers() {
  window.setTimeout = origSetTimeout; window.clearTimeout = origClearTimeout;
  window.setInterval = origSetInterval; window.clearInterval = origClearInterval;
}

// ------------------------------------------------------------ listener tracking
const listenerCounts = () => globalListeners.size;
const globalListeners = new Set();
let origWinAdd, origWinRemove, origDocAdd, origDocRemove;
function installListenerTracking() {
  origWinAdd = window.addEventListener.bind(window);
  origWinRemove = window.removeEventListener.bind(window);
  origDocAdd = document.addEventListener.bind(document);
  origDocRemove = document.removeEventListener.bind(document);
  let seq = 0;
  const keyOf = (target, type, fn) => `${target}:${type}:${fn.__lk ??= ++seq}`;
  window.addEventListener = (t, f, o) => { if (typeof f === 'function') globalListeners.add(keyOf('win', t, f)); return origWinAdd(t, f, o); };
  window.removeEventListener = (t, f, o) => { if (typeof f === 'function') globalListeners.delete(keyOf('win', t, f)); return origWinRemove(t, f, o); };
  document.addEventListener = (t, f, o) => { if (typeof f === 'function') globalListeners.add(keyOf('doc', t, f)); return origDocAdd(t, f, o); };
  document.removeEventListener = (t, f, o) => { if (typeof f === 'function') globalListeners.delete(keyOf('doc', t, f)); return origDocRemove(t, f, o); };
}

const sleep = (ms) => new Promise((r) => origSetTimeout(r, ms));
const now = () => Number(performance.now().toFixed(4));

function stats(a) {
  const x = a.filter(Number.isFinite).slice().sort((p, q) => p - q);
  if (!x.length) return { n: 0 };
  const mean = x.reduce((s, v) => s + v, 0) / x.length;
  const q = (p) => { const i = (p / 100) * (x.length - 1), lo = Math.floor(i), hi = Math.ceil(i);
    return lo === hi ? x[lo] : x[lo] + (x[hi] - x[lo]) * (i - lo); };
  return { n: x.length, min: x[0], max: x[x.length - 1],
    mean: Number(mean.toFixed(4)), p50: Number(q(50).toFixed(4)), p95: Number(q(95).toFixed(4)) };
}

// jsdom omits several browser APIs that FoodMapView and Leaflet touch on mount.
// These shims live in the harness only; no runtime source is modified. They are
// deliberately inert so they cannot manufacture behaviour the app does not have.
function installJsdomShims() {
  if (typeof window.matchMedia !== 'function') {
    window.matchMedia = (query) => ({
      matches: false, media: query, onchange: null,
      addListener() {}, removeListener() {},
      addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; },
    });
  }
  for (const name of ['ResizeObserver', 'IntersectionObserver', 'MutationObserver']) {
    if (typeof window[name] !== 'function') {
      window[name] = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
      globalThis[name] = window[name];
    }
  }
  if (typeof window.scrollTo !== 'function') window.scrollTo = () => {};
  if (typeof Element.prototype.scrollIntoView !== 'function') Element.prototype.scrollIntoView = () => {};
  if (typeof window.requestAnimationFrame !== 'function') {
    window.requestAnimationFrame = (cb) => origSetTimeout(() => cb(performance.now()), 16);
    window.cancelAnimationFrame = (id) => origClearTimeout(id);
  }
  // Leaflet and Chart.js probe for a 2D context; a null-returning stub keeps them
  // on their no-canvas paths rather than crashing the mount.
  if (!HTMLCanvasElement.prototype.getContext) HTMLCanvasElement.prototype.getContext = () => null;
}

beforeAll(() => { installTimerTracking(); installListenerTracking(); installJsdomShims(); });
afterAll(() => {
  restoreTimers();
  fs.writeFileSync(OUT, JSON.stringify(collected, null, 2) + '\n', 'utf8');
  console.log(`\n[D] wrote ${OUT}`);
});

// =============================================================== 1. cancel latency
describe('cancel latency', () => {
  it('measures cancel() to abort / timers cleared / idle, 30 iterations', async () => {
    const iterations = [];
    for (let i = 0; i < 30; i++) {
      let abortAt = null;
      let cancelJobCalledAt = null;
      let cancelAt = 0;

      const createJob = ({ signal }) => {
        signal?.addEventListener('abort', () => { abortAt = now(); }, { once: true });
        return Promise.resolve({ data: { jobId: `job-${i}`, status: 'fast_analysis' } });
      };
      const getJob = (id, { signal } = {}) => {
        signal?.addEventListener('abort', () => { abortAt ??= now(); }, { once: true });
        // Never completes on its own: the run stays in flight until cancelled.
        return Promise.resolve({ data: { jobId: id, status: 'fast_analysis' } });
      };
      const cancelJob = () => { cancelJobCalledAt = now(); return Promise.resolve({}); };

      let api;
      const Comp = defineComponent({
        setup() { api = useVisionAuto({ createJob, getJob, cancelJob }); return () => h('div'); },
      });
      const wrapper = mount(Comp);

      api.setUrl('https://www.youtube.com/shorts/abc12345');
      api.submit();
      // Let the job be created and the poll loop enter its 1500ms wait.
      await sleep(60);
      await nextTick();

      const timersBefore = liveTimeouts.size + liveIntervals.size;
      const intervalsBefore = liveIntervals.size;
      const stateBefore = api.state.value;
      const analyzingBefore = api.isAnalyzing.value;

      cancelAt = now();
      api.cancel();
      const afterCancelSync = now();
      await nextTick();

      const stateAfter = api.state.value;
      const idleAt = stateAfter === 'idle' ? afterCancelSync : null;
      const timersAfter = liveTimeouts.size + liveIntervals.size;
      const intervalsAfter = liveIntervals.size;

      iterations.push({
        iteration: i + 1,
        stateBeforeCancel: stateBefore,
        wasAnalyzing: analyzingBefore,
        stateAfterCancel: stateAfter,
        abortLatencyMs: abortAt != null ? Number((abortAt - cancelAt).toFixed(4)) : null,
        abortObserved: abortAt != null,
        cancelJobCalled: cancelJobCalledAt != null,
        cancelJobLatencyMs: cancelJobCalledAt != null ? Number((cancelJobCalledAt - cancelAt).toFixed(4)) : null,
        timersClearedLatencyMs: Number((afterCancelSync - cancelAt).toFixed(4)),
        idleLatencyMs: idleAt != null ? Number((idleAt - cancelAt).toFixed(4)) : null,
        reachedIdle: stateAfter === 'idle',
        liveTimersBefore: timersBefore,
        liveTimersAfter: timersAfter,
        liveIntervalsBefore: intervalsBefore,
        liveIntervalsAfter: intervalsAfter,
        elapsedTimerCleared: intervalsAfter < intervalsBefore || intervalsBefore === 0,
      });

      wrapper.unmount();
      await sleep(5);
    }

    collected.cancelLatency = {
      measurement: 'cancel() to abort / timers cleared / idle',
      iterations: iterations.length,
      note: 'cancel() is synchronous, so all three effects land in the same tick; '
        + 'latencies are sub-millisecond by construction and the meaningful result is '
        + 'whether each effect happened at all, which is recorded per iteration',
      perIteration: iterations,
      aggregate: {
        abortLatencyMs: stats(iterations.map((r) => r.abortLatencyMs)),
        idleLatencyMs: stats(iterations.map((r) => r.idleLatencyMs)),
        timersClearedLatencyMs: stats(iterations.map((r) => r.timersClearedLatencyMs)),
        abortObservedCount: iterations.filter((r) => r.abortObserved).length,
        reachedIdleCount: iterations.filter((r) => r.reachedIdle).length,
        cancelJobCalledCount: iterations.filter((r) => r.cancelJobCalled).length,
        intervalsLeftBehindCount: iterations.filter((r) => r.liveIntervalsAfter > 0).length,
      },
    };
    expect(iterations.length).toBe(30);
  });
});

// ============================================================ 2. lifecycle leak
describe('lifecycle leak', () => {
  it('mount/unmount 50 cycles and record listeners, timers, DOM nodes, heap', async () => {
    // Try the real FoodMapView first; fall back to a composable host if jsdom
    // cannot mount it, and record exactly which target was used.
    let target = 'FoodMapView';
    let mountFactory = null;
    let mountError = null;
    try {
      const mod = await import('../../frontend/src/views/FoodMapView.vue');
      const { createPinia, setActivePinia } = await import('pinia');
      const { createRouter, createMemoryHistory } = await import('vue-router');
      const FoodMapView = mod.default;
      // FoodMapView calls useRoute()/useRouter(), which read from injected router
      // context; `mocks` only patches the options-API $route/$router and leaves the
      // composables undefined. A real memory-history router is required.
      const stub = { template: '<div />' };
      mountFactory = () => {
        const pinia = createPinia();
        setActivePinia(pinia);
        const router = createRouter({
          history: createMemoryHistory(),
          routes: [
            { path: '/', component: stub },
            { path: '/food-map', component: stub },
            { path: '/:pathMatch(.*)*', component: stub },
          ],
        });
        router.push('/food-map');
        return mount(FoodMapView, {
          global: { plugins: [pinia, router], stubs: { RouterLink: true, RouterView: true } },
          attachTo: document.body,
        });
      };
      const probe = mountFactory();
      probe.unmount();
    } catch (e) {
      mountError = String(e?.message || e).slice(0, 400);
      target = 'useVisionAuto host component (FoodMapView could not mount under jsdom)';
      mountFactory = () => {
        const Host = defineComponent({
          setup() {
            const api = useVisionAuto({
              createJob: () => Promise.resolve({ data: { jobId: 'x', status: 'fast_analysis' } }),
              getJob: (id) => Promise.resolve({ data: { jobId: id, status: 'fast_analysis' } }),
              cancelJob: () => Promise.resolve({}),
            });
            api.setUrl('https://www.youtube.com/shorts/leak');
            api.submit();
            return () => h('div', 'host');
          },
        });
        return mount(Host, { attachTo: document.body });
      };
    }

    const cycles = [];
    const gc = globalThis.gc;
    for (let i = 0; i < 50; i++) {
      const listenersBefore = listenerCounts();
      const timersBefore = liveTimeouts.size + liveIntervals.size;

      const w = mountFactory();
      await sleep(25);
      await nextTick();
      w.unmount();
      await sleep(25);
      await nextTick();

      if (gc) { gc(); await sleep(5); gc(); }
      const mem = process.memoryUsage();
      cycles.push({
        cycle: i + 1,
        listenersBefore,
        listenersAfter: listenerCounts(),
        listenerDelta: listenerCounts() - listenersBefore,
        liveTimersBefore: timersBefore,
        liveTimersAfter: liveTimeouts.size + liveIntervals.size,
        liveTimerDelta: (liveTimeouts.size + liveIntervals.size) - timersBefore,
        domNodesInBody: document.body.getElementsByTagName('*').length,
        heapUsedBytes: mem.heapUsed,
        externalBytes: mem.external,
      });
    }

    // Linear trend of heap across cycles: a positive slope is the leak signal.
    const xs = cycles.map((c) => c.cycle);
    const ys = cycles.map((c) => c.heapUsedBytes);
    const n = xs.length;
    const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
    const slope = den ? num / den : 0;

    // The full-range slope is inflated by allocator and JIT warm-up in the first cycles.
    // The second-half slope is the honest leak signal: a real leak stays linear, warm-up
    // flattens.
    const half = cycles.slice(Math.floor(cycles.length / 2));
    const hx = half.map((c) => c.cycle), hy = half.map((c) => c.heapUsedBytes);
    const hn = hx.length;
    const hmx = hx.reduce((a, b) => a + b, 0) / hn, hmy = hy.reduce((a, b) => a + b, 0) / hn;
    let hnum = 0, hden = 0;
    for (let i = 0; i < hn; i++) { hnum += (hx[i] - hmx) * (hy[i] - hmy); hden += (hx[i] - hmx) ** 2; }
    const halfSlope = hden ? hnum / hden : 0;

    collected.lifecycleLeak = {
      target,
      mountError,
      gcAvailable: Boolean(gc),
      gcNote: gc ? 'global.gc() called twice per cycle'
        : 'node was not started with --expose-gc; heap figures are unforced and only '
          + 'the trend across cycles is meaningful',
      cycles: cycles.length,
      perCycle: cycles,
      trend: {
        heapSlopeBytesPerCycle: Math.round(slope),
        heapSlopeSecondHalfBytesPerCycle: Math.round(halfSlope),
        heapSecondHalfFirstBytes: hy[0],
        heapSecondHalfLastBytes: hy[hn - 1],
        slopeInterpretation: Math.abs(halfSlope) < Math.abs(slope) / 2
          ? 'second-half slope is well below the full-range slope: growth is decelerating, '
            + 'consistent with allocator/JIT warm-up rather than an unbounded leak'
          : 'second-half slope remains close to the full-range slope: growth is roughly linear, '
            + 'which is what an actual leak looks like',
        heapFirstCycleBytes: ys[0],
        heapLastCycleBytes: ys[n - 1],
        heapDeltaBytes: ys[n - 1] - ys[0],
        listenerDeltaTotal: cycles[n - 1].listenersAfter - cycles[0].listenersBefore,
        timerDeltaTotal: cycles[n - 1].liveTimersAfter - cycles[0].liveTimersBefore,
        domNodesFinal: cycles[n - 1].domNodesInBody,
      },
    };
    expect(cycles.length).toBe(50);
  });
});

// ========================================================== 3. stale-run guard
describe('stale run guard', () => {
  it('a superseded run must never write state, 30 attempts', async () => {
    const attempts = [];
    for (let i = 0; i < 30; i++) {
      let releaseOld;
      const oldGate = new Promise((r) => { releaseOld = r; });
      let call = 0;

      // The payload must satisfy adaptVisionAutoResponse, otherwise the adapter maps it
      // to state 'error' and drops the marker name - which would make this test pass
      // trivially regardless of the guard. status must be a key of STATUS_TO_STATE and
      // place needs id + name + formattedAddress + sourceType for adaptPlace to keep it.
      const jobResult = (marker) => ({
        status: 'matched_place',
        place: { id: `place-${marker}`, name: marker, formattedAddress: '1 Test Street, HCMC', sourceType: 'foodstory' },
      });
      const createJob = () => {
        call += 1;
        if (call === 1) {
          // First (soon-to-be-superseded) run resolves only after the second starts.
          return oldGate.then(() => ({ data: { jobId: 'old', status: 'completed', result: jobResult('STALE-OLD-RUN') } }));
        }
        return Promise.resolve({ data: { jobId: 'new', status: 'completed', result: jobResult('FRESH-NEW-RUN') } });
      };
      const getJob = (id) => Promise.resolve({ data: { jobId: id, status: 'completed', result: jobResult(id === 'old' ? 'STALE-OLD-RUN' : 'FRESH-NEW-RUN') } });

      let api;
      const Comp = defineComponent({
        setup() { api = useVisionAuto({ createJob, getJob, cancelJob: () => Promise.resolve({}) }); return () => h('div'); },
      });
      const w = mount(Comp);

      api.setUrl('https://www.youtube.com/shorts/first');
      const p1 = api.submit();          // run A, blocked
      await sleep(20);
      api.setUrl('https://www.youtube.com/shorts/second');
      const p2 = api.submit();          // run B supersedes A
      await sleep(20);
      releaseOld();                     // A now resolves, late
      const [r1, r2] = await Promise.all([p1, p2]);
      await sleep(30);
      await nextTick();

      const serialized = JSON.stringify(api.result.value ?? null);
      const staleWon = serialized.includes('STALE-OLD-RUN');
      attempts.push({
        attempt: i + 1,
        supersededRunReturnedNull: r1 === null,
        freshRunReturned: r2 !== null,
        stateAfter: api.state.value,
        staleOverwroteState: staleWon,
        resultContains: staleWon ? 'STALE-OLD-RUN' : (serialized.includes('FRESH-NEW-RUN') ? 'FRESH-NEW-RUN' : 'neither'),
        // Guards against a trivially-passing test: if the fresh marker is absent the
        // payload never survived adaptation and the result proves nothing.
        freshMarkerPresent: serialized.includes('FRESH-NEW-RUN'),
      });
      w.unmount();
    }

    collected.staleRunGuard = {
      measurement: 'rate at which a superseded run overwrites state',
      attempts: attempts.length,
      staleOverwriteCount: attempts.filter((a) => a.staleOverwroteState).length,
      staleOverwriteRate: `${attempts.filter((a) => a.staleOverwroteState).length}/${attempts.length}`,
      supersededReturnedNullCount: attempts.filter((a) => a.supersededRunReturnedNull).length,
      freshMarkerPresentCount: attempts.filter((a) => a.freshMarkerPresent).length,
      validityCheck: attempts.every((a) => a.freshMarkerPresent)
        ? 'valid: the fresh run\'s marker reached state in every attempt, so a stale overwrite '
          + 'would have been detectable'
        : 'INVALID: the fresh marker did not reach state in every attempt, so a 0/N result does '
          + 'not demonstrate the guard works',
      perAttempt: attempts,
    };
    expect(attempts.length).toBe(30);
  });
});

// ============================================================ 4. polling cost
describe('polling cost', () => {
  it('counts polls and total wait for a job that runs 10s', async () => {
    const pollTimes = [];
    const startedAt = now();
    const JOB_MS = 10000;

    const createJob = () => Promise.resolve({ data: { jobId: 'poll-job', status: 'fast_analysis' } });
    const getJob = (id) => {
      pollTimes.push(Number((now() - startedAt).toFixed(2)));
      const done = now() - startedAt >= JOB_MS;
      return Promise.resolve({
        data: done
          ? { jobId: id, status: 'completed',
              result: { status: 'matched_place',
                place: { id: 'place-poll', name: 'Poll Target', formattedAddress: '1 Test Street, HCMC', sourceType: 'foodstory' } } }
          : { jobId: id, status: 'fast_analysis' },
      });
    };

    let api;
    const Comp = defineComponent({
      setup() { api = useVisionAuto({ createJob, getJob, cancelJob: () => Promise.resolve({}) }); return () => h('div'); },
    });
    const w = mount(Comp);
    api.setUrl('https://www.youtube.com/shorts/pollcost');
    await api.submit();
    const totalMs = Number((now() - startedAt).toFixed(2));

    const gaps = pollTimes.map((t, i) => (i === 0 ? t : Number((t - pollTimes[i - 1]).toFixed(2))));
    collected.pollingCost = {
      measurement: 'poll count and wait for a 10s job',
      jobDurationMs: JOB_MS,
      pollCount: pollTimes.length,
      totalElapsedMs: totalMs,
      overshootMs: Number((totalMs - JOB_MS).toFixed(2)),
      pollTimestampsMs: pollTimes,
      interPollGapsMs: gaps,
      gapStats: stats(gaps.slice(1)),
      configuredPollDelayMs: 1500,
      finalState: api.state.value,
    };
    w.unmount();
    expect(pollTimes.length).toBeGreaterThan(0);
  });
});
