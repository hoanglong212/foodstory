<script setup>
import { computed } from 'vue'
import AppIcon from '../AppIcon.vue'
import { googlePlacePhotoUrl } from '../../services/visionAutoService'

const props = defineProps({
  state: { type: String, required: true },
  result: { type: Object, default: null },
  errorMessage: { type: String, default: '' },
  matchedMapPlace: { type: Object, default: null },
})

const emit = defineEmits([
  'dismiss',
  'focus-match',
  'save-match',
  'focus-candidate',
  'confirm-candidate',
  'edit-candidate',
  'reject-candidate',
  'try-link',
  'manual-add',
  'retry',
  'change-source',
  'select-dish',
  'focus-dish-place',
  'add-dish-place',
])

const match = computed(() => props.result?.matchedPlace || null)
const externalPlace = computed(() => props.result?.externalPlace || null)
const candidates = computed(() => {
  if (Array.isArray(props.result?.reviewCandidates) && props.result.reviewCandidates.length) {
    return props.result.reviewCandidates
  }
  return Array.isArray(props.result?.possiblePlaces) ? props.result.possiblePlaces : []
})
const isSingleReview = computed(() => props.state === 'review' && candidates.value.length === 1)
const isMultiReview = computed(() => props.state === 'review' && candidates.value.length > 1)
const dishCandidates = computed(() => Array.isArray(props.result?.dishCandidates) ? props.result.dishCandidates : [])
const dishPlaces = computed(() => Array.isArray(props.result?.restaurants) ? props.result.restaurants : [])

function hasCoordinates(candidate) {
  return Number.isFinite(Number(candidate?.lat)) && Number.isFinite(Number(candidate?.lng)) && candidate?.lat !== null && candidate?.lng !== null
}

function candidateWhy(candidate) {
  if (candidate?.source === 'food_map_local') return 'This matches a place already on your FoodStory map.'
  if (candidate?.sourceType === 'review_candidate') return 'This address came from video evidence and has not been verified against a real place record yet.'
  return 'The source aligns with this place record. Confirm it before adding it to your map.'
}

function ratingText(candidate) {
  if (candidate?.rating === null || candidate?.rating === undefined || candidate?.rating === '') return ''
  const rating = Number(candidate?.rating)
  return Number.isFinite(rating) ? `${rating.toFixed(1)} ★` : ''
}

function placePhotoUrl(place) {
  return googlePlacePhotoUrl(place?.photo?.name)
}

function priceText(priceLevel) {
  return {
    PRICE_LEVEL_FREE: 'Free',
    PRICE_LEVEL_INEXPENSIVE: 'Budget-friendly',
    PRICE_LEVEL_MODERATE: 'Mid-range',
    PRICE_LEVEL_EXPENSIVE: 'High-end',
    PRICE_LEVEL_VERY_EXPENSIVE: 'Premium',
  }[priceLevel] || ''
}

function dishExploreLinks(candidate) {
  const dishName = String(candidate?.dishName || '').trim()
  if (!dishName) return []
  const query = encodeURIComponent(dishName)
  return [
    { label: 'Articles & recipes', icon: 'book-open', url: `https://www.google.com/search?q=${query}+food+story+recipe` },
    { label: 'Video feed', icon: 'youtube', url: `https://www.youtube.com/results?search_query=${query}` },
  ]
}
</script>

