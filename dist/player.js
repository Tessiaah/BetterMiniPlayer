"use strict";
var BetterMiniPlayer = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/entry.ts
  var entry_exports = {};
  __export(entry_exports, {
    toggle: () => toggle
  });

  // src/playback.ts
  function seekTarget(video, seconds) {
    if (!Number.isFinite(video.currentTime) || !Number.isFinite(seconds)) return null;
    const target = Math.max(0, video.currentTime + seconds);
    const ranges = video.seekable;
    if (ranges.length > 0) {
      let nearest = ranges.start(0);
      let distance = Math.abs(target - nearest);
      for (let i = 0; i < ranges.length; i++) {
        const start = ranges.start(i);
        const end = ranges.end(i);
        if (target >= start && target <= end) return target;
        for (const boundary of [start, end]) {
          const nextDistance = Math.abs(target - boundary);
          if (nextDistance < distance) {
            nearest = boundary;
            distance = nextDistance;
          }
        }
      }
      return nearest;
    }
    return Number.isFinite(video.duration) && video.duration > 0 ? Math.min(target, video.duration) : null;
  }
  function isAdvertisement(video) {
    return video.closest("#movie_player")?.classList.contains("ad-showing") ?? false;
  }
  function canSeek(video) {
    return !isAdvertisement(video) && video.readyState >= 1 && seekTarget(video, 0) !== null;
  }
  async function togglePlayback(video) {
    if (video.paused || video.ended) await video.play();
    else video.pause();
  }
  function skip(video, seconds) {
    if (!canSeek(video)) return;
    const target = seekTarget(video, seconds);
    if (target !== null) video.currentTime = target;
  }
  function findVideo(doc) {
    const candidates = Array.from(doc.querySelectorAll("#movie_player video, video.html5-main-video"));
    return candidates.filter((video) => {
      const rect = video.getBoundingClientRect();
      return video.isConnected && video.readyState >= 2 && video.videoWidth > 0 && rect.width > 0 && rect.height > 0;
    }).sort((a, b) => {
      const area = (video) => {
        const rect = video.getBoundingClientRect();
        return rect.width * rect.height;
      };
      return area(b) - area(a);
    })[0] ?? null;
  }
  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const total = Math.floor(seconds);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor(total / 60) % 60;
    const remainder = String(total % 60).padStart(2, "0");
    return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${remainder}` : `${minutes}:${remainder}`;
  }

  // src/mirror.ts
  var VideoMirror = class {
    constructor(source, output, still, onError) {
      this.source = source;
      this.output = output;
      this.still = still;
      this.onError = onError;
      if (source.mediaKeys) throw new Error("Protected video cannot be mirrored. Try a regular YouTube video.");
      if (!source.captureStream) throw new Error("Video mirroring is unavailable in this browser. Update Brave, Chrome, or Edge.");
      this.paintStill();
      this.capture = source.captureStream();
      this.output.muted = true;
      this.output.playsInline = true;
      const options = { signal: this.abort.signal };
      this.capture.addEventListener("addtrack", this.refreshTracks, options);
      this.capture.addEventListener("removetrack", this.refreshTracks, options);
      for (const event of ["pause", "seeked", "loadeddata", "resize", "ended", "playing"]) {
        source.addEventListener(event, this.updateStill, options);
      }
      this.refreshTracks();
      this.observeFrame();
    }
    source;
    output;
    still;
    onError;
    capture;
    tracks = /* @__PURE__ */ new Set();
    abort = new AbortController();
    frameCallback;
    disposed = false;
    refreshTracks = () => {
      if (this.disposed) return;
      for (const track of this.capture.getTracks()) {
        this.tracks.add(track);
        if (track.kind === "audio") track.stop();
      }
      const live = this.capture.getVideoTracks().filter((track) => track.readyState === "live");
      const previous = this.output.srcObject?.getVideoTracks() ?? [];
      if (live.length === previous.length && live.every((track, i) => track === previous[i])) return;
      this.output.srcObject = new MediaStream(live);
      if (live.length > 0) void this.output.play().catch((error) => {
        if (!this.disposed && !(error instanceof DOMException && error.name === "AbortError")) this.onError(error);
      });
    };
    paintStill() {
      if (this.source.readyState < 2) return;
      const scale = Math.min(1, 1280 / this.source.videoWidth);
      this.still.width = Math.max(1, Math.round(this.source.videoWidth * scale));
      this.still.height = Math.max(1, Math.round(this.source.videoHeight * scale));
      const context = this.still.getContext("2d");
      if (!context) throw new Error("Could not display the video frame.");
      context.drawImage(this.source, 0, 0, this.still.width, this.still.height);
      context.getImageData(0, 0, 1, 1);
    }
    updateStill = () => {
      if (this.disposed) return;
      try {
        if (this.source.paused || this.source.ended) this.paintStill();
        this.still.hidden = !this.source.paused && !this.source.ended && this.output.readyState >= 2;
        this.refreshTracks();
      } catch (error) {
        this.onError(error);
      }
    };
    observeFrame() {
      if (this.disposed) return;
      this.frameCallback = this.output.requestVideoFrameCallback(() => {
        if (this.disposed) return;
        this.updateStill();
        this.observeFrame();
      });
    }
    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      this.abort.abort();
      if (this.frameCallback !== void 0) this.output.cancelVideoFrameCallback(this.frameCallback);
      for (const track of this.tracks) track.stop();
      for (const track of this.capture.getTracks()) track.stop();
      this.output.pause();
      this.output.srcObject = null;
    }
  };

  // src/ui/player.css
  var player_default = ':root { color-scheme: dark; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; background: #080a0d; color: #fff; }\n* { box-sizing: border-box; }\nhtml, body { width: 100%; height: 100%; margin: 0; overflow: hidden; }\nbutton { font: inherit; color: inherit; cursor: pointer; -webkit-tap-highlight-color: transparent; }\n.player { position: relative; width: 100%; height: 100%; isolation: isolate; background: #080a0d; }\n.video, .still { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }\n[hidden] { display: none !important; }\n.overlay { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: space-between; background: linear-gradient(180deg, #0009, transparent 35%, transparent 50%, #000b); opacity: 1; transition: opacity 160ms ease; pointer-events: none; }\n.player[data-idle="true"] .overlay { opacity: 0; }\n.player[data-idle="true"] { cursor: none; }\n.player:has(:focus-visible) .overlay { opacity: 1; }\n.top { display: flex; align-items: center; gap: 12px; padding: 14px 16px; }\n.title { flex: 1; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; font-weight: 500; text-shadow: 0 1px 6px #000; }\n.icon-button { display: grid; place-items: center; width: 48px; height: 48px; padding: 12px; border: 1px solid #ffffff18; border-radius: 50%; background: #11151bbc; box-shadow: 0 4px 20px #0003; pointer-events: auto; transition: background 120ms ease, transform 120ms ease; }\n.icon-button:hover { background: #353b45e6; transform: scale(1.04); }\n.icon-button:active { transform: scale(.96); }\n.icon-button:focus-visible { outline: 2px solid #93c5fd; outline-offset: 3px; }\n.icon-button:disabled { opacity: .4; cursor: default; transform: none; }\n.icon-button svg { width: 100%; height: 100%; }\n.close { width: 30px; height: 30px; padding: 6px; border: 0; background: #11151b80; }\n.transport { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 20px; }\n.toggle { width: 64px; height: 64px; padding: 18px; background: #161c24df; }\n.bottom { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px 14px; font-size: 11px; font-variant-numeric: tabular-nums; color: #ffffffe0; }\n.status { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n.time { flex-shrink: 0; }\n.feedback { position: absolute; left: 50%; top: 72%; transform: translateX(-50%); margin: 0; border-radius: 12px; padding: 6px 12px; background: #10151cdd; font-size: 12px; }\n@media (max-height: 180px) { .top { padding: 8px 12px; } .bottom { padding: 8px 12px; } .toggle { width: 48px; height: 48px; padding: 13px; } .icon-button:not(.toggle):not(.close) { width: 40px; height: 40px; padding: 9px; } }\n@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }\n';

  // src/types.ts
  function errorMessage(error) {
    const detail = error && typeof error === "object" ? error : void 0;
    if (detail?.name === "NotAllowedError") {
      return "The browser blocked Picture-in-Picture. Click the extension icon again, or allow Picture-in-Picture in your browser settings.";
    }
    if (detail?.name === "SecurityError") {
      return "This video cannot be mirrored because of media security restrictions. Try a regular, non-protected YouTube video.";
    }
    return typeof detail?.message === "string" ? detail.message : "Could not open the mini-player. Reload the YouTube tab and try again.";
  }

  // src/ui/icons.ts
  var paths = {
    play: "m9 5 11 7-11 7Z",
    pause: "M8 5v14M16 5v14",
    backward: "M3.5 8.5A9 9 0 1 1 3 14M3.5 3.5v5h5",
    forward: "M20.5 8.5A9 9 0 1 0 21 14M20.5 3.5v5h-5",
    close: "m6 6 12 12M18 6 6 18"
  };
  function createIcon(doc, name) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = doc.createElementNS(ns, "svg");
    for (const [key, value] of Object.entries({ viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.8", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" })) svg.setAttribute(key, value);
    const path = doc.createElementNS(ns, "path");
    path.setAttribute("d", paths[name]);
    if (name === "play") {
      path.setAttribute("fill", "currentColor");
      path.setAttribute("stroke", "none");
    }
    if (name === "pause") path.setAttribute("stroke-width", "3.5");
    svg.append(path);
    if (name === "backward" || name === "forward") {
      const text = doc.createElementNS(ns, "text");
      for (const [key, value] of Object.entries({ x: "12", y: "15.5", fill: "currentColor", stroke: "none", "text-anchor": "middle", "font-size": "9", "font-family": "system-ui", "font-weight": "650" })) text.setAttribute(key, value);
      text.textContent = "10";
      svg.append(text);
    }
    return svg;
  }

  // src/ui/player.ts
  function createPlayer(pip, source, close) {
    const doc = pip.document;
    doc.title = "Better Mini Player";
    doc.documentElement.lang = "en";
    const style = doc.createElement("style");
    style.textContent = player_default;
    doc.head.append(style);
    const root = doc.createElement("main");
    root.className = "player";
    root.setAttribute("aria-label", "YouTube mini-player");
    const element = (tag, className, parent) => {
      const node = doc.createElement(tag);
      node.className = className;
      parent.append(node);
      return node;
    };
    const video = element("video", "video", root);
    video.muted = true;
    video.playsInline = true;
    video.setAttribute("aria-hidden", "true");
    const still = element("canvas", "still", root);
    still.setAttribute("aria-hidden", "true");
    const overlay = element("div", "overlay", root);
    const top = element("div", "top", overlay);
    const title = element("p", "title", top);
    const button = (parent, className, label, hint, icon) => {
      const node = element("button", `icon-button ${className}`, parent);
      node.type = "button";
      node.setAttribute("aria-label", label);
      node.title = hint;
      node.append(createIcon(doc, icon));
      return node;
    };
    const closeButton = button(top, "close", "Close mini-player", "Close (Escape)", "close");
    const transport = element("div", "transport", overlay);
    transport.setAttribute("role", "group");
    transport.setAttribute("aria-label", "Playback controls");
    const back = button(transport, "backward", "Skip backward 10 seconds", "Back 10 seconds (Left arrow)", "backward");
    const toggle2 = button(transport, "toggle", "Pause", "Play / Pause (Space)", "pause");
    const forward = button(transport, "forward", "Skip forward 10 seconds", "Forward 10 seconds (Right arrow)", "forward");
    const bottom = element("div", "bottom", overlay);
    const status = element("span", "status", bottom);
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    const time = element("span", "time", bottom);
    const feedback = element("p", "feedback", root);
    feedback.setAttribute("role", "status");
    feedback.hidden = true;
    doc.body.replaceChildren(root);
    const abort = new AbortController();
    const options = { signal: abort.signal };
    let idleTimer = 0;
    let feedbackTimer = 0;
    let playbackError = "";
    const showControls = () => {
      root.dataset.idle = "false";
      pip.clearTimeout(idleTimer);
      if (!source.paused && !source.ended) idleTimer = pip.setTimeout(() => {
        root.dataset.idle = "true";
      }, 2200);
    };
    const refresh = () => {
      const paused = source.paused || source.ended;
      const label = paused ? "Play" : "Pause";
      if (toggle2.getAttribute("aria-label") !== label) {
        toggle2.setAttribute("aria-label", label);
        toggle2.replaceChildren(createIcon(doc, paused ? "play" : "pause"));
      }
      back.disabled = forward.disabled = !canSeek(source);
      title.textContent = source.ownerDocument.querySelector("h1.ytd-watch-metadata yt-formatted-string")?.textContent?.trim() || source.ownerDocument.title.replace(/ - YouTube$/, "");
      time.textContent = Number.isFinite(source.duration) ? `${formatTime(source.currentTime)} / ${formatTime(source.duration)}` : `${formatTime(source.currentTime)} \xB7 LIVE`;
      status.textContent = playbackError || (isAdvertisement(source) ? "Advertisement \xB7 seeking unavailable" : source.ended ? "Ended" : paused ? "Paused" : source.readyState < 3 ? "Buffering\u2026" : "");
      if (paused) {
        pip.clearTimeout(idleTimer);
        root.dataset.idle = "false";
      }
    };
    const play = async () => {
      playbackError = "";
      try {
        await togglePlayback(source);
      } catch (error) {
        if (!(error && typeof error === "object" && "name" in error && error.name === "AbortError")) playbackError = errorMessage(error);
      } finally {
        refresh();
        showControls();
      }
    };
    const seek = (seconds) => {
      if (!canSeek(source)) return;
      try {
        skip(source, seconds);
        feedback.textContent = seconds < 0 ? "\u221210 seconds" : "+10 seconds";
        feedback.hidden = false;
        pip.clearTimeout(feedbackTimer);
        feedbackTimer = pip.setTimeout(() => {
          feedback.hidden = true;
        }, 700);
        playbackError = "";
      } catch (error) {
        playbackError = errorMessage(error);
      }
      refresh();
      showControls();
    };
    toggle2.addEventListener("click", () => {
      void play();
    }, options);
    back.addEventListener("click", () => {
      seek(-10);
    }, options);
    forward.addEventListener("click", () => {
      seek(10);
    }, options);
    closeButton.addEventListener("click", close, options);
    video.addEventListener("click", () => {
      void play();
    }, options);
    still.addEventListener("click", () => {
      void play();
    }, options);
    root.addEventListener("pointermove", showControls, options);
    root.addEventListener("pointerdown", showControls, options);
    root.addEventListener("focusin", showControls, options);
    doc.addEventListener("keydown", (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
      if ((event.code === "Space" || event.code === "Enter") && event.target?.closest("button")) return;
      if (event.code === "Space" || event.code === "KeyK") {
        event.preventDefault();
        void play();
      } else if (event.code === "ArrowLeft" || event.code === "KeyJ") {
        event.preventDefault();
        seek(-10);
      } else if (event.code === "ArrowRight" || event.code === "KeyL") {
        event.preventDefault();
        seek(10);
      } else if (event.code === "Escape") {
        event.preventDefault();
        close();
      }
    }, options);
    for (const event of ["play", "pause", "ended", "timeupdate", "durationchange", "loadedmetadata", "waiting", "playing", "seeked"]) {
      source.addEventListener(event, refresh, options);
    }
    source.addEventListener("playing", showControls, options);
    refresh();
    showControls();
    return { video, still, refresh, dispose: () => {
      abort.abort();
      pip.clearTimeout(idleTimer);
      pip.clearTimeout(feedbackTimer);
      root.remove();
      style.remove();
    } };
  }

  // src/pip.ts
  function notify(message) {
    document.getElementById("better-mini-player-notice")?.remove();
    const host = document.createElement("div");
    host.id = "better-mini-player-notice";
    host.style.cssText = "position:fixed;right:24px;bottom:24px;z-index:2147483647;max-width:380px;";
    const shadow = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = ":host{all:initial}p{margin:0;padding:16px 20px;border:1px solid #ffffff25;border-radius:14px;background:#171b23;color:#f5f7fa;font:14px/1.5 system-ui;box-shadow:0 8px 32px #0005}";
    const text = document.createElement("p");
    text.setAttribute("role", "status");
    text.textContent = message;
    shadow.append(style, text);
    document.documentElement.append(host);
    window.setTimeout(() => {
      host.remove();
    }, 8e3);
  }
  var PipController = class {
    session;
    opening = false;
    async toggle() {
      if (this.session) {
        this.session.close();
        return { ok: true, state: "closed" };
      }
      if (this.opening) return { ok: false, message: "The mini-player is opening. Please wait a moment." };
      let pipWindow;
      let disposeSession;
      this.opening = true;
      try {
        const api = window.documentPictureInPicture;
        if (!api) throw new Error("Document Picture-in-Picture is unavailable. Update your desktop browser and enable Picture-in-Picture in its settings.");
        const source = findVideo(document);
        if (!source) throw new Error("Start a YouTube video, wait for it to load, then click the extension icon.");
        if (document.pictureInPictureElement) throw new Error("Close the browser\u2019s existing Picture-in-Picture window, then click this icon again.");
        const sourceUrl = source.currentSrc;
        const pageUrl = location.href;
        const aspect = source.videoWidth / source.videoHeight || 16 / 9;
        const height = Math.round(Math.min(480, Math.max(240, 480 / aspect)));
        const width = Math.round(Math.min(640, Math.max(240, height * aspect)));
        pipWindow = await api.requestWindow({ width, height });
        if (!source.isConnected || source.currentSrc !== sourceUrl || location.href !== pageUrl) {
          throw new Error("The video changed while opening. Click the extension icon again.");
        }
        const pip = pipWindow;
        let disposed = false;
        let mirror;
        let view;
        let monitor = 0;
        const abort = new AbortController();
        const cleanup = () => {
          if (disposed) return;
          disposed = true;
          abort.abort();
          pip.clearInterval(monitor);
          mirror?.dispose();
          view?.dispose();
          if (this.session?.window === pip) this.session = void 0;
        };
        const close = () => {
          cleanup();
          if (!pip.closed) pip.close();
        };
        disposeSession = close;
        const fail = (error) => {
          close();
          notify(errorMessage(error));
        };
        pip.addEventListener("pagehide", cleanup, { once: true, signal: abort.signal });
        window.addEventListener("pagehide", close, { once: true, signal: abort.signal });
        document.addEventListener("yt-navigate-start", close, { signal: abort.signal });
        source.addEventListener("emptied", close, { signal: abort.signal });
        source.addEventListener("error", () => {
          fail(new Error("YouTube could not play this video. Return to the tab to retry."));
        }, { signal: abort.signal });
        view = createPlayer(pip, source, close);
        mirror = new VideoMirror(source, view.video, view.still, fail);
        this.session = { window: pip, close };
        monitor = pip.setInterval(() => {
          const candidate = findVideo(document);
          if (pip.closed || !source.isConnected || source.currentSrc !== sourceUrl || location.href !== pageUrl || candidate !== null && candidate !== source) {
            close();
            return;
          }
          view?.refresh();
        }, 500);
        return { ok: true, state: "open" };
      } catch (error) {
        disposeSession?.();
        if (pipWindow && !pipWindow.closed) pipWindow.close();
        const message = errorMessage(error);
        notify(message);
        return { ok: false, message };
      } finally {
        this.opening = false;
      }
    }
  };

  // src/entry.ts
  var state = globalThis;
  function toggle() {
    state.__betterMiniPlayerV1 ??= new PipController();
    return state.__betterMiniPlayerV1.toggle();
  }
  return __toCommonJS(entry_exports);
})();
BetterMiniPlayer.toggle();
