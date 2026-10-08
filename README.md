# Better Mini Player

A small YouTube Picture-in-Picture extension for desktop **Brave, Chrome, and Edge**. A floating window with play/pause, backward 10 seconds, forward 10 seconds, and close. The original YouTube video stays in its player; all controls operate that video, and audio continues from the source tab.

## Install

The repository includes a ready-to-load `dist` folder. **No build is needed to install.**

1. Download and extract this repository, or clone it.
2. Open `brave://extensions` (Chrome: `chrome://extensions`; Edge: `edge://extensions`).
3. Enable **Developer mode**, click **Load unpacked**, and select the **`dist` folder**.
4. Pin **Better Mini Player** using the browser's Extensions menu.

## Use

Open a YouTube video, dismiss any YouTube consent dialog, and start playback. Click the extension icon to pop it out. Drag the browser's PiP title bar to move it, and drag its edges to resize. Hover or focus the window to show controls. Click the icon again, the mini-player's close button, or the window's native close button to return to the tab without changing your playback state or position.

Keyboard shortcuts inside the mini-player: **Space / K** for play/pause, **Left / J** for backward 10 seconds, **Right / L** for forward 10 seconds, and **Escape** to close. YouTube's page controls remain synchronized. Navigation to another video closes the mini-player; click the icon to open the new video.

## Limits

- Requires desktop Document Picture-in-Picture support (Chromium 116+) and browser settings that allow it. Unsupported browsers show an error; no fallback to native PiP controls.
- The browser provides always-on-top behavior. Borderless games depend on the OS/game; exclusive fullscreen and other topmost windows may cover PiP. Game overlays have not been tested.
- Keep the source tab open. There is no server, native helper, or independent video download.
- The video keeps its proportions inside the window. The browser controls the outer window's shape and placement.
- Ordinary YouTube videos are the initial scope. Protected/DRM media can block mirroring. YouTube captions and other page overlays aren't mirrored. Ads disable seeking; live seeking stays within the available DVR window.
- A toolbar `!` indicates an error: hover the icon for details. Errors on YouTube also show a temporary notice. Reload the source tab after reloading/updating the unpacked extension.

## Develop

Node.js 22+:

```sh
npm ci
npx playwright install chromium
npm run check
```

`npm run build` regenerates `dist`. `npm run package` produces `artifacts/better-mini-player-1.0.0.zip`. Load the extracted ZIP's root folder as an unpacked extension.

Browser tests use temporary profiles and a local video/audio fixture, including the real extension action and strict Trusted Types. To test installed Brave in PowerShell:

```powershell
$env:BROWSER_EXECUTABLE = 'C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe'
$env:HEADLESS = 'false'
npm run test:browser
npm run test:youtube
```

Live YouTube testing is opt-in and may be blocked by network, consent, ads, or site restrictions. See [AGENTS.md](AGENTS.md) for architecture, debugging, API research, and the verification record.
