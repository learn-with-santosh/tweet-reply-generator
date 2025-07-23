// Initialize the extension
document.addEventListener("DOMContentLoaded", () => {
  setupDarkMode();
  setupTabs();
  setupCharacterCounter();
  setupSliders();
  setupModelSelector();
  setupEventListeners();
  setupDefaultModelSelector();
  loadModelPreferences();

  // Load initial data
  if (shouldAutoLoadTweet()) {
    loadTweet();
  }
});

// ========================
// SETUP FUNCTIONS
// ========================
function setupDefaultModelSelector() {
  fetch("http://localhost:3001/models")
    .then(res => res.json())
    .then(models => {
      const selector = document.getElementById("defaultModel");
      selector.innerHTML = models.map(model => 
        `<option value="${model.name}">${model.name}</option>`
      ).join("");
      
      // Load saved preference
      const savedModel = localStorage.getItem("defaultModel");
      if (savedModel) selector.value = savedModel;
      
      // Save when changed
      selector.addEventListener("change", () => {
        localStorage.setItem("defaultModel", selector.value);
        showNotification("Default model saved", "success");
      });
    })
    .catch(err => {
      console.error("Error loading models:", err);
      document.getElementById("defaultModel").innerHTML = 
        '<option value="llama3.2:3b">llama3.2:3b</option>';
    });
}

// Load model preferences
function loadModelPreferences() {
  const rememberToggle = document.getElementById("rememberModelToggle");
  rememberToggle.checked = localStorage.getItem("rememberModel") !== "false";
  
  rememberToggle.addEventListener("change", (e) => {
    localStorage.setItem("rememberModel", e.target.checked);
  });
}

// Modify your existing model selection logic
function getSelectedModel() {
  const modelSelector = document.getElementById("modelSelector");
  const defaultModel = localStorage.getItem("defaultModel") || "llama3.2:3b";
  
  if (localStorage.getItem("rememberModel") === "false") {
    return defaultModel;
  }
  
  return modelSelector.value || defaultModel;
}

// Update your generateReplies function to use:
const model = getSelectedModel();

function setupDarkMode() {
  const isDarkMode = localStorage.getItem("darkMode") === "true";
  document.body.classList.toggle("dark-mode", isDarkMode);
  document
    .getElementById("darkModeToggle")
    .addEventListener("click", toggleDarkMode);
}

function setupTabs() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      // Update active tab
      document
        .querySelectorAll(".tab")
        .forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");

      // Show corresponding content
      document.querySelectorAll(".tab-content").forEach((content) => {
        content.classList.remove("active");
      });
      document.getElementById(`${tab.dataset.tab}Tab`).classList.add("active");

      // Load content if needed
      if (tab.dataset.tab === "saved") {
        loadSavedReplies();
      }
    });
  });
}

function setupCharacterCounter() {
  const textarea = document.getElementById("tweetText");
  textarea.addEventListener("input", updateCharCounter);
  updateCharCounter();
}

function updateCharCounter() {
  const text = document.getElementById("tweetText").value;
  const counter = document.getElementById("charCounter");
  counter.textContent = `${text.length}`;
  // counter.style.color = text.length > 250 ? "var(--danger-color)" :
  //                      text.length > 200 ? "var(--warning-color)" :
  //                      "var(--secondary-color)";
}

function setupSliders() {
  setupSlider("temperatureSlider", "temperatureValue");
  setupSlider("intensitySlider", "intensityValue");
}

function setupSlider(sliderId, valueId) {
  const slider = document.getElementById(sliderId);
  const value = document.getElementById(valueId);
  value.textContent = slider.value;
  slider.addEventListener("input", () => {
    value.textContent = slider.value;
  });
}

