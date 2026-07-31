// TIER 2E — Leaflet clustering at scale.
//
// The report states "clustering has not been load-tested at production scale."
//
// IMPORTANT SCOPE NOTE, recorded in the output as well: FoodMapView exposes no seam
// for injecting an arbitrary marker set, so this measures a standalone harness page
// that uses the SAME leaflet (1.9.4) and leaflet.markercluster (1.5.3) builds from
// frontend/node_modules and the SAME markerClusterGroup options as FoodMapView
// (maxClusterRadius 92, removeOutsideVisibleBounds true, animateAddingMarkers false,
// chunkedLoading true, chunkInterval 50, chunkDelay 32). It characterises the
// clustering configuration the app ships, not the assembled FoodMapView component.
//
// chunkedLoading is measured both on and off, so its effect on long tasks is evidence
// rather than assumption.

import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { chromePath, meta, writeOut, stats } from '../lib/env.mjs';
import { startStatic } from '../lib/static-server.mjs';

const NM = 'C:/COS30043/foodstory/frontend/node_modules';
const PORT = 5175;
const COUNTS = [50, 200, 1000, 5000];
const RUNS = 3;

const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="/leaflet.css"><link rel="stylesheet" href="/MarkerCluster.css">
<link rel="stylesheet" href="/MarkerCluster.Default.css">
<style>html,body,#map{height:100%;margin:0}</style>
<script src="/leaflet.js"></script><script src="/leaflet.markercluster.js"></script>
</head><body><div id="map"></div><script>
// Deterministic PRNG so every run uses the identical marker set.
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);
t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
// Ho Chi Minh City bounding box.
const LAT0=10.70,LAT1=10.88,LNG0=106.60,LNG1=106.80;
window.__longTasks=[];
try{new PerformanceObserver(l=>{for(const e of l.getEntries())
  window.__longTasks.push({startMs:e.startTime,durationMs:e.duration})}).observe({type:'longtask',buffered:true})}catch(e){}

