// PremiumTube - Popup Script

document.addEventListener('DOMContentLoaded', async () => {
  const toggles = document.querySelectorAll('input[data-setting]');
  const featureCountEl = document.getElementById('featureCount');
  const openSettingsBtn = document.getElementById('openSettings');
  const premiumBtn = document.getElementById('premiumBtn');
  const segmentsEl = document.getElementById('segmentsSkipped');
  const timeSavedEl = document.getElementById('timeSaved');

  const settings = await chrome.storage.sync.get(null);

  // Load stats
  const stats = await chrome.storage.local.get(['segmentsSkipped', 'timeSaved']);
  segmentsEl.textContent = stats.segmentsSkipped || 0;
  const seconds = Math.round(stats.timeSaved || 0);
  timeSavedEl.textContent = seconds >= 60 ? Math.floor(seconds / 60) + 'm' : seconds + 's';

  // Collapsible "More" buttons
  document.querySelectorAll('.more-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      const target = document.getElementById(targetId);
      if (!target) return;
      const isOpen = target.classList.toggle('open');
      btn.classList.toggle('open', isOpen);
      btn.querySelector('span').textContent = isOpen
        ? btn.dataset.target === 'more-skip' ? 'Less skip options' : 'Less options'
        : btn.dataset.target === 'more-skip' ? 'More skip options' : 'More options';
    });
  });

  // Apply toggles
  toggles.forEach(toggle => {
    const key = toggle.dataset.setting;
    const isPremium = toggle.dataset.premium === 'true';

    toggle.checked = !!settings[key];

    if (isPremium && !settings.isPremium) {
      toggle.disabled = true;
      toggle.checked = false;
    }

    toggle.addEventListener('change', async () => {
      if (isPremium && !settings.isPremium) {
        toggle.checked = false;
        chrome.runtime.openOptionsPage();
        return;
      }
      await chrome.storage.sync.set({ [key]: toggle.checked });
      settings[key] = toggle.checked;
      updateCount();
    });
  });

  // Premium button
  if (settings.isPremium) {
    premiumBtn.textContent = 'Premium Active';
    premiumBtn.classList.add('unlocked');
  } else {
    premiumBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());
  }

  openSettingsBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());

  function updateCount() {
    let count = 0;
    toggles.forEach(t => { if (t.checked && !t.disabled) count++; });
    featureCountEl.textContent = `${count} on`;
  }

  updateCount();
});
