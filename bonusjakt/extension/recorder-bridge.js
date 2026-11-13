// Relays recorded answers from the page to the extension, but only while recording is switched on.
window.addEventListener("message", async (e) => {
  if (e.source !== window || !e.data || !e.data.__bonusjakt_rec) return;
  const { recording } = await chrome.storage.local.get("recording");
  if (!recording) return;
  const { url, method, body, status, response } = e.data;
  chrome.runtime.sendMessage({ type: "recorded", entry: { url, method, body, status, response, at: new Date().toISOString() } });
});
