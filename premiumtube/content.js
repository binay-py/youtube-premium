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
  let posTimer = null;
  let keyHandler = null;

  // Local detection state
  let localDetectionTimers = [];
  let endScreenDetected = false;

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
      'quick intro', 'opening'
    ],
    outro: [
      'outro', 'ending', 'credits', 'closing',
      'wrap up', 'wrap-up', 'end screen', 'endscreen',
      'final thoughts', 'end card'
    ],
    sponsor: [
      'sponsor', 'sponsored', 'advertisement', 'paid promotion',
      "today's sponsor", 'ad break', 'ad read'
    ],
    selfpromo: [
      'merch', 'merchandise', 'self promo', 'self-promo', 'selfpromo',
      'channel plug', 'shameless plug'
    ],
    interaction: [
      'subscribe', 'like button', 'notification bell', 'leave a comment',
      'hit the bell', 'smash the like'
    ],
    preview: [
      'preview', 'recap', 'previously on', 'last time', 'quick recap'
    ]
  };

  // Stricter keywords for caption/transcript scanning — only multi-word phrases
  // that are unambiguous signals (won't match in normal speech)
  const CAPTION_KEYWORDS = {
    intro: [
      'welcome back to', 'welcome to the channel', 'welcome to my channel',
      'hello and welcome', 'in this video we', "in today's video",
      "let's get into it", "let's dive in", "let's jump into",
      'before we get started', 'before we begin', 'thanks for tuning in',
      'thanks for clicking'
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
      'signing off', 'have a great day'
    ],
    sponsor: [
      'this video is sponsored', 'this video is brought to you',
      'brought to you by', "today's sponsor is", 'a word from our sponsor',
      'use code', 'use my code', 'use my link', 'discount code',
      'promo code', 'special offer', 'link in the description',
      'first 100 people', 'first 1000 people', 'first 500 people',
      'sign up for free', 'free trial',
      // Known sponsor brands (unambiguous)
      'nordvpn', 'squarespace', 'skillshare', 'audible', 'raid shadow legends',
      'surfshark', 'expressvpn', 'manscaped', 'dashlane',
      'curiositystream', 'dollar shave club', 'betterhelp', 'hellofresh',
      'hello fresh', 'ridge wallet', 'raycon', 'established titles',
      'private internet access', 'incogni', 'athletic greens',
      'magic spoon', 'bespoke post', 'casetify', 'opera gx'
    ],
    selfpromo: [
      'check out my', 'my other channel', 'second channel',
      'join my discord', 'become a member', 'join the membership',
      'channel membership', 'support the channel', 'link in bio',
      'check out my merch', 'my merch store', 'buy me a coffee',
      'follow me on', 'sign up for my', 'my online course',
      'listen to my podcast'
    ],
    interaction: [
      'smash that like', 'hit the like', 'drop a like', 'leave a like',
      'smash that subscribe', 'hit the subscribe', 'click subscribe',
      'hit the notification', 'ring the notification', 'turn on notifications',
      'comment down below', 'leave a comment below', 'let me know in the comments',
      'share this video', 'share with your friends'
    ]
  };

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
    setupVideoEnhancement();
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
      pipEnabled: true, pipAutoSwitch: false,
      backgroundPlay: true, showToasts: true, autoMaxQuality: true, isPremium: false,
      preferAV1: true, disableAmbient: true, videoSharpening: true
    };
  }

  chrome.storage.onChanged.addListener((c) => {
    for (const [k, { newValue }] of Object.entries(c)) settings[k] = newValue;
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
    removeSeekbarMarkers();
    cleanupLocalDetection();
    currentVideoId = id;
    skipSegments = [];

    log(`Video: ${id}`, '#5ac8fa');

    // Fetch directly from SponsorBlock (CORS allowed)
    await fetchDirect(id);

    // Run local detection methods (SponsorBlock has priority)
    detectFromChapters();
    detectFromDescription();
    detectFromCaptions();       // Method 4: caption transcript scanning
    detectHeuristicFallback();  // Method 5: last-resort heuristic (only if 0 segments after 8s)
    // End screen detection runs during check() polling

    startPoll();
    if (skipSegments.length) addSeekbarMarkers();
    applyPremium();
    applyMaxQuality();
  }

  // ==================== AD BLOCKER ====================

  let adHandlerActive = false; // guard against concurrent handlers

  function isAdPlaying() {
    const player = getPlayer();
    if (!player) return false;
    return player.classList.contains('ad-showing')
      || player.classList.contains('ad-interrupting')
      || !!document.querySelector('.ytp-ad-player-overlay, .ytp-ad-player-overlay-layout')
      || !!document.querySelector('.ytp-ad-action-interstitial');
  }

  function setupAdBlocker() {
    if (settings.adSkip === false) return;

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
      }

      // Remove overlay ads
      document.querySelectorAll(
        '.ytp-ad-overlay-container, .ytp-ad-overlay-close-button, ' +
        '.ytp-ad-text-overlay, .ytp-ad-image-overlay'
      ).forEach(el => {
        const closeBtn = el.querySelector('.ytp-ad-overlay-close-button, button[class*="close"]') || el;
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
    const enforcementDialog = document.querySelector(
      'tp-yt-paper-dialog:has(ytd-enforcement-message-view-model), ' +
      'ytd-popup-container tp-yt-paper-dialog:has([target-id="enforcement-message"])'
    );
    if (enforcementDialog) {
      const dismissBtn = enforcementDialog.querySelector(
        'button, .yt-spec-button-shape-next, [aria-label="Close"], #dismiss-button'
      );
      if (dismissBtn) {
        dismissBtn.click();
        log('Dismissed anti-adblock popup', '#ff9f0a');
      }
      enforcementDialog.remove();
    }

    // Generic "allow ads" dialog
    const allowAdsPopup = document.querySelector(
      'ytd-popup-container tp-yt-paper-dialog:has(yt-ad-blocker-message-renderer)'
    );
    if (allowAdsPopup) {
      allowAdsPopup.remove();
      log('Removed ad-blocker message overlay', '#ff9f0a');
    }
  }


  function handleVideoAd() {
    if (adHandlerActive) return; // prevent concurrent handlers
    adHandlerActive = true;

    const v = getVid();
    if (!v) { adHandlerActive = false; return; }

    log('Ad detected! Attempting to skip...', '#ff9f0a');

    // Mute immediately so user doesn't hear the ad
    v.muted = true;

    // Try clicking skip button immediately
    if (tryClickSkip()) { adHandlerActive = false; return; }

    // Keep trying every 250ms
    let attempts = 0;
    const skipInterval = setInterval(() => {
      attempts++;

      if (!isAdPlaying()) {
        clearInterval(skipInterval);
        adHandlerActive = false;
        // Restore normal playback
        v.muted = false;
        v.playbackRate = 1;
        log('Ad ended', '#30d158');
        return;
      }

      if (tryClickSkip()) {
        clearInterval(skipInterval);
        adHandlerActive = false;
        v.muted = false;
        v.playbackRate = 1;
        return;
      }

      // Unskippable ad — multiple strategies to force it to end:
      // Strategy 1: Seek to end
      if (v.duration && isFinite(v.duration) && v.duration > 0.5) {
        v.currentTime = v.duration - 0.1;
      }

      // Strategy 2: Speed up as much as YouTube allows
      try { v.playbackRate = 16; } catch (e) {}

      // Strategy 3: If ad is very short or seeked to end, try to
      // dispatch an 'ended' event to force transition
      if (v.currentTime >= v.duration - 0.5 && v.duration > 0) {
        v.dispatchEvent(new Event('ended'));
      }

      // Safety: give up after 60s (240 attempts at 250ms)
      if (attempts > 240) {
        clearInterval(skipInterval);
        adHandlerActive = false;
        v.muted = false;
        v.playbackRate = 1;
        log('Ad handler timeout — gave up', '#ff9f0a');
      }
    }, 250);
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
      '.ytp-ad-player-overlay button[class*="skip"]',
      'button.ytp-ad-overlay-close-button',
      '.ytp-ad-action-interstitial-close-button',
      // Newer YouTube ad skip patterns
      '.ytp-ad-skip-button-modern-with-label',
      'ytd-button-renderer#skip-button button',
      '.ytp-ad-button-icon',
      'button[data-tooltip-target-id="skip-button"]'
    ];

    for (const sel of skipSelectors) {
      const btn = document.querySelector(sel);
      if (btn) {
        // Click even if not "visible" — YouTube sometimes hides skip buttons
        // behind overlays but they're still clickable
        btn.click();
        // Also try dispatching events directly
        btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        log('Clicked skip button: ' + sel, '#30d158');
        return true;
      }
    }

    // Also try finding skip text and clicking parent
    const allButtons = document.querySelectorAll('.ytp-ad-player-overlay button, .ytp-ad-module button');
    for (const btn of allButtons) {
      const txt = (btn.textContent || '').toLowerCase();
      if (txt.includes('skip') || txt.includes('close')) {
        btn.click();
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

  function detectFromChapters() {
    let attempts = 0;
    const maxAttempts = 30; // 15s at 500ms intervals

    const tryDetect = () => {
      // Try DOM selectors (expanded)
      const chapterElements = document.querySelectorAll(
        'ytd-macro-markers-list-item-renderer, ' +
        'ytd-chapter-renderer, ' +
        'ytd-engagement-panel-section-list-renderer[target-id*="chapters"] ytd-macro-markers-list-item-renderer'
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

      const newSegments = [];
      for (let i = 0; i < chapters.length; i++) {
        const ch = chapters[i];
        const end = (i < chapters.length - 1) ? chapters[i + 1].start : v.duration;
        const category = matchCategory(ch.title);

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
        log(`Chapters detection: found ${newSegments.length} segments`, '#5ac8fa');
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
        'ytd-expander #content, ' +
        '#meta-contents ytd-expander, ' +
        '#description .content, ' +
        '#attributed-snippet-text, ' +
        'ytd-watch-metadata #description, ' +
        'yt-attributed-string'
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

      const newSegments = [];
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const end = (i < entries.length - 1) ? entries[i + 1].start : v.duration;
        const category = matchCategory(entry.label);

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
        log(`Description detection: found ${newSegments.length} segments`, '#5ac8fa');
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

  // --- Method 3: End Screen Detection ---

  function detectEndScreen() {
    if (endScreenDetected) return;

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
        if (++captionRetries < 3) {
          const timerId = setTimeout(() => detectFromCaptions(), 3000);
          localDetectionTimers.push(timerId);
        }
        return;
      }

      try {
        // Extract caption track URL from ytInitialPlayerResponse in page source
        let captionUrl = null;
        const scripts = document.querySelectorAll('script');
        for (const script of scripts) {
          const text = script.textContent;
          if (!text.includes('ytInitialPlayerResponse')) continue;
          const match = text.match(/ytInitialPlayerResponse\s*=\s*({.+?});/s);
          if (!match) continue;
          const playerData = JSON.parse(match[1]);
          const tracks = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
          if (!tracks || !tracks.length) break;

          // Prefer English, fall back to first available
          const enTrack = tracks.find(t =>
            t.languageCode === 'en' || t.languageCode?.startsWith('en')
          ) || tracks[0];

          if (enTrack?.baseUrl) {
            captionUrl = enTrack.baseUrl;
          }
          break;
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

        for (const cap of captions) {
          for (const [category, keywords] of Object.entries(CAPTION_KEYWORDS)) {
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

  // --- Method 5: Heuristic Fallback Detection ---

  function detectHeuristicFallback() {
    const tryDetect = () => {
      const v = getVid();
      if (!v || !v.duration || v.duration === Infinity) return;

      // Only for videos > 45 seconds
      if (v.duration < 45) {
        log('Heuristic fallback: skipped (video < 45s)', '#aaa');
        return;
      }

      // Check per-category — add heuristics for missing categories only
      const hasIntro = skipSegments.some(s => s.category === 'intro');
      const hasOutro = skipSegments.some(s => s.category === 'outro');

      if (hasIntro && hasOutro) {
        log('Heuristic fallback: skipped (intro + outro already found)', '#aaa');
        return;
      }

      const dur = v.duration;
      const newSegments = [];

      // Intro estimate — proportional to video length
      if (!hasIntro) {
        let introEnd;
        if (dur < 120) introEnd = Math.min(10, dur * 0.08);       // < 2 min: ~10s
        else if (dur < 300) introEnd = Math.min(20, dur * 0.06);  // 2-5 min: ~20s
        else if (dur < 900) introEnd = Math.min(35, dur * 0.05);  // 5-15 min: ~35s
        else introEnd = Math.min(50, dur * 0.04);                 // 15+ min: ~50s

        if (introEnd >= 5 && !hasOverlap(0, introEnd)) {
          newSegments.push({
            start: 0,
            end: introEnd,
            category: 'intro',
            source: 'heuristic'
          });
        }
      }

      // Outro estimate — proportional to video length
      if (!hasOutro) {
        let outroLen;
        if (dur < 120) outroLen = Math.min(8, dur * 0.08);        // < 2 min: ~8s
        else if (dur < 300) outroLen = Math.min(15, dur * 0.05);  // 2-5 min: ~15s
        else if (dur < 900) outroLen = Math.min(25, dur * 0.04);  // 5-15 min: ~25s
        else outroLen = Math.min(35, dur * 0.03);                 // 15+ min: ~35s

        const outroStart = dur - outroLen;
        if (outroLen >= 5 && !hasOverlap(outroStart, dur)) {
          newSegments.push({
            start: outroStart,
            end: dur,
            category: 'outro',
            source: 'heuristic'
          });
        }
      }

      if (newSegments.length) {
        mergeSegments(newSegments);
        log(`Heuristic fallback: added ${newSegments.length} segments (estimated)`, '#ff9f0a');
        newSegments.forEach(s => {
          log(`  [heuristic] ${s.category}: ${fmtTime(s.start)} -> ${fmtTime(s.end)}`, '#ff9f0a');
        });
      }
    };

    // Run after other methods have had time (5s delay)
    const timerId = setTimeout(tryDetect, 5000);
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

  function matchCategory(text) {
    if (!text) return null;
    const lower = text.toLowerCase();

    for (const [category, keywords] of Object.entries(SEGMENT_KEYWORDS)) {
      for (const kw of keywords) {
        if (lower.includes(kw)) return category;
      }
    }
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

    try {
      const res = await fetch(url);
      log('API response: ' + res.status);

      if (res.status === 404) {
        log('No segments exist for this video');
        skipSegments = [];
        return;
      }

      if (!res.ok) {
        log('API error: ' + res.status, 'red');
        skipSegments = [];
        return;
      }

      const data = await res.json();
      skipSegments = data.map(d => ({
        start: d.segment[0],
        end: d.segment[1],
        category: d.category,
        source: 'sponsorblock'
      }));

      log(`Loaded ${skipSegments.length} segments:`, '#30d158');
      skipSegments.forEach(s => {
        log(`  ${s.category}: ${fmtTime(s.start)} -> ${fmtTime(s.end)} (${(s.end - s.start).toFixed(0)}s)`);
      });

    } catch (err) {
      log('Fetch failed: ' + err.message, 'red');

      // Fallback: try via background script
      log('Trying background fallback...');
      try {
        const resp = await chrome.runtime.sendMessage({ type: 'FETCH_SEGMENTS', videoId });
        if (resp?.success && resp.segments?.length) {
          skipSegments = resp.segments.map(s => ({ ...s, source: 'sponsorblock' }));
          log(`Fallback: loaded ${skipSegments.length} segments`, '#30d158');
        } else {
          skipSegments = [];
          log('Fallback: no segments');
        }
      } catch (e2) {
        log('Fallback also failed: ' + e2.message, 'red');
        skipSegments = [];
      }
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

  function check() {
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
      if (t >= seg.start && t < seg.end - 0.3) {
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
      showBtn(hit);
    } else if (activeBtn) {
      removeBtn();
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
        <svg id="pt-skip-icon" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
        <span id="pt-skip-title">Skip ${label}</span>
        <span id="pt-skip-time">${remaining}s</span>
        <kbd id="pt-skip-kbd">Enter</kbd>
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

    document.body.appendChild(el);
    activeBtn = el;

    // Position over the player
    posBtn();
    posTimer = setInterval(posBtn, 150);
    window.addEventListener('resize', posBtn);
    document.addEventListener('fullscreenchange', posBtn);

    // Animate in
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('pt-visible')));

    // Progress bar + live countdown
    const prog = el.querySelector('#pt-skip-progress');
    const timeEl = el.querySelector('#pt-skip-time');
    const tick = () => {
      if (!activeBtn || activeSeg !== seg) return;
      const vid = getVid();
      if (vid) {
        const pct = ((vid.currentTime - seg.start) / (seg.end - seg.start)) * 100;
        prog.style.width = Math.min(100, Math.max(0, pct)) + '%';
        const rem = Math.max(0, Math.round(seg.end - vid.currentTime));
        timeEl.textContent = rem + 's';
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    log(`BUTTON SHOWN: "Skip ${label}" [${seg.source || 'unknown'}]`, '#ff2d55');
  }

  function posBtn() {
    if (!activeBtn) return;
    const p = getPlayer();
    if (!p) return;
    const r = p.getBoundingClientRect();

    activeBtn.style.position = 'fixed';
    activeBtn.style.bottom = (window.innerHeight - r.bottom + 80) + 'px';
    activeBtn.style.right = (window.innerWidth - r.right + 16) + 'px';
  }

  function doSkip(seg) {
    const v = getVid();
    if (!v) return;
    const saved = Math.max(0, Math.round(seg.end - v.currentTime));
    log(`SKIPPED: ${seg.category} [${seg.source || 'unknown'}] ${fmtTime(v.currentTime)} -> ${fmtTime(seg.end)} (saved ${saved}s)`, '#30d158');

    v.currentTime = seg.end;
    removeBtn();
    trackStat(saved);
    if (settings.showToasts) {
      showToast(`Skipped ${LABELS[seg.category] || seg.category} · saved ${saved}s`);
    }
  }

  function removeBtn() {
    if (posTimer) { clearInterval(posTimer); posTimer = null; }
    window.removeEventListener('resize', posBtn);
    document.removeEventListener('fullscreenchange', posBtn);
    if (keyHandler) {
      document.removeEventListener('keydown', keyHandler);
      keyHandler = null;
    }
    if (activeBtn) {
      activeBtn.classList.remove('pt-visible');
      const e = activeBtn;
      setTimeout(() => e.remove(), 300);
      activeBtn = null;
      activeSeg = null;
    }
    document.querySelectorAll('#pt-skip-button').forEach(e => e.remove());
  }

  // ==================== SEEKBAR MARKERS ====================

  function addSeekbarMarkers() {
    removeSeekbarMarkers();

    const v = getVid();
    if (!v || !skipSegments.length) return;

    let attempts = 0;
    const tryAdd = () => {
      const bar = document.querySelector('.ytp-progress-bar');
      if (!bar || !v.duration || v.duration === Infinity) {
        if (++attempts < 20) setTimeout(tryAdd, 500);
        return;
      }

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

      log(`Added ${skipSegments.length} seekbar markers`, '#5ac8fa');
    };

    tryAdd();
  }

  function removeSeekbarMarkers() {
    document.querySelectorAll('.pt-seekbar-marker').forEach(e => e.remove());
  }

  // ==================== NAV ====================

  function setupNav() {
    const h = () => {
      const id = getVidId();
      if (id && id !== currentVideoId) {
        currentVideoId = null; skipSegments = []; stop(); removeBtn(); removeSeekbarMarkers(); cleanupLocalDetection(); attach();
      } else if (!id) {
        currentVideoId = null; skipSegments = []; stop(); removeBtn(); removeSeekbarMarkers(); cleanupLocalDetection();
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

  function setupPiP() {
    document.addEventListener('keydown', (e) => {
      if (e.altKey && e.key.toLowerCase() === 'p' && settings.pipEnabled) {
        e.preventDefault();
        const v = getVid();
        if (!v) return;
        if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {});
        else v.requestPictureInPicture().catch(() => {});
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (!settings.pipEnabled || !settings.pipAutoSwitch) return;
      const v = getVid();
      if (v && !v.paused && document.hidden && !document.pictureInPictureElement) {
        v.requestPictureInPicture().catch(() => {});
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

    // Try immediately, then every 500ms
    trySet();
    qualityTimer = setInterval(trySet, 500);
  }

  // ==================== VIDEO ENHANCEMENT ====================

  function setupVideoEnhancement() {
    if (settings.disableAmbient !== false) disableAmbientMode();
    if (settings.videoSharpening !== false) applySharpening();
    if (settings.preferAV1 !== false) forceAV1Codec();
  }

  // --- Disable Ambient Mode / HDR dimming ---

  function disableAmbientMode() {
    if (document.getElementById('pt-ambient-disable-css')) return;
    const style = document.createElement('style');
    style.id = 'pt-ambient-disable-css';
    style.textContent = `
      #cinematics,
      #cinematics-container,
      .ytd-cinematic-container-renderer,
      #cinematics canvas,
      #cinematics .ytd-cinematic-container-renderer {
        display: none !important;
      }
      /* Disable HDR tone-mapping dimming */
      video.html5-main-video {
        --ytd-cinema-bg: transparent !important;
      }
    `;
    document.head.appendChild(style);
    log('Ambient mode disabled', '#5ac8fa');
  }

  // --- CSS Sharpening Filter ---

  function applySharpening() {
    if (document.getElementById('pt-sharpen-svg')) return;

    // SVG convolution filter for subtle sharpening
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('id', 'pt-sharpen-svg');
    svg.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none';
    svg.innerHTML = `
      <defs>
        <filter id="pt-sharpen" color-interpolation-filters="sRGB">
          <feConvolveMatrix order="3"
            kernelMatrix="0 -0.3 0 -0.3 2.2 -0.3 0 -0.3 0"
            preserveAlpha="true"/>
        </filter>
      </defs>
    `;
    document.body.appendChild(svg);

    const style = document.createElement('style');
    style.id = 'pt-sharpen-css';
    style.textContent = `
      video.html5-main-video,
      #movie_player video {
        filter: url(#pt-sharpen) contrast(1.03) saturate(1.05) !important;
      }
    `;
    document.head.appendChild(style);
    log('Video sharpening enabled', '#5ac8fa');
  }

  // --- Force AV1 Codec ---

  function forceAV1Codec() {
    // AV1 preference is set via page-inject.js (MAIN world script)
    // Here we just try the player API from the content script side
    let attempts = 0;
    const tryForce = () => {
      const player = document.querySelector('#movie_player');
      if (player) {
        try {
          if (typeof player.setOption === 'function') {
            player.setOption('player', 'preferAv1', true);
          }
        } catch (e) {}
      }
      if (++attempts < 10) setTimeout(tryForce, 2000);
    };
    setTimeout(tryForce, 3000);
    log('AV1 codec preference set', '#5ac8fa');
  }

  // ==================== PREMIUM ====================

  let shortsObserver = null;

  function applyPremium() {
    if (!settings.isPremium) return;
    if (settings.theaterDefault) {
      setTimeout(() => {
        const b = document.querySelector('button.ytp-size-button');
        if (b && !document.querySelector('ytd-watch-flexy[theater]')) b.click();
      }, 1500);
    }
    if (settings.removeShorts && !shortsObserver) {
      const rm = () => ['ytd-rich-shelf-renderer[is-shorts]','ytd-reel-shelf-renderer','[is-shorts]',
        'ytd-mini-guide-entry-renderer[aria-label="Shorts"]'].forEach(s =>
          document.querySelectorAll(s).forEach(e => e.style.display = 'none'));
      rm();
      shortsObserver = new MutationObserver(rm);
      shortsObserver.observe(document.body, { childList: true, subtree: true });
    }
  }

  // ==================== TOAST ====================

  function showToast(msg) {
    document.getElementById('premiumtube-toast')?.remove();
    const t = document.createElement('div');
    t.id = 'premiumtube-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    t.offsetHeight;
    t.classList.add('pt-toast-show');
    setTimeout(() => {
      t.classList.remove('pt-toast-show');
      t.classList.add('pt-toast-hide');
      setTimeout(() => t.remove(), 300);
    }, 2000);
  }

  // ==================== START ====================

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