window.__run = async function(count, chunked){
  window.__longTasks.length = 0;
  // maxZoom must be set explicitly: markercluster reads it to build its zoom-level
  // cluster tree, and with no tile layer present Leaflet has no maxZoom to inherit,
  // so omitting it throws "Map has no maxZoom specified".
  const map = L.map('map',{preferCanvas:false,maxZoom:19,minZoom:3}).setView([10.7769,106.7009],12);
  // No tile layer: tile fetching would measure the network, not clustering.
  const rnd = mulberry32(count);
  const markers = [];
  for(let i=0;i<count;i++){
    markers.push(L.marker([LAT0+rnd()*(LAT1-LAT0), LNG0+rnd()*(LNG1-LNG0)]));
  }
  const group = L.markerClusterGroup({
    showCoverageOnHover:false, maxClusterRadius:92,
    spiderfyOnMaxZoom:false, spiderfyOnEveryZoom:false,
    removeOutsideVisibleBounds:true, animateAddingMarkers:false,
    chunkedLoading:chunked, chunkInterval:50, chunkDelay:32,
    iconCreateFunction(c){return L.divIcon({html:'<div class="taste-map-cluster">'+
      (c.getChildCount()>99?'99+':c.getChildCount())+'</div>',className:'taste-map-cluster-icon',
      iconSize:[40,40]})},
  });

  // data-loaded -> markers drawn
  const t0 = performance.now();
  await new Promise(res=>{
    let settled=false;
    const done=()=>{if(!settled){settled=true;res()}};
    if(chunked){ group.on('chunkProgress',(p)=>{ if(p.processed>=p.total) requestAnimationFrame(done) }) }
    group.addLayers(markers);
    map.addLayer(group);
    // Fallback for the non-chunked path (addLayers is synchronous there).
    requestAnimationFrame(()=>requestAnimationFrame(done));
    setTimeout(done, 30000);
  });
  const drawMs = performance.now()-t0;
  const clustersRendered = document.querySelectorAll('.leaflet-marker-icon').length;

  // rAF frame timing during pan
  const frames=[];
  const record=(n)=>new Promise(res=>{let last=performance.now(),i=0;
    const tick=()=>{const now=performance.now();frames.push(now-last);last=now;
      if(++i<n)requestAnimationFrame(tick);else res()};requestAnimationFrame(tick)});

  const panStart=performance.now();
  const panP=record(40);
  map.panBy([220,140],{animate:true,duration:0.6});
  await panP;
  const panMs=performance.now()-panStart;
  const panFrames=frames.slice();

  frames.length=0;
  const zoomStart=performance.now();
  const zoomP=record(40);
  map.setZoom(14,{animate:true});
  await zoomP;
  const zoomMs=performance.now()-zoomStart;
  const zoomFrames=frames.slice();

  const heap = performance.memory ? {
    usedJsHeapBytes: performance.memory.usedJSHeapSize,
    totalJsHeapBytes: performance.memory.totalJSHeapSize,
  } : null;

  map.remove();
  return { count, chunked, drawMs, clustersRendered, panMs, zoomMs,
    panFrames, zoomFrames, heap,
    longTasks: window.__longTasks.slice(),
  };
};
</script></body></html>`;

async function main() {
  const dir = path.join(os.tmpdir(), `foodstory-map-harness-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  const copies = [
    [`${NM}/leaflet/dist/leaflet.js`, 'leaflet.js'],
    [`${NM}/leaflet/dist/leaflet.css`, 'leaflet.css'],
    [`${NM}/leaflet.markercluster/dist/leaflet.markercluster.js`, 'leaflet.markercluster.js'],
    [`${NM}/leaflet.markercluster/dist/MarkerCluster.css`, 'MarkerCluster.css'],
    [`${NM}/leaflet.markercluster/dist/MarkerCluster.Default.css`, 'MarkerCluster.Default.css'],
  ];
  const missing = [];
  for (const [src, dst] of copies) {
    if (!fs.existsSync(src)) { missing.push(src); continue; }
    fs.copyFileSync(src, path.join(dir, dst));
  }
  if (missing.length) {
    writeOut('map-scale-raw.json', {
      meta: meta({ measurement: 'leaflet-cluster-scale', tier: '2E' }),
      status: 'unavailable', reason: `missing library files: ${missing.join(', ')}`, results: [],
    });
    return;
  }
  fs.writeFileSync(path.join(dir, 'index.html'), PAGE, 'utf8');

  const srv = await startStatic(dir, PORT);
  const browser = await puppeteer.launch({
    executablePath: chromePath(), headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-precise-memory-info', '--js-flags=--expose-gc'],
  });

  const results = [];
  for (const chunked of [true, false]) {
    for (const count of COUNTS) {
      const runs = [];
      for (let i = 0; i < RUNS; i++) {
        const page = await browser.newPage();
        await page.setViewport({ width: 1440, height: 900 });
        await page.goto(`${srv.origin}/index.html`, { waitUntil: 'load' });
        let r = null, err = null;
        try { r = await page.evaluate((c, ch) => window.__run(c, ch), count, chunked); }
        catch (e) { err = String(e.message).slice(0, 300); }
        await page.close();
        if (err) { runs.push({ run: i + 1, status: 'error', error: err }); continue; }
        const slowPan = r.panFrames.filter((f) => f > 50);
        const slowZoom = r.zoomFrames.filter((f) => f > 50);
        runs.push({
          run: i + 1,
          drawMs: Number(r.drawMs.toFixed(2)),
          clustersRendered: r.clustersRendered,
          panMs: Number(r.panMs.toFixed(2)),
          zoomMs: Number(r.zoomMs.toFixed(2)),
          panFramesOver50ms: slowPan.length,
          zoomFramesOver50ms: slowZoom.length,
          worstPanFrameMs: r.panFrames.length ? Number(Math.max(...r.panFrames).toFixed(2)) : null,
          worstZoomFrameMs: r.zoomFrames.length ? Number(Math.max(...r.zoomFrames).toFixed(2)) : null,
          slowPanFramesMs: slowPan.map((f) => Number(f.toFixed(2))),
          slowZoomFramesMs: slowZoom.map((f) => Number(f.toFixed(2))),
          heapAfterDraw: r.heap,
          longTaskCount: r.longTasks.length,
          longTasksOver50ms: r.longTasks.filter((t) => t.durationMs >= 50).length,
          longestTaskMs: r.longTasks.length ? Number(Math.max(...r.longTasks.map((t) => t.durationMs)).toFixed(2)) : 0,
          totalBlockingMs: Number(r.longTasks.reduce((s, t) => s + Math.max(0, t.durationMs - 50), 0).toFixed(2)),
        });
      }
      const ok = runs.filter((r) => !r.status);
      results.push({
        markerCount: count, chunkedLoading: chunked,
        status: ok.length ? 'measured' : 'unavailable',
        reason: ok.length ? undefined : runs[0]?.error,
        runs,
        aggregate: ok.length ? {
          drawMs: stats(ok.map((r) => r.drawMs)),
          panMs: stats(ok.map((r) => r.panMs)),
          zoomMs: stats(ok.map((r) => r.zoomMs)),
          panFramesOver50ms: stats(ok.map((r) => r.panFramesOver50ms)),
          zoomFramesOver50ms: stats(ok.map((r) => r.zoomFramesOver50ms)),
          longTasksOver50ms: stats(ok.map((r) => r.longTasksOver50ms)),
          longestTaskMs: stats(ok.map((r) => r.longestTaskMs)),
          totalBlockingMs: stats(ok.map((r) => r.totalBlockingMs)),
          heapUsedBytes: stats(ok.map((r) => r.heapAfterDraw?.usedJsHeapBytes).filter(Boolean)),
        } : undefined,
      });
      const a = results[results.length - 1].aggregate;
      console.log(`  chunked=${String(chunked).padEnd(5)} n=${String(count).padStart(4)} `
        + `draw=${a?.drawMs.p50}ms pan=${a?.panMs.p50}ms zoom=${a?.zoomMs.p50}ms `
        + `slowPanFrames=${a?.panFramesOver50ms.p50} longTasks>50=${a?.longTasksOver50ms.p50} `
        + `worstTask=${a?.longestTaskMs.p50}ms heap=${a?.heapUsedBytes.p50 ? (a.heapUsedBytes.p50 / 1048576).toFixed(1) + 'MB' : '-'}`);
    }
  }

  await browser.close();
  await srv.close();
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }

  // chunkedLoading on vs off, paired by marker count.
  const chunkEffect = COUNTS.map((c) => {
    const on = results.find((r) => r.markerCount === c && r.chunkedLoading === true);
    const off = results.find((r) => r.markerCount === c && r.chunkedLoading === false);
    if (!on?.aggregate || !off?.aggregate) return { markerCount: c, status: 'unavailable' };
    return {
      markerCount: c,
      drawMsOn: on.aggregate.drawMs.p50, drawMsOff: off.aggregate.drawMs.p50,
      longTasksOver50msOn: on.aggregate.longTasksOver50ms.p50,
      longTasksOver50msOff: off.aggregate.longTasksOver50ms.p50,
      longestTaskMsOn: on.aggregate.longestTaskMs.p50,
      longestTaskMsOff: off.aggregate.longestTaskMs.p50,
      totalBlockingMsOn: on.aggregate.totalBlockingMs.p50,
      totalBlockingMsOff: off.aggregate.totalBlockingMs.p50,
      chunkedReducedLongTasks: on.aggregate.longTasksOver50ms.p50 < off.aggregate.longTasksOver50ms.p50,
      chunkedReducedLongestTask: on.aggregate.longestTaskMs.p50 < off.aggregate.longestTaskMs.p50,
    };
  });

  writeOut('map-scale-raw.json', {
    meta: meta({
      measurement: 'leaflet-cluster-scale', tier: '2E',
      scopeCaveat: 'standalone harness page, not the assembled FoodMapView component. '
        + 'FoodMapView exposes no marker-injection seam, so an in-app marker sweep is not '
        + 'possible without modifying runtime source, which this benchmark does not do. '
        + 'Library builds and clusterer options are identical to the app.',
      leafletVersion: '1.9.4', markerClusterVersion: '1.5.3',
      clusterOptions: 'showCoverageOnHover false, maxClusterRadius 92, spiderfyOnMaxZoom false, '
        + 'spiderfyOnEveryZoom false, removeOutsideVisibleBounds true, animateAddingMarkers false, '
        + 'chunkInterval 50, chunkDelay 32',
      tileLayer: 'none - tile fetching would measure the network rather than clustering',
      markerGeneration: 'seeded mulberry32 PRNG over the HCMC bbox 10.70-10.88 N, 106.60-106.80 E; '
        + 'identical marker set for every run at a given count',
      runsPerCell: RUNS,
      heapSource: 'performance.memory with --enable-precise-memory-info',
    }),
    results,
    chunkedLoadingEffect: chunkEffect,
  });
}

await main();
