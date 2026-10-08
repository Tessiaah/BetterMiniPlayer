import type { ToggleResult } from './types';
const title = 'Better Mini Player — pop out this YouTube video';

async function report(tabId: number, message?: string): Promise<void> {
  // A tab may disappear while a request is in flight.
  await Promise.allSettled([
    chrome.action.setBadgeText({ tabId, text: message ? '!' : '' }),
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#c74646' }),
    chrome.action.setTitle({ tabId, title: message ? `Better Mini Player: ${message}` : title }),
  ]);
}

chrome.action.onClicked.addListener((tab) => {
  if (tab.id === undefined) return;
  const tabId = tab.id;
  let url: URL;
  try { url = new URL(tab.url ?? ''); }
  catch { void report(tabId, 'Open a YouTube video first.'); return; }
  if (url.protocol !== 'https:' || !['www.youtube.com', 'youtube.com', 'm.youtube.com'].includes(url.hostname)) {
    void report(tabId, 'Open a video on youtube.com first.');
    return;
  }
  // Inject directly from the toolbar event, before any awaited work. Chromium
  // propagates this user gesture to the injected script.
  void chrome.scripting.executeScript({
    target: { tabId }, world: 'ISOLATED', files: ['player.js'], injectImmediately: true,
  }).then((results) => {
    const result = results[0]?.result as ToggleResult | undefined;
    return report(tabId, result?.ok ? undefined : result?.message ?? 'Reload this YouTube tab and try again.');
  }).catch(() => report(tabId, 'Could not access this tab. Reload it, then click the icon again.'));
});
