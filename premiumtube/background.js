// PremiumTube - Background Service Worker
// Handles API calls, caching, and cross-tab communication

const SPONSORBLOCK_API = 'https://sponsor.ajay.app/api/skipSegments';
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

// In-memory cache for skip segments.
//
// Note on lifetime: an MV3 service worker is torn down after roughly 30s
// idle, and this Map dies with it. CACHE_DURATION is therefore an upper
// bound, not a guarantee - in practice entries survive only as long as the
// worker does. That is fine for the case this exists for (rapid replays and
// seeking within one video), so the cache stays in memory rather than
// paying a storage round-trip on every lookup.
//
// MAX_CACHE_ENTRIES bounds the Map for the case where the worker DOES stay
// alive through a long watch session.
const MAX_CACHE_ENTRIES = 100;
const segmentCache = new Map();

/** Insert, evicting the oldest entry once the cache is full. Map preserves
 *  insertion order, so the first key is the oldest. */
function cacheSet(videoId, segments) {
  if (segmentCache.size >= MAX_CACHE_ENTRIES) {
    segmentCache.delete(segmentCache.keys().next().value);
  }
  segmentCache.set(videoId, { segments, timestamp: Date.now() });
}

// Default settings applied on first install
const DEFAULT_SETTINGS = {
  // Phase 1 - Free features
  skipIntro: true,
  skipOutro: true,
  skipSponsor: true,
  skipSelfpromo: true,
  skipInteraction: true,
  skipMusicOfftopic: true,
  skipPreview: true,
  skipFiller: true,
  adSkip: true,
  pipEnabled: true,
  pipAutoSwitch: true,
  backgroundPlay: true,
  autoMaxQuality: true,

  // Premium feel
  autoDismissPopups: true,
  hidePremiumUpsells: true,
  continuousPlay: true,

  // Enhancement features
  keyboardShortcuts: true,
  videoStats: false,
  bassBoost: false,
  audioNormalizer: false,
  cinematicMode: false,
  videoSharpening: false,
  sharpeningStrength: 0.5,

};

// Initialize default settings on install
chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.sync.get(null);
  const merged = { ...DEFAULT_SETTINGS, ...existing };
  await chrome.storage.sync.set(merged);
  console.log('[PremiumTube] Extension installed, settings initialized');
});

// Listen for messages from content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'FETCH_SEGMENTS') {
    fetchSkipSegments(message.videoId)
      .then(segments => sendResponse({ success: true, segments }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // Keep message channel open for async response
  }

  if (message.type === 'GET_SETTINGS') {
    chrome.storage.sync.get(null)
      .then(settings => sendResponse({ success: true, settings }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'SAVE_SETTINGS') {
    chrome.storage.sync.set(message.settings)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }


});

// Fetch skip segments from SponsorBlock API with caching
async function fetchSkipSegments(videoId) {
  // Check cache first
  const cached = segmentCache.get(videoId);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    console.log(`[PremiumTube] Cache hit for ${videoId}`);
    return cached.segments;
  }

  const categories = JSON.stringify([
    'intro', 'outro', 'sponsor', 'selfpromo',
    'interaction', 'music_offtopic', 'preview', 'filler'
  ]);

  const url = `${SPONSORBLOCK_API}?videoID=${videoId}&categories=${encodeURIComponent(categories)}`;

  try {
    const response = await fetch(url);

    if (response.status === 404) {
      // No segments found for this video - cache empty result
      cacheSet(videoId, []);
      return [];
    }

    if (!response.ok) {
      throw new Error(`SponsorBlock API error: ${response.status}`);
    }

    const data = await response.json();

    const segments = data.map(seg => ({
      start: seg.segment[0],
      end: seg.segment[1],
      category: seg.category,
      uuid: seg.UUID
    }));

    // Cache the result
    cacheSet(videoId, segments);
    console.log(`[PremiumTube] Fetched ${segments.length} segments for ${videoId}`);

    return segments;
  } catch (err) {
    console.error(`[PremiumTube] Failed to fetch segments: ${err.message}`);
    throw err;
  }
}

// (No periodic cleanup timer here on purpose: a setInterval registered at
//  the top level of an MV3 service worker does not keep the worker alive,
//  so a 5-minute sweep would almost never fire - the worker is long dead by
//  then, taking the whole Map with it. Staleness is handled at read time by
//  the CACHE_DURATION check, and size by the eviction in cacheSet.)