function setupModelSelector() {
  fetch("http://localhost:3001/models")
    .then(res => res.json())
    .then(models => {
      const selector = document.getElementById("modelSelector");
      selector.innerHTML = models.map(model => 
        `<option value="${model.name}">${model.name}</option>`
      ).join("");
      
      // Set initial selection based on preferences
      if (localStorage.getItem("rememberModel") !== "false") {
        const lastUsed = localStorage.getItem("lastUsedModel");
        if (lastUsed) selector.value = lastUsed;
      } else {
        selector.value = localStorage.getItem("defaultModel") || "llama3.2:3b";
      }
      
      // Save last used model when changed
      selector.addEventListener("change", () => {
        localStorage.setItem("lastUsedModel", selector.value);
      });
    })
    .catch(err => {
      console.error("Error loading models:", err);
      const defaultModel = localStorage.getItem("defaultModel") || "llama3.2:3b";
      document.getElementById("modelSelector").innerHTML = 
        `<option value="${defaultModel}">${defaultModel}</option>`;
    });
}
function setupEventListeners() {
  // Main buttons
  document.getElementById("loadTweet").addEventListener("click", loadTweet);
  document
    .getElementById("generate")
    .addEventListener("click", generateReplies);
  document
    .getElementById("quickReply")
    .addEventListener("click", quickReplyToTweet);

  // Settings toggles
  document.getElementById("autoLoadToggle").addEventListener("change", (e) => {
    localStorage.setItem("autoLoadTweet", e.target.checked);
  });

  document.getElementById("streamToggle").addEventListener("change", (e) => {
    localStorage.setItem("streamResponses", e.target.checked);
  });

  document.getElementById("emojiToggle").addEventListener("change", (e) => {
    localStorage.setItem("emojiToggle", e.target.checked);
  });

  document
    .getElementById("languageSelector")
    .addEventListener("change", (e) => {
      localStorage.setItem("replyLanguage", e.target.value);
    });
}

// ========================
// CORE FUNCTIONALITY
// ========================

function loadTweet() {
  showLoading(true, "Loading tweet...");
  document.getElementById("tweetText").value = "";

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) {
      showLoading(false);
      showNotification("No active tab found", "error");
      return;
    }

    chrome.scripting.executeScript(
      {
        target: { tabId: tabs[0].id },
        files: ["content.js"],
      },
      () => {
        chrome.tabs.sendMessage(
          tabs[0].id,
          { type: "GET_TWEET_TEXT" },
          (response) => {
            showLoading(false);
            if (chrome.runtime.lastError) {
              showNotification(
                "Failed to communicate with content script",
                "error"
              );
              return;
            }

            if (response?.text) {
              document.getElementById("tweetText").value = response.text;
              updateCharCounter();
            } else {
              showNotification("No tweet detected on this page", "warning");
            }
          }
        );
      }
    );
  });
}

async function generateReplies() {
  const tweetText = document.getElementById("tweetText").value.trim();
  if (!tweetText) {
    showNotification("Please enter tweet text", "error");
    return;
  }

  const model = document.getElementById("modelSelector").value;
  if (!model) {
    showNotification("Please select a model", "error");
    return;
  }

  showLoading(true);
  document.getElementById("generate").disabled = true;
  document.getElementById("replies").innerHTML = "";

  try {
    const response = await fetch("http://localhost:3001/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt: generateCleanPrompt(tweetText),
        stream: shouldStreamResponses(),
        temperature: parseFloat(
          document.getElementById("temperatureSlider").value
        ),
      }),
    });

    if (shouldStreamResponses()) {
      await processStreamedResponse(response);
    } else {
      const data = await response.json();
      const cleanReplies = extractCleanReplies(data.response);

      displayGeneratedReplies(cleanReplies);

      // displayGeneratedReplies(data.response);
    }

    document.getElementById("quickReply").style.display = "flex";
    showNotification("Replies generated successfully", "success");
  } catch (err) {
    console.error("Generation error:", err);
    showNotification("Failed to generate replies. Is Ollama running?", "error");
  } finally {
    showLoading(false);
    document.getElementById("generate").disabled = false;
  }
}

function generateCleanPrompt(tweetText) {
  const style = document.getElementById("styleSelector").value;
  const intensity = document.getElementById("intensitySlider").value;
  const includeEmojis = document.getElementById("emojiToggle").checked;
  const language = document.getElementById("languageSelector").value;

  const stylePrompts = {
    funny: `Write 3 funny Twitter replies (1 sentence each)${
      includeEmojis ? " with relevant emojis" : ""
    }`,
    professional: `Write 3 professional Twitter replies (1-2 sentences each) in ${language}`,
    casual: `Write 3 casual Twitter replies like you're talking to a friend${
      includeEmojis ? " with some emojis" : ""
    }`,
    sarcastic: `Write 3 sarcastic but humorous Twitter replies (keep them clever not mean)`,
    motivational: `Write 3 motivational Twitter replies that inspire positivity in ${language}`,
  };

  return `Generate exactly 3 Twitter replies to this tweet:\n"${tweetText}"\n\nRequirements:\n- ${stylePrompts[style]}\n- Number them (1. 2. 3.)\n- No additional commentary\n\nReplies:`;
}

