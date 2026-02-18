// PremiumTube - Page Context Script (runs in MAIN world)
// This has access to YouTube's internal APIs (window.yt, window.ytcfg, etc.)

(function () {
  'use strict';

  // ---- Force AV1 Codec Preference ----

  try {
    // Hook into ytcfg.set to force AV1 on every config update
    if (window.ytcfg && typeof window.ytcfg.set === 'function') {
      var origSet = window.ytcfg.set;
      window.ytcfg.set = function () {
        if (arguments[0] && typeof arguments[0] === 'object') {
          var flags = arguments[0].EXPERIMENT_FLAGS;
          if (flags) {
            flags.html5_prefer_av1 = true;
            flags.html5_disable_av1 = false;
          }
        }
        return origSet.apply(this, arguments);
      };
    }

    // Set flags on existing config immediately
    if (window.yt && window.yt.config_ && window.yt.config_.EXPERIMENT_FLAGS) {
      window.yt.config_.EXPERIMENT_FLAGS.html5_prefer_av1 = true;
      window.yt.config_.EXPERIMENT_FLAGS.html5_disable_av1 = false;
    }
  } catch (e) {}
})();
