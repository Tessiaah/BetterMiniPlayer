"use strict";
(() => {
  // src/background.ts
  var title = "Better Mini Player \u2014 pop out this YouTube video";
  async function report(tabId, message) {
    await Promise.allSettled([
      chrome.action.setBadgeText({ tabId, text: message ? "!" : "" }),
      chrome.action.setBadgeBackgroundColor({ tabId, color: "#c74646" }),
      chrome.action.setTitle({ tabId, title: message ? `Better Mini Player: ${message}` : title })
    ]);
  }
  chrome.action.onClicked.addListener((tab) => {
    if (tab.id === void 0) return;
    const tabId = tab.id;
    let url;
    try {
      url = new URL(tab.url ?? "");
    } catch {
      void report(tabId, "Open a YouTube video first.");
      return;
    }
    if (url.protocol !== "https:" || !["www.youtube.com", "youtube.com", "m.youtube.com"].includes(url.hostname)) {
      void report(tabId, "Open a video on youtube.com first.");
      return;
    }
    void chrome.scripting.executeScript({
      target: { tabId },
      world: "ISOLATED",
      files: ["player.js"],
      injectImmediately: true
    }).then((results) => {
      const result = results[0]?.result;
      return report(tabId, result?.ok ? void 0 : result?.message ?? "Reload this YouTube tab and try again.");
    }).catch(() => report(tabId, "Could not access this tab. Reload it, then click the icon again."));
  });
})();
