# PremiumTube — YouTube Premium features, free

<p align="center">
  <img src="premiumtube/icons/icon128.png" alt="PremiumTube" width="80"/>
</p>

<p align="center">
  <strong>Auto-skip sponsors, intros and ads. Background play, PiP, max quality.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Manifest-V3-blue" alt="Manifest V3"/>
  <img src="https://img.shields.io/badge/Chrome-88%2B-green" alt="Chrome 88+"/>
  <img src="https://img.shields.io/badge/Price-Free-brightgreen" alt="Free"/>
</p>

---

## Features

### Skip segments

| Feature | Description |
|---------|-------------|
| **Skip Intros** | Skips video intro sequences |
| **Skip Outros** | Skips end screens & credit rolls |
| **Skip Sponsors** | Skips sponsored segments via [SponsorBlock](https://sponsor.ajay.app) |
| **Skip Self-Promo** | Skips merch mentions & channel promos |
| **Skip Reminders** | Skips "like & subscribe" prompts |
| **Skip Filler** | Skips tangents & off-topic content |
| **Skip Preview/Recap** | Skips recaps & previews of upcoming content |
| **Skip Non-music** | Skips talking segments in music videos |

### Ad blocking

- Detects and skips video ads
- Blocks ad network requests via Declarative Net Request (34 rules)
- Hides ad overlays and banners
- Mutes audio during unskippable ads
- Handles anti-adblock popups

### Playback

| Feature | Description |
|---------|-------------|
| **Max Quality** | Sets the highest available resolution automatically |
| **Picture-in-Picture** | Toggle with `Alt+P` |
| **Auto PiP on Tab Switch** | Enters PiP when you leave the tab |
| **Background Play** | Audio continues when the tab is hidden |
| **Continuous Play** | Stops YouTube pausing during long sessions |
| **Auto-dismiss Popups** | Clears "Are you still watching?" prompts |
| **Hide Premium Upsells** | Removes "Get YouTube Premium" banners |

### Off by default

These ship disabled — turn them on in Settings:

| Feature | What it does |
|---------|--------------|
| **Video Stats** | Overlay with live quality, codec and bitrate |
| **Bass Boost** | Web Audio low-shelf filter |
| **Audio Normalizer** | Evens out loudness across videos |
| **Cinematic Mode** | Ambient lighting glow around the player |
| **Video Sharpening** | SVG convolution filter, strength adjustable |

### Detection: four methods in parallel

1. **SponsorBlock API** — community skip-segment database
2. **YouTube Chapters** — parsed from `ytInitialData`
3. **Description Timestamps** — scans the description for labeled times
4. **Captions/Transcript** — keyword matching over the caption track

Plus a separate end-screen detector that reads YouTube metadata, falling back to the DOM.

### UI

- Skip button with countdown and progress bar
- Upcoming-segment preview, 12 seconds ahead
- Colored markers on the seekbar
- YouTube-style toasts

---

## Install

```bash
git clone https://github.com/binay-py/youtube-premium.git
```

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. **Load unpacked**
4. Select the **`premiumtube`** folder — not the repo root
5. Open YouTube

### Updating

```bash
git pull origin main
```

Then hit reload on the PremiumTube card in `chrome://extensions`.

---

## Usage

Click the toolbar icon for stats and quick toggles. Right-click the icon → **Options**, or **Settings** in the popup, for everything else.

| Shortcut | Action |
|----------|--------|
| `Alt+P` | Toggle Picture-in-Picture |
| `Enter` | Skip the current segment manually |

---

## How it works

```
YouTube page load
       │
       ├── content.js  (isolated world, ~3,000 lines)
       │     ├── Fetches SponsorBlock segments via the service worker
       │     ├── Parses chapters from ytInitialData
       │     ├── Scans the description for timestamps
       │     ├── Keyword-matches the caption track
       │     ├── Polls currentTime every 200ms to fire skips
       │     └── Draws the skip button, preview and seekbar markers
       │
       ├── bridge.js  (MAIN world)
       │     ├── Reaches YouTube's #movie_player API, which the isolated
       │     │   world cannot touch
       │     ├── Reads quality / codec / bitrate, publishes them onto a
       │     │   hidden DOM node for content.js to read back
       │     └── Applies max quality, and keeps re-applying it
       │
       ├── background.js  (service worker)
       │     ├── SponsorBlock fetches, with an in-memory cache
       │     └── Seeds default settings on install
       │
       ├── ad_rules.json  (Declarative Net Request)
       │     └── 34 static rules blocking ad endpoints
       │
       └── styles.css
             └── Hides Premium upsells and ad containers
```

### Why two content scripts

`content.js` runs in the **isolated world** — its own JS context, with access to the DOM and to `chrome.*`, but *not* to the page's own JavaScript objects. YouTube's player API (`getPlaybackQuality`, `setPlaybackQualityRange`, `getPlayerResponse`) lives on the page's `#movie_player` element and is only reachable from the page's context.

So `bridge.js` is declared with `"world": "MAIN"`, runs alongside YouTube's own code, and the two halves talk through a hidden `<div id="pt-stats-bridge">` — `bridge.js` writes `data-*` attributes and dispatches `CustomEvent`s, `content.js` reads them. Neither can call the other directly.

### Setting quality

Three escalating methods, because YouTube's player has changed shape repeatedly:

1. `setPlaybackQualityRange(best, best)` — works on current builds
2. `setPlaybackQuality(best)` — legacy, still live on some
3. Clicking through the settings menu — a real fallback, and deliberately only fired after a 600ms check confirms 1 and 2 didn't take. It's visible to the user, so it doesn't run unless it has to.

A monitor then re-applies quality every 3s, up to 5 times, because YouTube likes to drop back to `auto` shortly after a navigation.

---

## File structure

```
premiumtube/
├── manifest.json        # Manifest V3 config
├── content.js           # Isolated world — detection, skipping, UI, ad handling
├── bridge.js            # MAIN world — player API access, quality control
├── background.js        # Service worker — SponsorBlock fetch + cache, defaults
├── popup.html/.js       # Toolbar popup — stats, quick toggles
├── options.html/.js     # Full settings page
├── styles.css           # Injected CSS
├── ad_rules.json        # 34 Declarative Net Request rules
└── icons/
    ├── generate_icons.py
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## Permissions

| Permission | Why |
|-----------|-----|
| `storage` | Settings and stats |
| `declarativeNetRequest` | Ad request blocking |
| `*://*.youtube.com/*` | Operate on YouTube |
| `*://sponsor.ajay.app/*` | Fetch SponsorBlock segments |
| `*://*.doubleclick.net/*` | Ad network |
| `*://*.googlesyndication.com/*` | Ad network |
| `*://*.googleadservices.com/*` | Ad network |
| `*://*.adsense.google.com/*` | Ad network |

Content scripts are registered for `*://www.youtube.com/*` specifically, so `m.youtube.com` and `music.youtube.com` are not covered.

---

## Mobile

PremiumTube is a Chrome extension and only runs in desktop browsers — extensions can't load inside the YouTube mobile app. Alternatives:

| Platform | App | Notes |
|----------|-----|-------|
| **Android** | [ReVanced](https://github.com/ReVanced) | Patches the official APK — ads, SponsorBlock, background play, PiP |
| **Android** | [NewPipe](https://newpipe.net) | Lightweight client with SponsorBlock and downloads |
| **Android** | [Kiwi Browser](https://play.google.com/store/apps/details?id=com.kiwibrowser.browser) | Supports Chrome extensions — install PremiumTube directly |
| **iOS** | [uYou+](https://github.com/qnblackcat/uYouPlus) | Modified YouTube app, sideload via AltStore |

---

## Known issues

**Two ad rules touch YouTube's attestation endpoints** — `youtubei/v1/att/get` (rule 33) and `jnn-pa.googleapis.com` (rule 39). These belong to BotGuard, YouTube's anti-automation layer. Blocking them is common in ad-blocking lists, but it's also a known trigger for *"Sign in to confirm you're not a bot"* and for playback simply failing. If you hit either, remove those two rules from `ad_rules.json` first.

**YouTube changes its DOM often.** Skip detection leans on selectors and on `ytInitialData` shape. When something stops working, that's usually why.

---

## Tech

Manifest V3 · vanilla JS, no framework, no build step · `chrome.storage.sync` for settings, `.local` for stats · Declarative Net Request · SponsorBlock API · YouTube's internal player API via a MAIN-world bridge

---

## Credits

- [SponsorBlock](https://sponsor.ajay.app) — community sponsor-segment database, by Ajay Ramachandran

---

## License

Not currently licensed. All rights reserved — no `LICENSE` file has been added to this repository yet.

If you intend this to be open source, add a `LICENSE` file and update this section; until one exists, default copyright applies and others have no right to reuse the code.
