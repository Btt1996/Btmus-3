# MyMusic — Personal Offline Music Player for iPhone (iOS 18)

MyMusic is a modern, privacy-first, offline music player Progressive Web App (PWA) designed specifically for iPhone (iOS 18) and modern mobile browsers. It enables seamless music synchronization from Telegram and local audio files, storing all audio blobs and metadata directly in persistent browser storage (IndexedDB) with zero external subscriptions, zero tracking, and complete offline playback.

---

## 🎵 Key Features

- **True Offline Playback**: All downloaded audio files are stored locally in the browser's persistent IndexedDB storage. Playback, seeking, shuffle, and repeat work with no internet connection in Airplane mode.
- **Telegram Music Synchronization**:
  - Direct Telegram Bot API integration: connect a bot created with `@BotFather`.
  - Discovers audio documents and tracks in Telegram channels, supergroups, topics, and direct messages.
  - Live streaming download with byte-level progress bars.
  - Automatic source playlist generation based on Telegram channel or topic names.
  - Smart duplicate prevention: avoids re-downloading previously imported tracks.
- **Manual Audio File Import**:
  - Full support for `.mp3`, `.m4a`, `.aac`, `.wav`, `.flac`, and `.ogg` files via iPhone's native Files app, iCloud Drive, or desktop drag-and-drop.
  - Pure client-side ID3 parser extracts Song Title, Artist, Album, Year, and embedded album artwork (`APIC` tags converted to high-quality thumbnails).
  - Accurate audio duration detection using off-screen HTML5 Audio metadata decoding.
- **Audio Player Engine**:
  - Persistent **Mini-Player** with micro-scrubber bar and play/pause/skip controls.
  - **Full-Screen Player** with high-resolution artwork, atmospheric glow, responsive seekbar, volume controls, shuffle, and 3-stage repeat modes (`off`, `all`, `one`).
  - **Media Session API**: native iOS Lock Screen and Control Center playback controls, track metadata, and lock-screen seek support.
  - Seamless background tab and screen-navigation audio continuity.
- **Playlists & Library Management**:
  - Organize songs into Telegram source playlists or custom manual playlists.
  - Real-time instant search across titles, artists, albums, and topics.
  - Filter by Favorites, Telegram tracks, or All.
  - Multi-select batch deletion and single-track removal with safety confirmation modals.
  - Song technical inspector: view bitrate, format, file size, download timestamp, and play counts.
- **Storage & Backup Diagnostics**:
  - Real-time storage estimation using `navigator.storage.estimate()`.
  - Export library metadata backup as JSON.
  - In-app **Offline Integrity Audit**: verifies IndexedDB blob persistence and off-network audio decoding directly on your iPhone.

---

## 🛠️ Technology Stack

- **Framework**: React 19 + TypeScript + Vite 8
- **Styling**: Tailwind CSS v4 with dark charcoal theme, iOS safe area (`env(safe-area-inset-top)`, `env(safe-area-inset-bottom)`), and responsive mobile touch targets
- **Offline Storage**: IndexedDB (isolated stores for `tracks`, `audioBlobs`, `playlists`, `settings`, and `syncHistory`)
- **PWA Integration**: `vite-plugin-pwa` with service worker precaching, Web App Manifest, maskable and Apple Touch icons
- **Audio**: Web Audio API & HTMLAudioElement with object URL lifecycle cleanup to prevent memory leaks

---

## 📲 How to Install on iPhone (iOS 18)

1. Open Safari on your iPhone and navigate to the application URL.
2. Tap the **Share** button (the square with an arrow pointing up) at the bottom toolbar of Safari.
3. Scroll down the action sheet and tap **Add to Home Screen**.
4. Confirm the name **MyMusic** and tap **Add** in the top-right corner.
5. Tap the new **MyMusic** icon on your iPhone Home Screen to launch the app in standalone fullscreen mode without browser URL bars.

---

## 🚀 Setup & Build Instructions

### Prerequisites
- Node.js 18+ (tested on Node.js 22)
- npm or pnpm

### Development
```bash
# Install dependencies
npm install

# Start the local development server on port 3000
npm run dev
```

### Production Build
```bash
# Compile and package for production
npm run build

# Preview production build locally
npm run preview
```
The production bundle will be generated in the `dist/` directory, including the Service Worker, Web App Manifest, and cached assets.

---

## 🌐 Deploying to Free Static Hosting

Because MyMusic is an offline-first client-side Progressive Web App with IndexedDB persistence, it can be hosted for free on any static host.

### Option 1: Cloudflare Pages (Recommended)
1. Push your repository to GitHub or GitLab.
2. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/) > **Workers & Pages** > **Create application** > **Pages**.
3. Connect your repository.
4. Set Build Settings:
   - **Framework preset**: `Vite`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
5. Click **Save and Deploy**. Cloudflare provides free SSL, global CDN, and unlimited bandwidth.

### Option 2: Vercel
1. Install the Vercel CLI (`npm i -g vercel`) or connect via [vercel.com](https://vercel.com).
2. Run `vercel` in the project root.
3. Select default settings (Framework: Vite, Output Directory: `dist`).

### Option 3: Netlify
1. Connect repository on [netlify.com](https://netlify.com).
2. Set build command to `npm run build` and publish directory to `dist`.
3. Add a `_redirects` file with `/*  /index.html  200` to support SPA routing.

---

## ⚙️ Telegram Synchronization Guide

1. Open Telegram and search for `@BotFather`.
2. Send `/newbot` and follow the prompts to choose a bot name and username (e.g. `MyMusicSyncBot`).
3. Copy the HTTP API token provided by BotFather (format `123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ`).
4. In MyMusic, go to the **Sync** tab and enter your token.
5. To sync music:
   - **Direct Forwarding**: Forward any audio file or music message from any chat directly to your bot.
   - **Channels / Groups**: Add your bot as an admin to your private music channel or group so it can receive audio posts.
6. Tap **Check Updates** in MyMusic: the app will list all discovered audio files with titles, artists, and sizes.
7. Tap **Download Selected**: the files will be downloaded directly into your iPhone's IndexedDB and categorized into playlists.

---

## 📋 iOS Constraints & Technical Notes

- **Background Audio**: Safari/iOS PWAs support background audio playback while the screen is locked as long as the HTML `<audio>` element maintains active playback. To ensure lock screen controls function, MyMusic hooks into the `navigator.mediaSession` API.
- **Storage Limits**: iOS WebKit allocates storage quotas dynamically (typically up to 50% of free disk space). In the Settings tab, you can view your quota and run the **Offline Audio Test** to confirm file persistence.
- **Audio Formats**: iOS Safari natively plays `.mp3`, `.m4a` (AAC/ALAC), `.wav`, and `.flac`. Non-standard or proprietary codecs should be converted to MP3/M4A before importing.
