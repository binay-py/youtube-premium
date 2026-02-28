// PremiumTube - Background Service Worker
// Handles API calls, caching, and cross-tab communication

const SPONSORBLOCK_API = 'https://sponsor.ajay.app/api/skipSegments';
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

// In-memory cache for skip segments (cleared when service worker restarts)
const segmentCache = new Map();

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
      segmentCache.set(videoId, { segments: [], timestamp: Date.now() });
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
    segmentCache.set(videoId, { segments, timestamp: Date.now() });
    console.log(`[PremiumTube] Fetched ${segments.length} segments for ${videoId}`);

    return segments;
  } catch (err) {
    console.error(`[PremiumTube] Failed to fetch segments: ${err.message}`);
    throw err;
  }
}

// Clean up old cache entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of segmentCache) {
    if (now - value.timestamp > CACHE_DURATION) {
      segmentCache.delete(key);
    }
  }
}, 5 * 60 * 1000); // Every 5 minutes
