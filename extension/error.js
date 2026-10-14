/* global browser */
(async () => {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  document.getElementById("message").textContent = await browser.action.getTitle({ tabId: tab.id });
})();