function extractCleanReplies(rawResponse) {
  return rawResponse
    .split("\n")
    .filter((line) => line.trim())
    .slice(0, 3) // Take only first 3 replies
    .map((line) =>
      line
        .replace(/^\d+\.\s*/, "")
        .replace(/"/g, "")
        .trim()
    );
}

function displayGeneratedReplies(replies) {
  const container = document.getElementById("replies");
  container.innerHTML = "";

  replies.forEach((reply, index) => {
    const replyDiv = document.createElement("div");
    replyDiv.className = "reply";
    replyDiv.innerHTML = `
      <div class="reply-text">${reply}</div>
      <div class="reply-actions">
        <button class="reply-btn copy" title="Copy">📋</button>
        <button class="reply-btn quick-reply" title="Quick Reply">🚀</button>
        <button class="reply-btn save" title="Save">💾</button>
        <button class="reply-btn emoji" title="Add Emoji">😀</button>
      </div>
    `;

    // Copy button
    replyDiv.querySelector(".copy").addEventListener("click", () => {
      navigator.clipboard.writeText(reply)
        .then(() => showNotification("Copied to clipboard!", "success"))
        .catch(() => showNotification("Failed to copy", "error"));
    });

    // Quick Reply button
    replyDiv.querySelector(".quick-reply").addEventListener("click", () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            func: (text) => {
              const replyBox = document.querySelector('[data-testid="tweetTextarea_0"]');
              if (replyBox) {
                replyBox.focus();
                document.execCommand('insertText', false, text);
              }
            },
            args: [reply]
          });
          showNotification("Reply inserted into Twitter!", "success");
        }
      });
    });

    // Save button
    replyDiv.querySelector(".save").addEventListener("click", () => {
      const savedReplies = JSON.parse(localStorage.getItem("savedReplies") || "[]");
      savedReplies.push({
        text: reply,
        timestamp: new Date().toISOString()
      });
      localStorage.setItem("savedReplies", JSON.stringify(savedReplies));
      showNotification("Reply saved to templates!", "success");
    });

    // Emoji button
    replyDiv.querySelector(".emoji").addEventListener("click", (e) => {
      e.stopPropagation();
      showNotification("Emoji picker coming soon", "warning");
      // Implementation would go here
    });

    container.appendChild(replyDiv);
  });
}

function saveReplyToTemplates(replyText) {
      const savedReplies = JSON.parse(localStorage.getItem("savedReplies") || "[]");
      savedReplies.push({
        text: replyText,
        timestamp: new Date().toISOString()
      });
      
      localStorage.setItem("savedReplies", JSON.stringify(savedReplies));
      showNotification("Reply saved to templates", "success");
      loadSavedReplies();
    }
async function processStreamedResponse(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullResponse = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    fullResponse += chunk;

    // Process the chunk and update UI incrementally
    const replies = parseStreamedReplies(fullResponse);
    displayGeneratedReplies(replies.join("\n"));
  }
}

function parseStreamedReplies(text) {
  return text
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => line.replace(/^\d+\.\s*/, "").trim())
    .filter((line) => line.length > 0);
}

// function displayGeneratedReplies(rawResponse) {
//   const container = document.getElementById("replies");
//   const replies = rawResponse.split(/\n+/)
//     .filter(line => line.trim())
//     .map(line => line.replace(/^\d+\.\s*/, "").trim());

//   container.innerHTML = "";

//   replies.forEach((reply, index) => {
//     const replyDiv = document.createElement("div");
//     replyDiv.className = "reply";
//     replyDiv.innerHTML = `
//       <div class="reply-text">${reply}</div>
//       <div class="reply-actions">
//         <button class="reply-btn copy" title="Copy">📋</button>
//         <button class="reply-btn save" title="Save">💾</button>
//         <button class="reply-btn emoji" title="Add Emoji">😀</button>
//       </div>
//     `;

//     // Set up event listeners
//     replyDiv.querySelector(".copy").addEventListener("click", () => {
//       copyToClipboard(reply);
//     });

//     replyDiv.querySelector(".save").addEventListener("click", () => {
//       saveReplyToTemplates(reply);
//     });

