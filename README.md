# PremiumTube - YouTube Premium Features for Free

<p align="center">
  <img src="premiumtube/icons/icon128.png" alt="PremiumTube" width="80"/>
</p>

<p align="center">
  <strong>Auto-skip sponsors, intros, ads & more. Background play, PiP, max quality — all free.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Manifest-V3-blue" alt="Manifest V3"/>
  <img src="https://img.shields.io/badge/Chrome-88%2B-green" alt="Chrome 88+"/>
  <img src="https://img.shields.io/badge/License-MIT-yellow" alt="MIT License"/>
  <img src="https://img.shields.io/badge/Price-Free-brightgreen" alt="Free"/>
</p>

---

## Features

### Skip Segments
| Feature | Description |
|---------|-------------|
| **Skip Intros** | Automatically skips video intro sequences |
| **Skip Outros** | Skips end screens & credit rolls |
| **Skip Sponsors** | Skips sponsored segments via [SponsorBlock](https://sponsor.ajay.app) |
| **Skip Self-Promo** | Skips merch mentions & channel promos |
| **Skip Reminders** | Skips "like & subscribe" prompts |
| **Skip Filler** | Skips tangents & off-topic content |
| **Skip Preview/Recap** | Skips recaps & previews of upcoming content |
| **Skip Non-music** | Skips talking segments in music videos |

### Ad Blocking
- Automatically detects and skips video ads
- Blocks ad network requests via Declarative Net Request
- Hides ad overlays and banners
- Mutes audio during unskippable ads
- Handles anti-adblock popups

### Playback Enhancements
| Feature | Description |
|---------|-------------|
| **Max Quality** | Automatically sets highest available resolution (4K/1440p/1080p) |
| **Picture-in-Picture** | Toggle PiP with `Alt+P` shortcut |
| **Auto PiP on Tab Switch** | Automatically enters PiP when you leave the tab |
| **Background Play** | Audio continues playing when the tab is hidden |
| **Continuous Play** | Prevents YouTube from pausing during long sessions |
| **Auto-dismiss Popups** | Dismisses "Are you still watching?" prompts |
| **Hide Premium Upsells** | Removes "Get YouTube Premium" banners |

### Smart Detection (4 Methods)
PremiumTube uses multiple detection methods running in parallel for maximum accuracy:

1. **SponsorBlock API** — Community-driven database of skip segments
2. **YouTube Chapters** — Parses chapter metadata from video data
3. **Description Timestamps** — Scans video descriptions for labeled timestamps
4. **Captions/Transcript** — Analyzes YouTube captions with keyword matching

### UI Features
- Skip button with countdown timer and progress bar
- Upcoming segment preview (shows 12 seconds before)
- Colored seekbar markers on the YouTube timeline
- YouTube-style toast notifications
- Category-colored segment indicators

---

## Installation

### From Source (Developer Mode)
1. Clone this repository:
   ```bash
   git clone https://github.com/binay-py/youtube-premium.git
   ```
2. Open Chrome and go to `chrome://extensions`
3. Enable **Developer mode** (top right toggle)
4. Click **Load unpacked**
5. Select the `premiumtube` folder
6. Visit YouTube — the extension is active

### Updating
```bash
git pull origin main
```
Then click the refresh icon on `chrome://extensions` for the PremiumTube card.

---

## Usage

### Popup
Click the PremiumTube icon in your toolbar to:
- View stats (segments skipped, time saved)
- Toggle individual features on/off
- Access more skip options via expandable sections
- Open the full Settings page

### Keyboard Shortcuts
| Shortcut | Action |
|----------|--------|
| `Alt+P` | Toggle Picture-in-Picture |
| `Enter` | Manually skip current segment |

### Settings Page
Right-click the extension icon → **Options**, or click **Settings** in the popup for the full configuration page with all toggles.

---

## How It Works

```
YouTube Page Load
       │
       ├── content.js injects into youtube.com
       │     ├── Fetches SponsorBlock segments
       │     ├── Parses chapter data from ytInitialData
       │     ├── Scans description for timestamps
       │     ├── Analyzes captions for keywords
       │     └── Polls video time every 200ms to trigger skips
       │
       ├── background.js (Service Worker)
       │     ├── Handles SponsorBlock API caching (30 min)
       │     ├── Initializes default settings on install
       │     └── Proxies API requests for content script
       │
       ├── ad_rules.json (Declarative Net Request)
       │     └── 30 rules blocking ad network domains
       │
       └── styles.css
             └── Hides YouTube Premium upsells & ad elements
```

---

## File Structure

```
premiumtube/
├── manifest.json        # Extension config (Manifest V3)
├── content.js           # Main content script — segment detection, ad skip, PiP, quality
├── background.js        # Service worker — API caching, settings init
├── popup.html           # Extension popup UI
├── popup.js             # Popup logic — toggles, stats, collapsible sections
├── options.html         # Full settings page
├── options.js           # Settings page logic
├── styles.css           # Injected CSS for YouTube
├── ad_rules.json        # Declarative Net Request ad blocking rules
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## Mobile Users

PremiumTube is a Chrome extension — it runs in desktop browsers. Chrome extensions can't work inside the YouTube mobile app. Here are alternatives for mobile:

| Platform | App | Features | Link |
|----------|-----|----------|------|
| **Android** | **ReVanced** | Ad blocking, SponsorBlock, background play, PiP — patches the official YouTube APK | [github.com/ReVanced](https://github.com/ReVanced) |
| **Android** | **NewPipe** | Lightweight YouTube client with SponsorBlock, background play, downloads | [newpipe.net](https://newpipe.net) |
| **Android** | **Kiwi Browser** | Mobile browser that supports Chrome extensions — install PremiumTube directly | [Play Store](https://play.google.com/store/apps/details?id=com.kiwibrowser.browser) |
| **iOS** | **uYou+** | Modified YouTube app with ad blocking & SponsorBlock (sideload via AltStore) | [github.com/qnblackcat/uYouPlus](https://github.com/qnblackcat/uYouPlus) |

---

## Permissions

| Permission | Why |
|-----------|-----|
| `storage` | Save settings & stats across sessions |
| `declarativeNetRequest` | Block ad network requests |
| `*://*.youtube.com/*` | Operate on YouTube pages |
| `*://sponsor.ajay.app/*` | Fetch SponsorBlock skip segments |
| `*://*.googlevideo.com/*` | Block video ad delivery |
| `*://*.doubleclick.net/*` | Block ad network |
| `*://*.googlesyndication.com/*` | Block ad network |
| `*://*.googleadservices.com/*` | Block ad network |

---

## Tech Stack

- **Manifest V3** — Modern Chrome extension standard
- **Vanilla JavaScript (ES6+)** — No frameworks, no build step
- **Chrome Storage API** — Sync settings across devices
- **Declarative Net Request** — Performant ad blocking
- **SponsorBlock API** — Community skip segment data
- **YouTube Internal Player API** — Quality & playback control

---

## Credits

- [SponsorBlock](https://sponsor.ajay.app) — Community-driven sponsor segment database
- Built with vanilla JS, no dependencies

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

<p align="center">
  <strong>If PremiumTube saves you time, give it a star!</strong>
</p>
