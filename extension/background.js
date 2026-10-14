/* global browser */
browser.action.onClicked.addListener(async (tab) => {
  try {
    if (!tab.id || !/^https:\/\/www\.youtube\.com\/(?:\?.*)?$/.test(tab.url || "")) {
      throw new Error("Open the desktop YouTube homepage, then click this icon again.");
    }
    await browser.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
    await browser.action.setBadgeText({ tabId: tab.id, text: "" });
    await browser.action.setTitle({ tabId: tab.id, title: "Test a YouTube thumbnail" });
  } catch (error) {
    await browser.action.setBadgeBackgroundColor({ tabId: tab.id, color: "#b42318" });
    await browser.action.setBadgeText({ tabId: tab.id, text: "!" });
    await browser.action.setTitle({ tabId: tab.id, title: error.message || "Could not open the tester. Reload the page and try again." });
    await browser.action.setPopup({ tabId: tab.id, popup: "error.html" });
    try { await browser.action.openPopup(); } catch (_) { /* Badge and tooltip remain available. */ }
    await browser.action.setPopup({ tabId: tab.id, popup: "" });
  }
});
