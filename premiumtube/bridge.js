// PremiumTube - Page World Bridge
// Runs in the MAIN world (page's JS context) to access YouTube's player API.
// Writes data to DOM attributes that the content script can read.
// Also handles quality setting since player API is only accessible from MAIN world.

(function () {
  'use strict';

  var QUALITY_ORDER = [
    'highres', 'hd2880', 'hd2160', 'hd1440', 'hd1080',
    'hd720', 'large', 'medium', 'small', 'tiny'
  ];

  function getEl() {
    var el = document.getElementById('pt-stats-bridge');
    if (!el) {
      el = document.createElement('div');
      el.id = 'pt-stats-bridge';
      el.style.display = 'none';
      document.documentElement.appendChild(el);
    }
    return el;
  }

  function getPlayer() {
    return document.querySelector('#movie_player');
  }

  function update() {
    try {
      var el = getEl();
      var p = getPlayer();

      // Quality
      var quality = '';
      try {
        if (p && typeof p.getPlaybackQuality === 'function') {
          quality = p.getPlaybackQuality() || '';
        }
      } catch (e) {}

      // Available quality levels
      var availableStr = '';
      try {
        if (p && typeof p.getAvailableQualityLevels === 'function') {
          var avail = p.getAvailableQualityLevels();
          if (avail && avail.length) availableStr = avail.join(',');
        }
      } catch (e) {}

      // Codec & Bitrate from player response
      var codec = '';
      var bitrate = '';
      try {
        var pr = null;

        // Method 1: player.getPlayerResponse()
        if (p && typeof p.getPlayerResponse === 'function') {
          pr = p.getPlayerResponse();
        }

        // Method 2: global ytInitialPlayerResponse
        if (!pr || !pr.streamingData) {
          pr = window.ytInitialPlayerResponse;
        }

        if (pr && pr.streamingData) {
          var fmts = pr.streamingData.adaptiveFormats || pr.streamingData.formats || [];
          var vid = document.querySelector('video');
          var targetH = (vid && vid.videoHeight) ? vid.videoHeight : 1080;
          var best = null;

          for (var i = 0; i < fmts.length; i++) {
            var f = fmts[i];
            if (!f.mimeType || f.mimeType.indexOf('video/') !== 0) continue;
            if (!best || Math.abs((f.height || 0) - targetH) < Math.abs((best.height || 0) - targetH)) {
              best = f;
            }
          }

          if (best) {
            var cm = best.mimeType.match(/codecs="([^"]+)"/);
            codec = cm ? cm[1] : best.mimeType.split(';')[0];
            if (best.bitrate) bitrate = String(best.bitrate);
          }
        }
      } catch (e) {}

      // Playback stats from getStatsForNerds if available
      try {
        if (p && typeof p.getVideoStats === 'function') {
          var stats = p.getVideoStats();
          if (stats) {
            if (!codec && stats.fmt) codec = stats.fmt;
            if (!bitrate && stats.videoBandwidth) bitrate = stats.videoBandwidth;
          }
        }
      } catch (e) {}

      el.setAttribute('data-quality', quality);
      el.setAttribute('data-available-qualities', availableStr);
      el.setAttribute('data-codec', codec);
      el.setAttribute('data-bitrate', bitrate);
    } catch (e) {}
  }

  // ==================== QUALITY SETTING ====================

  function setMaxQuality() {
    try {
      var p = getPlayer();
      if (!p) return false;

      var available = null;
      if (typeof p.getAvailableQualityLevels === 'function') {
        available = p.getAvailableQualityLevels();
      }
      if (!available || !available.length) return false;

      // Pick the highest available quality
      var best = available[0]; // YouTube returns sorted highest-first
      for (var i = 0; i < QUALITY_ORDER.length; i++) {
        if (available.indexOf(QUALITY_ORDER[i]) !== -1) {
          best = QUALITY_ORDER[i];
          break;
        }
      }

      // Get current quality
      var current = '';
      if (typeof p.getPlaybackQuality === 'function') {
        current = p.getPlaybackQuality() || '';
      }

      if (current === best) {
        reportResult('already-max', best, available);
        return true; // Already at max
      }

      // Method 1: setPlaybackQualityRange (most reliable on modern YouTube)
      if (typeof p.setPlaybackQualityRange === 'function') {
        try { p.setPlaybackQualityRange(best, best); } catch (e) {}
      }

      // Method 2: setPlaybackQuality (legacy, still works on some builds)
      if (typeof p.setPlaybackQuality === 'function') {
        try { p.setPlaybackQuality(best); } catch (e) {}
      }

      // Method 3: Internal API via wrappedJSObject or direct property
      try {
        if (p.wrappedJSObject && typeof p.wrappedJSObject.setPlaybackQualityRange === 'function') {
          p.wrappedJSObject.setPlaybackQualityRange(best, best);
        }
      } catch (e) {}

      // Method 4: Click-through the settings menu as last resort
      try {
        setQualityViaMenu(best, available);
      } catch (e) {}

      reportResult('set', best, available, current);
      return true;
    } catch (e) {
      return false;
    }
  }

  function setQualityViaMenu(targetQuality, available) {
    // Map quality labels to menu text patterns
    var qualityToLabel = {
      'highres': '4320',
      'hd2880': '2880',
      'hd2160': '2160',
      'hd1440': '1440',
      'hd1080': '1080',
      'hd720': '720',
      'large': '480',
      'medium': '360',
      'small': '240',
      'tiny': '144'
    };

    var targetLabel = qualityToLabel[targetQuality];
    if (!targetLabel) return;

    // Find and click the settings gear
    var settingsBtn = document.querySelector('.ytp-settings-button');
    if (!settingsBtn) return;

    settingsBtn.click();

    setTimeout(function () {
      // Find the quality menu item
      var menuItems = document.querySelectorAll('.ytp-menuitem');
      var qualityItem = null;
      for (var i = 0; i < menuItems.length; i++) {
        var label = menuItems[i].querySelector('.ytp-menuitem-label');
        if (label && label.textContent && label.textContent.toLowerCase().indexOf('quality') !== -1) {
          qualityItem = menuItems[i];
          break;
        }
      }

      if (!qualityItem) {
        settingsBtn.click(); // close
        return;
      }

      qualityItem.click();

      setTimeout(function () {
        // Find the target quality option
        var options = document.querySelectorAll('.ytp-quality-menu .ytp-menuitem, .ytp-panel-menu .ytp-menuitem');
        var found = false;
        for (var j = 0; j < options.length; j++) {
          var optLabel = options[j].querySelector('.ytp-menuitem-label');
          var text = optLabel ? optLabel.textContent : options[j].textContent;
          if (text && text.indexOf(targetLabel) !== -1) {
            options[j].click();
            found = true;
            break;
          }
        }
        if (!found) {
          // Close the menu if we couldn't find the option
          var backBtn = document.querySelector('.ytp-panel-back-button');
          if (backBtn) backBtn.click();
          setTimeout(function () { settingsBtn.click(); }, 100);
        }
      }, 200);
    }, 200);
  }

  function reportResult(status, best, available, previous) {
    var el = getEl();
    el.setAttribute('data-quality-status', status);
    el.setAttribute('data-quality-target', best || '');
    if (previous) el.setAttribute('data-quality-previous', previous);
    // Dispatch event so content script knows result
    document.dispatchEvent(new CustomEvent('pt-quality-result', {
      detail: { status: status, target: best, previous: previous || '', available: (available || []).join(',') }
    }));
  }

  // Listen for quality-set requests from content script
  document.addEventListener('pt-set-max-quality', function () {
    setMaxQuality();
  });

  // Auto-apply on navigation (when requested via attribute)
  var qualityMonitorInterval = null;

  document.addEventListener('pt-start-quality-monitor', function () {
    if (qualityMonitorInterval) clearInterval(qualityMonitorInterval);
    var reapplyCount = 0;
    var maxReapplies = 5;

    qualityMonitorInterval = setInterval(function () {
      if (++reapplyCount > maxReapplies) {
        clearInterval(qualityMonitorInterval);
        qualityMonitorInterval = null;
        return;
      }

      var p = getPlayer();
      if (!p || typeof p.getAvailableQualityLevels !== 'function') return;
      var available = p.getAvailableQualityLevels();
      if (!available || !available.length) return;

      var best = available[0];
      for (var i = 0; i < QUALITY_ORDER.length; i++) {
        if (available.indexOf(QUALITY_ORDER[i]) !== -1) {
          best = QUALITY_ORDER[i];
          break;
        }
      }

      var current = '';
      if (typeof p.getPlaybackQuality === 'function') {
        current = p.getPlaybackQuality() || '';
      }

      if (current === best) return; // all good

      // Re-apply
      if (typeof p.setPlaybackQualityRange === 'function') {
        try { p.setPlaybackQualityRange(best, best); } catch (e) {}
      }
      if (typeof p.setPlaybackQuality === 'function') {
        try { p.setPlaybackQuality(best); } catch (e) {}
      }
    }, 3000);
  });

  document.addEventListener('pt-stop-quality-monitor', function () {
    if (qualityMonitorInterval) {
      clearInterval(qualityMonitorInterval);
      qualityMonitorInterval = null;
    }
  });

  // Update immediately and every 2 seconds
  update();
  setInterval(update, 2000);

  // Also update on navigation
  window.addEventListener('yt-navigate-finish', update);
})();
