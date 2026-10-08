# Better Mini Player

## Purpose and scope
A small Manifest V3 extension for desktop Brave, Chrome, and Edge, initially targeting YouTube. The toolbar icon toggles a real Document Picture-in-Picture window with play/pause, ±10-second seek, and close controls. No frameworks, remote code, server, native app, accounts, downloads, or settings UI.

## Architecture and conventions
- `extension/manifest.json`: source manifest. Only `activeTab` and `scripting` permissions; no persistent host permissions or automatic content scripts.
- `src/background.ts`: toolbar event -> immediate isolated-world injection, error badge/title. Never await unrelated work before injection; it must inherit the user gesture.
- `src/entry.ts`: per-tab controller in the extension's isolated world, retained across repeated injections.
- `src/pip.ts`: window creation, session lifecycle, notices, navigation/source-loss cleanup.
- `src/playback.ts`: discover the main loaded YouTube video and operate its actual playback state. Clamp seeks to duration or seekable live ranges; don't seek ads.
- `src/mirror.ts`: capture rendered video frames from the original, immediately stop captured audio tracks, display a video-only stream in PiP. Canvas stills handle opening and seeking while paused.
- `src/ui/`: constant SVG icons, PiP CSS, accessible UI, keyboard controls, media-event synchronization.
- `scripts/`: build, package, and opt-in live YouTube verification.
- `tests/`: playback edge cases and real Chromium media/window lifecycle checks.
- `dist/`: committed, ready-to-load unpacked extension. Regenerate after source edits.

Strict TypeScript, native DOM APIs, small focused modules. Use textContent for page-derived text. No inline script, eval, remote resources, or page-accessible extension message bridge. **Build all HTML/SVG using createElement/createElementNS; never use innerHTML or a Trusted Types bypass.** YouTube's Trusted Types CSP is inherited by the PiP document, and caused a real failure during live testing. Exceptions can originate in the PiP realm; inspect their name/message rather than relying on instanceof. Avoid adding dependencies or permissions without a concrete need.

## Decisions to preserve
**Never move, copy the media URL of, mute, reload, or replace YouTube's original video.** It stays in its original document/parent under YouTube's player logic. The original is the only media decoder/source of audio; the muted PiP video only consumes a local video-only MediaStream. Every transport action reads/writes the original HTMLVideoElement. Callbacks reference it directly; no network or runtime message channel carries playback commands. Closing disposes capture tracks/listeners/timers and leaves source time, audio, rate, and play/pause state untouched.

Paused video capture may provide no new frames; use a canvas still of the actual source after pause/seek. Do not temporarily play a paused original to initialize the mirror. Stop every captured audio track, including late-added tracks. Streams can replace tracks at end/replay; refresh on addtrack/removetrack. Cleanup is idempotent.

Do not lock out pause while play() waits for buffering. Each click reads source.paused; an intentional pause can abort a pending play request, and AbortError should not appear as a playback failure. Keep overlays visible for keyboard focus-visible, while mouse focus permits the idle fade.

YouTube navigation, replacement/removed video, source changes, tab closure, and media errors close the mini-player; users reopen for the next video. Keeping a detached stale source alive or following a different video automatically is unsafe. A visible PiP-window timer monitors fallback conditions; event listeners handle immediate navigation/unload. Runtime failures produce a clear on-page notice.

## Build, installation, tests, debugging
Node 22+; `npm ci`, `npx playwright install chromium`, `npm run check`. Load `dist/` using Developer mode -> Load unpacked at `brave://extensions`, `chrome://extensions`, or `edge://extensions`; pin the action. Reload the extension and source tab after edits, then click its icon.

`npm test` checks playback calculations. `npm run test:browser` uses an isolated temporary profile and local generated media to verify real frames, original-state controls, pause/seek/close/reopen, source loss/navigation, and errors. `npm run test:youtube` is opt-in live-site validation; never call a blocked/bot-gated attempt a successful playback test. `npm run package` writes a ZIP. Assert the source's currentTime/paused state and actual mirror frames, not just window creation.

