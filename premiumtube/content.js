// PremiumTube - Content Script
// Skip button appears when inside a segment. User clicks to skip.

(function () {
  'use strict';

  const API = 'https://sponsor.ajay.app/api/skipSegments';
  const CATEGORIES = '["intro","outro","sponsor","selfpromo","interaction","music_offtopic","preview","filler"]';

  let settings = {};
  let currentVideoId = null;
  let skipSegments = [];
  let pollTimer = null;
  let initTimer = null;
  let activeBtn = null;
  let activeSeg = null;
  let keyHandler = null;

  // Upcoming segment preview state
  let upcomingBtn = null;
  let upcomingSeg = null;

  // Local detection state
  let localDetectionTimers = [];
  let endScreenDetected = false;

  // Seekbar marker persistence state
  let seekbarObserver = null;
  let seekbarSafetyTimer = null;

  // Controls visibility observer (for sliding button when controls hide)
  let controlsObserver = null;

  const LABELS = {
    intro: 'Intro', outro: 'Outro', sponsor: 'Sponsor',
    selfpromo: 'Self-promo', interaction: 'Reminder',
    music_offtopic: 'Non-music', preview: 'Preview', filler: 'Filler'
  };

  const KEYS = {
    intro: 'skipIntro', outro: 'skipOutro', sponsor: 'skipSponsor',
    selfpromo: 'skipSelfpromo', interaction: 'skipInteraction',
    music_offtopic: 'skipMusicOfftopic', preview: 'skipPreview', filler: 'skipFiller'
  };

  // ---- Keyword lists for segment detection ----
  // SEGMENT_KEYWORDS: used for chapter titles and description labels (short text matching)
  // CAPTION_KEYWORDS: stricter subset used ONLY for transcript/captions scanning (avoids false positives)

  const SEGMENT_KEYWORDS = {
    intro: [
      'intro', 'introduction', 'opening segment',
      'quick intro', 'opening', 'welcome segment'
    ],
    outro: [
      'outro', 'ending', 'credits', 'closing',
      'wrap up', 'wrap-up', 'end screen', 'endscreen',
      'final thoughts', 'end card', 'goodbye', 'bye bye'
    ],
    sponsor: [
      'sponsor', 'sponsored', 'advertisement', 'paid promotion',
      "today's sponsor", 'ad break', 'ad read',
      'collaboration', 'collab', 'in association with', 'partnered with',
      'gifted', 'pr package', 'pr unboxing', 'sent me',
      '#ad', '#sponsored', '#collab', '#partnership',
      'brand deal', 'paid partnership', 'promoted', 'integrated ad'
    ],
    selfpromo: [
      'merch', 'merchandise', 'self promo', 'self-promo', 'selfpromo',
      'channel plug', 'shameless plug', 'my course', 'my podcast'
    ],
    interaction: [
      'subscribe', 'like button', 'notification bell', 'leave a comment',
      'hit the bell', 'smash the like', 'like and subscribe',
      'comment below'
    ],
    preview: [
      'preview', 'recap', 'previously on', 'last time', 'quick recap',
      'coming up'
    ]
  };

  // Known sponsor brands — used by matchCategory() pattern matching and caption scanning
  const SPONSOR_BRANDS = [
    // Indian brands
    'flipkart', 'myntra', 'meesho', 'ajio', 'nykaa', 'mamaearth', 'wow skin science',
    'boat', 'noise', 'fire-boltt', 'realme', 'oneplus', 'samsung india',
    'cred', 'groww', 'zerodha', 'upstox', 'coin dcx', 'coinswitch',
    'unacademy', 'byju', "byjus", 'physicswallah', 'vedantu', 'toppr',
    'lenskart', 'sugar cosmetics', 'plum goodness', 'mivi', 'portronics',
    'swiggy', 'zomato', 'blinkit', 'zepto', 'dunzo',
    'phonepe', 'paytm', 'google pay', 'amazon pay',
    'cult.fit', 'healthifyme', 'beardo', 'man matters',
    'urban company', 'pharmeasy', 'netmeds', '1mg',
    'wrogn', 'bewakoof', 'souled store', 'the man company',
    'pepperfry', 'urban ladder', 'wakefit',
    'khatabook', 'open', 'razorpay',
    'shaadi.com', 'matrimony.com',
    'jiocinema', 'hotstar', 'zee5', 'sonyliv', 'voot',
    'dream11', 'mpl', 'winzo', 'my11circle',
    // Global / Western brands
    'nordvpn', 'surfshark', 'expressvpn', 'private internet access',
    'squarespace', 'skillshare', 'audible', 'brilliant', 'curiositystream',
    'nebula', 'wondrium', 'coursera',
    'raid shadow legends', 'genshin impact', 'rise of kingdoms',
    'manscaped', 'dollar shave club', 'dr squatch',
    'betterhelp', 'headspace', 'calm',
    'hellofresh', 'hello fresh', 'factor meals', 'athletic greens',
    'magic spoon', 'ag1',
    'ridge wallet', 'raycon', 'casetify', 'dbrand',
    'established titles', 'incogni', 'dashlane', 'lastpass', '1password',
    'opera gx', 'brave browser',
    'bespoke post', 'sheath underwear',
    'hostinger', 'bluehost', 'namecheap',
    'shopify', 'wix', 'notion',
    'grammarly', 'canva',
    'ground news', 'morning brew', 'the daily wire',
    'funcky', 'backbone one', 'analogue',
    'keeps', 'hims', 'roman',
    'honey', 'rakuten', 'capital one shopping',
    'trade coffee', 'masterclass',
    'seatgeek', 'stubhub',
    'stamps.com', 'shipstation',
  ];

  // Stricter keywords for caption/transcript scanning — only multi-word phrases
  // that are unambiguous signals (won't match in normal speech)
  const CAPTION_KEYWORDS = {
    intro: [
      'welcome back to', 'welcome to the channel', 'welcome to my channel',
      'hello and welcome', 'in this video we', "in today's video",
      "let's get into it", "let's dive in", "let's jump into",
      'before we get started', 'before we begin', 'thanks for tuning in',
      'thanks for clicking',
      // More English
      "what's up guys", "what's going on guys", 'hey everyone welcome',
      'hey guys welcome', 'hi guys welcome', 'hello friends',
      'good morning everyone', "what's up everyone",
      // Hindi/Hinglish
      'namaste doston', 'namaskar doston', 'namaskar dosto',
      'toh chaliye shuru karte', 'chaliye shuru karte hain',
      'swagat hai aapka', 'aaj hum baat karenge',
      'toh aaj ki video mein', 'hello doston', 'hello dosto'
    ],
    outro: [
      'thanks for watching', 'thank you for watching', 'see you next time',
      'see you in the next', "don't forget to subscribe",
      'until next time', "that's all for today", "that's it for today",
      'catch you later', 'catch you in the next', 'like comment subscribe',
      'like and subscribe', 'peace out', 'hope you enjoyed',
      'smash that subscribe', 'hit the subscribe', 'ring the bell',
      'leave a like', 'drop a like', 'comment down below',
      "that's a wrap", "that's gonna do it", "that's going to do it",
      'signing off', 'have a great day',
      // More English
      'bye bye guys', 'take care guys', 'take care everyone',
      'see you guys in the next', 'peace out everyone',
      // Hindi/Hinglish
      'milte hain next video', 'aur milte hain', 'milte hain agle video mein',
      'toh milte hain', 'alvida doston', 'bye bye doston',
      'apna khayal rakhna', 'video ko like karna mat bhoolna'
    ],
    sponsor: [
      'this video is sponsored', 'this video is brought to you',
      'brought to you by', "today's sponsor is", 'a word from our sponsor',
      'use code', 'use my code', 'use my link', 'discount code',
      'promo code', 'special offer', 'link in the description',
      'first 100 people', 'first 1000 people', 'first 500 people',
      'sign up for free', 'free trial',
      // Partnership/collaboration phrases
      'in collaboration with', 'in association with', 'special thanks to',
      'shoutout to', 'partnered with', 'paid partnership with',
      // More CTAs
      'click the link', 'limited time offer', 'percent off', 'check them out',
      'use the link below', 'huge discount', 'exclusive deal',
      // Auto-include all sponsor brands
      ...SPONSOR_BRANDS
    ],
    selfpromo: [
      'check out my', 'my other channel', 'second channel',
      'join my discord', 'become a member', 'join the membership',
      'channel membership', 'support the channel', 'link in bio',
      'check out my merch', 'my merch store', 'buy me a coffee',
      'follow me on', 'sign up for my', 'my online course',
      'listen to my podcast',
      'my website', 'my store', 'my app'
    ],
    interaction: [
      'smash that like', 'hit the like', 'drop a like', 'leave a like',
      'smash that subscribe', 'hit the subscribe', 'click subscribe',
      'hit the notification', 'ring the notification', 'turn on notifications',
      'comment down below', 'leave a comment below', 'let me know in the comments',
      'share this video', 'share with your friends',
      'like share subscribe', 'like subscribe', 'subscribe karo',
      'like karo', 'bell icon daba do'
    ]
  };

  // ---- Music video detection ----
  // Musical structure terms — if chapters contain these, it's a music track, not a talk/vlog
  const MUSIC_CHAPTER_TERMS = [
    'verse', 'chorus', 'bridge', 'hook', 'drop', 'refrain',
    'pre-chorus', 'pre chorus', 'post-chorus', 'post chorus',
    'interlude', 'breakdown', 'buildup', 'build-up', 'build up',
    'solo', 'instrumental', 'coda', 'riff', 'beat switch',
    'verse 1', 'verse 2', 'verse 3', 'chorus 1', 'chorus 2',
    'stanza', 'hook 1', 'hook 2', 'drop 1', 'drop 2'
  ];

  // Cache per video ID so we don't re-detect every time
  let musicVideoCache = {}; // { videoId: true/false }

  function isMusicVideo() {
    const id = currentVideoId;
    if (!id) return false;
    if (id in musicVideoCache) return musicVideoCache[id];

    let isMusic = false;

    // Method 1: Check video category from ytInitialPlayerResponse
    try {
      // Try global object first
      let category = window.ytInitialPlayerResponse?.videoDetails?.category;

      // Fallback: parse from script tags
      if (!category) {
        const scripts = document.querySelectorAll('script');
        for (const script of scripts) {
          const text = script.textContent;
          if (!text.includes('ytInitialPlayerResponse')) continue;
          const match = text.match(/ytInitialPlayerResponse\s*=\s*({.+?});/s);
          if (!match) continue;
          const data = JSON.parse(match[1]);
          category = data?.videoDetails?.category;
          break;
        }
      }

      if (category && category.toLowerCase() === 'music') {
        isMusic = true;
        log('Music video detected (category: Music)', '#bf5af2');
      }
    } catch (e) { /* ignore parse errors */ }

    // Method 2: Check if chapters contain music structure terms
    if (!isMusic) {
      isMusic = detectMusicFromChapterTitles();
    }

    musicVideoCache[id] = isMusic;
    return isMusic;
  }

  function detectMusicFromChapterTitles() {
    // Get chapter titles from DOM or ytInitialData
    const titles = [];

    // Try DOM
    const chapterElements = document.querySelectorAll(
      'ytd-macro-markers-list-item-renderer, ytd-chapter-renderer'
    );
    chapterElements.forEach(el => {
      const titleEl = el.querySelector('#details h4, #chapter-title, .macro-markers');
      if (titleEl) titles.push(stripEmojis(titleEl.textContent).toLowerCase().trim());
    });

    // Try ytInitialData if DOM is empty
    if (!titles.length) {
      const parsed = parseChaptersFromInitialData();
      if (parsed) {
        parsed.forEach(ch => titles.push(ch.title));
      }
    }

    if (titles.length < 2) return false;

    // Count how many chapter titles match music terms
    let musicHits = 0;
    for (const title of titles) {
      for (const term of MUSIC_CHAPTER_TERMS) {
        if (title === term || title.startsWith(term + ' ') || title.endsWith(' ' + term)) {
          musicHits++;
          break;
        }
      }
    }

    // If 2+ chapters are music structure terms, it's a music track
    if (musicHits >= 2) {
      log(`Music video detected (${musicHits}/${titles.length} chapters are music terms)`, '#bf5af2');
      return true;
    }
    return false;
  }

  // ==================== INIT ====================

  async function init() {
    log('Initializing...', '#ff2d55');
    settings = await loadSettings();
    log('Settings loaded: ' + Object.entries(KEYS).map(([cat, key]) => `${cat}=${settings[key]}`).join(', '));
    setupNav();
    setupBgPlay();
    setupPiP();
    setupAutoQuality();
    setupAutoDismiss();
    setupHidePremiumUpsells();
    setupContinuousPlay();
    attach();
    log('Ready!', '#30d158');
  }

  async function loadSettings() {
    try {
      const r = await chrome.storage.sync.get(null);
      if (r && Object.keys(r).length) return r;
    } catch (e) {
      log('Settings error: ' + e.message, 'red');
    }
    return {
      skipIntro: true, skipOutro: true, skipSponsor: true,
      skipSelfpromo: true, skipInteraction: true, skipMusicOfftopic: true,
      skipPreview: true, skipFiller: true,
      pipEnabled: true, pipAutoSwitch: true,
      backgroundPlay: true, autoMaxQuality: true,
      autoDismissPopups: true, hidePremiumUpsells: true, continuousPlay: true
    };
  }

  chrome.storage.onChanged.addListener((c) => {
    for (const [k, { newValue }] of Object.entries(c)) {
      const oldVal = settings[k];
      settings[k] = newValue;

      // React to feature toggles that need setup/teardown
      if (k === 'autoMaxQuality' && newValue) applyMaxQuality();
      if (k === 'autoDismissPopups' && newValue) setupAutoDismiss();
      if (k === 'hidePremiumUpsells' && newValue) setupHidePremiumUpsells();
      if (k === 'hidePremiumUpsells' && !newValue) removeHidePremiumUpsells();
      if (k === 'continuousPlay' && newValue) setupContinuousPlay();
    }
  });

  // ==================== LOGGING ====================

  function log(msg, color) {
    const style = color ? `color:${color};font-weight:bold` : 'color:#aaa';
    console.log(`%c[PremiumTube] ${msg}`, style);
  }

  // ==================== VIDEO ====================

  function getVid() {
    return document.querySelector('video.html5-main-video')
      || document.querySelector('#movie_player video')
      || document.querySelector('video');
  }

  function getPlayer() {
    return document.querySelector('#movie_player') || document.querySelector('.html5-video-player');
  }

  function getVidId() {
    return new URLSearchParams(location.search).get('v');
  }

  function attach() {
    clearTimeout(initTimer);
    let tries = 0;
    const go = () => {
      const v = getVid(), id = getVidId();
      if (v && id) { onVideo(id); return; }
      if (++tries < 50) initTimer = setTimeout(go, 300);
      else log('Could not find video after 50 tries', 'red');
    };
    go();
  }

  async function onVideo(id) {
    if (id === currentVideoId) return;
    stop();
    removeBtn();
    removeUpcoming();
    removeSeekbarMarkers();
    stopControlsObserver();
    cleanupLocalDetection();
    currentVideoId = id;
    skipSegments = [];
    delete musicVideoCache[id]; // reset music detection for fresh check

    log(`Video: ${id}`, '#5ac8fa');

    // Start polling immediately so segments found by any method are caught
    startPoll();
    startControlsObserver();

    // Start local detection immediately (don't wait for API)
    detectFromChapters();
    detectFromDescription();
    detectFromCaptions();
    detectEndScreenFromMetadata(); // early outro detection from YouTube metadata
    // Live end screen detection still runs during check() polling as fallback

    // Fetch from SponsorBlock (with retry) — runs in parallel with local detection
    await fetchDirect(id);

    if (skipSegments.length) addSeekbarMarkers();
    applyMaxQuality();
  }


  // ==================== LOCAL SEGMENT DETECTION ====================

  // --- Method 1: YouTube Chapters Parsing ---

  function stripEmojis(text) {
    return text.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, '').trim();
  }

  function parseChaptersFromInitialData() {
    try {
      const scripts = document.querySelectorAll('script');
      for (const script of scripts) {
        const text = script.textContent;
        if (!text.includes('ytInitialData')) continue;
        const match = text.match(/ytInitialData\s*=\s*({.+?});/s);
        if (!match) continue;
        const data = JSON.parse(match[1]);
        // Navigate to chapters in engagement panels
        const panels = data?.engagementPanels || [];
        for (const panel of panels) {
          const content = panel?.engagementPanelSectionListRenderer?.content;
          const macroMarkers = content?.macroMarkersListRenderer?.contents;
          if (!macroMarkers) continue;
          const chapters = [];
          for (const item of macroMarkers) {
            const marker = item?.macroMarkersListItemRenderer;
            if (!marker) continue;
            const title = marker.title?.simpleText || marker.title?.runs?.map(r => r.text).join('') || '';
            const timeStr = marker.timeDescription?.simpleText || '';
            const seconds = parseTimestamp(timeStr);
            if (seconds !== null) {
              chapters.push({ title: stripEmojis(title).toLowerCase(), start: seconds });
            }
          }
          if (chapters.length) return chapters;
        }
      }
    } catch (e) {
      log('ytInitialData chapter parse error: ' + e.message, '#ff9f0a');
    }
    return null;
  }

  function detectFromChapters() {
    let attempts = 0;
    const maxAttempts = 30; // 15s at 500ms intervals

    const tryDetect = () => {
      // Try DOM selectors (expanded for current YouTube layout)
      const chapterElements = document.querySelectorAll(
        'ytd-macro-markers-list-item-renderer, ' +
        'ytd-chapter-renderer, ' +
        'ytd-engagement-panel-section-list-renderer[target-id*="chapters"] ytd-macro-markers-list-item-renderer, ' +
        'ytd-engagement-panel-section-list-renderer[target-id*="macro-markers"] ytd-macro-markers-list-item-renderer'
      );

      // Also try parsing from ytInitialData JSON
      let chaptersFromData = null;
      if (!chapterElements.length) {
        chaptersFromData = parseChaptersFromInitialData();
      }

      if (!chapterElements.length && !chaptersFromData) {
        if (++attempts < maxAttempts) {
          const timerId = setTimeout(tryDetect, 500);
          localDetectionTimers.push(timerId);
        }
        return;
      }

      const v = getVid();
      if (!v || !v.duration) {
        if (++attempts < maxAttempts) {
          const timerId = setTimeout(tryDetect, 500);
          localDetectionTimers.push(timerId);
        }
        return;
      }

      const chapters = [];

      if (chaptersFromData) {
        // Use parsed data directly
        chapters.push(...chaptersFromData);
      } else {
        // Parse from DOM
        chapterElements.forEach(el => {
          const titleEl = el.querySelector('#details h4, #chapter-title, .macro-markers, .macro-markers-list-item-renderer h4');
          const timeEl = el.querySelector('#time, .timestamp, #details .macro-markers-list-item-renderer-time, .macro-markers-list-item-renderer-time');

          let title = '';
          if (titleEl) title = titleEl.textContent.trim();
          else title = el.textContent.trim();
          title = stripEmojis(title).toLowerCase();

          let timeStr = '';
          if (timeEl) timeStr = timeEl.textContent.trim();

          const seconds = parseTimestamp(timeStr);
          if (seconds !== null) {
            chapters.push({ title, start: seconds });
          }
        });
      }

      if (!chapters.length) return;

      // Sort by start time
      chapters.sort((a, b) => a.start - b.start);

      // Check if this is a music video (chapters like "Verse", "Chorus", etc.)
      const musicVideo = isMusicVideo();

      const newSegments = [];
      for (let i = 0; i < chapters.length; i++) {
        const ch = chapters[i];
        const end = (i < chapters.length - 1) ? chapters[i + 1].start : v.duration;
        const category = matchCategory(ch.title);

        // Skip intro/outro detection for music videos (those are musical terms, not video segments)
        if (musicVideo && (category === 'intro' || category === 'outro')) continue;

        if (category && !hasOverlap(ch.start, end)) {
          newSegments.push({
            start: ch.start,
            end: end,
            category: category,
            source: 'chapters'
          });
        }
      }

      if (newSegments.length) {
        mergeSegments(newSegments);
        log(`Chapters detection: found ${newSegments.length} segments` + (musicVideo ? ' (music video — intro/outro skipped)' : ''), '#5ac8fa');
        newSegments.forEach(s => {
          log(`  [chapters] ${s.category}: ${fmtTime(s.start)} -> ${fmtTime(s.end)}`, '#5ac8fa');
        });
      }
    };

    const timerId = setTimeout(tryDetect, 1000);
    localDetectionTimers.push(timerId);
  }

  // --- Method 2: Description Timestamp Scanning ---

  function detectFromDescription() {
    let attempts = 0;
    const maxAttempts = 30; // 15s at 500ms intervals

    const tryDetect = () => {
      const descEl = document.querySelector(
        'ytd-text-inline-expander #snippet-text, ' +
        'ytd-text-inline-expander .content, ' +
        '#description-inline-expander #plain-snippet-text, ' +
        '#description-inline-expander yt-attributed-string, ' +
        'ytd-expander #content, ' +
        '#meta-contents ytd-expander, ' +
        '#description .content, ' +
        '#attributed-snippet-text, ' +
        'ytd-watch-metadata #description, ' +
        'ytd-watch-metadata yt-attributed-string, ' +
        'yt-attributed-string.content'
      );

      if (!descEl) {
        if (++attempts < maxAttempts) {
          const timerId = setTimeout(tryDetect, 500);
          localDetectionTimers.push(timerId);
        }
        return;
      }

      const v = getVid();
      if (!v || !v.duration) {
        if (++attempts < maxAttempts) {
          const timerId = setTimeout(tryDetect, 500);
          localDetectionTimers.push(timerId);
        }
        return;
      }

      const text = descEl.textContent || '';
      const lines = text.split('\n');

      // Multiple timestamp formats:
      // "0:00 Intro", "2:30 - Sponsor", "(0:00) Intro", "[0:00] Intro",
      // "0:00: Intro", "Intro - 0:00", "Intro 0:00"
      const timestampFirstPattern = /(?:\(?[\[\(]?)(\d{1,2}:\d{2}(?::\d{2})?)[\]\)]?[:\s]*[-–—]?\s*(.+)/;
      const labelFirstPattern = /^([A-Za-z][A-Za-z\s&/]+?)\s*[-–—]\s*(\d{1,2}:\d{2}(?::\d{2})?)/;
      const labelFirstNoSepPattern = /^([A-Za-z][A-Za-z\s&/]{2,}?)\s+(\d{1,2}:\d{2}(?::\d{2})?)$/;
      const entries = [];

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        let seconds = null;
        let label = null;

        // Try timestamp-first patterns
        const m1 = trimmed.match(timestampFirstPattern);
        if (m1) {
          seconds = parseTimestamp(m1[1]);
          label = m1[2].trim().toLowerCase();
        }

        // Try label-first with separator: "Intro - 0:00"
        if (seconds === null) {
          const m2 = trimmed.match(labelFirstPattern);
          if (m2) {
            seconds = parseTimestamp(m2[2]);
            label = m2[1].trim().toLowerCase();
          }
        }

        // Try label-first without separator: "Intro 0:00"
        if (seconds === null) {
          const m3 = trimmed.match(labelFirstNoSepPattern);
          if (m3) {
            seconds = parseTimestamp(m3[2]);
            label = m3[1].trim().toLowerCase();
          }
        }

        if (seconds !== null && label) {
          entries.push({ start: seconds, label });
        }
      }

      // Scan for sponsor indicators in description text
      const lowerText = text.toLowerCase();
      const sponsorIndicators = [
        '#ad', 'sponsored by', 'paid promotion', 'paid partnership',
        'this video is sponsored', 'brought to you by', 'thanks to our sponsor',
        'includes paid promotion', 'use code', 'use my code',
        'promo code', 'discount code', 'coupon code'
      ];
      const hasSponsorIndicator = sponsorIndicators.some(ind => lowerText.includes(ind));

      if (!entries.length && !hasSponsorIndicator) return;

      // Sort entries by start time
      entries.sort((a, b) => a.start - b.start);

      const musicVideo = isMusicVideo();
      const newSegments = [];
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const end = (i < entries.length - 1) ? entries[i + 1].start : v.duration;
        const category = matchCategory(entry.label);

        // Skip intro/outro detection for music videos
        if (musicVideo && (category === 'intro' || category === 'outro')) continue;

        if (category && !hasOverlap(entry.start, end)) {
          newSegments.push({
            start: entry.start,
            end: end,
            category: category,
            source: 'description'
          });
        }
      }

      if (newSegments.length) {
        mergeSegments(newSegments);
        log(`Description detection: found ${newSegments.length} segments` + (musicVideo ? ' (music video — intro/outro skipped)' : ''), '#5ac8fa');
        newSegments.forEach(s => {
          log(`  [description] ${s.category}: ${fmtTime(s.start)} -> ${fmtTime(s.end)}`, '#5ac8fa');
        });
      }

      if (hasSponsorIndicator && entries.length === 0) {
        log('Description contains sponsor indicators but no timestamps found', '#ff9f0a');
      }
    };

    const timerId = setTimeout(tryDetect, 2000);
    localDetectionTimers.push(timerId);
  }

  // --- Method 3a: Early End Screen Detection (from YouTube metadata) ---
  // YouTube embeds endscreen timing in ytInitialPlayerResponse — available at page load.
  // This lets us show the outro seekbar marker from the very start of the video.

  function detectEndScreenFromMetadata() {
    // Don't add outro segments for music videos
    if (isMusicVideo()) return;

    let attempts = 0;
    const maxAttempts = 15; // 7.5s at 500ms intervals

    const tryDetect = () => {
      const v = getVid();
      if (!v || !v.duration || v.duration === Infinity) {
        if (++attempts < maxAttempts) {
          const timerId = setTimeout(tryDetect, 500);
          localDetectionTimers.push(timerId);
        }
        return;
      }

      let startMs = null;

      // Method A: Global ytInitialPlayerResponse
      try {
        const results = window.ytInitialPlayerResponse
          ?.playerOverlays?.playerOverlayRenderer
          ?.endScreen?.watchNextEndScreenRenderer?.results;
        if (results?.length) {
          for (const r of results) {
            const ms = r?.endScreenVideoRenderer?.startMs
              || r?.endScreenPlaylistRenderer?.startMs
              || r?.endScreenChannelRenderer?.startMs;
            if (ms) {
              const parsed = parseInt(ms, 10);
              if (!isNaN(parsed) && (startMs === null || parsed < startMs)) {
                startMs = parsed;
              }
            }
          }
        }
      } catch (e) { /* ignore */ }

      // Method B: Parse from script tags
      if (startMs === null) {
        try {
          const scripts = document.querySelectorAll('script');
          for (const script of scripts) {
            const text = script.textContent;
            if (!text.includes('ytInitialPlayerResponse')) continue;
            const match = text.match(/ytInitialPlayerResponse\s*=\s*({.+?});/s);
            if (!match) continue;
            const data = JSON.parse(match[1]);
            const results = data?.playerOverlays?.playerOverlayRenderer
              ?.endScreen?.watchNextEndScreenRenderer?.results;
            if (!results?.length) break;
            for (const r of results) {
              const ms = r?.endScreenVideoRenderer?.startMs
                || r?.endScreenPlaylistRenderer?.startMs
                || r?.endScreenChannelRenderer?.startMs;
              if (ms) {
                const parsed = parseInt(ms, 10);
                if (!isNaN(parsed) && (startMs === null || parsed < startMs)) {
                  startMs = parsed;
                }
              }
            }
            break;
          }
        } catch (e) { /* ignore */ }
      }

      if (startMs === null) {
        log('End screen metadata: no endscreen data found', '#aaa');
        return;
      }

      const outroStart = startMs / 1000; // convert ms to seconds
      const outroEnd = v.duration;

      // Sanity checks
      if (outroStart >= outroEnd || outroStart < 0) return;
      // Don't create extremely long outro segments (>25% of video)
      if ((outroEnd - outroStart) > v.duration * 0.25) return;
      // Already have an outro segment covering this time?
      if (hasOverlap(outroStart, outroEnd)) return;

      endScreenDetected = true;

      const newSegments = [{
        start: outroStart,
        end: outroEnd,
        category: 'outro',
        source: 'endscreen-meta'
      }];

      mergeSegments(newSegments);
      log(`End screen metadata: outro at ${fmtTime(outroStart)} -> ${fmtTime(outroEnd)} (marker visible from start)`, '#bf5af2');
    };

    const timerId = setTimeout(tryDetect, 1500);
    localDetectionTimers.push(timerId);
  }

  // --- Method 3b: Live End Screen Detection (DOM fallback) ---
  // Fallback for when metadata isn't available — detects visible endscreen elements.

  function detectEndScreen() {
    if (endScreenDetected) return;

    // Don't add outro segments for music videos
    if (isMusicVideo()) return;

    const v = getVid();
    if (!v || !v.duration || v.duration === Infinity) return;

    const timeLeft = v.duration - v.currentTime;
    if (timeLeft > 45 || timeLeft < 0) return;

    // Look for YouTube end screen cards (expanded selectors)
    const endScreenElements = document.querySelectorAll(
      '.ytp-ce-element, .ytp-endscreen-content, [class*="endscreen"]'
    );

    // Also detect subscribe animation overlay at video end
    const subscribeOverlay = document.querySelector(
      '.ytp-ce-subscribe-button, .ytp-ce-channel, .ytp-ce-covering-overlay'
    );

    if (!endScreenElements.length && !subscribeOverlay) return;

    // Check if any end screen element is visible
    const visibleEndScreen = Array.from(endScreenElements).some(el => {
      return el.offsetParent !== null && el.offsetWidth > 0;
    }) || (subscribeOverlay && subscribeOverlay.offsetParent !== null);

    if (!visibleEndScreen) return;

    // Check if there's already an outro segment covering this time
    const outroStart = v.currentTime;
    const outroEnd = v.duration;

    if (hasOverlap(outroStart, outroEnd)) return;

    endScreenDetected = true;

    const newSegments = [{
      start: outroStart,
      end: outroEnd,
      category: 'outro',
      source: 'endscreen'
    }];

    mergeSegments(newSegments);
    log(`End screen detection: outro at ${fmtTime(outroStart)} -> ${fmtTime(outroEnd)}`, '#bf5af2');
  }

  // --- Method 4: YouTube Captions/Transcript Scanning ---

  let captionRetries = 0;

  function detectFromCaptions() {
    const tryDetect = async () => {
      const v = getVid();
      if (!v || !v.duration) {
        if (++captionRetries < 6) {
          const timerId = setTimeout(() => detectFromCaptions(), 3000);
          localDetectionTimers.push(timerId);
        }
        return;
      }

      try {
        let captionUrl = null;

        // Method A: Try YouTube's internal player API (most reliable)
        const player = document.querySelector('#movie_player');
        if (player && typeof player.getOption === 'function') {
          try {
            const trackList = player.getOption('captions', 'tracklist');
            if (trackList && trackList.length) {
              const enTrack = trackList.find(t =>
                t.languageCode === 'en' || t.languageCode?.startsWith('en')
              ) || trackList[0];
              if (enTrack?.baseUrl) captionUrl = enTrack.baseUrl;
            }
          } catch (e) { /* player API not available yet */ }
        }

        // Method B: Parse from ytInitialPlayerResponse in page source
        if (!captionUrl) {
          const scripts = document.querySelectorAll('script');
          for (const script of scripts) {
            const text = script.textContent;
            if (!text.includes('ytInitialPlayerResponse')) continue;
            const match = text.match(/ytInitialPlayerResponse\s*=\s*({.+?});/s);
            if (!match) continue;
            const playerData = JSON.parse(match[1]);
            const tracks = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
            if (!tracks || !tracks.length) break;

            const enTrack = tracks.find(t =>
              t.languageCode === 'en' || t.languageCode?.startsWith('en')
            ) || tracks[0];

            if (enTrack?.baseUrl) captionUrl = enTrack.baseUrl;
            break;
          }
        }

        // Method C: Try the global ytInitialPlayerResponse object
        if (!captionUrl && window.ytInitialPlayerResponse) {
          try {
            const tracks = window.ytInitialPlayerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
            if (tracks && tracks.length) {
              const enTrack = tracks.find(t =>
                t.languageCode === 'en' || t.languageCode?.startsWith('en')
              ) || tracks[0];
              if (enTrack?.baseUrl) captionUrl = enTrack.baseUrl;
            }
          } catch (e) { /* not available */ }
        }

        if (!captionUrl) {
          log('Captions detection: no caption track found', '#aaa');
          return;
        }

        // Fetch the timedtext XML
        const res = await fetch(captionUrl);
        if (!res.ok) {
          log('Captions detection: fetch failed ' + res.status, '#ff9f0a');
          return;
        }

        const xmlText = await res.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
        const textElements = xmlDoc.querySelectorAll('text');

        if (!textElements.length) {
          log('Captions detection: no text elements in captions', '#aaa');
          return;
        }

        // Build caption entries with timestamps
        const captions = [];
        textElements.forEach(el => {
          const start = parseFloat(el.getAttribute('start'));
          const dur = parseFloat(el.getAttribute('dur') || '0');
          const content = (el.textContent || '').replace(/&#?\w+;/g, ' ').toLowerCase();
          if (!isNaN(start) && content.trim()) {
            captions.push({ start, dur, end: start + dur, text: content });
          }
        });

        if (!captions.length) return;

        // Scan captions using CAPTION_KEYWORDS (strict, multi-word only)
        const rawHits = []; // { start, end, category }
        const videoDuration = v.duration;
        const musicVideo = isMusicVideo();

        for (const cap of captions) {
          for (const [category, keywords] of Object.entries(CAPTION_KEYWORDS)) {
            // Skip intro/outro detection for music videos
            if (musicVideo && (category === 'intro' || category === 'outro')) continue;
            // Temporal filtering: intro only in first 15%, outro only in last 15%
            if (category === 'intro' && videoDuration > 0 && cap.start > videoDuration * 0.15) continue;
            if (category === 'outro' && videoDuration > 0 && cap.start < videoDuration * 0.85) continue;

            for (const kw of keywords) {
              if (cap.text.includes(kw)) {
                rawHits.push({ start: cap.start, end: cap.end, category });
                break; // one category match per caption line is enough
              }
            }
          }
        }

        if (!rawHits.length) {
          log('Captions detection: no keyword matches in transcript', '#aaa');
          return;
        }

        // Merge nearby hits of the same category (within 15s gap, max 90s segment)
        rawHits.sort((a, b) => a.start - b.start);
        const merged = [];
        for (const hit of rawHits) {
          const last = merged[merged.length - 1];
          if (last && last.category === hit.category
              && hit.start - last.end < 15
              && (hit.end - last.start) < 90) {
            last.end = Math.max(last.end, hit.end);
          } else {
            merged.push({ ...hit });
          }
        }

        // Add padding: 2s before, 5s after each merged segment (capped at 120s total)
        const newSegments = [];
        for (const seg of merged) {
          const padStart = Math.max(0, seg.start - 2);
          let padEnd = Math.min(v.duration, seg.end + 5);
          // Hard cap: no single caption segment > 120s
          if (padEnd - padStart > 120) padEnd = padStart + 120;

          if (!hasOverlap(padStart, padEnd)) {
            newSegments.push({
              start: padStart,
              end: padEnd,
              category: seg.category,
              source: 'captions'
            });
          }
        }

        if (newSegments.length) {
          mergeSegments(newSegments);
          log(`Captions detection: found ${newSegments.length} segments`, '#bf5af2');
          newSegments.forEach(s => {
            log(`  [captions] ${s.category}: ${fmtTime(s.start)} -> ${fmtTime(s.end)}`, '#bf5af2');
          });
        }
      } catch (e) {
        log('Captions detection error: ' + e.message, '#ff9f0a');
      }
    };

    // Run after SponsorBlock + chapters/description have had time
    const timerId = setTimeout(tryDetect, 4000);
    localDetectionTimers.push(timerId);
  }

  // --- Utility Functions ---

  function parseTimestamp(str) {
    if (!str) return null;
    const parts = str.trim().split(':').map(Number);
    if (parts.some(isNaN)) return null;

    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return null;
  }

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function matchCategory(text) {
    if (!text) return null;
    const lower = text.toLowerCase();

    // Pass 1: Existing keyword matching (unchanged)
    for (const [category, keywords] of Object.entries(SEGMENT_KEYWORDS)) {
      for (const kw of keywords) {
        if (lower.includes(kw)) return category;
      }
    }

    // Pass 2: Brand-anchored pattern matching
    let matchedBrand = null;
    for (const brand of SPONSOR_BRANDS) {
      if (lower.includes(brand)) {
        matchedBrand = brand;
        break;
      }
    }

    if (!matchedBrand) return null;

    // Filter out editorial/review content — these are NOT sponsors
    const brandSafePatterns = [
      'review', 'vs', 'versus', 'comparison', 'top 10', 'top 5', 'top 20',
      'tier list', 'ranking', 'rated', 'honest opinion', 'is it worth',
      'should you buy', 'alternatives', 'problems with'
    ];
    for (const safe of brandSafePatterns) {
      if (lower.includes(safe)) return null;
    }

    const esc = escapeRegex(matchedBrand);

    // Structural patterns that strongly indicate sponsorship
    const sponsorPatterns = [
      new RegExp(`\\b\\w+\\s+with\\s+${esc}\\b`),         // "[word] with [brand]"
      new RegExp(`\\bft\\.?\\s*${esc}\\b`),                // "ft. [brand]"
      new RegExp(`\\bfeat\\.?\\s*${esc}\\b`),              // "feat. [brand]"
      new RegExp(`\\bfeaturing\\s+${esc}\\b`),             // "featuring [brand]"
      new RegExp(`\\b${esc}\\s+(special|segment|deal|zone|edition)\\b`), // "[brand] special/segment/..."
      new RegExp(`\\b(powered|presented|brought)\\s+by\\s+${esc}\\b`),  // "powered/presented by [brand]"
      new RegExp(`\\bunboxing\\s+${esc}\\b`),              // "unboxing [brand]"
      new RegExp(`\\b${esc}\\s+unboxing\\b`),              // "[brand] unboxing"
    ];

    for (const pat of sponsorPatterns) {
      if (pat.test(lower)) return 'sponsor';
    }

    // Brand name IS the entire chapter title (after stripping emojis/whitespace)
    if (lower.trim() === matchedBrand) return 'sponsor';

    return null;
  }

  function hasOverlap(start, end) {
    const OVERLAP_THRESHOLD = 3; // seconds of overlap tolerance
    for (const seg of skipSegments) {
      const overlapStart = Math.max(start, seg.start);
      const overlapEnd = Math.min(end, seg.end);
      if (overlapEnd - overlapStart > OVERLAP_THRESHOLD) return true;
    }
    return false;
  }

  function mergeSegments(newSegments) {
    for (const seg of newSegments) {
      if (!hasOverlap(seg.start, seg.end)) {
        skipSegments.push(seg);
      }
    }
    // Re-sort by start time
    skipSegments.sort((a, b) => a.start - b.start);
    // Refresh seekbar markers
    addSeekbarMarkers();
  }

  function cleanupLocalDetection() {
    for (const timerId of localDetectionTimers) {
      clearTimeout(timerId);
    }
    localDetectionTimers = [];
    endScreenDetected = false;
    captionRetries = 0;
  }

  // ==================== FETCH SEGMENTS DIRECTLY ====================

  async function fetchDirect(videoId) {
    const url = `${API}?videoID=${videoId}&categories=${encodeURIComponent(CATEGORIES)}`;
    log('Fetching: ' + url);

    // Try direct fetch with one retry
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(url);
        log(`API response: ${res.status} (attempt ${attempt + 1})`);

        if (res.status === 404) {
          log('No segments on SponsorBlock for this video');
          return; // no segments — local detection will still run
        }

        if (!res.ok) {
          if (attempt === 0) {
            log(`API returned ${res.status}, retrying in 2s...`, '#ff9f0a');
            await new Promise(r => setTimeout(r, 2000));
            continue; // retry
          }
          throw new Error(`API error: ${res.status}`);
        }

        const data = await res.json();
        const sbSegments = data.map(d => ({
          start: d.segment[0],
          end: d.segment[1],
          category: d.category,
          source: 'sponsorblock'
        }));

        // Merge SponsorBlock segments (they have priority — added first)
        skipSegments.push(...sbSegments);
        skipSegments.sort((a, b) => a.start - b.start);

        log(`SponsorBlock: loaded ${sbSegments.length} segments`, '#30d158');
        sbSegments.forEach(s => {
          log(`  ${s.category}: ${fmtTime(s.start)} -> ${fmtTime(s.end)} (${(s.end - s.start).toFixed(0)}s)`);
        });
        return; // success

      } catch (err) {
        if (attempt === 0) {
          log('Fetch failed: ' + err.message + ', retrying...', '#ff9f0a');
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }
        log('Fetch failed after retry: ' + err.message, 'red');
      }
    }

    // Both direct attempts failed — try via background service worker
    log('Trying background fallback...');
    try {
      const resp = await chrome.runtime.sendMessage({ type: 'FETCH_SEGMENTS', videoId });
      if (resp?.success && resp.segments?.length) {
        const bgSegments = resp.segments.map(s => ({ ...s, source: 'sponsorblock' }));
        skipSegments.push(...bgSegments);
        skipSegments.sort((a, b) => a.start - b.start);
        log(`Background fallback: loaded ${bgSegments.length} segments`, '#30d158');
      } else {
        log('Background fallback: no segments');
      }
    } catch (e2) {
      log('Background fallback failed: ' + e2.message, 'red');
    }
  }

  function fmtTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  // ==================== POLL & CHECK ====================

  function startPoll() {
    stop();
    pollTimer = setInterval(check, 200);

    const v = getVid();
    if (v) {
      v.addEventListener('timeupdate', check);
      v.addEventListener('seeked', check);
    }

    log(`Polling started for ${skipSegments.length} segments`, '#30d158');
  }

  function stop() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    const v = getVid();
    if (v) {
      v.removeEventListener('timeupdate', check);
      v.removeEventListener('seeked', check);
    }
  }

  let logTick = 0;
  let lastCheckTime = 0;

  function check() {
    // Throttle: skip if called again within 100ms (prevents double-fire from interval + event)
    const now = performance.now();
    if (now - lastCheckTime < 100) return;
    lastCheckTime = now;

    const v = getVid();
    if (!v) return;

    // End screen detection (runs during polling)
    detectEndScreen();

    if (!skipSegments.length) return;

    const t = v.currentTime;
    let hit = null;

    for (const seg of skipSegments) {
      const settingKey = KEYS[seg.category];
      if (settingKey && settings[settingKey] === false) continue;
      if (t >= seg.start - 0.2 && t < seg.end - 0.1) {
        hit = seg;
        break;
      }
    }

    // Log every ~3 seconds
    if (++logTick % 15 === 0) {
      const near = skipSegments.reduce((b, s) => {
        const d = s.start - t;
        return (d > 0 && d < b.d) ? { s, d } : b;
      }, { s: skipSegments[0], d: Infinity });

      const nSeg = near.s;
      const nDist = (nSeg.start - t).toFixed(1);
      const status = hit
        ? `IN SEGMENT: ${hit.category} [${hit.source || 'unknown'}]`
        : `Next: ${nSeg.category} in ${nDist}s (at ${fmtTime(nSeg.start)})`;

      log(`${fmtTime(t)} | ${status}`);
    }

    if (hit) {
      if (upcomingBtn) removeUpcoming();
      showBtn(hit);
    } else {
      if (activeBtn) removeBtn();

      // Find nearest upcoming segment within 12 seconds
      const upcoming = skipSegments.find(seg => {
        const settingKey = KEYS[seg.category];
        if (settingKey && settings[settingKey] === false) return false;
        const delta = seg.start - t;
        return delta > 0 && delta <= 12;
      });
      if (upcoming) showUpcoming(upcoming, t);
      else if (upcomingBtn) removeUpcoming();
    }
  }

  // ==================== SKIP BUTTON ====================

  function showBtn(seg) {
    if (activeSeg === seg && activeBtn) return;
    removeBtn();

    activeSeg = seg;
    const label = LABELS[seg.category] || seg.category;
    const v = getVid();
    const remaining = v ? Math.max(0, Math.round(seg.end - v.currentTime)) : Math.round(seg.end - seg.start);

    const el = document.createElement('div');
    el.id = 'pt-skip-button';
    el.setAttribute('data-category', seg.category);
    el.innerHTML = `
      <div id="pt-skip-inner">
        <span id="pt-skip-dot"></span>
        <svg id="pt-skip-icon" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
        <span id="pt-skip-title">Skip ${label}</span>
        <span id="pt-skip-time">${remaining}s</span>
        <span id="pt-skip-kbd">↵</span>
        <div id="pt-skip-progress"></div>
      </div>
    `;

    el.onclick = (e) => { e.stopPropagation(); e.preventDefault(); doSkip(seg); };

    // Keyboard shortcut - Enter to skip
    keyHandler = (e) => {
      if (e.key === 'Enter' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const a = document.activeElement;
        if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)) return;
        e.preventDefault();
        doSkip(seg);
      }
    };
    document.addEventListener('keydown', keyHandler);

    // Append inside the player so it moves naturally with it (no scroll jitter)
    const player = getPlayer();
    (player || document.body).appendChild(el);
    activeBtn = el;

    // Sync controls-hidden state before animating in
    if (player && player.classList.contains('ytp-autohide')) {
      el.classList.add('pt-controls-hidden');
    }

    // Animate in
    requestAnimationFrame(() => el.classList.add('pt-visible'));

    // Progress bar + live countdown
    const prog = el.querySelector('#pt-skip-progress');
    const timeEl = el.querySelector('#pt-skip-time');
    let lastRem = -1;
    const tick = () => {
      if (!activeBtn || activeSeg !== seg) return;
      const vid = getVid();
      if (vid) {
        const pct = ((vid.currentTime - seg.start) / (seg.end - seg.start)) * 100;
        prog.style.width = Math.min(100, Math.max(0, pct)) + '%';
        const rem = Math.max(0, Math.round(seg.end - vid.currentTime));
        if (rem !== lastRem) {
          timeEl.textContent = rem + 's';
          lastRem = rem;
          // Fade the time badge when reaching 0
          if (rem <= 0) {
            timeEl.classList.add('pt-time-fading');
          }
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    log(`BUTTON SHOWN: "Skip ${label}" [${seg.source || 'unknown'}]`, '#ff2d55');
  }

  function doSkip(seg) {
    const v = getVid();
    if (!v) return;
    const saved = Math.max(0, Math.round(seg.end - v.currentTime));
    const label = LABELS[seg.category] || seg.category;
    log(`SKIPPED: ${seg.category} [${seg.source || 'unknown'}] ${fmtTime(v.currentTime)} -> ${fmtTime(seg.end)} (saved ${saved}s)`, '#30d158');

    v.currentTime = seg.end;
    removeBtn();
    trackStat(saved);
    showToast(`Skipped ${label}` + (saved > 0 ? ` \u00b7 saved ${saved}s` : ''));
  }

  // ---- Toast notification ----
  let toastTimer = null;
  function showToast(msg) {
    let el = document.getElementById('premiumtube-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'premiumtube-toast';
      document.body.appendChild(el);
    }
    clearTimeout(toastTimer);
    el.textContent = msg;
    el.className = '';
    // Trigger reflow so transition replays
    void el.offsetWidth;
    el.classList.add('pt-toast-show');
    toastTimer = setTimeout(() => {
      el.classList.remove('pt-toast-show');
      el.classList.add('pt-toast-hide');
    }, 2500);
  }

  function removeBtn() {
    if (keyHandler) {
      document.removeEventListener('keydown', keyHandler);
      keyHandler = null;
    }
    if (activeBtn) {
      activeBtn.classList.remove('pt-visible');
      activeBtn.classList.add('pt-exiting');
      const fadingEl = activeBtn;
      activeBtn = null;
      activeSeg = null;
      // Remove stale orphaned buttons (but not the one currently fading)
      document.querySelectorAll('#pt-skip-button').forEach(e => {
        if (e !== fadingEl) e.remove();
      });
      setTimeout(() => fadingEl.remove(), 550);
    } else {
      // No active button, just clean up any orphans
      document.querySelectorAll('#pt-skip-button').forEach(e => e.remove());
    }
  }

  // ==================== UPCOMING SEGMENT PREVIEW ====================

  function showUpcoming(seg, currentTime) {
    // If already showing this segment's upcoming, just update countdown
    if (upcomingSeg === seg && upcomingBtn) {
      const countEl = upcomingBtn.querySelector('#pt-upcoming-count');
      if (countEl) {
        const delta = Math.max(0, Math.ceil(seg.start - currentTime));
        countEl.textContent = `in ${delta}s`;
      }
      return;
    }

    removeUpcoming();
    upcomingSeg = seg;

    const label = LABELS[seg.category] || seg.category;
    const delta = Math.max(0, Math.ceil(seg.start - currentTime));

    const el = document.createElement('div');
    el.id = 'pt-upcoming-segment';
    el.setAttribute('data-category', seg.category);
    el.innerHTML = `
      <span class="pt-upcoming-dot"></span>
      <span class="pt-upcoming-label">${label}</span>
      <span id="pt-upcoming-count">in ${delta}s</span>
    `;

    // Append inside the player so it moves naturally with it (no scroll jitter)
    const player = getPlayer();
    (player || document.body).appendChild(el);
    upcomingBtn = el;

    // Sync controls-hidden state before animating in
    if (player && player.classList.contains('ytp-autohide')) {
      el.classList.add('pt-controls-hidden');
    }

    requestAnimationFrame(() => el.classList.add('pt-upcoming-visible'));

    // Live countdown
    const tick = () => {
      if (!upcomingBtn || upcomingSeg !== seg) return;
      const vid = getVid();
      if (vid) {
        const d = Math.max(0, Math.ceil(seg.start - vid.currentTime));
        const countEl = upcomingBtn.querySelector('#pt-upcoming-count');
        if (countEl) countEl.textContent = `in ${d}s`;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    log(`UPCOMING: "${label}" in ${delta}s [${seg.source || 'unknown'}]`, '#ff9f0a');
  }

  function removeUpcoming() {
    if (upcomingBtn) {
      upcomingBtn.classList.remove('pt-upcoming-visible');
      upcomingBtn.classList.add('pt-upcoming-exiting');
      const fadingEl = upcomingBtn;
      upcomingBtn = null;
      upcomingSeg = null;
      setTimeout(() => fadingEl.remove(), 500);
    }
    document.querySelectorAll('#pt-upcoming-segment').forEach(e => {
      if (e !== upcomingBtn) e.remove();
    });
  }

  // ==================== SEEKBAR MARKERS ====================

  function injectMarkerElements() {
    const v = getVid();
    if (!v || !v.duration || v.duration === Infinity || !skipSegments.length) return false;

    const bar = document.querySelector('.ytp-progress-bar');
    if (!bar) return false;

    // Remove any existing markers first
    bar.querySelectorAll('.pt-seekbar-marker').forEach(e => e.remove());

    for (const seg of skipSegments) {
      const markerKey = KEYS[seg.category];
      if (markerKey && settings[markerKey] === false) continue;

      const startPct = (seg.start / v.duration) * 100;
      const widthPct = ((seg.end - seg.start) / v.duration) * 100;

      const marker = document.createElement('div');
      marker.className = 'pt-seekbar-marker';
      marker.setAttribute('data-category', seg.category);
      marker.style.left = startPct + '%';
      marker.style.width = Math.max(0.3, widthPct) + '%';
      marker.title = `${LABELS[seg.category]}: ${fmtTime(seg.start)} – ${fmtTime(seg.end)}`;

      bar.appendChild(marker);
    }
    return true;
  }

  function startSeekbarObserver() {
    stopSeekbarObserver();

    // MutationObserver: watch the progress bar's parent for DOM changes
    // YouTube re-renders the progress bar on fullscreen, resize, navigation, etc.
    const barParent = document.querySelector('.ytp-progress-bar')?.parentElement
      || document.querySelector('.ytp-chrome-bottom');
    if (barParent) {
      seekbarObserver = new MutationObserver(() => {
        // Check if our markers were removed
        if (skipSegments.length && !document.querySelector('.pt-seekbar-marker')) {
          log('Seekbar markers lost — re-injecting', '#ff9f0a');
          injectMarkerElements();
        }
      });
      seekbarObserver.observe(barParent, { childList: true, subtree: true });
    }

    // Safety net: periodic check every 3 seconds
    seekbarSafetyTimer = setInterval(() => {
      if (skipSegments.length && !document.querySelector('.pt-seekbar-marker')) {
        log('Seekbar markers missing (safety check) — re-injecting', '#ff9f0a');
        injectMarkerElements();
      }
    }, 3000);
  }

  function stopSeekbarObserver() {
    if (seekbarObserver) { seekbarObserver.disconnect(); seekbarObserver = null; }
    if (seekbarSafetyTimer) { clearInterval(seekbarSafetyTimer); seekbarSafetyTimer = null; }
  }

  // ==================== CONTROLS VISIBILITY OBSERVER ====================
  // Watches for YouTube's .ytp-autohide class to slide buttons down when controls fade out

  function startControlsObserver() {
    stopControlsObserver();
    const player = getPlayer();
    if (!player) return;

    const sync = () => {
      const hidden = player.classList.contains('ytp-autohide');
      if (activeBtn) activeBtn.classList.toggle('pt-controls-hidden', hidden);
      if (upcomingBtn) upcomingBtn.classList.toggle('pt-controls-hidden', hidden);
    };

    controlsObserver = new MutationObserver(sync);
    controlsObserver.observe(player, { attributes: true, attributeFilter: ['class'] });

    // Initial sync
    sync();
    log('Controls visibility observer started', '#5ac8fa');
  }

  function stopControlsObserver() {
    if (controlsObserver) { controlsObserver.disconnect(); controlsObserver = null; }
  }

  function addSeekbarMarkers() {
    removeSeekbarMarkers();

    const v = getVid();
    if (!v || !skipSegments.length) return;

    let attempts = 0;
    const tryAdd = () => {
      if (injectMarkerElements()) {
        startSeekbarObserver();
        log(`Added ${skipSegments.length} seekbar markers`, '#5ac8fa');
      } else if (++attempts < 20) {
        setTimeout(tryAdd, 500);
      }
    };

    tryAdd();
  }

  function removeSeekbarMarkers() {
    stopSeekbarObserver();
    document.querySelectorAll('.pt-seekbar-marker').forEach(e => e.remove());
  }

  // ==================== NAV ====================

  function setupNav() {
    const h = () => {
      const id = getVidId();
      if (id && id !== currentVideoId) {
        currentVideoId = null; skipSegments = []; stop(); removeBtn(); removeUpcoming(); removeSeekbarMarkers(); cleanupLocalDetection(); attach();
      } else if (!id) {
        currentVideoId = null; skipSegments = []; stop(); removeBtn(); removeUpcoming(); removeSeekbarMarkers(); cleanupLocalDetection();
      }
    };
    window.addEventListener('yt-navigate-finish', h);
    window.addEventListener('yt-page-data-updated', h);
    window.addEventListener('popstate', h);
    let last = location.href;
    setInterval(() => { if (location.href !== last) { last = location.href; h(); } }, 800);
  }

  // ==================== STATS ====================

  async function trackStat(saved) {
    try {
      const s = await chrome.storage.local.get(['segmentsSkipped', 'timeSaved']);
      await chrome.storage.local.set({
        segmentsSkipped: (s.segmentsSkipped || 0) + 1,
        timeSaved: (s.timeSaved || 0) + Math.max(0, saved)
      });
    } catch (e) {}
  }

  // ==================== PIP ====================

  let pipAutoTriggered = false; // track if WE triggered PiP (not the user)

  function setupPiP() {
    document.addEventListener('keydown', (e) => {
      if (e.altKey && e.key.toLowerCase() === 'p' && settings.pipEnabled) {
        e.preventDefault();
        const v = getVid();
        if (!v) return;
        pipAutoTriggered = false; // manual toggle — don't auto-exit
        if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {});
        else v.requestPictureInPicture().catch(() => {});
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (!settings.pipEnabled || !settings.pipAutoSwitch) return;
      const v = getVid();

      if (document.hidden) {
        // Leaving tab — enter PiP
        if (v && !v.paused && !document.pictureInPictureElement) {
          v.requestPictureInPicture().then(() => {
            pipAutoTriggered = true;
          }).catch(() => {});
        }
      } else {
        // Returning to tab — exit PiP (only if we auto-triggered it)
        if (pipAutoTriggered && document.pictureInPictureElement) {
          document.exitPictureInPicture().catch(() => {});
          pipAutoTriggered = false;
        }
      }
    });
  }

  // ==================== BACKGROUND PLAY ====================

  let bgPlayInterval = null;
  let wasPlayingBeforeHide = false;
  let userPaused = false;

  function setupBgPlay() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.ytp-play-button');
      if (btn) {
        const v = getVid();
        if (v && !v.paused) userPaused = true;
        else userPaused = false;
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        const v = getVid();
        wasPlayingBeforeHide = v && !v.paused;

        if (!settings.backgroundPlay || !wasPlayingBeforeHide || userPaused) return;

        if (bgPlayInterval) clearInterval(bgPlayInterval);

        bgPlayInterval = setInterval(() => {
          if (!document.hidden || !settings.backgroundPlay) {
            clearInterval(bgPlayInterval);
            bgPlayInterval = null;
            return;
          }
          const el = getVid();
          if (el && el.paused && el.readyState >= 2) {
            el.play().catch(() => {});
          }
        }, 1000);

      } else {
        if (bgPlayInterval) {
          clearInterval(bgPlayInterval);
          bgPlayInterval = null;
        }
        userPaused = false;
      }
    });
  }

  // ==================== AUTO MAX QUALITY ====================

  const QUALITY_ORDER = [
    'highres', 'hd2880', 'hd2160', 'hd1440', 'hd1080',
    'hd720', 'large', 'medium', 'small', 'tiny'
  ];

  let qualityTimer = null;

  function setupAutoQuality() {
    // Apply quality on every video change via yt-navigate-finish
    window.addEventListener('yt-navigate-finish', () => {
      if (settings.autoMaxQuality) applyMaxQuality();
    });
  }

  function applyMaxQuality() {
    if (!settings.autoMaxQuality) return;

    // Clear previous attempts
    if (qualityTimer) { clearInterval(qualityTimer); qualityTimer = null; }

    let attempts = 0;
    const trySet = () => {
      const player = document.querySelector('#movie_player');
      if (!player || typeof player.getAvailableQualityLevels !== 'function') {
        if (++attempts < 40) return; // keep trying via interval
        clearInterval(qualityTimer); qualityTimer = null;
        return;
      }

      const available = player.getAvailableQualityLevels();
      if (!available || !available.length) {
        if (++attempts < 40) return;
        clearInterval(qualityTimer); qualityTimer = null;
        return;
      }

      // Pick the highest available quality
      let best = available[0]; // already sorted highest-first by YouTube
      for (const q of QUALITY_ORDER) {
        if (available.includes(q)) { best = q; break; }
      }

      // Get current quality
      const current = typeof player.getPlaybackQuality === 'function'
        ? player.getPlaybackQuality() : null;

      if (current === best) {
        // Already at max — stop trying
        clearInterval(qualityTimer); qualityTimer = null;
        return;
      }

      // Set quality using available methods
      if (typeof player.setPlaybackQualityRange === 'function') {
        player.setPlaybackQualityRange(best, best);
      }
      if (typeof player.setPlaybackQuality === 'function') {
        player.setPlaybackQuality(best);
      }

      log(`Quality: ${current || '?'} → ${best} (available: ${available.join(', ')})`, '#30d158');

      // Verify it stuck after a moment
      setTimeout(() => {
        if (!settings.autoMaxQuality) return;
        const p = document.querySelector('#movie_player');
        if (!p || typeof p.getPlaybackQuality !== 'function') return;
        const now = p.getPlaybackQuality();
        if (now !== best) {
          // YouTube overrode it — try again
          if (typeof p.setPlaybackQualityRange === 'function') {
            p.setPlaybackQualityRange(best, best);
          }
          if (typeof p.setPlaybackQuality === 'function') {
            p.setPlaybackQuality(best);
          }
          log(`Quality re-applied: ${now} → ${best}`, '#ff9f0a');
        }
      }, 3000);

      clearInterval(qualityTimer); qualityTimer = null;
    };

    // Try via interval only (avoids race with immediate call)
    qualityTimer = setInterval(trySet, 500);
  }

  // ==================== AUTO-DISMISS POPUPS ====================

  let autoDismissObserver = null;

  function setupAutoDismiss() {
    if (settings.autoDismissPopups === false) return;
    if (autoDismissObserver) return;

    autoDismissObserver = new MutationObserver(() => {
      if (settings.autoDismissPopups === false) return;

      // "Are you still watching?" confirm dialog
      const confirmDialogs = document.querySelectorAll('yt-confirm-dialog-renderer');
      for (const dialog of confirmDialogs) {
        const text = (dialog.textContent || '').toLowerCase();
        if (text.includes('still watching') || text.includes('continue watching') || text.includes('video paused')) {
          const confirmBtn = dialog.querySelector('#confirm-button button, #confirm-button, .yt-spec-button-shape-next');
          if (confirmBtn) {
            confirmBtn.click();
            log('Auto-dismissed "Are you still watching?" popup', '#30d158');
          }
        }
      }

      // Paper dialog confirmations
      const paperDialogs = document.querySelectorAll('tp-yt-paper-dialog');
      for (const dialog of paperDialogs) {
        const text = (dialog.textContent || '').toLowerCase();
        if (text.includes('still watching') || text.includes('continue watching') || text.includes('video paused')) {
          const btn = dialog.querySelector('button, .yt-spec-button-shape-next, #confirm-button button, yt-button-renderer button');
          if (btn) {
            btn.click();
            log('Auto-dismissed confirmation dialog', '#30d158');
          }
        }
      }

      // Popup container with confirm dialog
      const popupConfirm = document.querySelector('.ytd-popup-container yt-confirm-dialog-renderer #confirm-button button');
      if (popupConfirm) {
        const container = popupConfirm.closest('yt-confirm-dialog-renderer');
        const text = (container?.textContent || '').toLowerCase();
        if (text.includes('still watching') || text.includes('continue watching')) {
          popupConfirm.click();
          log('Auto-dismissed popup confirm button', '#30d158');
        }
      }
    });

    autoDismissObserver.observe(document.body, { childList: true, subtree: true });
    log('Auto-dismiss popups enabled', '#5ac8fa');
  }

  // ==================== HIDE PREMIUM UPSELLS ====================

  function setupHidePremiumUpsells() {
    if (settings.hidePremiumUpsells === false) return;
    if (document.getElementById('pt-hide-premium-upsells')) return;

    const style = document.createElement('style');
    style.id = 'pt-hide-premium-upsells';
    style.textContent = `
      ytd-mealbar-promo-renderer,
      ytd-statement-banner-renderer,
      ytd-brand-video-singleton-renderer,
      #premium-upsell,
      yt-button-renderer[is-premium-upsell],
      ytd-popup-container tp-yt-paper-dialog:has([href*="premium"]),
      ytd-popup-container tp-yt-paper-dialog:has([href*="youtube.com/premium"]),
      .ytd-popup-container [href*="premium"],
      tp-yt-paper-dialog:has(yt-premium-upsell-dialog-renderer),
      ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-upsell"],
      ytd-guide-entry-renderer:has(a[href*="premium"]),
      ytd-mini-guide-entry-renderer:has(a[href*="premium"]),
      #items ytd-compact-link-renderer:has(a[href*="premium"]),
      ytd-banner-promo-renderer:has([href*="premium"]),
      tp-yt-paper-dialog:has([href*="youtube.com/premium"]) {
        display: none !important;
      }
    `;
    document.head.appendChild(style);
    log('Premium upsell hiding enabled', '#5ac8fa');
  }

  function removeHidePremiumUpsells() {
    const el = document.getElementById('pt-hide-premium-upsells');
    if (el) el.remove();
    log('Premium upsell hiding disabled', '#5ac8fa');
  }

  // ==================== CONTINUOUS PLAY ====================

  let continuousPlayInitialized = false;
  let continuousUserPaused = false;
  let continuousPlayObserver = null;

  function setupContinuousPlay() {
    if (settings.continuousPlay === false) return;
    if (continuousPlayInitialized) return;
    continuousPlayInitialized = true;

    // Track user-initiated pauses
    document.addEventListener('click', (e) => {
      if (!settings.continuousPlay) return;
      const playBtn = e.target.closest('.ytp-play-button');
      if (playBtn) {
        const v = getVid();
        if (v && !v.paused) continuousUserPaused = true;
        else continuousUserPaused = false;
      }
    });

    document.addEventListener('keydown', (e) => {
      if (!settings.continuousPlay) return;
      if (e.key === ' ' || e.key.toLowerCase() === 'k') {
        const a = document.activeElement;
        if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)) return;
        const v = getVid();
        if (v && !v.paused) continuousUserPaused = true;
        else continuousUserPaused = false;
      }
    });

    // Monitor for pause events not initiated by user
    const attachPauseListener = () => {
      const v = getVid();
      if (!v) {
        setTimeout(attachPauseListener, 1000);
        return;
      }

      v.addEventListener('pause', () => {
        if (!settings.continuousPlay) return;
        if (continuousUserPaused) return;

        // Don't resume if video has ended
        if (v.ended || (v.duration && v.currentTime >= v.duration - 0.5)) return;

        // Don't resume if an ad is playing
        const p = getPlayer();
        if (p && (p.classList.contains('ad-showing') || p.classList.contains('ad-interrupting'))) return;

        // Small delay to distinguish YouTube-initiated pauses from user actions
        setTimeout(() => {
          if (v.paused && !v.ended && !continuousUserPaused && settings.continuousPlay) {
            v.play().catch(() => {});
            log('Continuous play: resumed YouTube-paused video', '#30d158');
          }
        }, 200);
      });

      v.addEventListener('play', () => {
        continuousUserPaused = false;
      });
    };
    attachPauseListener();

    // Reset user pause flag on video change
    window.addEventListener('yt-navigate-finish', () => {
      continuousUserPaused = false;
    });

    // MutationObserver for pause overlay dialogs
    continuousPlayObserver = new MutationObserver(() => {
      if (!settings.continuousPlay) return;

      // "Video paused. Continue watching?" overlay
      const pauseOverlay = document.querySelector('.ytp-pause-overlay');
      if (pauseOverlay && pauseOverlay.offsetParent !== null) {
        const btn = pauseOverlay.querySelector('button, .ytp-pause-overlay-button');
        if (btn) {
          btn.click();
          log('Continuous play: dismissed pause overlay', '#30d158');
        } else {
          // No button — just resume
          const v = getVid();
          if (v && v.paused && !v.ended) {
            v.play().catch(() => {});
            log('Continuous play: resumed from pause overlay', '#30d158');
          }
        }
      }

      // "Continue watching?" dialog
      const dialogs = document.querySelectorAll('tp-yt-paper-dialog, yt-confirm-dialog-renderer');
      for (const dialog of dialogs) {
        const text = (dialog.textContent || '').toLowerCase();
        if (text.includes('continue watching') || text.includes('video paused')) {
          const btn = dialog.querySelector('button, #confirm-button button, .yt-spec-button-shape-next');
          if (btn) {
            btn.click();
            log('Continuous play: dismissed continue watching dialog', '#30d158');
          }
        }
      }
    });

    continuousPlayObserver.observe(document.body, { childList: true, subtree: true });
    log('Continuous play enabled', '#5ac8fa');
  }

  // ==================== START ====================

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
