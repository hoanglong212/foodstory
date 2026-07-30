import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { performance } from 'node:perf_hooks'

const root = path.resolve(import.meta.dirname, '..')
const fixturePath = 'C:\\COS30043\\foodstory-benchmark-worktrees\\track2-v3\\backend\\tests\\fixtures\\youtube-shorts-address-30.json'
const fixture = JSON.parse(await fs.readFile(fixturePath, 'utf8'))
const versions = [
  { id:'track2_v3', commit:'852d5735c5e20abf995ffa3a4e096e04add88586', service:'C:\\COS30043\\foodstory-benchmark-worktrees\\track2-v3\\backend\\src\\services\\shortsAddressRouterService.js' },
  { id:'final', commit:'c1007231c2bf1dc77091bb381df5462de3dd6b6f', service:'C:\\COS30043\\foodstory-benchmark-worktrees\\final\\backend\\src\\services\\shortsAddressRouterService.js' },
]

function csvEscape(value) {
  const text = value == null ? '' : String(value)
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"','""')}"` : text
}
function csv(rows) {
  const headers = [...new Set(rows.flatMap((row)=>Object.keys(row)))]
  return headers.join(',')+'\r\n'+rows.map((row)=>headers.map((h)=>csvEscape(row[h])).join(',')).join('\r\n')+'\r\n'
}
function inputFor(item) {
  return {
    url:item.url, title:item.title||'', description:item.description||'', descriptionRawFromYoutube:item.descriptionRawFromYoutube||'',
    pageMetadataText:item.pageMetadataText||'', serpSnippet:item.serpSnippet||'', jsonldObjects:item.jsonldObjects||[], ocrText:item.ocrText||'', asrText:item.asrText||''
  }
}
function percentile(sorted,p){ return sorted[Math.max(0,Math.ceil(sorted.length*p/100)-1)] }

await fs.mkdir(path.join(root,'vision'),{recursive:true})
const rows=[]
const stageRows=[]
const originalFetch=globalThis.fetch
globalThis.fetch=async()=>{throw new Error('Network blocked in deterministic Vision routing benchmark')}
try {
  for(const version of versions){
    const {routeShortsAddress}=await import(pathToFileURL(version.service).href)
    for(let runIndex=0;runIndex<=5;runIndex+=1){
      for(const item of fixture.cases){
        const start=performance.now()
        let result=null,error=''
        try{result=routeShortsAddress(inputFor(item))}catch(caught){error=String(caught?.message||caught).slice(0,300)}
        const duration=performance.now()-start
        const actualTrack=result?.track||'ERROR'
        const correct=actualTrack===item.expectedTrack
        rows.push({
          version_id:version.id,commit_sha:version.commit,corpus_id:fixture.version,case_id:item.id,url:item.url,expected_category:item.expectedTrack,
          expected_place_or_address:item.expectedNormalizedAddress||item.expectedCandidateAddress||'',expected_dish:'',actual_final_status:actualTrack,
          matched_place:result?.candidateAddress||'',candidate_place:result?.candidateAddress||'',candidate_dish:'',confidence:result?.confidence||'',
          correct_exact_match:'',correct_partial_match:'',safe_review_result:item.expectedTrack==='TRACK_2'&&actualTrack==='TRACK_2'?1:0,
          false_positive:0,false_promotion:item.expectedTrack==='TRACK_2'&&actualTrack==='TRACK_1'?1:0,false_negative:item.expectedTrack==='TRACK_1'&&actualTrack!=='TRACK_1'?1:0,
          timeout:0,provider_error:error?1:0,total_wall_clock_ms:duration.toFixed(6),queue_wait_ms:'',metadata_time_ms:'',media_acquisition_time_ms:'',frame_extraction_time_ms:'',ocr_time_ms:'',asr_time_ms:'',model_provider_time_ms:'',place_resolution_time_ms:'',
          frame_count:'',crop_count:'',ocr_call_count:0,asr_windows:0,provider_call_count:0,peak_memory_bytes:'',run_index:runIndex,run_type:runIndex===0?'warmup':'measured_warm',evidence_type:'deterministic_30_case_router_fixture',sample_size:runIndex===0?30:150,
          caveat:'Measures safe Track 1/Track 2 routing only. It is not a full media/OCR/dish/place benchmark and cannot support exact-place or dish-accuracy claims.',error
        })
        stageRows.push({version_id:version.id,commit_sha:version.commit,case_id:item.id,run_index:runIndex,run_type:runIndex===0?'warmup':'measured_warm',evidence_type:'deterministic_30_case_router_fixture',total_wall_clock_ms:duration.toFixed(6),queue_wait_ms:'',metadata_time_ms:'',media_acquisition_time_ms:'',frame_extraction_time_ms:'',ocr_time_ms:'',asr_time_ms:'',model_provider_time_ms:'',place_resolution_time_ms:'',sample_size:runIndex===0?30:150,caveat:'Only synchronous router wall time is observable; stage timings are unavailable.'})
      }
    }
  }
}finally{globalThis.fetch=originalFetch}

await fs.writeFile(path.join(root,'vision','vision_runs.csv'),csv(rows),'utf8')
await fs.writeFile(path.join(root,'vision','vision_stage_breakdown.csv'),csv(stageRows),'utf8')

const outcomes=[]
const summaries=[]
for(const version of versions){
  const measured=rows.filter((r)=>r.version_id===version.id&&r.run_type==='measured_warm')
  const caseLatest=measured.filter((r)=>r.run_index===1)
  const durations=measured.map((r)=>Number(r.total_wall_clock_ms)).sort((a,b)=>a-b)
  for(const outcome of ['TRACK_1','TRACK_2','ERROR']){
    const count=caseLatest.filter((r)=>r.actual_final_status===outcome).length
    outcomes.push({version_id:version.id,commit_sha:version.commit,outcome,sample_size:caseLatest.length,count,rate_percent:((count/caseLatest.length)*100).toFixed(2),run_type:'measured_warm_representative_repeat',evidence_type:'deterministic_30_case_router_fixture',caveat:'Outcome is router track, not full Vision Auto final status.'})
  }
  const correct=caseLatest.filter((r)=>r.actual_final_status===r.expected_category).length
  const falsePromotions=caseLatest.reduce((a,r)=>a+Number(r.false_promotion),0)
  summaries.push({version_id:version.id,commit_sha:version.commit,corpus_id:fixture.version,run_type:'measured_warm',evidence_type:'deterministic_30_case_router_fixture',sample_size:150,unique_cases:30,exact_place_accuracy_percent:'',address_precision_percent:'',address_recall_percent:'',dish_top1_accuracy_percent:'',dish_top3_recall_percent:'',safe_routing_accuracy_percent:((correct/30)*100).toFixed(2),false_promotion_rate_percent:((falsePromotions/30)*100).toFixed(2),review_candidate_rate_percent:((caseLatest.filter(r=>r.actual_final_status==='TRACK_2').length/30)*100).toFixed(2),not_found_rate_percent:'',timeout_rate_percent:'0.00',p50_latency_ms:percentile(durations,50).toFixed(6),p95_latency_ms:percentile(durations,95).toFixed(6),caveat:'Only safe routing has labelled ground truth. Place/address/dish accuracy metrics are intentionally blank.'})
}
summaries.unshift({version_id:'vision_early',commit_sha:'5746fdf39dc38d3b50b71513a270a59a853ffed6',corpus_id:fixture.version,run_type:'unavailable',evidence_type:'compatibility_limitation',sample_size:0,unique_cases:30,caveat:'Earliest Vision implementation cannot accept this later router corpus through an equivalent deterministic interface.'})
await fs.writeFile(path.join(root,'vision','vision_outcomes.csv'),csv(outcomes),'utf8')
await fs.writeFile(path.join(root,'vision','vision_summary.csv'),csv(summaries),'utf8')
await fs.writeFile(path.join(root,'vision','GROUND_TRUTH_LIMITATIONS.md'),`# Vision Ground-Truth Limitations\n\nThe recovered 30-case corpus labels only safe routing between Track 1 and Track 2. It contains expected textual address evidence for some cases but does not provide verified place identities, dish labels, media files, frame-level OCR truth, or provider-independent stage timings.\n\nConsequently, this benchmark reports safe-routing accuracy and false-promotion rate only. Exact-place accuracy, address precision/recall, dish top-1 accuracy, dish top-3 recall, frame/OCR correlations, and full Vision Auto latency are not calculated. Blank values mean unsupported, not zero.\n\nThe early Vision snapshot cannot consume the later 30-case corpus through an equivalent deterministic interface. The final commit no longer includes this fixture; the immutable copy from Track 2 V3 commit \`852d5735c5e20abf995ffa3a4e096e04add88586\` is replayed against both compatible router implementations with network access blocked.\n`,'utf8')
await fs.appendFile(path.join(root,'BENCHMARK_EXECUTION_LOG.md'),`\n## Deterministic Vision routing benchmark\n\n- Replayed 30 labelled cases for one warm-up and five measured repeats against Track 2 V3 and final router implementations.\n- Network access was blocked; provider call count was zero.\n- Full Vision/OCR/dish/place metrics were left unavailable because the corpus does not label them.\n`,'utf8')
console.log(JSON.stringify({vision_run_rows:rows.length,stage_rows:stageRows.length,summary_rows:summaries.length},null,2))
