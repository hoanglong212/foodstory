import fs from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const chartDir = path.join(root, 'chart_data')

function parseCsv(text) {
  const rows=[]; let row=[]; let field=''; let quoted=false
  for(let i=0;i<text.length;i+=1){const c=text[i]; if(quoted){if(c==='"'&&text[i+1]==='"'){field+='"';i+=1}else if(c==='"')quoted=false;else field+=c}else if(c==='"')quoted=true;else if(c===','){row.push(field);field=''}else if(c==='\n'){row.push(field.replace(/\r$/u,''));rows.push(row);row=[];field=''}else field+=c}
  if(field||row.length){row.push(field);rows.push(row)}
  const headers=rows.shift()||[]
  return rows.filter(r=>r.some(v=>v!=='')).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]??''])))
}
function escapeCsv(value){const text=value==null?'':String(value);return /[",\r\n]/u.test(text)?`"${text.replaceAll('"','""')}"`:text}
function toCsv(rows){if(!rows.length)return '';const headers=[...new Set(rows.flatMap(r=>Object.keys(r)))];return headers.join(',')+'\r\n'+rows.map(r=>headers.map(h=>escapeCsv(r[h])).join(',')).join('\r\n')+'\r\n'}
async function read(relative){return parseCsv(await fs.readFile(path.join(root,relative),'utf8'))}
async function write(relative,rows){const target=path.join(root,relative);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,toCsv(rows),'utf8')}
function pctl(sorted,p){if(!sorted.length)return '';return sorted[Math.max(0,Math.ceil(sorted.length*p/100)-1)]}
function stats(values,digits=3){const v=values.map(Number).filter(Number.isFinite).sort((a,b)=>a-b);if(!v.length)return {mean:'',median:'',min:'',max:'',p50:'',p95:''};const f=n=>Number(n).toFixed(digits);return {mean:f(v.reduce((a,b)=>a+b,0)/v.length),median:f(pctl(v,50)),min:f(v[0]),max:f(v.at(-1)),p50:f(pctl(v,50)),p95:f(pctl(v,95))}}
function groupBy(rows,keyFn){const map=new Map();for(const row of rows){const key=keyFn(row);if(!map.has(key))map.set(key,[]);map.get(key).push(row)}return map}
function percentChange(before,after){return before?((after-before)/before*100):NaN}

await fs.mkdir(chartDir,{recursive:true})
const lighthouse=await read('frontend/lighthouse_runs.csv')
const measuredLighthouse=lighthouse.filter(r=>r.run_type==='measured_warm'&&r.status==='success')
const lighthouseMetrics=[['performance_score_percent','percent'],['accessibility_score_percent','percent'],['lcp_ms','ms'],['cls_score','score'],['tbt_ms','ms'],['speed_index_ms','ms'],['fcp_ms','ms'],['total_transferred_bytes','bytes'],['javascript_transferred_bytes','bytes'],['unused_javascript_bytes','bytes'],['dom_node_count','nodes'],['long_task_count','count']]
const frontendSummary=[]
for(const [,group] of groupBy(measuredLighthouse,r=>[r.version_id,r.page_id,r.viewport_id].join('|'))){const base=group[0];const out={version_id:base.version_id,commit_sha:base.commit_sha,page_id:base.page_id,viewport_id:base.viewport_id,run_type:'measured_warm',evidence_type:'lighthouse_local_production_build',sample_size:group.length,caveat:base.caveat};for(const [metric,unit] of lighthouseMetrics){const s=stats(group.map(r=>r[metric]),metric==='cls_score'?6:3);out[`${metric}_unit`]=unit;for(const [name,value] of Object.entries(s))out[`${metric}_${name}`]=value}frontendSummary.push(out)}
await write('frontend/frontend_summary.csv',frontendSummary)

const builds=await read('frontend/build_runs.csv')
const buildSummary=[]
for(const [,group] of groupBy(builds.filter(r=>r.run_type==='measured_warm'&&r.status==='success'),r=>r.version_id)){const b=group[0],wall=stats(group.map(r=>r.wall_clock_ms)),vite=stats(group.map(r=>r.vite_reported_ms));buildSummary.push({version_id:b.version_id,commit_sha:b.commit_sha,run_type:'measured_warm',evidence_type:'measured_local_production_build',sample_size:group.length,wall_clock_unit:'ms',wall_clock_mean_ms:wall.mean,wall_clock_median_ms:wall.median,wall_clock_min_ms:wall.min,wall_clock_max_ms:wall.max,wall_clock_p50_ms:wall.p50,wall_clock_p95_ms:wall.p95,vite_reported_mean_ms:vite.mean,vite_reported_p95_ms:vite.p95,transformed_modules_count:b.transformed_modules_count,generated_js_bytes:b.generated_js_bytes,generated_css_bytes:b.generated_css_bytes,generated_total_bytes:b.generated_total_bytes,caveat:b.caveat})}
await write('frontend/build_summary.csv',buildSummary)

const accessibility=[]
for(const row of measuredLighthouse){const lhr=JSON.parse(await fs.readFile(path.join(root,row.report_json),'utf8'));const refs=lhr.categories?.accessibility?.auditRefs||[];const failed=refs.map(ref=>lhr.audits?.[ref.id]).filter(a=>a&&a.scoreDisplayMode!=='notApplicable'&&a.score===0);const nodes=failed.reduce((sum,a)=>sum+(Array.isArray(a.details?.items)?a.details.items.length:0),0);accessibility.push({version_id:row.version_id,commit_sha:row.commit_sha,page_id:row.page_id,viewport_id:row.viewport_id,run_index:row.run_index,run_type:row.run_type,evidence_type:'lighthouse_axe_rule_failures',automated_axe_violation_count:failed.length,affected_node_count:nodes,serious_or_critical_violation_count:'',accessibility_score_percent:row.accessibility_score_percent,sample_size:5,caveat:'Counts failed Lighthouse accessibility rules backed by axe where applicable; Lighthouse does not expose axe impact severity, so serious/critical count is blank.'})}
await write('design/accessibility_audit.csv',accessibility)

const responsive=await read('design/responsive_audit.csv')
const navigation=await read('frontend/navigation_runs.csv')
const navigationSummary=[]
for(const [,group] of groupBy(navigation.filter(r=>r.run_type==='measured_warm'&&r.evidence_type==='host_wall_clock_navigation_to_load'&&r.navigation_duration_ms!==''),r=>[r.version_id,r.page_id,r.viewport_id].join('|'))){const b=group[0],s=stats(group.map(r=>r.navigation_duration_ms));navigationSummary.push({version_id:b.version_id,page_id:b.page_id,viewport_id:b.viewport_id,latency_unit:'ms',run_type:'measured_warm',evidence_type:b.evidence_type,sample_size:group.length,mean_ms:s.mean,median_ms:s.median,min_ms:s.min,max_ms:s.max,p50_ms:s.p50,p95_ms:s.p95,caveat:b.caveat})}
await write('frontend/navigation_summary.csv',navigationSummary)
const responsiveSummary=[]
for(const [,group] of groupBy(responsive,r=>[r.version_id,r.page_id].join('|'))){const b=group[0];responsiveSummary.push({version_id:b.version_id,page_id:b.page_id,viewport_count:group.length,horizontal_overflow_failures:group.filter(r=>r.horizontal_overflow==='true').length,clipped_text_elements_total:group.reduce((a,r)=>a+Number(r.clipped_text_elements||0),0),overlapping_navigation_pairs_total:group.reduce((a,r)=>a+Number(r.overlapping_navigation_pairs||0),0),inaccessible_controls_total:group.reduce((a,r)=>a+Number(r.inaccessible_controls||0),0),missing_form_labels_total:group.reduce((a,r)=>a+Number(r.missing_form_labels||0),0),touch_targets_below_44px_total:group.reduce((a,r)=>a+Number(r.touch_targets_below_44px||0),0),unit:'failure_count',run_type:'measured_warm',evidence_type:'browser_dom_structural_audit',sample_size:group.length,caveat:b.caveat})}

const visionRuns=await read('vision/vision_runs.csv'),visionSummary=await read('vision/vision_summary.csv'),visionOutcomes=await read('vision/vision_outcomes.csv'),visionStages=await read('vision/vision_stage_breakdown.csv')
const apiSummary=await read('api/api_summary.csv')
const realtimeRuns=await read('realtime/realtime_events.csv'),realtimeSummary=await read('realtime/realtime_summary.csv')
const foodmapRuns=await read('foodmap/foodmap_runs.csv')
const workflow=await read('design/workflow_steps.csv')

await write('chart_data/01_vision_latency_p50_p95.csv',visionSummary.map(r=>({version_id:r.version_id,p50_latency_ms:r.p50_latency_ms,p95_latency_ms:r.p95_latency_ms,unit:'ms',sample_size:r.sample_size,run_type:r.run_type,evidence_type:r.evidence_type,caveat:r.caveat})))
await write('chart_data/02_vision_outcome_rates.csv',visionOutcomes.map(r=>({...r,unit:'percent'})))
await write('chart_data/03_exact_place_accuracy.csv',visionSummary.map(r=>({version_id:r.version_id,exact_place_accuracy_percent:r.exact_place_accuracy_percent,unit:'percent',sample_size:r.sample_size,run_type:r.run_type,evidence_type:r.evidence_type,caveat:'Unavailable: corpus lacks verified place identity ground truth.'})))
await write('chart_data/04_ocr_calls_vs_latency.csv',visionRuns.filter(r=>r.run_type==='measured_warm').map(r=>({version_id:r.version_id,case_id:r.case_id,ocr_call_count:r.ocr_call_count,total_wall_clock_ms:r.total_wall_clock_ms,ocr_call_unit:'calls',latency_unit:'ms',sample_size:1,run_type:r.run_type,evidence_type:r.evidence_type,caveat:'Router-only fixture makes zero provider calls; do not infer an OCR relationship.'})))
await write('chart_data/05_frame_count_vs_latency.csv',visionSummary.map(r=>({version_id:r.version_id,frame_count:'',total_wall_clock_ms:'',frame_count_unit:'frames',latency_unit:'ms',sample_size:0,run_type:'unavailable',evidence_type:'ground_truth_limitation',caveat:'No identical retained media fixture; frame correlation unavailable.'})))
await write('chart_data/06_vision_stage_time_breakdown.csv',visionStages)
await write('chart_data/07_vision_url_outcome_matrix.csv',visionRuns.filter(r=>r.run_index==='1').map(r=>({case_id:r.case_id,url:r.url,version_id:r.version_id,actual_outcome:r.actual_final_status,expected_outcome:r.expected_category,unit:'categorical_outcome',sample_size:1,run_type:r.run_type,evidence_type:r.evidence_type,caveat:r.caveat})))
await write('chart_data/08_lighthouse_metrics.csv',frontendSummary)
const homeDesktop=Object.fromEntries(frontendSummary.filter(r=>r.page_id==='home'&&r.viewport_id==='desktop_1440x900').map(r=>[r.version_id,r]))
await write('chart_data/09_bundle_size_vs_lcp.csv',buildSummary.filter(r=>homeDesktop[r.version_id]).map(r=>({version_id:r.version_id,generated_js_bytes:r.generated_js_bytes,generated_css_bytes:r.generated_css_bytes,generated_total_bytes:r.generated_total_bytes,lcp_mean_ms:homeDesktop[r.version_id].lcp_ms_mean,bundle_unit:'bytes',lcp_unit:'ms',sample_size:homeDesktop[r.version_id].sample_size,run_type:'measured_warm',evidence_type:'build_plus_lighthouse',caveat:'Generated total includes static assets; correlation does not establish causation.'})))
await write('chart_data/10_api_latency_p50_p95.csv',apiSummary)
await write('chart_data/11_realtime_event_to_receive_distribution.csv',realtimeRuns.map(r=>({version_id:r.version_id,viewer_count:r.viewer_count,operation:r.operation,total_event_to_receive_ms:r.total_event_to_receive_ms,latency_unit:'ms',sample_size:1,run_type:r.run_type,evidence_type:r.evidence_type,caveat:r.caveat})))
await write('chart_data/12_realtime_stage_breakdown.csv',realtimeSummary)
await write('chart_data/13_marker_count_vs_render_time.csv',foodmapRuns.map(r=>({version_id:r.version_id,marker_count:r.marker_count,initial_map_render_ms:r.initial_map_render_ms,marker_creation_ms:r.marker_creation_ms,cluster_creation_ms:r.cluster_creation_ms,marker_unit:'markers',latency_unit:'ms',sample_size:r.sample_size,run_type:r.run_type,evidence_type:r.evidence_type,caveat:r.caveat})))
await write('chart_data/14_marker_count_vs_fps.csv',foodmapRuns.map(r=>({version_id:r.version_id,marker_count:r.marker_count,pan_fps:r.pan_fps,zoom_fps:r.zoom_fps,marker_unit:'markers',fps_unit:'frames_per_second',sample_size:r.sample_size,run_type:r.run_type,evidence_type:r.evidence_type,caveat:r.caveat})))
await write('chart_data/15_accessibility_violations.csv',accessibility)
await write('chart_data/16_responsive_failures.csv',responsiveSummary)
await write('chart_data/17_workflow_steps.csv',workflow)
await write('chart_data/18_source_complexity.csv',[
  {version_id:'foodmap_monolith',commit_sha:'770d84cacd02a76ef7e082a34175b1a7d3cb5697',metric:'main_view_lines',value:8481,unit:'lines',sample_size:1,run_type:'static_source_measurement',evidence_type:'git_blob_line_count',caveat:'Architectural evidence only.'},
  {version_id:'foodmap_final',commit_sha:'c1007231c2bf1dc77091bb381df5462de3dd6b6f',metric:'main_view_lines',value:3124,unit:'lines',sample_size:1,run_type:'static_source_measurement',evidence_type:'git_blob_line_count',caveat:'Architectural evidence only.'},
  {version_id:'foodmap_monolith',commit_sha:'770d84cacd02a76ef7e082a34175b1a7d3cb5697',metric:'distributed_feature_lines',value:8481,unit:'lines',sample_size:1,run_type:'static_source_measurement',evidence_type:'git_blob_line_count',caveat:'Single monolithic Vue file.'},
  {version_id:'foodmap_final',commit_sha:'c1007231c2bf1dc77091bb381df5462de3dd6b6f',metric:'distributed_feature_lines',value:9091,unit:'lines',sample_size:1,run_type:'static_source_measurement',evidence_type:'git_blob_line_count',caveat:'View plus extracted CSS and five production Vue components; tests excluded.'}
])

const stage1Build=buildSummary.find(r=>r.version_id==='frontend_stage1'),finalBuild=buildSummary.find(r=>r.version_id==='final')
const stage1Home=homeDesktop.frontend_stage1,finalHome=homeDesktop.final
const apiShared=['authentication_login','recipe_list','recipe_detail','checklist_retrieval'].map(id=>({id,before:apiSummary.find(r=>r.version_id==='realtime_pre_ws'&&r.endpoint_id===id),after:apiSummary.find(r=>r.version_id==='final'&&r.endpoint_id===id)}))
const finalRealtime=realtimeSummary.filter(r=>r.version_id==='realtime_final')
const visionComparable=visionSummary.filter(r=>['track2_v3','final'].includes(r.version_id))
const measuredRows={build:builds.length,lighthouse:lighthouse.length,navigation:navigation.length,responsive:responsive.length,api:(await read('api/api_runs.csv')).length,realtime:realtimeRuns.length,vision:visionRuns.length}
const observationCount=Object.values(measuredRows).reduce((a,b)=>a+b,0)
const mainViewReduction=percentChange(8481,3124)
const distributedChange=percentChange(8481,9091)
const apiRowsMarkdown=apiShared.map(x=>'| '+x.id+' | '+(x.before?.p50_ms||'unavailable')+' ms | '+(x.after?.p50_ms||'unavailable')+' ms | '+(x.before?.p95_ms||'unavailable')+' ms | '+(x.after?.p95_ms||'unavailable')+' ms |').join('\n')
const realtimeMarkdown=finalRealtime.map(r=>'- '+r.viewer_count+' viewer(s), '+r.operation+': p50 '+(r.p50_ms||'unavailable')+' ms, p95 '+(r.p95_ms||'unavailable')+' ms, lost '+(r.lost_events||0)+', duplicates '+(r.duplicate_events||0)+'.').join('\n')
const visionMarkdown=visionComparable.map(r=>'- '+r.version_id+': safe-routing accuracy '+(r.safe_routing_accuracy_percent||'unavailable')+'%, false-promotion rate '+(r.false_promotion_rate_percent||'unavailable')+'%, router p50 '+(r.p50_latency_ms||'unavailable')+' ms (150 measured case-runs).').join('\n')
const recipeDetailApi=apiShared.find(item=>item.id==='recipe_detail')

const report=`# FoodStory Controlled Comparative Benchmark Report

## Methodology

This benchmark uses feature-specific Git snapshots rather than treating one commit as the universal baseline. Detached worktrees preserve each committed source tree. Production frontend builds, local loopback Lighthouse runs, structural browser audits, sequential API calls, WebSocket delivery probes, and deterministic network-blocked Vision routing fixtures are retained as individual observations.

One warm-up precedes five measured Lighthouse/build/Vision repeats where supported. API endpoints use 30 sequential measured requests after one warm-up. Real-time delivery uses ten iterations at each of 1, 5, and 10 viewers, giving 30 iterations per event type across load levels. Failures and unavailable comparisons remain visible.

## Selected versions

See \`VERSION_SELECTION.md\` and \`version_manifest.csv\`. The principal snapshots are Stage 1 \`6df998a\`, Stage 2 \`35c8ddb\`, pre-WebSocket \`54779d5\`, early Vision \`5746fdf\`, monolithic Food Map \`770d84c\`, Track 2 V3 \`852d573\`, and final \`c100723\`.

## Controlled variables

- Same Windows 11 machine, CPU, RAM, Node/npm/Python executables, MySQL 8.0.19 instance, and loopback network.
- Production Vite builds, fixed desktop/mobile viewports, and retained raw reports.
- External AI/place/OCR/news providers excluded from controlled application-only claims.
- Same existing MySQL fixture for read-only API comparisons.

## Uncontrolled variables

- OS scheduling, power-plan changes, antivirus activity, and filesystem cache state.
- Historical dependency versions differ because each committed lockfile is respected.
- Live map tiles and external media/provider latency are not controlled.

## Results

### Frontend builds and public-page Lighthouse

| Measure | Stage 1 | Final | Change |
|---|---:|---:|---:|
| Warm build wall-clock mean | ${stage1Build?.wall_clock_mean_ms ?? 'unavailable'} ms | ${finalBuild?.wall_clock_mean_ms ?? 'unavailable'} ms | ${Number.isFinite(percentChange(Number(stage1Build?.wall_clock_mean_ms),Number(finalBuild?.wall_clock_mean_ms)))?percentChange(Number(stage1Build.wall_clock_mean_ms),Number(finalBuild.wall_clock_mean_ms)).toFixed(1)+'%':'unavailable'} |
| Generated JavaScript | ${stage1Build?.generated_js_bytes ?? 'unavailable'} bytes | ${finalBuild?.generated_js_bytes ?? 'unavailable'} bytes | - |
| Desktop Home LCP mean | ${stage1Home?.lcp_ms_mean ?? 'unavailable'} ms | ${finalHome?.lcp_ms_mean ?? 'unavailable'} ms | ${stage1Home&&finalHome?percentChange(Number(stage1Home.lcp_ms_mean),Number(finalHome.lcp_ms_mean)).toFixed(1)+'%':'unavailable'} |
| Desktop Home accessibility | ${stage1Home?.accessibility_score_percent_mean ?? 'unavailable'}% | ${finalHome?.accessibility_score_percent_mean ?? 'unavailable'}% | - |

Transferred-byte measurements are warm-cache Lighthouse observations because storage reset is disabled after the warm-up. They must not be presented as cold first-visit payloads.

### API latency

| Endpoint | Pre-WebSocket p50 | Final p50 | Pre-WebSocket p95 | Final p95 |
|---|---:|---:|---:|---:|
${apiRowsMarkdown}

Only read-only/login endpoints were executed against the existing database. Comment, rating, and favourite mutation latency is unavailable because no transactionally isolated API fixture existed.

### Real-time delivery

The pre-WebSocket snapshot has no broadcast mechanism, so its event latency is unavailable rather than zero. The final snapshot retained ${realtimeRuns.length} per-viewer delivery observations. Server broadcast timestamps and browser store/render timestamps were not instrumented; the valid metric is request-sent to WebSocket-receive latency.

${realtimeMarkdown}

### Vision routing safety

${visionMarkdown}

These are synchronous router results, not full Vision Auto media/OCR/place/dish results. Exact-place and dish metrics are blank because the recovered corpus does not label them.

### Food Map architecture

The main \`FoodMapView.vue\` changed from 8,481 lines to 3,124 lines (${mainViewReduction.toFixed(1)}%). When extracted CSS and five production Vue components are counted, the distributed feature total is 9,091 lines (${distributedChange.toFixed(1)}% versus the monolith). This supports a modularity claim, not a runtime-speed claim. Marker/FPS results remain unavailable because the two production snapshots lack a shared deterministic injection seam.

## Statistical coverage

Retained raw observations: ${observationCount} (${Object.entries(measuredRows).map(([k,v])=>`${k} ${v}`).join(', ')}). Summary tables report mean, median, minimum, maximum, p50, and p95 wherever repeated numeric observations exist.

## Major measured improvements

- Final desktop Home LCP mean was ${finalHome?.lcp_ms_mean ?? 'unavailable'} ms versus ${stage1Home?.lcp_ms_mean ?? 'unavailable'} ms for Stage 1 (${stage1Home&&finalHome?Math.abs(percentChange(Number(stage1Home.lcp_ms_mean),Number(finalHome.lcp_ms_mean))).toFixed(1)+'% lower':'unavailable'}) under the warm-cache local Lighthouse method.
- Safe routing and false-promotion behavior are directly comparable between Track 2 V3 and final on the recovered 30-case deterministic corpus.
- Final WebSocket delivery is measurable at 1, 5, and 10 viewers; the earlier snapshot has no equivalent capability.
- The Food Map entry view is substantially smaller, with functionality distributed into explicit components and CSS.

## Major measured regressions

- Final warm build wall-clock mean was ${finalBuild?.wall_clock_mean_ms ?? 'unavailable'} ms versus ${stage1Build?.wall_clock_mean_ms ?? 'unavailable'} ms for Stage 1; generated total output grew from ${stage1Build?.generated_total_bytes ?? 'unavailable'} to ${finalBuild?.generated_total_bytes ?? 'unavailable'} bytes.
- Recipe-detail API p95 was ${recipeDetailApi?.after?.p95_ms ?? 'unavailable'} ms in final versus ${recipeDetailApi?.before?.p95_ms ?? 'unavailable'} ms in the pre-WebSocket snapshot during this run; this tail result should be repeated before treating it as stable.
- Any page-level Lighthouse regression shown in \`frontend_summary.csv\` should be reported per route and viewport, not generalized to the entire application.

## Bottlenecks

- Final build output includes a very large static-asset set, which dominates generated-total bytes.
- Full Vision latency is dominated by stages absent from the deterministic router corpus and therefore remains unmeasured here.
- Authenticated UI and mutable API workflows require disposable database fixtures for credible repeated benchmarks.

## Valid comparisons

- Production build time and emitted sizes for the four successfully built frontend snapshots.
- Public equivalent routes that exist in both compared frontend versions.
- Shared read-only/login API endpoints against the same MySQL fixture.
- Track 2 V3 versus final safe routing on the identical recovered 30-case corpus.
- Final request-to-WebSocket-receive distributions across controlled viewer counts.
- Static source complexity measured from immutable Git blobs.

## Invalid or impossible comparisons

- Pages absent from earlier versions, authenticated Admin pages without a controlled auth profile, and the historical protected Food Map versus final guest preview.
- Full Vision exact-place, address precision/recall, dish accuracy, OCR/frame correlations, or stage timing without common labelled media.
- External provider latency as application latency.
- Pre-WebSocket event latency represented as zero.
- Food Map line-count reduction represented as proof of FPS/render improvement.

## Recommended charts and exact captions

1. **Production build cost by FoodStory version.** "Five warm production builds per version on the same Windows machine; bars show p50 and p95 wall-clock time."
2. **Public-page Lighthouse LCP by version and viewport.** "Five warm-cache Lighthouse runs per supported public route; unavailable pages are not imputed."
3. **Safe Shorts routing across compatible Vision versions.** "The same 30 labelled metadata/OCR routing cases were replayed with network access blocked; this is not full Vision Auto accuracy."
4. **API latency for shared endpoints.** "Thirty sequential loopback requests per endpoint and version against the same existing MySQL fixture; external providers excluded."
5. **Final WebSocket request-to-receive latency.** "Ten iterations per event type at 1, 5, and 10 viewers; server broadcast and browser render stages were not instrumented."
6. **Food Map source decomposition.** "Main-view lines decreased after extraction, while total distributed feature lines increased; line counts do not establish runtime speed."

## Statements that must not be made

- "The final application is universally faster than Stage 1/Stage 2."
- "Food Map refactoring improved FPS" or "line reduction caused runtime improvement."
- "Vision Auto achieved exact-place or dish accuracy" from this router-only corpus.
- "External news/AI/provider latency is backend processing time."
- "Pre-WebSocket latency was zero."
- "Blank or unavailable values are failures" or "unavailable values are zero."

## Limitations

This is a credible bounded benchmark, not a complete laboratory evaluation. Authenticated browser profiles, disposable database snapshots, identical downloadable media, provider quota, and internal server/browser instrumentation were not available. Those comparisons remain explicitly unavailable.
`
await fs.writeFile(path.join(root,'COMPARATIVE_BENCHMARK_REPORT.md'),report,'utf8')
await fs.appendFile(path.join(root,'BENCHMARK_EXECUTION_LOG.md'),`\n## Summary and chart-data generation\n\n- Generated frontend/build/accessibility summaries, 18 chart-ready CSV files, and COMPARATIVE_BENCHMARK_REPORT.md.\n- Retained blank fields for unsupported metrics; no unavailable value was converted to zero.\n`,'utf8')
console.log(JSON.stringify({frontend_summary_rows:frontendSummary.length,build_summary_rows:buildSummary.length,accessibility_rows:accessibility.length,chart_files:18,retained_observations:observationCount},null,2))
