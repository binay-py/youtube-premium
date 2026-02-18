# PremiumTube - YouTube Premium Features

A Chrome extension that brings YouTube Premium-like features to everyone. Free core features with an optional one-time premium upgrade.

## Features

### Free Tier
- **Auto-Skip Intros/Outros** - Powered by SponsorBlock community data
- **Auto-Skip Sponsors** - Skip sponsored segments automatically
- **Skip Self-Promotion & Interaction Reminders** - No more "like and subscribe" interruptions
- **Picture-in-Picture** - Enhanced PiP with Alt+P shortcut and auto-PiP on tab switch
- **Background Play** - Audio keeps playing when you switch tabs
- **Toast Notifications** - Subtle alerts when segments are skipped

### Premium Tier ($2.99 one-time)
- **Ad Skipping** - Automatically detect and skip video ads
- **Theater Mode Default** - Videos always open in theater mode
- **Remove Shorts** - Hide the Shorts shelf from your feed
- **Custom Playback Speeds** - Per-channel speed presets (coming soon)
- **Video Downloads** - Save videos for offline viewing (coming soon)

## Installation (Development)

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable **Developer mode** (toggle in top-right corner)
4. Click **Load unpacked**
5. Select the `premiumtube/` folder
6. The PremiumTube icon will appear in your extensions bar

## Usage

### Quick Toggles
Click the PremiumTube icon in the toolbar to access quick toggles for all features.

### Detailed Settings
Click "Open Settings" in the popup or right-click the extension icon > Options to access the full settings page.

### Keyboard Shortcuts
- **Alt+P** - Toggle Picture-in-Picture mode

### Background Play
When enabled, audio continues playing even when you switch to another tab. YouTube normally pauses video when the tab is hidden - PremiumTube overrides this behavior.

### Auto-Skip
PremiumTube uses the SponsorBlock API to identify and skip segments in videos. You can configure which categories to skip:
- Intros
- Outros
- Sponsor segments
- Self-promotion
- Interaction reminders (like/subscribe)

## Freemium Model

Core features (auto-skip, PiP, background play) are completely free. Premium features (ad-skip, UI customization) require a one-time $2.99 payment via PayPal.

For testing premium features during development, use the "Dev: Unlock Premium Locally" button on the settings page.

## Tech Stack

- Chrome Extension Manifest V3
- Vanilla JavaScript (ES6+)
- SponsorBlock API for skip segment data
- chrome.storage.sync for settings persistence

## Credits

- [SponsorBlock](https://sponsor.ajay.app/) - Community-driven skip segment database
- SponsorBlock API by Ajay Ramachandran

## Privacy

PremiumTube does not collect, store, or transmit any personal data. All settings are stored locally in your browser using Chrome's sync storage. The only external API call is to SponsorBlock to fetch skip segment data for the video you're watching.

## License

MIT
