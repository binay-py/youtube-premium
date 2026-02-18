// PremiumTube - Options Page Script

document.addEventListener('DOMContentLoaded', async () => {
  const toggles = document.querySelectorAll('input[data-setting]');
  const statusMsg = document.getElementById('statusMsg');
  const statSegments = document.getElementById('statSegments');
  const statTime = document.getElementById('statTime');

  let settings = await chrome.storage.sync.get(null);

  // Load stats
  const stats = await chrome.storage.local.get(['segmentsSkipped', 'timeSaved']);
  statSegments.textContent = stats.segmentsSkipped || 0;
  const seconds = Math.round(stats.timeSaved || 0);
  if (seconds >= 3600) {
    statTime.textContent = Math.floor(seconds / 3600) + 'h ' + Math.floor((seconds % 3600) / 60) + 'm';
  } else if (seconds >= 60) {
    statTime.textContent = Math.floor(seconds / 60) + 'm ' + (seconds % 60) + 's';
  } else {
    statTime.textContent = seconds + 's';
  }

  function applySettings() {
    toggles.forEach(toggle => {
      const key = toggle.dataset.setting;
      toggle.checked = !!settings[key];
    });
  }

  applySettings();

  toggles.forEach(toggle => {
    toggle.addEventListener('change', async () => {
      const key = toggle.dataset.setting;
      settings[key] = toggle.checked;
      await chrome.storage.sync.set({ [key]: toggle.checked });
      showStatus('Settings saved');
    });
  });

  function showStatus(msg) {
    statusMsg.textContent = msg;
    statusMsg.classList.add('show');
    setTimeout(() => statusMsg.classList.remove('show'), 2500);
  }
});
