/* global browser */
const HOMEPAGE = "https://www.youtube.com/";
const busyWindows = new Set();
function isHomepage(url) {
  try { const page = new URL(url); return page.origin === "https://www.youtube.com" && page.pathname === "/"; }
  catch (_) { return false; }
}
function waitForHomepage(tabId) {
  return new Promise((resolve, reject) => {
    const finish = (error, tab) => {
      clearTimeout(timer);
      browser.tabs.onUpdated.removeListener(updated);
      browser.tabs.onRemoved.removeListener(removed);
      if (error) reject(error); else resolve(tab);
    };
    const inspect = tab => {
      if (tab.status !== "complete") return;
      if (!isHomepage(tab.url)) finish(new Error("The tab left the YouTube homepage. Open YouTube Home and try again."));
      else finish(null, tab);
    };
    const updated = (id, change, tab) => { if (id === tabId && change.status === "complete") inspect(tab); };
    const removed = id => { if (id === tabId) finish(new Error("The YouTube tab was closed before the tester could open.")); };
    const timer = setTimeout(() => finish(new Error("YouTube is taking too long to load. When it finishes, click the tester again.")), 30000);
    browser.tabs.onUpdated.addListener(updated);
    browser.tabs.onRemoved.addListener(removed);
    browser.tabs.get(tabId).then(inspect, error => finish(error));
  });
}
browser.action.onClicked.addListener(async (tab) => {
  const windowId = tab.windowId;
  if (busyWindows.has(windowId)) return;
  busyWindows.add(windowId);
  let target = tab;
  try {
    const navigate = !isHomepage(tab.url);
    if (navigate) {
      const youtubeTabs = await browser.tabs.query({ url: "https://www.youtube.com/*" });
      const homeTabs = youtubeTabs.filter(candidate => isHomepage(candidate.url));
      const existing = homeTabs.find(candidate => candidate.windowId === windowId) || homeTabs[0];
      target = existing
        ? await browser.tabs.update(existing.id, { active: true })
        : await browser.tabs.create({ url: HOMEPAGE, active: true, windowId });
      if (target.windowId !== windowId) await browser.windows.update(target.windowId, { focused: true });
    }
    if (!target.id) throw new Error("Could not find a tab for the tester. Open YouTube and try again.");
    target = await waitForHomepage(target.id);
    // Switching tabs must reveal an existing tester without toggling it off.
    const results = navigate ? await browser.scripting.executeScript({ target: { tabId: target.id }, func: () => Boolean(globalThis.__ytThumbnailTester) }) : [];
    if (!results.some(result => result.result)) await browser.scripting.executeScript({ target: { tabId: target.id }, files: ["content.js"] });
    await browser.action.setBadgeText({ tabId: target.id, text: "" });
    await browser.action.setTitle({ tabId: target.id, title: "Test a YouTube thumbnail" });
    if (navigate && tab.id) {
      await browser.action.setBadgeText({ tabId: tab.id, text: "" });
      await browser.action.setTitle({ tabId: tab.id, title: "Test a YouTube thumbnail" });
    }
  } catch (error) {
    const targetExists = target.id ? await browser.tabs.get(target.id).catch(() => null) : null;
    const tabId = targetExists ? target.id : tab.id;
    try {
      await browser.action.setBadgeBackgroundColor({ tabId, color: "#b42318" });
      await browser.action.setBadgeText({ tabId, text: "!" });
      await browser.action.setTitle({ tabId, title: error.message || "Could not open the tester. Reload the page and try again." });
      await browser.action.setPopup({ tabId, popup: "error.html" });
      try { await browser.action.openPopup(); } catch (_) { /* Badge and tooltip remain available. */ }
      await browser.action.setPopup({ tabId, popup: "" });
    } catch (_) { /* Both tabs may have closed while the request was pending. */ }
  } finally { busyWindows.delete(windowId); }
});
