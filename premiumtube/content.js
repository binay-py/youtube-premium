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

  // Race condition guard — increments on every video change
  let videoGeneration = 0;

  // Seekbar marker persistence state
  let seekbarObserver = null;
  let seekbarSafetyTimer = null;

  // Controls visibility observer (for sliding button when controls hide)
  let controlsObserver = null;

  const LABELS = {
    intro: 'Intro', outro: 'Outro', sponsor: 'Sponsor',
    selfpromo: 'Promo', interaction: 'Reminder',
    music_offtopic: 'Off-topic', preview: 'Preview', filler: 'Filler'
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
      'intro', 'introduction',
      'quick intro', 'channel intro', 'video intro', 'the intro',
      'opening segment', 'opening intro',
      // Hindi/Hinglish
      'parichay', 'shuruat', 'shuruaat', 'bhoomika'
    ],
    outro: [
      'outro', 'end screen', 'endscreen',
      'wrap up', 'wrap-up', 'end card',
      'final thoughts', 'thanks for watching', 'see you next',
      'until next time', 'signing off', 'end of video',
      // Hindi/Hinglish
      'alvida', 'aakhri baatein', 'samapan'
    ],
    sponsor: [
      'sponsor', 'sponsored', 'advertisement', 'paid promotion',
      "today's sponsor", 'ad break', 'ad read',
      'collaboration', 'collab', 'in association with', 'partnered with',
      'gifted', 'pr package', 'pr unboxing', 'sent me',
      '#ad', '#sponsored', '#collab', '#partnership',
      'brand deal', 'paid partnership', 'promoted', 'integrated ad',
      'sponsored by', 'brought to you by', 'sponsored segment',
      'word from our sponsor', 'message from our sponsor',
      'this video is sponsored', 'paid promo',
      // Hindi/Hinglish
      'praayojak', 'praayojit', 'vigyaapan',
      'is video ke sponsor', 'aaj ka sponsor'
    ],
    selfpromo: [
      'merch', 'merchandise', 'self promo', 'self-promo', 'selfpromo',
      'channel plug', 'shameless plug', 'my course', 'my podcast',
      'check out my', 'my website', 'my store', 'my shop',
      'link in description', 'link in bio', 'my patreon',
      'join my discord', 'my social media',
      // Hindi/Hinglish
      'mera course', 'meri website', 'description mein link'
    ],
    interaction: [
      'subscribe', 'like button', 'notification bell', 'leave a comment',
      'hit the bell', 'smash the like', 'like and subscribe',
      'comment below', 'drop a like', 'ring the bell',
      'turn on notifications', 'click subscribe',
      'like share subscribe', 'subscribe and like',
      // Hindi/Hinglish
      'subscribe karo', 'like karo', 'bell icon daba do',
      'comment karo', 'share karo'
    ],
    preview: [
      'preview', 'recap', 'previously on', 'last time', 'quick recap',
      'coming up', 'in this video', 'what we\'ll cover',
      'table of contents', 'agenda', 'overview',
      // Hindi/Hinglish
      'is video mein', 'aaj hum dekhenge'
    ]
  };

  // Known sponsor brands — used by matchCategory() pattern matching and caption scanning
  const SPONSOR_BRANDS = [
    // Indian brands — e-commerce & fashion
    'flipkart', 'myntra', 'meesho', 'ajio', 'nykaa', 'mamaearth', 'wow skin science',
    'tata cliq', 'jiomart', 'firstcry', 'purplle', 'snitch', 'bonkers corner',
    'wrogn', 'bewakoof', 'souled store', 'the man company',
    // Indian brands — tech & gadgets
    'boat', 'noise', 'fire-boltt', 'realme', 'oneplus', 'samsung india',
    'mivi', 'portronics', 'boult audio', 'crossbeats', 'ambrane',
    'nothing india', 'iqoo', 'poco', 'redmi',
    // Indian brands — fintech & payments
    'cred', 'groww', 'zerodha', 'upstox', 'coin dcx', 'coinswitch',
    'phonepe', 'paytm', 'google pay', 'amazon pay',
    'khatabook', 'open', 'razorpay', 'fi money', 'jupiter',
    'smallcase', 'kuvera', 'angel one', 'dhan',
    // Indian brands — education
    'unacademy', 'byju', "byjus", 'physicswallah', 'vedantu', 'toppr',
    'allen', 'apna college', 'coding ninjas', 'scaler', 'newton school',
    'great learning', 'simplilearn', 'upgrad',
    // Indian brands — lifestyle & food
    'lenskart', 'sugar cosmetics', 'plum goodness',
    'swiggy', 'zomato', 'blinkit', 'zepto', 'dunzo', 'bigbasket',
    'cult.fit', 'healthifyme', 'beardo', 'man matters',
    'urban company', 'pharmeasy', 'netmeds', '1mg', 'tata 1mg',
    // Indian brands — home & furniture
    'pepperfry', 'urban ladder', 'wakefit', 'sleepyhead',
    // Indian brands — entertainment & gaming
    'jiocinema', 'hotstar', 'zee5', 'sonyliv', 'voot', 'mxplayer',
    'dream11', 'mpl', 'winzo', 'my11circle', 'getmega',
    'shaadi.com', 'matrimony.com',
    // Indian brands — travel
    'makemytrip', 'goibibo', 'ixigo', 'cleartrip', 'yatra',
    // Global — VPN & security
    'nordvpn', 'surfshark', 'expressvpn', 'private internet access', 'proton vpn',
    'incogni', 'dashlane', 'lastpass', '1password', 'bitwarden',
    // Global — web & hosting
    'squarespace', 'hostinger', 'bluehost', 'namecheap',
    'shopify', 'wix', 'notion', 'webflow',
    // Global — learning
    'skillshare', 'audible', 'brilliant', 'curiositystream',
    'nebula', 'wondrium', 'coursera', 'masterclass', 'linkedin learning',
    // Global — gaming
    'raid shadow legends', 'genshin impact', 'rise of kingdoms',
    'state of survival', 'afk arena', 'mobile legends', 'lords mobile',
    // Global — grooming & health
    'manscaped', 'dollar shave club', 'dr squatch',
    'betterhelp', 'headspace', 'calm', 'noom',
    // Global — food & drink
    'hellofresh', 'hello fresh', 'factor meals', 'athletic greens',
    'magic spoon', 'ag1', 'liquid iv', 'mudwater',
    // Global — tech & accessories
    'ridge wallet', 'raycon', 'casetify', 'dbrand', 'anker',
    'opera gx', 'brave browser', 'arc browser',
    'backbone one', 'analogue',
    // Global — productivity & tools
    'grammarly', 'canva', 'aura', 'delete me',
    'ground news', 'morning brew',
    // Global — finance & shopping
    'honey', 'rakuten', 'capital one shopping',
    'trade coffee', 'bespoke post',
    'seatgeek', 'stubhub',
    'stamps.com', 'shipstation',
    'keeps', 'hims', 'roman',
    'established titles', 'funcky',
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
      "let's get started", 'welcome back everybody', 'welcome back everyone',
      'so today we', 'alright so today',
      // Hindi/Hinglish
      'namaste doston', 'namaskar doston', 'namaskar dosto',
      'toh chaliye shuru karte', 'chaliye shuru karte hain',
      'swagat hai aapka', 'aaj hum baat karenge',
      'toh aaj ki video mein', 'hello doston', 'hello dosto',
      'aaj ke is video mein', 'sabse pehle',
      'kaise hain aap sab', 'kaise ho dosto',
      'aaj ka topic hai', 'aaj ka vishay hai'
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
      'until next time guys', 'i will see you', 'we will see you',
      'with that said', "that's all i have", 'thanks for sticking around',
      // Hindi/Hinglish
      'milte hain next video', 'aur milte hain', 'milte hain agle video mein',
      'toh milte hain', 'alvida doston', 'bye bye doston',
      'apna khayal rakhna', 'video ko like karna mat bhoolna',
      'subscribe zaroor karna', 'agle video mein milte hain',
      'jai hind doston', 'dhanyavaad doston'
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
      'go to the link', 'get started for free', 'download for free',
      'get it for free', 'money back guarantee', 'try it for free',
      'percent off with', 'off using my code', 'off using my link',
      'they sent me', 'they were kind enough', 'huge thanks to',
      'massive thanks to', 'big thanks to',
      // Hindi/Hinglish sponsor phrases
      'is video ka sponsor hai', 'aaj ka sponsor hai',
      'ye video sponsored hai', 'link description mein hai',
      'code use karo', 'link use karo', 'discount milega',
      'pehle 100 logo ko', 'free mein try karo',
      'inhone ye bheja hai', 'inhone sponsor kiya hai'
    ],
    selfpromo: [
      'check out my', 'my other channel', 'second channel',
      'join my discord', 'become a member', 'join the membership',
      'channel membership', 'support the channel', 'link in bio',
      'check out my merch', 'my merch store', 'buy me a coffee',
      'follow me on', 'sign up for my', 'my online course',
      'listen to my podcast',
      'my website', 'my store', 'my app',
      // Hindi/Hinglish
      'mera channel subscribe karo', 'doosra channel bhi dekho',
      'meri website pe jao', 'merch kharidna mat bhoolna'
    ],
    interaction: [
      'smash that like', 'hit the like', 'drop a like', 'leave a like',
      'smash that subscribe', 'hit the subscribe', 'click subscribe',
      'hit the notification', 'ring the notification', 'turn on notifications',
      'comment down below', 'leave a comment below', 'let me know in the comments',
      'share this video', 'share with your friends',
      'like share subscribe', 'like subscribe',
      // Hindi/Hinglish
      'subscribe karo', 'like karo', 'bell icon daba do',
      'comment karo', 'share karo neeche', 'notification on karo',
      'like kar do', 'subscribe kar lo', 'bell icon dabao',
      'comment mein batao'
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
    setupAdBlocker();
    setupAutoQuality();
    setupAutoDismiss();
    setupHidePremiumUpsells();
    setupContinuousPlay();
    setupKeyboardShortcuts();
    setupVideoStats();
    setupAudioEnhancement();
    setupCinematicMode();
    setupVideoSharpening();
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
      skipPreview: true, skipFiller: true, adSkip: true,
      pipEnabled: true, pipAutoSwitch: true,
      backgroundPlay: true, autoMaxQuality: true,
      autoDismissPopups: true, hidePremiumUpsells: true, continuousPlay: true,
      keyboardShortcuts: true, videoStats: false,
      bassBoost: false, audioNormalizer: false,
      cinematicMode: false, videoSharpening: false, sharpeningStrength: 0.5
    };
  }

  chrome.storage.onChanged.addListener((c) => {
    for (const [k, { newValue }] of Object.entries(c)) {
      const oldVal = settings[k];
      settings[k] = newValue;

      // React to feature toggles that need setup/teardown
      if (k === 'adSkip' && newValue && !oldVal) setupAdBlocker();
      if (k === 'autoMaxQuality' && newValue) applyMaxQuality();
      if (k === 'autoMaxQuality' && !newValue) cleanupQualityMonitor();
      if (k === 'autoDismissPopups' && newValue) setupAutoDismiss();
      if (k === 'hidePremiumUpsells' && newValue) setupHidePremiumUpsells();
      if (k === 'hidePremiumUpsells' && !newValue) removeHidePremiumUpsells();
      if (k === 'continuousPlay' && newValue) setupContinuousPlay();
      if (k === 'bassBoost' || k === 'audioNormalizer') updateAudioGraph();
      if (k === 'cinematicMode' && newValue && !oldVal) startCinematic();
      if (k === 'cinematicMode' && !newValue) stopCinematic();
      if (k === 'videoSharpening' && newValue && !oldVal) startSharpening();
      if (k === 'videoSharpening' && !newValue) stopSharpening();
      if (k === 'sharpeningStrength') updateSharpeningStrength();
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
    cleanupSpeedIndicator();
    removeStatsOverlay();
    stopCinematic();
    stopSharpening();
    currentVideoId = id;
    skipSegments = [];
    delete musicVideoCache[id]; // reset music detection for fresh check

    const gen = ++videoGeneration; // race condition guard

    log(`Video: ${id}`, '#5ac8fa');

    // Start polling immediately so segments found by any method are caught
    startPoll();
    startControlsObserver();

    // Start local detection immediately (don't wait for API)
    detectFromChapters(gen);
    detectFromDescription(gen);
    detectFromCaptions(gen);
    detectEndScreenFromMetadata(gen);
    // Live end screen detection still runs during check() polling as fallback

    // Fetch from SponsorBlock (with retry) — runs in parallel with local detection
    await fetchDirect(id, gen);

    if (gen !== videoGeneration) return; // stale — user navigated away
    if (skipSegments.length) addSeekbarMarkers();
    applyMaxQuality();
  }

  // ==================== AD BLOCKER ====================

  let adHandlerActive = false; // guard against concurrent handlers
  let adBlockerInitialized = false; // guard against duplicate setup

  function isAdPlaying() {
    const player = getPlayer();
    if (!player) return false;

    // Only use the most reliable signals — player class set by YouTube
    return player.classList.contains('ad-showing')
      || player.classList.contains('ad-interrupting');
  }

  function setupAdBlocker() {
    if (settings.adSkip === false) return;
    if (adBlockerInitialized) return;
    adBlockerInitialized = true;

    log('Ad blocker enabled', '#30d158');

    // CSS injection to hide ad containers and overlays
    const style = document.createElement('style');
    style.id = 'pt-ad-blocker-css';
    style.textContent = `
      #player-ads,
      #masthead-ad,
      ytd-ad-slot-renderer,
      ytd-banner-promo-renderer,
      ytd-promoted-sparkles-web-renderer,
      tp-yt-paper-dialog:has(.ytd-mealbar-promo-renderer),
      .ytp-ad-overlay-container,
      .ytp-ad-text-overlay,
      #ad-text,
      .ytd-mealbar-promo-renderer,
      ytd-popup-container:has(a[href*="googleads"]),
      .ytp-ad-message-container,
      .ytp-ad-action-interstitial,
      .ytp-ad-image-overlay,
      .ytp-ad-survey,
      ytd-display-ad-renderer,
      ytd-companion-slot-renderer,
      ytd-action-companion-ad-renderer,
      ytd-promoted-video-renderer,
      ytd-in-feed-ad-layout-renderer,
      #related ytd-promoted-sparkles-web-renderer,
      .ytd-merch-shelf-renderer,
      ytd-statement-banner-renderer,
      .ytd-brand-video-singleton-renderer,
      tp-yt-paper-dialog:has(ytd-enforcement-message-view-model),
      ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-ads"] {
        display: none !important;
      }
    `;
    document.head.appendChild(style);

    // MutationObserver on player for video ads
    const observePlayer = () => {
      const player = getPlayer();
      if (!player) {
        setTimeout(observePlayer, 1000);
        return;
      }

      const adObserver = new MutationObserver(() => {
        if (settings.adSkip === false) return;
        if (isAdPlaying()) {
          handleVideoAd();
        }
      });

      // Watch player class changes (ad-showing gets added here)
      adObserver.observe(player, {
        attributes: true,
        attributeFilter: ['class'],
        subtree: false
      });

      // Also observe body for anti-adblock popups
      const bodyObserver = new MutationObserver(() => {
        if (settings.adSkip === false) return;
        dismissAntiAdblock();
      });
      bodyObserver.observe(document.body, {
        childList: true,
        subtree: true
      });

      log('Ad observer attached to player', '#5ac8fa');
    };
    observePlayer();

    // Polling fallback - check every 500ms for ad elements
    setInterval(() => {
      if (settings.adSkip === false) return;

      if (isAdPlaying()) {
        handleVideoAd();
      } else {
        // Safety net: if no ad is playing, ensure video isn't stuck in a bad state
        // from a previous ad handler that didn't clean up properly
        const v = getVid();
        if (v) {
          // Restore mute/speed if ad handler left things dirty
          if (adHandlerActive) {
            restoreVideoState();
            log('Safety net: cleared stale ad handler state', '#ff9f0a');
          }
          // If video is muted but shouldn't be (no ad, user didn't mute)
          // playbackRate stuck at non-1 from ad skip
          if (v.playbackRate > 1 && v.playbackRate !== 2) {
            // 2x might be user-set, but 16x is definitely from ad handler
            v.playbackRate = 1;
            log('Safety net: reset stuck playback rate', '#ff9f0a');
          }
        }
      }

      // Remove overlay ads aggressively
      document.querySelectorAll(
        '.ytp-ad-overlay-container, .ytp-ad-overlay-close-button, ' +
        '.ytp-ad-text-overlay, .ytp-ad-image-overlay, .ytp-ad-survey'
      ).forEach(el => {
        const closeBtn = el.querySelector(
          '.ytp-ad-overlay-close-button, button[class*="close"], ' +
          '[aria-label="Close"], [aria-label="close"]'
        ) || el;
        if (closeBtn && (closeBtn.tagName === 'BUTTON' || closeBtn.getAttribute('role') === 'button')) {
          closeBtn.click();
        }
        el.style.display = 'none';
      });

      // Dismiss anti-adblock popups
      dismissAntiAdblock();
    }, 500);

  }

  function dismissAntiAdblock() {
    // YouTube's "ad blockers are not allowed" popup
    const enforcementSelectors = [
      'tp-yt-paper-dialog:has(ytd-enforcement-message-view-model)',
      'ytd-popup-container tp-yt-paper-dialog:has([target-id="enforcement-message"])',
      'ytd-popup-container tp-yt-paper-dialog:has(yt-ad-blocker-message-renderer)',
      'tp-yt-paper-dialog:has(yt-playability-error-supported-renderers)',
      '#dialog:has([class*="enforcement"])',
      'ytd-popup-container tp-yt-paper-dialog:has(#dismiss-button)'
    ];

    for (const sel of enforcementSelectors) {
      const dialog = document.querySelector(sel);
      if (dialog) {
        const dismissBtn = dialog.querySelector(
          '#dismiss-button button, button, .yt-spec-button-shape-next, ' +
          '[aria-label="Close"], [aria-label="Dismiss"], #dismiss-button'
        );
        if (dismissBtn) {
          dismissBtn.click();
          log('Dismissed anti-adblock popup: ' + sel, '#ff9f0a');
        }
        dialog.remove();
      }
    }

    // Remove any blocking overlays that prevent video playback
    const blockOverlay = document.querySelector(
      '.ytd-enforcement-message-view-model, ' +
      'yt-playability-error-supported-renderers'
    );
    if (blockOverlay) {
      blockOverlay.remove();
      log('Removed ad-block enforcement overlay', '#ff9f0a');
    }
  }


  function restoreVideoState() {
    // Safety: always restore normal playback state
    // Re-query the video element — YouTube may have swapped it during ad transition
    const v = getVid();
    if (v) {
      v.muted = false;
      v.playbackRate = 1;
    }
    adHandlerActive = false;
  }

  function handleVideoAd() {
    if (adHandlerActive) return; // prevent concurrent handlers
    adHandlerActive = true;

    // Double-check: confirm ad is truly playing before taking action
    // This avoids false positives from transient class changes
    const player = getPlayer();
    if (!player || (!player.classList.contains('ad-showing') && !player.classList.contains('ad-interrupting'))) {
      adHandlerActive = false;
      return;
    }

    log('Ad detected! Attempting to skip...', '#ff9f0a');

    // Cinematic mode auto-pauses during ads via its own isAdPlaying() check

    // Always re-query video element — YouTube can swap it for ads
    const v = getVid();
    if (!v) { adHandlerActive = false; return; }

    // Mute immediately so user doesn't hear the ad
    v.muted = true;

    // Try clicking skip button immediately
    if (tryClickSkip()) {
      restoreVideoState();
      return;
    }

    // Keep trying every 300ms
    let attempts = 0;
    const skipInterval = setInterval(() => {
      attempts++;

      // Re-check if ad is still playing (use player class — most reliable)
      const player = getPlayer();
      const stillAd = player && (player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting'));

      if (!stillAd) {
        clearInterval(skipInterval);
        restoreVideoState();
        // Ensure video resumes after ad ends — re-query fresh element
        setTimeout(() => {
          const vid = getVid();
          if (vid && vid.paused && !vid.ended && vid.readyState >= 2) {
            vid.play().catch(() => {});
            log('Resumed video after ad', '#30d158');
          }
        }, 500);
        log('Ad ended', '#30d158');
        return;
      }

      // Try clicking skip button every tick
      if (tryClickSkip()) {
        clearInterval(skipInterval);
        restoreVideoState();
        return;
      }

      // Always re-query video — YouTube may swap during ad
      const currentV = getVid();
      if (!currentV) { /* no video element */ }
      else if (currentV.duration && isFinite(currentV.duration) && currentV.duration < 120) {
        // Only apply aggressive strategies to SHORT videos (ads are < 120s)
        if (currentV.duration > 0.5) {
          currentV.currentTime = currentV.duration - 0.1;
        }
        try { currentV.playbackRate = 16; } catch (e) {}
      }

      // Strategy: Try YouTube's player API (safe — only works on actual ads)
      if (attempts === 3 || attempts === 15) {
        try {
          if (player && typeof player.skipAd === 'function') {
            player.skipAd();
            log('Called player.skipAd()', '#30d158');
          }
        } catch (e) {}
      }

      // Safety: give up after 15s (50 attempts at 300ms)
      if (attempts > 50) {
        clearInterval(skipInterval);
        restoreVideoState();
        log('Ad handler timeout — gave up', '#ff9f0a');
      }
    }, 300);
  }

  function tryClickSkip() {
    // Comprehensive skip button selectors (YouTube changes these often)
    const skipSelectors = [
      '.ytp-skip-ad-button',
      '.ytp-ad-skip-button',
      '.ytp-ad-skip-button-modern',
      '.ytp-ad-skip-button-container button',
      'button.ytp-ad-skip-button',
      '.videoAdUiSkipButton',
      '[id^="skip-button"]',
      '.ytp-ad-skip-button-slot button',
      '.ytp-ad-skip-button-slot .ytp-ad-skip-button-modern',
      'button[class*="skip-button"]',
      'button[class*="skip-ad"]',
      '.ytp-ad-player-overlay button[class*="skip"]',
      'button.ytp-ad-overlay-close-button',
      '.ytp-ad-action-interstitial-close-button',
      '.ytp-ad-skip-button-modern-with-label',
      'ytd-button-renderer#skip-button button',
      '.ytp-ad-button-icon',
      'button[data-tooltip-target-id="skip-button"]',
      // 2025-2026 YouTube ad skip patterns
      '.ytp-ad-skip-button-slot',
      '.ytp-skip-ad-button__text',
      '.ytp-ad-skip-button-container',
      'button[class*="ytp-ad-skip"]',
      '.ytp-ad-module button',
      '.ytp-ad-overlay-close-container button',
      'yt-button-renderer[is-skip-ad-button] button',
      '.ytp-ad-feedback-dialog-close-button'
    ];

    for (const sel of skipSelectors) {
      const els = document.querySelectorAll(sel);
      for (const btn of els) {
        btn.click();
        btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        log('Clicked skip button: ' + sel, '#30d158');
        return true;
      }
    }

    // Broad text-based search across all buttons in the player area
    const allButtons = document.querySelectorAll(
      '.ytp-ad-player-overlay button, .ytp-ad-module button, ' +
      '.ytp-ad-overlay-container button, #movie_player button, ' +
      '.html5-video-player button'
    );
    for (const btn of allButtons) {
      const txt = (btn.textContent || btn.getAttribute('aria-label') || '').toLowerCase();
      if (txt.includes('skip') || txt.includes('close ad') || txt.includes('skip ad')) {
        btn.click();
        btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        log('Clicked skip via text match: "' + txt.trim() + '"', '#30d158');
        return true;
      }
    }

    return false;
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

  function detectFromChapters(gen) {
    let attempts = 0;
    const maxAttempts = 30; // 15s at 500ms intervals

    const tryDetect = () => {
      if (gen !== videoGeneration) return; // stale
      // Try DOM selectors (expanded for current YouTube layout)
      const chapterElements = document.querySelectorAll(
        'ytd-macro-markers-list-item-renderer, ' +
        'ytd-chapter-renderer, ' +
        'ytd-engagement-panel-section-list-renderer[target-id*="chapters"] ytd-macro-markers-list-item-renderer, ' +
        'ytd-engagement-panel-section-list-renderer[target-id*="macro-markers"] ytd-macro-markers-list-item-renderer, ' +
        // 2025-2026 YouTube selectors
        'yt-decorated-chapter-renderer, ' +
        'ytd-macro-markers-list-renderer ytd-macro-markers-list-item-renderer, ' +
        '[target-id*="chapters"] [role="listitem"], ' +
        'ytd-structured-description-content-renderer ytd-macro-markers-list-item-renderer'
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
          const titleEl = el.querySelector(
            '#details h4, #chapter-title, .macro-markers, .macro-markers-list-item-renderer h4, ' +
            'h4, [class*="chapter-title"], [class*="macro-markers"] h4, ' +
            'yt-formatted-string[class*="title"], span[class*="title"]'
          );
          const timeEl = el.querySelector(
            '#time, .timestamp, #details .macro-markers-list-item-renderer-time, ' +
            '.macro-markers-list-item-renderer-time, ' +
            '[class*="timestamp"], [class*="time-display"], span[class*="time"]'
          );

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
        const segDuration = end - ch.start;
        const category = matchCategory(ch.title);

        // Skip intro/outro detection for music videos (those are musical terms, not video segments)
        if (musicVideo && (category === 'intro' || category === 'outro')) continue;

        // Positional check: intro only in first 15%, outro only in last 30%
        if (category === 'intro' && ch.start > v.duration * 0.15) continue;
        if (category === 'outro' && ch.start < v.duration * 0.70) continue;

        // Sanity: skip segments that are too long relative to video duration
        // Intro/outro > 20% of video, others > 30% — almost certainly false positives
        if (category === 'intro' || category === 'outro') {
          if (segDuration > v.duration * 0.20) continue;
        } else if (segDuration > v.duration * 0.30) continue;

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

  function detectFromDescription(gen) {
    let attempts = 0;
    const maxAttempts = 30; // 15s at 500ms intervals

    const tryDetect = () => {
      if (gen !== videoGeneration) return; // stale
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
        'yt-attributed-string.content, ' +
        // 2025-2026 YouTube selectors
        'ytd-structured-description-content-renderer #description-content, ' +
        '#description-inner, ' +
        'ytd-video-description-infocards-section-renderer, ' +
        '#description yt-attributed-string, ' +
        '#description ytd-text-inline-expander, ' +
        'ytd-watch-metadata yt-formatted-string[class*="description"]'
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
      // "0:00: Intro", "Intro - 0:00", "Intro 0:00", "0:00 | Intro"
      const timestampFirstPattern = /(?:[\[\(]?)(\d{1,2}:\d{2}(?::\d{2})?)[\]\)]?[:\s|]*[-–—|]?\s*(.+)/;
      const labelFirstPattern = /^(.+?)\s*[-–—|:]\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*$/;
      const labelFirstNoSepPattern = /^([^\d].{2,}?)\s+(\d{1,2}:\d{2}(?::\d{2})?)\s*$/;
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
        '#ad', '#sponsored', '#collab', '#partnership',
        'sponsored by', 'paid promotion', 'paid partnership',
        'this video is sponsored', 'brought to you by', 'thanks to our sponsor',
        'includes paid promotion', 'use code', 'use my code',
        'promo code', 'discount code', 'coupon code',
        'affiliate link', 'referral link', 'commission',
        'special thanks to', 'in partnership with', 'in collaboration with',
        'brand collaboration', 'gifted by', 'sent for review',
        // Hindi/Hinglish
        'is video ka sponsor', 'ye video sponsored hai',
        'link description mein', 'code use karo'
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
        const segDuration = end - entry.start;
        const category = matchCategory(entry.label);

        // Skip intro/outro detection for music videos
        if (musicVideo && (category === 'intro' || category === 'outro')) continue;

        // Positional check: intro only in first 15%, outro only in last 30%
        if (category === 'intro' && entry.start > v.duration * 0.15) continue;
        if (category === 'outro' && entry.start < v.duration * 0.70) continue;

        // Sanity: skip segments that are too long relative to video duration
        if (category === 'intro' || category === 'outro') {
          if (segDuration > v.duration * 0.20) continue;
        } else if (segDuration > v.duration * 0.30) continue;

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

  function detectEndScreenFromMetadata(gen) {
    // Don't add outro segments for music videos
    if (isMusicVideo()) return;

    let attempts = 0;
    const maxAttempts = 15; // 7.5s at 500ms intervals

    const tryDetect = () => {
      if (gen !== videoGeneration) return; // stale
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

  function detectFromCaptions(gen) {
    const tryDetect = async () => {
      if (gen !== videoGeneration) return; // stale
      const v = getVid();
      if (!v || !v.duration) {
        if (++captionRetries < 6) {
          const timerId = setTimeout(() => detectFromCaptions(gen), 3000);
          localDetectionTimers.push(timerId);
        }
        return;
      }

      try {
        let captionUrls = []; // try multiple tracks for multilingual support

        // Collect all available caption tracks
        let allTracks = [];

        // Method A: Try YouTube's internal player API (most reliable)
        const player = document.querySelector('#movie_player');
        if (player && typeof player.getOption === 'function') {
          try {
            const trackList = player.getOption('captions', 'tracklist');
            if (trackList && trackList.length) {
              allTracks = trackList.filter(t => t.baseUrl);
            }
          } catch (e) { /* player API not available yet */ }
        }

        // Method B: Parse from ytInitialPlayerResponse in page source
        if (!allTracks.length) {
          const scripts = document.querySelectorAll('script');
          for (const script of scripts) {
            const text = script.textContent;
            if (!text.includes('ytInitialPlayerResponse')) continue;
            const match = text.match(/ytInitialPlayerResponse\s*=\s*({.+?});/s);
            if (!match) continue;
            const playerData = JSON.parse(match[1]);
            const tracks = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
            if (tracks && tracks.length) allTracks = tracks.filter(t => t.baseUrl);
            break;
          }
        }

        // Method C: Try the global ytInitialPlayerResponse object
        if (!allTracks.length && window.ytInitialPlayerResponse) {
          try {
            const tracks = window.ytInitialPlayerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
            if (tracks && tracks.length) allTracks = tracks.filter(t => t.baseUrl);
          } catch (e) { /* not available */ }
        }

        if (!allTracks.length) {
          log('Captions detection: no caption track found', '#aaa');
          return;
        }

        // Prioritize: English first, then Hindi, then others
        const prioritized = [
          ...allTracks.filter(t => t.languageCode === 'en' || t.languageCode?.startsWith('en')),
          ...allTracks.filter(t => t.languageCode === 'hi' || t.languageCode?.startsWith('hi')),
          ...allTracks.filter(t => !t.languageCode?.startsWith('en') && !t.languageCode?.startsWith('hi'))
        ];
        // Deduplicate by baseUrl
        const seen = new Set();
        for (const t of prioritized) {
          if (!seen.has(t.baseUrl)) { seen.add(t.baseUrl); captionUrls.push(t.baseUrl); }
        }
        // Limit to 3 tracks max to avoid excessive fetching
        captionUrls = captionUrls.slice(0, 3);

        // Fetch and merge captions from all tracks
        const captions = [];
        for (const url of captionUrls) {
          if (gen !== videoGeneration) return; // stale
          try {
            const res = await fetch(url);
            if (!res.ok) continue;
            const xmlText = await res.text();
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
            const textElements = xmlDoc.querySelectorAll('text');
            textElements.forEach(el => {
              const start = parseFloat(el.getAttribute('start'));
              const dur = parseFloat(el.getAttribute('dur') || '0');
              const content = (el.textContent || '').replace(/&#?\w+;/g, ' ').toLowerCase();
              if (!isNaN(start) && content.trim()) {
                captions.push({ start, dur, end: start + dur, text: content });
              }
            });
          } catch (e) {
            log('Captions detection: track fetch failed: ' + e.message, '#ff9f0a');
          }
        }

        if (gen !== videoGeneration) return; // stale

        if (!captions.length) return;

        // Scan captions using CAPTION_KEYWORDS (strict, multi-word only)
        const rawHits = []; // { start, end, category }
        const videoDuration = v.duration;
        const musicVideo = isMusicVideo();

        for (const cap of captions) {
          for (const [category, keywords] of Object.entries(CAPTION_KEYWORDS)) {
            // Skip intro/outro from captions — too noisy, only trust explicit timestamps/chapters
            if (category === 'intro' || category === 'outro') continue;
            // Skip intro/outro detection for music videos
            if (musicVideo && (category === 'intro' || category === 'outro')) continue;

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
    const lower = text.toLowerCase().trim();

    // Pass 1: Keyword matching with word boundary checks
    for (const [category, keywords] of Object.entries(SEGMENT_KEYWORDS)) {
      for (const kw of keywords) {
        // Multi-word keywords use includes (specific enough)
        // Single-word keywords use word boundary regex to avoid partial matches
        if (kw.includes(' ') || kw.startsWith('#')) {
          if (lower.includes(kw)) return category;
        } else {
          const re = new RegExp(`\\b${escapeRegex(kw)}\\b`);
          if (re.test(lower)) return category;
        }
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

    // Filter out editorial/review/build content — these are NOT sponsors
    const brandSafePatterns = [
      'review', 'vs', 'versus', 'comparison', 'top 10', 'top 5', 'top 20',
      'tier list', 'ranking', 'rated', 'honest opinion', 'is it worth',
      'should you buy', 'alternatives', 'problems with',
      // Tech/build/shopping context — editorial, not sponsorship
      'build', 'building', 'built', 'install', 'installing', 'setup', 'setting up',
      'shopping', 'bought', 'buying', 'testing', 'tested', 'using',
      'upgrade', 'upgrading', 'benchmark', 'benchmarking', 'performance',
      'hands on', 'hands-on', 'first look', 'overview', 'tutorial',
      'how to', 'guide', 'explained', 'explained', 'deep dive',
      'teardown', 'repair', 'fixing', 'modding', 'customiz'
    ];
    for (const safe of brandSafePatterns) {
      if (lower.includes(safe)) return null;
    }

    const esc = escapeRegex(matchedBrand);

    // Structural patterns that strongly indicate sponsorship
    const sponsorPatterns = [
      new RegExp(`\\b(sponsored|partnered)\\s+with\\s+${esc}\\b`),      // "sponsored/partnered with [brand]"
      new RegExp(`\\bft\\.?\\s*${esc}\\b`),                // "ft. [brand]"
      new RegExp(`\\bfeat\\.?\\s*${esc}\\b`),              // "feat. [brand]"
      new RegExp(`\\bfeaturing\\s+${esc}\\b`),             // "featuring [brand]"
      new RegExp(`\\b${esc}\\s+(special|segment|deal|zone)\\b`), // "[brand] special/segment/..."
      new RegExp(`\\b(powered|presented|brought)\\s+by\\s+${esc}\\b`),  // "powered/presented by [brand]"
    ];

    for (const pat of sponsorPatterns) {
      if (pat.test(lower)) return 'sponsor';
    }

    // Brand name IS the entire chapter title (after stripping emojis/whitespace)
    if (lower.trim() === matchedBrand) return 'sponsor';

    return null;
  }

  function hasOverlap(start, end, category) {
    for (const seg of skipSegments) {
      // Same category — only one intro/outro/etc. allowed, block if ANY time overlap
      if (category && seg.category === category) {
        const overlapStart = Math.max(start, seg.start);
        const overlapEnd = Math.min(end, seg.end);
        if (overlapEnd > overlapStart) return true;
        // Also block same-category segments that are very close (within 10s gap)
        if (Math.abs(start - seg.end) < 10 || Math.abs(seg.start - end) < 10) return true;
      }
      // Different category — use normal overlap threshold
      const overlapStart = Math.max(start, seg.start);
      const overlapEnd = Math.min(end, seg.end);
      if (overlapEnd - overlapStart > 3) return true;
    }
    return false;
  }

  // Only one intro and one outro allowed across all sources
  function hasCategoryAlready(category) {
    if (category !== 'intro' && category !== 'outro') return false;
    return skipSegments.some(s => s.category === category);
  }

  function mergeSegments(newSegments) {
    for (const seg of newSegments) {
      if (hasCategoryAlready(seg.category)) continue;
      if (!hasOverlap(seg.start, seg.end, seg.category)) {
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

  async function fetchDirect(videoId, gen) {
    const url = `${API}?videoID=${videoId}&categories=${encodeURIComponent(CATEGORIES)}`;
    log('Fetching: ' + url);

    // Fetch with timeout helper
    const fetchWithTimeout = (u, ms = 5000) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), ms);
      return fetch(u, { signal: controller.signal }).finally(() => clearTimeout(timer));
    };

    // Try direct fetch with retry + exponential backoff
    for (let attempt = 0; attempt < 3; attempt++) {
      if (gen !== videoGeneration) return; // stale
      try {
        const res = await fetchWithTimeout(url, 5000);
        log(`API response: ${res.status} (attempt ${attempt + 1})`);

        if (res.status === 404) {
          log('No segments on SponsorBlock for this video');
          return; // no segments — local detection will still run
        }

        // Don't retry on server errors (5xx) — won't help
        if (res.status >= 500) {
          log(`SponsorBlock server error (${res.status}), skipping`, '#ff9f0a');
          return;
        }

        if (!res.ok) {
          if (attempt < 2) {
            const delay = 1000 * (attempt + 1); // 1s, 2s backoff
            log(`API returned ${res.status}, retrying in ${delay / 1000}s...`, '#ff9f0a');
            await new Promise(r => setTimeout(r, delay));
            continue;
          }
          throw new Error(`API error: ${res.status}`);
        }

        const data = await res.json();
        if (gen !== videoGeneration) return; // stale
        const sbSegments = data.map(d => ({
          start: d.segment[0],
          end: d.segment[1],
          category: d.category,
          source: 'sponsorblock'
        }));

        // Merge SponsorBlock segments (they have priority — dedup with existing)
        mergeSegments(sbSegments);

        log(`SponsorBlock: loaded ${sbSegments.length} segments`, '#30d158');
        sbSegments.forEach(s => {
          log(`  ${s.category}: ${fmtTime(s.start)} -> ${fmtTime(s.end)} (${(s.end - s.start).toFixed(0)}s)`);
        });
        return; // success

      } catch (err) {
        if (attempt < 2) {
          const delay = 1000 * (attempt + 1);
          log('Fetch failed: ' + err.message + `, retrying in ${delay / 1000}s...`, '#ff9f0a');
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        log('Fetch failed after retries: ' + err.message, 'red');
      }
    }

    // Both direct attempts failed — try via background service worker
    log('Trying background fallback...');
    try {
      const resp = await chrome.runtime.sendMessage({ type: 'FETCH_SEGMENTS', videoId });
      if (resp?.success && resp.segments?.length) {
        const bgSegments = resp.segments.map(s => ({ ...s, source: 'sponsorblock' }));
        mergeSegments(bgSegments);
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
      if (t >= seg.start - 0.3 && t < seg.end - 0.05) {
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

  // Category-specific SVG icons (24x24 viewBox)
  const CATEGORY_ICONS = {
    intro:          '<path d="M8 5v14l11-7z"/>',                                           // play
    outro:          '<path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>',                             // skip previous (reversed = end)
    sponsor:        '<path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"/>', // dollar sign
    selfpromo:      '<path d="M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58.55 0 1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41 0-.55-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z"/>',  // tag
    interaction:    '<path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>',  // bell
    music_offtopic: '<path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>',  // music note
    preview:        '<path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>',  // eye
    filler:         '<path d="M9.64 7.64c.23-.5.36-1.05.36-1.64 0-2.21-1.79-4-4-4S2 3.79 2 6s1.79 4 4 4c.59 0 1.14-.13 1.64-.36L10 12l-2.36 2.36C7.14 14.13 6.59 14 6 14c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4c0-.59-.13-1.14-.36-1.64L12 14l7 7h3v-1L9.64 7.64zM6 8c-1.1 0-2-.89-2-2s.9-2 2-2 2 .89 2 2-.9 2-2 2zm0 12c-1.1 0-2-.89-2-2s.9-2 2-2 2 .89 2 2-.9 2-2 2zM19 3l-6 6 2 2 7-7V3h-3z"/>',  // cut
  };

  // ==================== SKIP BUTTON ====================

  function showBtn(seg) {
    if (activeSeg === seg && activeBtn) return;
    removeBtn();

    activeSeg = seg;
    const label = LABELS[seg.category] || seg.category;
    const v = getVid();
    const remaining = v ? Math.max(0, Math.round(seg.end - v.currentTime)) : Math.round(seg.end - seg.start);
    const iconPath = CATEGORY_ICONS[seg.category] || CATEGORY_ICONS.sponsor;

    const el = document.createElement('div');
    el.id = 'pt-skip-button';
    el.setAttribute('data-category', seg.category);
    el.innerHTML = `
      <div id="pt-skip-inner">
        <svg id="pt-skip-icon" viewBox="0 0 24 24">${iconPath}</svg>
        <span id="pt-skip-title">${label}</span>
        <span id="pt-skip-time">${remaining}s</span>
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

    log(`BUTTON SHOWN: "${label}" [${seg.source || 'unknown'}]`, '#ff2d55');
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
      // Detect clicks on the play button, video itself, or video container
      const playBtn = e.target.closest('.ytp-play-button');
      const videoClick = e.target.closest('video, .html5-video-container');
      if (playBtn || videoClick) {
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
  // Quality setting is done via bridge.js (MAIN world) since YouTube's player
  // API methods are only accessible from the page's JS context, not from
  // the content script's isolated world.

  let qualityTimer = null;

  function setupAutoQuality() {
    // Listen for quality results from bridge.js
    document.addEventListener('pt-quality-result', (e) => {
      const d = e.detail || {};
      if (d.status === 'set') {
        log(`Quality: ${d.previous || '?'} → ${d.target} (available: ${d.available})`, '#30d158');
        // Start monitor to keep quality locked
        setTimeout(() => {
          document.dispatchEvent(new CustomEvent('pt-start-quality-monitor'));
        }, 1000);
      } else if (d.status === 'already-max') {
        log(`Quality: already at max (${d.target})`, '#30d158');
      }
    });

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
      // Check if bridge has reported available qualities yet
      const bridge = document.getElementById('pt-stats-bridge');
      const availStr = bridge?.getAttribute('data-available-qualities') || '';

      if (!availStr) {
        if (++attempts < 40) return; // keep trying
        clearInterval(qualityTimer); qualityTimer = null;
        return;
      }

      // Bridge has qualities available — tell it to set max
      clearInterval(qualityTimer); qualityTimer = null;
      document.dispatchEvent(new CustomEvent('pt-set-max-quality'));
    };

    // Poll until bridge is ready, then dispatch
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
      // Detect clicks on the play button, the video itself, or the video container
      const playBtn = e.target.closest('.ytp-play-button');
      const videoClick = e.target.closest('video, .html5-video-container');
      if (playBtn || videoClick) {
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

      let lastAutoResume = 0;
      let resumeTimeout = null;
      v.addEventListener('pause', () => {
        if (!settings.continuousPlay) return;
        if (continuousUserPaused) return;

        // Don't resume if video has ended
        if (v.ended || (v.duration && v.currentTime >= v.duration - 0.5)) return;

        // Don't resume if an ad is playing
        const p = getPlayer();
        if (p && (p.classList.contains('ad-showing') || p.classList.contains('ad-interrupting'))) return;

        // Don't resume if video is buffering (readyState < HAVE_FUTURE_DATA)
        if (v.readyState < 3) return;

        // Cooldown: don't auto-resume more than once every 5 seconds
        // This prevents play/pause loops where YouTube and our code fight
        const now = Date.now();
        if (now - lastAutoResume < 5000) return;

        // Clear any pending resume — only the latest pause event matters
        if (resumeTimeout) clearTimeout(resumeTimeout);

        // Long delay (2s) to distinguish YouTube-initiated pauses from user actions
        // Most user pauses happen intentionally; YouTube's "are you still watching"
        // pauses are the ones we want to override, and they can wait 2s
        resumeTimeout = setTimeout(() => {
          resumeTimeout = null;
          // Re-check all conditions after the delay
          if (v.paused && !v.ended && !continuousUserPaused && settings.continuousPlay) {
            // Re-check ad state
            const p2 = getPlayer();
            if (p2 && (p2.classList.contains('ad-showing') || p2.classList.contains('ad-interrupting'))) return;
            lastAutoResume = Date.now();
            v.play().catch(() => {});
            log('Continuous play: resumed YouTube-paused video', '#30d158');
          }
        }, 2000);
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

  // ==================== KEYBOARD SHORTCUTS ====================

  let speedIndicatorEl = null;
  let speedIndicatorTimer = null;
  let holdFastForward = false;
  let holdOriginalRate = 1;
  let shortcutKeydownHandler = null;
  let shortcutKeyupHandler = null;

  function isTyping() {
    const a = document.activeElement;
    if (!a) return false;
    return a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable
      || a.closest('[contenteditable="true"]');
  }

  function showSpeedIndicator(text) {
    const player = getPlayer();
    if (!player) return;

    if (!speedIndicatorEl) {
      speedIndicatorEl = document.createElement('div');
      speedIndicatorEl.id = 'pt-speed-indicator';
      player.appendChild(speedIndicatorEl);
    }

    speedIndicatorEl.textContent = text;
    speedIndicatorEl.classList.add('pt-speed-visible');

    clearTimeout(speedIndicatorTimer);
    speedIndicatorTimer = setTimeout(() => {
      if (speedIndicatorEl) speedIndicatorEl.classList.remove('pt-speed-visible');
    }, 800);
  }

  function cleanupSpeedIndicator() {
    clearTimeout(speedIndicatorTimer);
    if (speedIndicatorEl) { speedIndicatorEl.remove(); speedIndicatorEl = null; }
  }

  function setupKeyboardShortcuts() {
    if (shortcutKeydownHandler) return;

    shortcutKeydownHandler = (e) => {
      if (!settings.keyboardShortcuts) return;
      if (isTyping()) return;

      const v = getVid();
      if (!v) return;

      switch (e.key) {
        case ']': {
          e.preventDefault(); e.stopPropagation();
          v.playbackRate = Math.min(16, v.playbackRate + 0.25);
          showSpeedIndicator(v.playbackRate + 'x');
          break;
        }
        case '[': {
          e.preventDefault(); e.stopPropagation();
          v.playbackRate = Math.max(0.25, v.playbackRate - 0.25);
          showSpeedIndicator(v.playbackRate + 'x');
          break;
        }
        case 'Backspace': {
          e.preventDefault(); e.stopPropagation();
          v.playbackRate = 1;
          showSpeedIndicator('1x');
          break;
        }
        case ',': {
          if (v.paused) {
            e.preventDefault(); e.stopPropagation();
            v.currentTime = Math.max(0, v.currentTime - (1 / 30));
          }
          break;
        }
        case '.': {
          if (v.paused) {
            e.preventDefault(); e.stopPropagation();
            v.currentTime = Math.min(v.duration, v.currentTime + (1 / 30));
          }
          break;
        }
        case 'ArrowRight': {
          if (e.repeat && !holdFastForward) {
            holdFastForward = true;
            holdOriginalRate = v.playbackRate;
            v.playbackRate = 2;
            showSpeedIndicator('2x >>');
          }
          break;
        }
      }
    };

    shortcutKeyupHandler = (e) => {
      if (e.key === 'ArrowRight' && holdFastForward) {
        holdFastForward = false;
        const v = getVid();
        if (v) {
          v.playbackRate = holdOriginalRate;
          showSpeedIndicator(holdOriginalRate + 'x');
        }
      }
    };

    document.addEventListener('keydown', shortcutKeydownHandler);
    document.addEventListener('keyup', shortcutKeyupHandler);
    log('Keyboard shortcuts enabled', '#5ac8fa');
  }

  // ==================== AUTO QUALITY MONITOR ====================
  // Quality monitoring is handled by bridge.js in the MAIN world.
  // Content script just starts/stops it via custom events.

  function cleanupQualityMonitor() {
    document.dispatchEvent(new CustomEvent('pt-stop-quality-monitor'));
  }

  // ==================== AUDIO ENHANCEMENT ====================

  let audioCtx = null;
  let audioSourceNode = null;
  let audioConnectedVideo = null;
  let bassFilter = null;
  let compressor = null;

  function setupAudioEnhancement() {
    // Defer actual initialization until user gesture
    const initOnGesture = () => {
      document.removeEventListener('click', initOnGesture);
      document.removeEventListener('keydown', initOnGesture);
      initAudioContext();
    };
    document.addEventListener('click', initOnGesture);
    document.addEventListener('keydown', initOnGesture);
    log('Audio enhancement ready (waiting for user gesture)', '#5ac8fa');
  }

  function initAudioContext() {
    if (audioCtx) return;

    const v = getVid();
    if (!v) return;

    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();

      // Bass boost filter (lowshelf at 200Hz)
      bassFilter = audioCtx.createBiquadFilter();
      bassFilter.type = 'lowshelf';
      bassFilter.frequency.value = 200;
      bassFilter.gain.value = settings.bassBoost ? 6 : 0;

      // Dynamic range compressor
      compressor = audioCtx.createDynamicsCompressor();
      if (settings.audioNormalizer) {
        compressor.threshold.value = -24;
        compressor.ratio.value = 12;
        compressor.knee.value = 30;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.25;
      } else {
        compressor.threshold.value = 0;
        compressor.ratio.value = 1;
      }

      // Connect: source → bassFilter → compressor → destination
      audioSourceNode = audioCtx.createMediaElementSource(v);
      audioConnectedVideo = v;
      audioSourceNode.connect(bassFilter);
      bassFilter.connect(compressor);
      compressor.connect(audioCtx.destination);

      if (audioCtx.state === 'suspended') audioCtx.resume();

      log('Audio context initialized (bass: ' + (settings.bassBoost ? 'ON' : 'OFF') +
        ', normalizer: ' + (settings.audioNormalizer ? 'ON' : 'OFF') + ')', '#30d158');
    } catch (e) {
      log('Audio context error: ' + e.message, 'red');
    }
  }

  function updateAudioGraph() {
    if (!audioCtx || !bassFilter || !compressor) {
      // If context doesn't exist yet, try to create it
      if (settings.bassBoost || settings.audioNormalizer) {
        initAudioContext();
      }
      return;
    }

    // Reconnect if video element changed
    const v = getVid();
    if (v && v !== audioConnectedVideo) {
      try {
        audioSourceNode = audioCtx.createMediaElementSource(v);
        audioConnectedVideo = v;
        audioSourceNode.connect(bassFilter);
        log('Audio reconnected to new video element', '#5ac8fa');
      } catch (e) {
        log('Audio reconnect failed: ' + e.message, '#ff9f0a');
      }
    }

    // Update bass boost
    bassFilter.gain.value = settings.bassBoost ? 6 : 0;

    // Update normalizer
    if (settings.audioNormalizer) {
      compressor.threshold.value = -24;
      compressor.ratio.value = 12;
      compressor.knee.value = 30;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.25;
    } else {
      compressor.threshold.value = 0;
      compressor.ratio.value = 1;
    }

    log('Audio graph updated (bass: ' + (settings.bassBoost ? '+6dB' : '0dB') +
      ', normalizer: ' + (settings.audioNormalizer ? 'ON' : 'OFF') + ')', '#30d158');
  }

  // ==================== VIDEO STATS OVERLAY ====================

  let statsOverlayEl = null;
  let statsInterval = null;
  let statsVisible = false;
  let lastTotalFrames = 0;
  let lastFrameTime = 0;

  function setupVideoStats() {
    // Alt+S handled in keyboard shortcut system
    document.addEventListener('keydown', (e) => {
      if (e.altKey && e.key.toLowerCase() === 's' && settings.videoStats) {
        e.preventDefault();
        toggleStatsOverlay();
      }
    });
    log('Video stats ready (Alt+S to toggle)', '#5ac8fa');
  }

  function toggleStatsOverlay() {
    if (statsVisible) {
      removeStatsOverlay();
    } else {
      createStatsOverlay();
    }
  }

  function createStatsOverlay() {
    removeStatsOverlay();

    const player = getPlayer();
    if (!player) return;

    statsOverlayEl = document.createElement('div');
    statsOverlayEl.id = 'pt-stats-overlay';
    player.appendChild(statsOverlayEl);

    requestAnimationFrame(() => statsOverlayEl.classList.add('pt-stats-visible'));

    lastTotalFrames = 0;
    lastFrameTime = performance.now();

    statsInterval = setInterval(updateStats, 1000);
    updateStats();
    statsVisible = true;
    log('Stats overlay shown', '#5ac8fa');
  }

  function updateStats() {
    if (!statsOverlayEl) return;
    const v = getVid();
    if (!v) return;

    // bridge.js (MAIN world) writes YouTube API data to this DOM element
    const bridge = document.getElementById('pt-stats-bridge');

    // Resolution
    const res = `${v.videoWidth || '?'} x ${v.videoHeight || '?'}`;

    // Quality — read from bridge, fallback to video height
    let quality = bridge?.getAttribute('data-quality') || '';
    if (!quality || quality === 'unknown') {
      const h = v.videoHeight;
      if (h >= 2160) quality = '4K (2160p)';
      else if (h >= 1440) quality = '1440p';
      else if (h >= 1080) quality = '1080p';
      else if (h >= 720) quality = '720p';
      else if (h >= 480) quality = '480p';
      else if (h >= 360) quality = '360p';
      else if (h > 0) quality = h + 'p';
      else quality = 'N/A';
    }

    // FPS
    let fps = 'N/A';
    let dropped = 'N/A';
    try {
      const vq = v.getVideoPlaybackQuality?.();
      if (vq) {
        const now = performance.now();
        const elapsed = (now - lastFrameTime) / 1000;
        if (elapsed > 0 && lastTotalFrames > 0) {
          fps = Math.round((vq.totalVideoFrames - lastTotalFrames) / elapsed);
        }
        lastTotalFrames = vq.totalVideoFrames;
        lastFrameTime = now;
        dropped = vq.droppedVideoFrames;
      }
    } catch (e) {}

    // Buffer health
    let buffer = 'N/A';
    try {
      if (v.buffered.length > 0) {
        const buffEnd = v.buffered.end(v.buffered.length - 1);
        buffer = (buffEnd - v.currentTime).toFixed(1) + 's';
      }
    } catch (e) {}

    // Codec & Bitrate — read from bridge
    let codec = bridge?.getAttribute('data-codec') || 'N/A';
    let bitrate = 'N/A';
    const rawBitrate = bridge?.getAttribute('data-bitrate');
    if (rawBitrate) {
      const kbps = Math.round(parseInt(rawBitrate, 10) / 1000);
      bitrate = kbps >= 1000 ? (kbps / 1000).toFixed(1) + ' Mbps' : kbps + ' kbps';
    }

    const rate = v.playbackRate + 'x';

    statsOverlayEl.textContent =
      `Resolution : ${res}\n` +
      `Quality    : ${quality}\n` +
      `FPS        : ${fps}\n` +
      `Dropped    : ${dropped}\n` +
      `Buffer     : ${buffer}\n` +
      `Codec      : ${codec}\n` +
      `Speed      : ${rate}\n` +
      `Bitrate    : ${bitrate}`;
  }

  function removeStatsOverlay() {
    if (statsInterval) { clearInterval(statsInterval); statsInterval = null; }
    if (statsOverlayEl) {
      statsOverlayEl.classList.remove('pt-stats-visible');
      const el = statsOverlayEl;
      statsOverlayEl = null;
      setTimeout(() => el.remove(), 300);
    }
    statsVisible = false;
  }

  // ==================== CINEMATIC MODE (Ambient Lighting) ====================

  let cinematicCanvas = null;
  let cinematicCtx = null;
  let cinematicGlow = null;
  let cinematicInterval = null;
  let cinematicCorsPaused = false;

  function setupCinematicMode() {
    if (settings.cinematicMode) {
      setTimeout(() => { if (settings.cinematicMode) startCinematic(); }, 2000);
    }
  }

  function startCinematic() {
    stopCinematic();

    const v = getVid();
    const player = getPlayer();
    if (!v || !player) return;

    // Sampling canvas — 32x18 for better color accuracy than 16x9
    cinematicCanvas = document.createElement('canvas');
    cinematicCanvas.width = 32;
    cinematicCanvas.height = 18;
    cinematicCanvas.style.display = 'none';
    cinematicCtx = cinematicCanvas.getContext('2d', { willReadFrequently: true });

    // Glow element — insert inside the player (already position:relative)
    // so we don't need to modify any parent elements
    cinematicGlow = document.createElement('div');
    cinematicGlow.id = 'pt-ambient-glow';
    player.appendChild(cinematicGlow);

    cinematicCorsPaused = false;

    // Use setInterval at the actual sample rate instead of RAF at 60fps
    cinematicInterval = setInterval(() => {
      if (!settings.cinematicMode) { stopCinematic(); return; }

      const vid = getVid();
      if (!vid || vid.paused || vid.readyState < 2) return;

      // Skip during ads — ad video is cross-origin and taints the canvas
      if (isAdPlaying()) {
        cinematicCorsPaused = true;
        if (cinematicGlow) cinematicGlow.style.opacity = '0';
        return;
      }

      // After ad ends, reset the canvas to clear tainted state
      if (cinematicCorsPaused) {
        cinematicCorsPaused = false;
        cinematicCanvas.width = 32; // resets canvas state, clears taint
        cinematicCtx = cinematicCanvas.getContext('2d', { willReadFrequently: true });
        if (cinematicGlow) cinematicGlow.style.opacity = '';
      }

      try {
        cinematicCtx.drawImage(vid, 0, 0, 32, 18);
        const data = cinematicCtx.getImageData(0, 0, 32, 18).data;

        // Sample edges (2-pixel deep strips on each side)
        const top = sampleEdge(data, 32, 0, 0, 32, 2);
        const bottom = sampleEdge(data, 32, 0, 16, 32, 18);
        const left = sampleEdge(data, 32, 0, 0, 3, 18);
        const right = sampleEdge(data, 32, 29, 0, 32, 18);

        if (cinematicGlow) {
          cinematicGlow.style.boxShadow =
            `0 -40px 70px 40px rgba(${top.r},${top.g},${top.b},0.65), ` +
            `0 40px 70px 40px rgba(${bottom.r},${bottom.g},${bottom.b},0.65), ` +
            `-40px 0 70px 40px rgba(${left.r},${left.g},${left.b},0.55), ` +
            `40px 0 70px 40px rgba(${right.r},${right.g},${right.b},0.55)`;
        }
      } catch (e) {
        // CORS — pause sampling, don't permanently kill it
        cinematicCorsPaused = true;
        if (cinematicGlow) cinematicGlow.style.opacity = '0';
        log('Cinematic: CORS hit, pausing until next content video', '#ff9f0a');
      }
    }, 200); // 5fps — exactly the rate we need

    log('Cinematic mode started', '#bf5af2');
  }

  function sampleEdge(data, imgWidth, x1, y1, x2, y2) {
    let r = 0, g = 0, b = 0, count = 0;
    for (let y = y1; y < y2; y++) {
      for (let x = x1; x < x2; x++) {
        const i = (y * imgWidth + x) * 4;
        r += data[i]; g += data[i + 1]; b += data[i + 2];
        count++;
      }
    }
    if (count === 0) return { r: 0, g: 0, b: 0 };
    return { r: Math.round(r / count), g: Math.round(g / count), b: Math.round(b / count) };
  }

  function stopCinematic() {
    if (cinematicInterval) { clearInterval(cinematicInterval); cinematicInterval = null; }
    if (cinematicGlow) { cinematicGlow.remove(); cinematicGlow = null; }
    if (cinematicCanvas) { cinematicCanvas.remove(); cinematicCanvas = null; }
    cinematicCtx = null;
    cinematicCorsPaused = false;
  }

  // ==================== VIDEO SHARPENING (CSS/SVG Filter) ====================
  // Uses an SVG feConvolveMatrix filter applied via CSS — no canvas, no WebGL,
  // no hiding the video. GPU-accelerated by the browser automatically.

  let sharpeningStyleEl = null;
  let sharpeningSvgEl = null;

  function setupVideoSharpening() {
    if (settings.videoSharpening) {
      setTimeout(() => { if (settings.videoSharpening) startSharpening(); }, 2000);
    }
  }

  function startSharpening() {
    stopSharpening();

    const v = getVid();
    if (!v) return;

    const rawStrength = settings.sharpeningStrength || 0.5;

    // Quadratic curve: gentle at low values, stronger at high
    // 0.0 → 0.0, 0.25 → 0.03, 0.5 → 0.13, 0.75 → 0.28, 1.0 → 0.5
    const strength = rawStrength * rawStrength * 0.5;

    // Unsharp mask kernel: center = 1 + 4*s, edges = -s
    const center = (1 + 4 * strength).toFixed(3);
    const edge = (-strength).toFixed(3);

    sharpeningSvgEl = document.createElement('div');
    sharpeningSvgEl.id = 'pt-sharpen-svg';
    sharpeningSvgEl.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
    sharpeningSvgEl.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg">
        <filter id="pt-sharpen-filter" color-interpolation-filters="sRGB">
          <feConvolveMatrix order="3" preserveAlpha="true"
            kernelMatrix="0 ${edge} 0 ${edge} ${center} ${edge} 0 ${edge} 0" />
        </filter>
      </svg>`;
    document.body.appendChild(sharpeningSvgEl);

    // Apply CSS filter to the video element
    sharpeningStyleEl = document.createElement('style');
    sharpeningStyleEl.id = 'pt-sharpen-style';
    sharpeningStyleEl.textContent = `
      video.html5-main-video,
      #movie_player video {
        filter: url(#pt-sharpen-filter) !important;
      }
    `;
    document.head.appendChild(sharpeningStyleEl);

    log('Video sharpening started (strength: ' + strength + ')', '#30d158');
  }

  function updateSharpeningStrength() {
    if (!sharpeningSvgEl) return;
    // Rebuild the filter with new strength
    if (settings.videoSharpening) {
      startSharpening(); // restarts with new strength
    }
  }

  function stopSharpening() {
    if (sharpeningStyleEl) { sharpeningStyleEl.remove(); sharpeningStyleEl = null; }
    if (sharpeningSvgEl) { sharpeningSvgEl.remove(); sharpeningSvgEl = null; }
  }

  // ==================== START ====================

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