<template>
  <aside
    v-if="!['idle', 'analyzing', 'fast_analysis', 'deep_analysis', 'resolving', 'dish_analyzing', 'dish_searching'].includes(state)"
    class="vision-result-panel"
    aria-live="polite"
    aria-label="Vision Auto result"
  >
    <button class="vision-result-close" type="button" aria-label="Close Vision Auto result" @click="emit('dismiss')">
      <AppIcon name="x" size="17" />
    </button>

    <template v-if="state === 'matched' && match">
      <span class="vision-result-kicker"><AppIcon name="check" size="15" /> Place found in FoodStory</span>
      <article class="vision-place-summary">
        <img v-if="matchedMapPlace?.image || match.image" :src="matchedMapPlace?.image || match.image" :alt="`Photo of ${matchedMapPlace?.name || match.name}`" />
        <div>
          <p class="vision-place-meta">{{ matchedMapPlace?.category || match.category || 'FoodStory Map' }}</p>
          <h2>{{ matchedMapPlace?.name || match.name }}</h2>
          <p>{{ matchedMapPlace?.address || match.address }}</p>
          <small v-if="ratingText(matchedMapPlace || match)">{{ ratingText(matchedMapPlace || match) }}</small>
        </div>
      </article>
      <div class="vision-result-actions">
        <button class="vision-result-primary" type="button" @click="emit('focus-match')">View on map</button>
        <button type="button" @click="emit('focus-match')">Details</button>
        <button v-if="matchedMapPlace" type="button" @click="emit('save-match')"><AppIcon name="bookmark" size="16" /> {{ matchedMapPlace.isOwned ? 'Open My Map' : 'Add to My Map' }}</button>
      </div>
    </template>

    <template v-else-if="state === 'external' && externalPlace">
      <span class="vision-result-kicker"><AppIcon name="map-pin" size="15" /> Place found</span>
      <h2>{{ externalPlace.name }}</h2>
      <p class="vision-result-copy">This place is not yet available in FoodStory.</p>
      <article class="vision-place-card">
        <div>
          <p>{{ externalPlace.address }}</p>
          <small>Resolved to a real place record with map coordinates.</small>
        </div>
      </article>
      <div class="vision-result-actions">
        <button class="vision-result-primary" type="button" @click="emit('focus-candidate', externalPlace)">View on map</button>
        <button type="button" @click="emit('confirm-candidate', externalPlace)">Add to FoodStory</button>
        <button class="vision-result-quiet" type="button" @click="emit('dismiss')">Dismiss</button>
      </div>
    </template>

    <template v-else-if="isSingleReview">
      <span class="vision-result-kicker"><AppIcon name="map-pin" size="15" /> Review before adding</span>
      <h2>Possible place found</h2>
      <p class="vision-result-copy">
        {{ result?.sourceContext?.isMultiPlace
          ? 'This video may mention multiple places. One place was resolved.'
          : 'We found a real place record that may match this source.' }}
      </p>
      <article class="vision-place-card">
        <div>
          <h3>{{ candidates[0].name }}</h3>
          <p>{{ candidates[0].address }}</p>
          <small>{{ candidateWhy(candidates[0]) }}</small>
        </div>
        <div class="vision-candidate-actions">
          <button v-if="hasCoordinates(candidates[0])" type="button" @click="emit('focus-candidate', candidates[0])">View</button>
          <button class="vision-result-primary" type="button" @click="emit('confirm-candidate', candidates[0])">Confirm</button>
          <button type="button" @click="emit('edit-candidate', candidates[0])">Edit details</button>
          <button class="vision-result-quiet" type="button" @click="emit('reject-candidate')">Not this place</button>
        </div>
      </article>
    </template>

    <template v-else-if="(state === 'multi_place' || isMultiReview) && candidates.length">
      <span class="vision-result-kicker"><AppIcon name="map-pin" size="15" /> Review places</span>
      <h2>Multiple places found</h2>
      <p class="vision-result-copy">This video appears to mention several places.</p>
      <ol class="vision-place-list">
        <li v-for="(candidate, index) in candidates" :key="candidate.id" class="vision-place-card">
          <span class="vision-place-index">{{ index + 1 }}</span>
          <div>
            <h3>{{ candidate.name }}</h3>
            <p>{{ candidate.address }}</p>
            <small>{{ candidateWhy(candidate) }}</small>
            <div class="vision-candidate-actions">
              <button v-if="hasCoordinates(candidate)" type="button" @click="emit('focus-candidate', candidate)">View</button>
              <button class="vision-result-primary" type="button" @click="emit('confirm-candidate', candidate)">Confirm</button>
              <button class="vision-result-quiet" type="button" @click="emit('reject-candidate')">Not this place</button>
            </div>
          </div>
        </li>
      </ol>
    </template>

    <template v-else-if="state === 'dish_candidates' && dishCandidates.length">
      <span class="vision-result-kicker"><AppIcon name="utensils" size="15" /> Dish Vision</span>
      <h2>Which dish looks right?</h2>
      <p class="vision-result-copy">Confirm one visual match before FoodStory searches for places that serve it.</p>
      <figure v-if="result?.source?.thumbnailUrl" class="vision-dish-source">
        <img :src="result.source.thumbnailUrl" :alt="result.source.title ? `Thumbnail from ${result.source.title}` : 'Food shown in the source video'" />
        <figcaption>
          <span>From the source video</span>
          <a v-if="result.source.url" :href="result.source.url" target="_blank" rel="noopener noreferrer">Watch source</a>
        </figcaption>
      </figure>
      <ol class="vision-place-list">
        <li v-for="candidate in dishCandidates" :key="candidate.id" class="vision-place-card vision-dish-candidate">
          <div>
            <h3>{{ candidate.dishName }}</h3>
            <p v-if="candidate.cuisine">{{ candidate.cuisine }}</p>
            <small v-if="candidate.visualEvidence?.length">Seen in the thumbnail: {{ candidate.visualEvidence.join(', ') }}</small>
            <div v-if="candidate.aliases?.length" class="vision-dish-aliases" aria-label="Other names">
              <span v-for="alias in candidate.aliases.slice(0, 3)" :key="alias">{{ alias }}</span>
            </div>
            <button class="vision-result-primary vision-dish-select" type="button" @click="emit('select-dish', candidate)">
              Find places serving this
            </button>
            <nav class="vision-dish-links" aria-label="Explore this dish">
              <a v-for="link in dishExploreLinks(candidate)" :key="link.url" :href="link.url" target="_blank" rel="noopener noreferrer">
                <AppIcon :name="link.icon" size="14" /> {{ link.label }}
              </a>
            </nav>
          </div>
        </li>
      </ol>
      <p class="vision-safety-note">These are dish suggestions only. FoodStory is not claiming where the video was filmed.</p>
    </template>

    <template v-else-if="state === 'external_places_found' && dishPlaces.length">
      <span class="vision-result-kicker"><AppIcon name="map-pin" size="15" /> Google Places</span>
      <h2>Real places matching {{ result?.selectedDish?.dishName }}</h2>
      <p class="vision-result-copy">Ranked from Google Places around the current map area. These are alternatives, not the original video location.</p>
      <ol class="vision-place-list">
        <li v-for="place in dishPlaces" :key="place.id" class="vision-place-card vision-external-place">
          <figure v-if="placePhotoUrl(place)" class="vision-place-photo">
            <img :src="placePhotoUrl(place)" :alt="`Photo of ${place.name}`" loading="lazy" @error="$event.currentTarget.closest('figure').hidden = true" />
            <figcaption v-if="place.photo?.attribution?.[0]">
              <a v-if="place.photo.attribution[0].uri" :href="place.photo.attribution[0].uri" target="_blank" rel="noopener noreferrer">Photo: {{ place.photo.attribution[0].displayName }}</a>
              <span v-else>Photo: {{ place.photo.attribution[0].displayName }}</span>
            </figcaption>
          </figure>
          <div>
            <h3>{{ place.name }}</h3>
            <p>{{ [place.address, place.district].filter(Boolean).join(', ') || place.category }}</p>
            <div class="vision-place-facts">
              <span v-if="priceText(place.priceLevel)">{{ priceText(place.priceLevel) }}</span>
              <span v-if="ratingText(place)">{{ ratingText(place) }}<template v-if="place.userRatingCount"> · {{ place.userRatingCount.toLocaleString() }} ratings</template></span>
              <span v-if="place.distanceKm !== null">{{ place.distanceKm }} km away</span>
            </div>
            <blockquote v-if="place.reviews?.[0]" class="vision-place-review">
              <p>“{{ place.reviews[0].text }}”</p>
              <footer>
                {{ place.reviews[0].authorName }}<template v-if="place.reviews[0].relativeTime"> · {{ place.reviews[0].relativeTime }}</template>
                <a v-if="place.reviews[0].sourceUri" :href="place.reviews[0].sourceUri" target="_blank" rel="noopener noreferrer">Read on Google</a>
              </footer>
            </blockquote>
            <small v-else>
              <template v-if="ratingText(place)">{{ ratingText(place) }}<template v-if="place.userRatingCount"> · {{ place.userRatingCount.toLocaleString() }} ratings</template></template>
              <template v-if="place.distanceKm !== null"> · {{ place.distanceKm }} km away</template>
            </small>
            <div class="vision-candidate-actions">
              <button class="vision-result-primary" type="button" @click="emit('focus-dish-place', place)">View on map</button>
              <button type="button" @click="emit('add-dish-place', place)">Add to FoodStory</button>
            </div>
          </div>
        </li>
      </ol>
      <nav class="vision-dish-explore" aria-label="Stories and feeds about this dish">
        <strong>Stories & feeds about {{ result?.selectedDish?.dishName }}</strong>
        <a v-for="link in dishExploreLinks(result?.selectedDish)" :key="link.url" :href="link.url" target="_blank" rel="noopener noreferrer">
          <AppIcon :name="link.icon" size="15" /> {{ link.label }}
        </a>
      </nav>
    </template>

    <template v-else-if="state === 'dish_not_identified'">
      <span class="vision-result-kicker"><AppIcon name="search" size="15" /> Dish Vision</span>
      <h2>No clear dish found</h2>
      <p class="vision-result-copy">The public thumbnail did not show enough detail to name a dish reliably.</p>
      <div class="vision-result-actions">
        <button class="vision-result-primary" type="button" @click="emit('try-link')">Try another video</button>
        <button type="button" @click="emit('dismiss')">Browse the map</button>
      </div>
    </template>

    <template v-else-if="state === 'external_places_not_found'">
      <span class="vision-result-kicker"><AppIcon name="search" size="15" /> Google Places</span>
      <h2>No nearby match for {{ result?.selectedDish?.dishName }}</h2>
      <p class="vision-result-copy">Try moving the map to another area, then run the search again.</p>
      <div class="vision-result-actions">
        <button class="vision-result-primary" type="button" @click="emit('try-link')">Try another video</button>
        <button type="button" @click="emit('dismiss')">Browse the map</button>
      </div>
    </template>

    <template v-else-if="state === 'external_places_unavailable'">
      <span class="vision-result-kicker"><AppIcon name="search" size="15" /> Real-place search</span>
      <h2>External place search is not ready</h2>
      <p class="vision-result-copy">Dish identification works, but the Google Places connection has not been configured yet.</p>
      <div class="vision-result-actions">
        <button class="vision-result-primary" type="button" @click="emit('try-link')">Try another video</button>
        <button type="button" @click="emit('dismiss')">Browse the map</button>
      </div>
    </template>

    <template v-else-if="state === 'not_found'">
      <span class="vision-result-kicker"><AppIcon name="search" size="15" /> Vision Auto</span>
      <h2>{{ result?.reason === 'analysis_timeout' ? "We couldn't resolve this video in time." : 'No reliable place found' }}</h2>
      <p class="vision-result-copy">{{ result?.reason === 'analysis_timeout' ? 'Try again, try another link, or add the place manually.' : "We couldn't find enough location detail in this video." }}</p>
      <div class="vision-result-actions vision-result-actions-stack">
        <button class="vision-result-primary" type="button" @click="emit('try-link')">Try another link</button>
        <button class="vision-result-quiet" type="button" @click="emit('manual-add')">Add place manually</button>
      </div>
    </template>

    <template v-else-if="state === 'error'">
      <span class="vision-result-kicker"><AppIcon name="x" size="15" /> Vision Auto</span>
      <h2>We couldn't analyze this source right now.</h2>
      <p v-if="errorMessage" class="vision-result-copy">{{ errorMessage }}</p>
      <div class="vision-result-actions">
        <button class="vision-result-primary" type="button" @click="emit('retry')">Try again</button>
        <button type="button" @click="emit('change-source')">Change source</button>
      </div>
    </template>
  </aside>
