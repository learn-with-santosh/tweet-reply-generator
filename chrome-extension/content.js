(() => {
  let tweetText = "";

  // Try to find the tweet text element
  const tweetContainer = document.querySelector("article div[lang]");
  if (tweetContainer) {
    tweetText = tweetContainer.innerText.trim();
  }

  let lastTweetText = "";

  // Helper to get tweet text
  function extractTweetText() {
    const el = document.querySelector('article [data-testid="tweetText"]');
    return el ? el.innerText.trim() : "";
  }

  // Watch for changes
  const observer = new MutationObserver(() => {
    const text = extractTweetText();
    if (text && text !== lastTweetText) {
      lastTweetText = text;
    }
  });

  // Start observing
  observer.observe(document.body, { childList: true, subtree: true });

  // Send the tweet text to the popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "GET_TWEET_TEXT") {
      const current = extractTweetText();

      sendResponse({ text: current });
    }
  });
})();
