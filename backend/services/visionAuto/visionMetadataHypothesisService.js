import { execFile } from 'node:child_process'
import pool from '../../db.js'
import { fetchYouTubeOEmbedMetadata } from '../socialUrlProviders/youtubeUrlProvider.js'

const fold = (value = '') => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const tokens = (value) => new Set(fold(value).split(' ').filter((v) => v.length > 1))
function overlap(a, b) { const x=tokens(a), y=tokens(b); if(!x.size||!y.size)return 0; let n=0; for(const t of x)if(y.has(t))n++; return n/Math.min(x.size,y.size) }
function unsafeSinglePlaceIntent(value) {
  return /\b(?:top\s*\d+|\d+\s+(?:quan|restaurants?)|food\s*tour|recipe|cong\s*thuc|cach\s*lam|nguyen\s*lieu)\b/i.test(fold(value))
}
export function isStrongRecipeMetadata(metadata) {
  const title = fold(metadata?.title)
  if (!title) return false
  return /\b(?:recipe|cooking|cook|cong thuc|cach lam|nguyen lieu|huong dan nau|lam mon)\b/i.test(title)
}

export function decideVisionMetadataFastPath({ metadata, localPlace } = {}) {
  if (localPlace) {
    return { terminal: true, status: 'matched_place', place: localPlace }
  }

  // Recipe-like metadata is useful classification evidence, but it cannot
  // prove that the video contains no storefront or address. Keep analyzing
  // frames instead of turning a metadata-only guess into a terminal result.
  return { terminal: false, recipeLike: isStrongRecipeMetadata(metadata) }
}
export async function fetchVisionMetadata(
  url,
  {
    timeoutMs = 8000,
    exec = execFile,
    fetchOEmbed = fetchYouTubeOEmbedMetadata,
  } = {},
) {
  const outputTemplate = '{"title":%(title)j,"description":%(description)j,"thumbnail":%(thumbnail)j,"duration":%(duration)j}'
  const ytDlpMetadata = await new Promise((resolve) => exec('yt-dlp', ['--skip-download','--no-warnings','--socket-timeout','6','--retries','0','--print',outputTemplate,url], { timeout: timeoutMs, windowsHide:true, maxBuffer: 64*1024 }, (error, stdout) => { if(error)return resolve(null); try { const p=JSON.parse(String(stdout).trim()); resolve({title:String(p.title||'').slice(0,400),description:String(p.description||'').slice(0,1000),thumbnail:Boolean(p.thumbnail),duration:Number(p.duration)||null}) } catch { resolve(null) } }))
  if (ytDlpMetadata?.title) return ytDlpMetadata

  try {
    const oembed = await fetchOEmbed(url, {
      timeoutMs: Math.min(6_000, Math.max(500, Number(timeoutMs) || 8_000)),
    })
    if (!oembed?.title) return ytDlpMetadata
    return {
      title: String(oembed.title).slice(0, 400),
      description: ytDlpMetadata?.description || '',
      thumbnail: Boolean(ytDlpMetadata?.thumbnail || oembed.thumbnailUrl),
      duration: ytDlpMetadata?.duration || null,
    }
  } catch {
    return ytDlpMetadata
  }
}
export async function resolveMetadataLocalPlace(metadata, { database = pool } = {}) {
  const title = String(metadata?.title || '').trim(); if(!title || unsafeSinglePlaceIntent(title)) return null
  const [rows] = await database.execute('SELECT id,name,address,district,latitude,longitude FROM restaurants WHERE latitude IS NOT NULL AND longitude IS NOT NULL LIMIT 500')
  const scored = rows.map((row) => { const name=overlap(title,row.name); const address=overlap(title,`${row.address||''} ${row.district||''}`); return {row,score:name*.72+address*.28} }).sort((a,b)=>b.score-a.score)[0]
  if(!scored || scored.score < .7 || overlap(title,scored.row.name)<.72) return null
  return { sourceType:'foodstory', sourceId:String(scored.row.id), id:`foodstory:restaurant:${scored.row.id}`, name:scored.row.name, formattedAddress:[scored.row.address,scored.row.district].filter(Boolean).join(', '), lat:Number(scored.row.latitude), lng:Number(scored.row.longitude), existsInFoodStory:true, _score:Math.round(scored.score*1000)/1000 }
}

export function buildMetadataLocationHypothesis(metadata) {
  const title = String(metadata?.title || '').replace(/\s+/g, ' ').trim()
  if (!title || unsafeSinglePlaceIntent(title)) return null
  const parts = title.split(/[,|–—]+/u).map((value) => value.trim()).filter(Boolean)
  if (parts.length < 2) return null
  const placeName = parts[0].replace(/^(?:review|visit|at|inside)\s*:?\s*/iu, '').trim()
  const locality = parts[1].replace(/\b(?:review|shorts?|video)\b.*$/iu, '').trim()
  const placeTokens = tokens(placeName)
  const localityTokens = tokens(locality)
  if (placeTokens.size < 2 || placeTokens.size > 8 || localityTokens.size < 2 || localityTokens.size > 8) return null
  return {
    id: 'metadata-title-hypothesis',
    placeName,
    address: null,
    locality,
    confidence: 0.78,
    source: 'metadata',
    sources: ['metadata_title'],
    observationCount: 1,
  }
}