</template>

<style scoped>
.vision-result-panel {
  position: fixed;
  z-index: 32;
  top: calc(var(--nav-height) + 22px);
  right: 28px;
  width: min(430px, calc(100vw - 116px));
  max-height: calc(100svh - var(--nav-height) - 46px);
  overflow: auto;
  padding: 20px;
  border: 0;
  border-radius: 16px;
  color: #fffaf4;
  background: #202124;
  box-shadow: 0 16px 32px rgba(20, 15, 11, 0.26);
}

.vision-result-panel h2,
.vision-place-card h3 { margin: 0; color: #fffaf4; }
.vision-result-panel h2 { padding-right: 32px; font-size: 1.15rem; line-height: 1.25; }
.vision-place-card h3 { font-size: .92rem; line-height: 1.3; }
.vision-result-kicker { display: inline-flex; align-items: center; gap: 6px; margin-bottom: 10px; color: #f3a263; font-size: .7rem; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; }
.vision-result-copy { margin: 9px 0 15px; color: rgba(255,250,244,.7); font-size: .82rem; line-height: 1.5; }
.vision-result-close { position: absolute; top: 10px; right: 10px; display: grid; width: 44px; height: 44px; place-items: center; padding: 0; border: 1px solid rgba(255,255,255,.13); border-radius: 9px; color: rgba(255,250,244,.86); background: rgba(255,255,255,.04); }
.vision-place-summary { display: grid; grid-template-columns: 88px minmax(0, 1fr); gap: 12px; margin-top: 14px; }
.vision-place-summary img { width: 88px; height: 80px; border-radius: 10px; object-fit: cover; }
.vision-place-summary div { min-width: 0; }
.vision-place-summary h2 { padding: 0; overflow-wrap: anywhere; font-size: 1rem; }
.vision-place-summary p:not(.vision-place-meta), .vision-place-card p { margin: 5px 0 0; color: rgba(255,250,244,.72); font-size: .78rem; line-height: 1.4; overflow-wrap: anywhere; }
.vision-place-meta { margin: 0 0 4px; color: #f3a263; font-size: .68rem; font-weight: 750; text-transform: uppercase; }
.vision-place-summary small, .vision-place-card small { display: block; margin-top: 7px; color: rgba(255,250,244,.57); font-size: .7rem; line-height: 1.4; }
.vision-result-actions, .vision-candidate-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
.vision-result-actions-stack { display: grid; }
.vision-result-actions button, .vision-candidate-actions button { min-height: 44px; padding: 0 12px; border: 1px solid rgba(255,255,255,.15); border-radius: 9px; color: rgba(255,250,244,.9); background: rgba(255,255,255,.04); font-size: .76rem; font-weight: 800; }
.vision-result-primary { border-color: #f08b43 !important; color: #2a160b !important; background: #f29a55 !important; }
.vision-result-quiet { color: rgba(255,250,244,.64) !important; background: transparent !important; }
.vision-place-list { display: grid; gap: 10px; margin: 14px 0 0; padding: 0; list-style: none; }
.vision-place-card { display: grid; grid-template-columns: auto minmax(0,1fr); gap: 10px; padding: 12px; border: 1px solid rgba(255,255,255,.12); border-radius: 12px; background: #18191b; }
.vision-place-card > div { min-width: 0; }
.vision-place-index { display: grid; width: 24px; height: 24px; place-items: center; border: 1px solid rgba(243,150,77,.35); border-radius: 50%; color: #f3a263; font-size: .72rem; font-weight: 850; }
.vision-place-card:not(li) { grid-template-columns: minmax(0,1fr); }
.vision-dish-candidate { grid-template-columns: minmax(0,1fr); }
.vision-dish-select { min-height: 44px; margin-top: 12px; padding: 0 12px; border-radius: 9px; font-size: .76rem; font-weight: 800; }
.vision-safety-note { margin: 14px 0 0; color: rgba(255,250,244,.67); font-size: .72rem; line-height: 1.45; }
.vision-dish-source { margin: 0 0 14px; overflow: hidden; border-radius: 12px; background: #121315; }
.vision-dish-source img { display: block; width: 100%; aspect-ratio: 16 / 9; object-fit: cover; }
.vision-dish-source figcaption { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 9px 11px; color: rgba(255,250,244,.68); font-size: .7rem; }
.vision-dish-source a, .vision-dish-links a, .vision-dish-explore a, .vision-place-review a, .vision-place-photo a { color: #f5aa71; font-weight: 750; text-decoration: none; }
.vision-dish-aliases { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 9px; }
.vision-dish-aliases span { padding: 4px 7px; border-radius: 999px; color: rgba(255,250,244,.75); background: rgba(255,255,255,.07); font-size: .65rem; }
.vision-dish-links { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 12px; }
.vision-dish-links a, .vision-dish-explore a { display: inline-flex; min-height: 44px; align-items: center; gap: 6px; font-size: .72rem; }
.vision-external-place { grid-template-columns: 104px minmax(0,1fr); align-items: start; }
.vision-place-photo { position: relative; margin: 0; overflow: hidden; border-radius: 9px; background: #292a2d; }
.vision-place-photo img { display: block; width: 104px; height: 104px; object-fit: cover; }
.vision-place-photo figcaption { position: absolute; right: 0; bottom: 0; left: 0; padding: 16px 5px 4px; background: linear-gradient(transparent, rgba(0,0,0,.8)); font-size: .56rem; line-height: 1.2; }
.vision-place-photo figcaption a, .vision-place-photo figcaption span { color: rgba(255,255,255,.9); }
.vision-place-facts { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 9px; }
.vision-place-facts span { padding: 4px 7px; border-radius: 6px; color: #f7d3b6; background: rgba(243,150,77,.1); font-size: .64rem; font-weight: 750; }
.vision-place-review { margin: 11px 0 0; padding: 0; color: rgba(255,250,244,.78); }
.vision-place-review p { display: -webkit-box; margin: 0; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 3; font-size: .72rem; font-style: italic; line-height: 1.45; }
.vision-place-review footer { display: flex; flex-wrap: wrap; gap: 5px 9px; margin-top: 5px; color: rgba(255,250,244,.56); font-size: .63rem; }
.vision-dish-explore { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 14px; margin-top: 14px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,.1); }
.vision-dish-explore strong { flex-basis: 100%; color: rgba(255,250,244,.8); font-size: .72rem; }
button:focus-visible, a:focus-visible { outline: 3px solid rgba(249,151,76,.85); outline-offset: 2px; }
@media (hover:hover) and (pointer:fine) { .vision-result-actions button:not(.vision-result-primary):hover, .vision-candidate-actions button:not(.vision-result-primary):hover { border-color: rgba(243,150,77,.3); background: rgba(243,150,77,.08); transform: translateY(-1px); } .vision-result-primary:hover { background: #f7a464 !important; transform: translateY(-1px); } }
@media (max-width:768px) { .vision-result-panel { top: auto; right: 12px; bottom: calc(158px + env(safe-area-inset-bottom)); left: 12px; width: auto; max-height: min(62svh, 580px); } .vision-external-place { grid-template-columns: 88px minmax(0,1fr); } .vision-place-photo img { width: 88px; height: 96px; } }
:global(:root[data-theme="light"]) .vision-result-panel { color: #302219; background: #fff; box-shadow: 0 6px 12px rgba(72,48,29,.13); }
:global(:root[data-theme="light"]) .vision-result-panel h2,
:global(:root[data-theme="light"]) .vision-place-card h3,
:global(:root[data-theme="light"]) .vision-place-summary h2 { color: #302219; }
:global(:root[data-theme="light"]) .vision-result-copy,
:global(:root[data-theme="light"]) .vision-place-summary p:not(.vision-place-meta),
:global(:root[data-theme="light"]) .vision-place-card p { color: #665347; }
:global(:root[data-theme="light"]) .vision-place-summary small,
:global(:root[data-theme="light"]) .vision-place-card small,
:global(:root[data-theme="light"]) .vision-safety-note { color: #78685d; }
:global(:root[data-theme="light"]) .vision-place-card,
:global(:root[data-theme="light"]) .vision-dish-source { border-color: rgba(68,45,28,.13); background: #f7f3ee; }
:global(:root[data-theme="light"]) .vision-result-close,
:global(:root[data-theme="light"]) .vision-result-actions button,
:global(:root[data-theme="light"]) .vision-candidate-actions button { border-color: rgba(68,45,28,.16); color: #4f3c30; background: #f8f4ef; }
:global(:root[data-theme="light"]) .vision-dish-source figcaption,
:global(:root[data-theme="light"]) .vision-place-review { color: #665347; }
:global(:root[data-theme="light"]) .vision-dish-aliases span { color: #665347; background: #ebe5de; }
:global(:root[data-theme="light"]) .vision-place-facts span { color: #8d3c18; background: #fff0e5; }
:global(:root[data-theme="light"]) .vision-dish-explore { border-top-color: rgba(68,45,28,.12); }
:global(:root[data-theme="light"]) .vision-dish-explore strong { color: #594638; }
@media (prefers-reduced-motion:reduce) { .vision-result-actions button, .vision-candidate-actions button { transition-duration: .01ms; } }
</style>