Set `BROWSER_EXECUTABLE` to a browser path for Brave/Edge testing; `HEADLESS=false` opens visible test windows. Always use temporary profiles, never attach to a user's everyday profile. Tests use the browser-target CDP Extensions.triggerAction on a *tab* target to exercise the real toolbar action and activation. This testing protocol requires a recent Chromium, although the extension runtime targets 116+. Disable viewport emulation (`viewport: null`) so tests do not override the native PiP's requested dimensions. Some Chromium builds report a background PiP opener as visible; assert tabActive=false and actual mirror frame delivery. Poll the source using timers/evaluate, since hidden documents may stop requestAnimationFrame. Temporary buffering/seek readyState drops are not source destruction and must not close PiP.

Inspect the extension service worker via the extensions page. Inspect the mini-player with DevTools. Toolbar errors appear as `!` and a descriptive hover title; YouTube errors also show a temporary notice. Use `.local/` for private probes/profiles and `test-results/` for output; never commit them.

## API limitations and sources
Document PiP requires desktop support, a secure top-level document, user activation, and browser/OS permission. Chromium launched it in 116; browser settings/policies may disable it. No native-PiP fallback because that loses custom controls. Browser chrome provides dragging/resizing and owns window placement. CSS object-fit preserves the video aspect ratio within freely resized windows; the API cannot enforce the outer window aspect ratio or set its position. Always-on-top is OS controlled; exclusive-fullscreen games or competing topmost windows can cover it. It cannot outlive its source tab. Ordinary YouTube videos are the scope; DRM/tainted media, captions rendered outside the video, and ads' skip UI aren't mirrored. Seeking is disabled during ads and unseekable live streams.

Primary research:
- https://developer.chrome.com/docs/web-platform/document-picture-in-picture
- https://developer.chrome.com/docs/extensions/develop/concepts/activeTab
- https://www.w3.org/TR/mediacapture-fromelement/ (paused frames, changing tracks, origin restrictions)
- https://chromium.googlesource.com/chromium/src.git/+/8e21953ab08e31a8cc63de007888b9a8097334b9/extensions/browser/scripting_utils.cc (injection user activation)
- https://issues.chromium.org/issues/40857662 (historical hidden-opener frame delivery bug, fixed)

## Verification record
2026-10-08, Windows:
- Strict TypeScript check and 6 playback unit tests pass.
- 7 browser tests pass in installed Brave (Chromium 155), both headless and visible windows. Includes installed MV3 extension activation, strict Trusted Types, paused seek/frame, original DOM/state retention, video-only muted mirror, real moving frames with another tab active, media-event synchronization, native/custom close and capture cleanup, reopen/end/replay, resize containment, ad seek restrictions, navigation/source removal/tab-close cleanup, and descriptive missing-video/API/security failures.
- Live YouTube playback passes in visible Brave using `Me at the zoo`: actual extension action, original DOM retained, real play/pause and ±10-second changes, video frames, background-tab rendering, audio isolation, close without losing state, reopen, and real YouTube SPA navigation cleanup. The test uses a fresh profile and dismisses YouTube's consent dialog; a blocked consent attempt is not a passing test.
- Browser/OS dragging and topmost behavior are provided by Document PiP; no game or exclusive-fullscreen overlay test was performed. Direct audio audibility on physical speakers was not assessed; the source remains unmuted and no captured audio is attached to PiP.
- The same 7 browser tests pass in installed Edge (Chromium 154), headless. Chrome for Testing 155/156 could not be launched on this host (spawn UNKNOWN), so direct Chrome playback is unverified. The runtime uses the shared Chromium APIs and feature detection; do not call Chrome tested. CI uses the installed Edge on Windows runners.
- A clean `npm ci` followed by the full Brave check passes. The distributable ZIP passes CRC validation and every archived entry matches `dist` byte for byte. Source, ready-to-load `dist`, installation instructions, and a Windows/Edge CI workflow are included in the repository.
