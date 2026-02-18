// PremiumTube - Content Script
// Skip button appears when inside a segment. User clicks to skip.

(function () {
  'use strict';

  const API = 'https://sponsor.ajay.app/api/skipSegments';
  const CATEGORIES = '["intro","outro","sponsor","selfpromo"]';

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
    selfpromo: 'Self-promo'
  };

  const KEYS = {
    intro: 'skipIntro', outro: 'skipOutro', sponsor: 'skipSponsor',
    selfpromo: 'skipSelfpromo'
  };

  // Keyword lists for local segment detection
  const SEGMENT_KEYWORDS = {
    intro: ['intro', 'introduction', 'opening', 'start'],
    outro: ['outro', 'end', 'ending', 'credits', 'bye', 'goodbye', 'closing', 'wrap up', 'wrap-up', 'wrapup', 'end screen', 'endscreen'],
    sponsor: ['sponsor', 'sponsored', 'ad', 'advertisement', 'paid promotion', 'today\'s sponsor', 'this video is sponsored'],
    selfpromo: ['merch', 'merchandise', 'subscribe', 'like and subscribe', 'self promo', 'self-promo', 'selfpromo', 'check out my', 'my website', 'patreon', 'social media', 'follow me']
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
      skipSelfpromo: true, adSkip: true,
      pipEnabled: true, pipAutoSwitch: false,
      backgroundPlay: true, showToasts: true, isPremium: false
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
    // End screen detection runs during check() polling

    if (skipSegments.length) {
      startPoll();
      addSeekbarMarkers();
    } else {
      // Start polling anyway for end screen detection and local detection results
      startPoll();
    }
    applyPremium();
  }

  // ==================== AD BLOCKER ====================

  function setupAdBlocker() {
    if (settings.adSkip === false) return;

    log('Ad blocker enabled', '#30d158');

    // CSS injection to hide ad containers
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
      .ytp-ad-message-container {
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
        if (!settings.adSkip && settings.adSkip !== undefined) return;
        if (player.classList.contains('ad-showing')) {
          handleVideoAd();
        }
      });

      adObserver.observe(player, {
        attributes: true,
        attributeFilter: ['class']
      });

      log('Ad observer attached to player', '#5ac8fa');
    };
    observePlayer();

    // Polling fallback - check every 1s for ad elements
    setInterval(() => {
      if (settings.adSkip === false) return;
      const player = getPlayer();
      if (player && player.classList.contains('ad-showing')) {
        handleVideoAd();
      }
      // Remove overlay ads
      document.querySelectorAll('.ytp-ad-overlay-container, .ytp-ad-overlay-close-button').forEach(el => {
        const closeBtn = el.querySelector('.ytp-ad-overlay-close-button') || el;
        if (closeBtn && closeBtn.tagName === 'BUTTON') closeBtn.click();
        el.style.display = 'none';
      });
    }, 1000);
  }

  function handleVideoAd() {
    const v = getVid();
    if (!v) return;

    log('Ad detected! Attempting to skip...', '#ff9f0a');

    // Try clicking skip button immediately
    tryClickSkip();

    // Keep trying every 300ms
    const skipInterval = setInterval(() => {
      const player = getPlayer();
      if (!player || !player.classList.contains('ad-showing')) {
        clearInterval(skipInterval);
        // Restore normal playback
        v.muted = false;
        v.playbackRate = 1;
        log('Ad ended', '#30d158');
        return;
      }

      if (tryClickSkip()) {
        clearInterval(skipInterval);
        return;
      }

      // Unskippable ad: mute, speed up, seek to end
      v.muted = true;
      if (v.playbackRate < 16) v.playbackRate = 16;
      if (v.duration && isFinite(v.duration) && v.duration > 0) {
        v.currentTime = v.duration;
      }
    }, 300);

    // Safety: clear interval after 30s max
    setTimeout(() => clearInterval(skipInterval), 30000);
  }

  function tryClickSkip() {
    const skipSelectors = [
      '.ytp-skip-ad-button',
      '.ytp-ad-skip-button',
      '.ytp-ad-skip-button-modern',
      '.ytp-ad-skip-button-container button',
      'button.ytp-ad-skip-button',
      '.videoAdUiSkipButton',
      '[id^="skip-button"]'
    ];

    for (const sel of skipSelectors) {
      const btn = document.querySelector(sel);
      if (btn && btn.offsetParent !== null) {
        btn.click();
        log('Clicked skip button: ' + sel, '#30d158');
        return true;
      }
    }
    return false;
  }

  // ==================== LOCAL SEGMENT DETECTION ====================

  // --- Method 1: YouTube Chapters Parsing ---

  function detectFromChapters() {
    let attempts = 0;
    const maxAttempts = 30; // 15s at 500ms intervals

    const tryDetect = () => {
      const chapterElements = document.querySelectorAll(
        'ytd-macro-markers-list-item-renderer, ytd-chapter-renderer'
      );

      if (!chapterElements.length) {
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
      chapterElements.forEach(el => {
        const titleEl = el.querySelector('#details h4, #chapter-title, .macro-markers');
        const timeEl = el.querySelector('#time, .timestamp, #details .macro-markers-list-item-renderer-time');

        let title = '';
        if (titleEl) title = titleEl.textContent.trim().toLowerCase();
        else title = el.textContent.trim().toLowerCase();

        let timeStr = '';
        if (timeEl) timeStr = timeEl.textContent.trim();

        const seconds = parseTimestamp(timeStr);
        if (seconds !== null) {
          chapters.push({ title, start: seconds });
        }
      });

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
        '#description .content'
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

      // Parse timestamps like "0:00 Intro", "2:30 - Sponsor", "12:45 Self-promo"
      const timestampPattern = /(\d{1,2}:\d{2}(?::\d{2})?)\s*[-–—]?\s*(.+)/;
      const entries = [];

      for (const line of lines) {
        const match = line.trim().match(timestampPattern);
        if (match) {
          const seconds = parseTimestamp(match[1]);
          const label = match[2].trim().toLowerCase();
          if (seconds !== null) {
            entries.push({ start: seconds, label });
          }
        }
      }

      // Also scan for sponsor indicators in description text
      const lowerText = text.toLowerCase();
      const sponsorIndicators = ['#ad', 'sponsored by', 'paid promotion', 'paid partnership',
        'this video is sponsored', 'brought to you by', 'thanks to our sponsor'];
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
    if (timeLeft > 30 || timeLeft < 0) return;

    // Look for YouTube end screen cards
    const endScreenElements = document.querySelectorAll('.ytp-ce-element');
    if (!endScreenElements.length) return;

    // Check if any end screen element is visible
    const visibleEndScreen = Array.from(endScreenElements).some(el => {
      return el.offsetParent !== null && el.offsetWidth > 0;
    });
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
      if (!settings[KEYS[seg.category]]) continue;
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
        if (!settings[KEYS[seg.category]]) continue;

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

  // ==================== PREMIUM ====================

  function applyPremium() {
    if (!settings.isPremium) return;
    if (settings.theaterDefault) {
      setTimeout(() => {
        const b = document.querySelector('button.ytp-size-button');
        if (b && !document.querySelector('ytd-watch-flexy[theater]')) b.click();
      }, 1500);
    }
    if (settings.removeShorts) {
      const rm = () => ['ytd-rich-shelf-renderer[is-shorts]','ytd-reel-shelf-renderer','[is-shorts]',
        'ytd-mini-guide-entry-renderer[aria-label="Shorts"]'].forEach(s =>
          document.querySelectorAll(s).forEach(e => e.style.display = 'none'));
      rm();
      new MutationObserver(rm).observe(document.body, { childList: true, subtree: true });
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
