// PremiumTube - Options Page Script

document.addEventListener('DOMContentLoaded', async () => {
  const toggles = document.querySelectorAll('input[data-setting]');
  const statusMsg = document.getElementById('statusMsg');
  const premiumLockSection = document.getElementById('premiumLockSection');
  const premiumUnlockedSection = document.getElementById('premiumUnlockedSection');
  const paypalBtn = document.getElementById('paypalBtn');
  const devUnlockBtn = document.getElementById('devUnlockBtn');
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
      const isPremium = toggle.dataset.premium === 'true';

      toggle.checked = !!settings[key];

      if (isPremium && !settings.isPremium) {
        toggle.disabled = true;
        toggle.checked = false;
      } else {
        toggle.disabled = false;
      }
    });

    if (settings.isPremium) {
      premiumLockSection.classList.add('hidden');
      premiumUnlockedSection.classList.remove('hidden');
    } else {
      premiumLockSection.classList.remove('hidden');
      premiumUnlockedSection.classList.add('hidden');
    }
  }

  applySettings();

  toggles.forEach(toggle => {
    toggle.addEventListener('change', async () => {
      const key = toggle.dataset.setting;
      const isPremium = toggle.dataset.premium === 'true';

      if (isPremium && !settings.isPremium) {
        toggle.checked = false;
        showStatus('Unlock Premium to enable this feature');
        return;
      }

      settings[key] = toggle.checked;
      await chrome.storage.sync.set({ [key]: toggle.checked });
      showStatus('Settings saved');
    });
  });

  paypalBtn.addEventListener('click', () => {
    showStatus('PayPal integration coming soon - use Dev Unlock for testing');
  });

  devUnlockBtn.addEventListener('click', async () => {
    settings.isPremium = true;
    await chrome.storage.sync.set({ isPremium: true });
    applySettings();
    showStatus('Premium unlocked!');
  });

  function showStatus(msg) {
    statusMsg.textContent = msg;
    statusMsg.classList.add('show');
    setTimeout(() => statusMsg.classList.remove('show'), 2500);
  }
});