//     replyDiv.querySelector(".emoji").addEventListener("click", (e) => {
//       // Emoji picker would be implemented here
//       showNotification("Emoji picker coming soon", "warning");
//     });

//     container.appendChild(replyDiv);
//   });
// }

function quickReplyToTweet() {
  const firstReply = document.querySelector(".reply");
  if (!firstReply) {
    showNotification("No replies to use", "warning");
    return;
  }

  const replyText = firstReply.querySelector(".reply-text").textContent;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;

    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      func: (text) => {
        const replyBox = document.querySelector(
          '[data-testid="tweetTextarea_0"]'
        );
        if (replyBox) {
          replyBox.focus();
          document.execCommand("insertText", false, text);
        }
      },
      args: [replyText],
    });
    showNotification("Reply inserted into Twitter", "success");
  });
}

// ========================
// SAVED REPLIES
// ========================

function loadSavedReplies() {
  const savedReplies = JSON.parse(localStorage.getItem("savedReplies") || "[]");
  const container = document.getElementById("savedRepliesList");

  if (savedReplies.length === 0) {
    container.innerHTML = `<div style="padding: 16px; text-align: center; color: var(--secondary-color);">No saved replies yet</div>`;
    return;
  }

  container.innerHTML = savedReplies
    .map(
      (reply, index) => `
        <div class="reply">
          <div class="reply-text">${reply.text}</div>
          <div class="reply-actions">
            <button class="reply-btn copy" data-index="${index}" title="Copy">📋</button>
            <button class="reply-btn" data-index="${index}" title="Use" style="color: var(--success-color);">✏️</button>
            <button class="reply-btn" data-index="${index}" title="Delete" style="color: var(--danger-color);">🗑️</button>
          </div>
          <div style="font-size: 11px; color: var(--secondary-color); margin-top: 4px;">
            Saved ${new Date(reply.timestamp).toLocaleString()}
          </div>
        </div>
      `
    )
    .join("");

  // Add event listeners
  container.querySelectorAll(".reply-btn.copy").forEach((btn) => {
    btn.addEventListener("click", () => {
      const index = btn.dataset.index;
      const reply = savedReplies[index].text;
      copyToClipboard(reply);
    });
  });

  container.querySelectorAll(".reply-btn:not(.copy)").forEach((btn) => {
    btn.addEventListener("click", () => {
      const index = btn.dataset.index;
      if (btn.textContent === "✏️") {
        // Use this reply
        document.getElementById("tweetText").value = savedReplies[index].text;
        updateCharCounter();
        document.querySelector('.tab[data-tab="generate"]').click();
      } else {
        // Delete this reply
        if (confirm("Delete this saved reply?")) {
          savedReplies.splice(index, 1);
          localStorage.setItem("savedReplies", JSON.stringify(savedReplies));
          loadSavedReplies();
          showNotification("Reply deleted", "success");
        }
      }
    });
  });
}

function saveReplyToTemplates(replyText) {
  const savedReplies = JSON.parse(localStorage.getItem("savedReplies") || "[]");
  savedReplies.push({
    text: replyText,
    timestamp: new Date().toISOString(),
  });

  localStorage.setItem("savedReplies", JSON.stringify(savedReplies));
  showNotification("Reply saved to templates", "success");
  loadSavedReplies();
}

// ========================
// UTILITY FUNCTIONS
// ========================

function toggleDarkMode() {
  const isDarkMode = document.body.classList.toggle("dark-mode");
  localStorage.setItem("darkMode", isDarkMode);
}

function showLoading(show, message = "Generating replies...") {
  const loader = document.getElementById("loadingIndicator");
  loader.style.display = show ? "block" : "none";
  if (message) loader.querySelector("div:nth-child(2)").textContent = message;
}

function showNotification(message, type = "info") {
  const notification = document.getElementById("notification");
  notification.textContent = message;
  notification.className = `notification ${type} show`;

  setTimeout(() => {
    notification.classList.remove("show");
  }, 3000);
}

function copyToClipboard(text) {
  navigator.clipboard
    .writeText(text)
    .then(() => showNotification("Copied to clipboard", "success"))
    .catch(() => showNotification("Failed to copy", "error"));
}

function shouldAutoLoadTweet() {
  return localStorage.getItem("autoLoadTweet") !== "false";
}

function shouldStreamResponses() {
  return localStorage.getItem("streamResponses") !== "false";
}
