// Store Vue version info for tabs
const tabVueVersions = new Map();

// Function to detect Vue version
function detectVueVersion() {
  return (function() {
    // Detect Vue2
    const hasVue2 = Array.from(document.querySelectorAll('*')).some(el => el.__vue__);
    if (hasVue2) return { version: 2 };
    
    // Detect Vue3
    const hasVue3 = Array.from(document.querySelectorAll('*')).some(el => el.__vue_app__);
    if (hasVue3) return { version: 3 };
    
    return { version: 0 };
  })();
}

// Set icon state
function setIconState(tabId, isEnabled) {
    chrome.action.setIcon({
      tabId: tabId,
      path: {
        "16": `/icons/${isEnabled ? 'enabled' : 'disabled'}_16.png`,
        "32": `/icons/${isEnabled ? 'enabled' : 'disabled'}_32.png`,
        "48": `/icons/${isEnabled ? 'enabled' : 'disabled'}_48.png`,
        "128": `/icons/${isEnabled ? 'enabled' : 'disabled'}_128.png`
      }
    });
}
  
// Detect Vue version in tab and update icon
async function detectAndUpdateTab(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: detectVueVersion,
      world: "MAIN"
    });
    
    const vueInfo = results?.[0]?.result || { version: 0 };
    tabVueVersions.set(tabId, vueInfo);
    
    // Update icon state
    setIconState(tabId, vueInfo.version > 0);
    
    return vueInfo;
  } catch (error) {
    console.error('Vue detection failed:', error);
    tabVueVersions.set(tabId, { version: 0 });
    setIconState(tabId, false);
    return { version: 0 };
  }
}

// Listen for tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.startsWith('http')) {
    detectAndUpdateTab(tabId);
  }
});

// Listen for tab activation
chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId, tab => {
    if (tab.url?.startsWith('http')) {
      detectAndUpdateTab(tabId);
    }
  });
});

// Listen for tab removal
chrome.tabs.onRemoved.addListener((tabId) => {
  tabVueVersions.delete(tabId);
});

// Listen for messages from content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;
  
  if (message.type === 'GET_VUE_VERSION') {
    if (tabId) {
      // Return cached version info if available
      if (tabVueVersions.has(tabId)) {
        sendResponse(tabVueVersions.get(tabId));
        return true;
      }
      // Otherwise detect again
      detectAndUpdateTab(tabId).then(sendResponse);
      return true;
    }
    // Handle request from popup
    const activeTabId = message.tabId;
    if (activeTabId) {
      if (tabVueVersions.has(activeTabId)) {
        sendResponse(tabVueVersions.get(activeTabId));
        return true;
      }
      detectAndUpdateTab(activeTabId).then(sendResponse);
      return true;
    }
  }

  console.log("Received message:", message, "from:", sender);

  if (!tabId) {
    console.error("Unable to get tabId");
    return;
  }

  if (message.type === "INJECT_VUE2") {
    chrome.scripting
      .executeScript({
        target: { tabId: tabId },
        func: injectVue2,
        world: "MAIN", // Execute in page's main world
      })
      .then((results) => {
        const success = results?.[0]?.result;
        chrome.tabs.sendMessage(tabId, {
          type: "VUE_DETECTED",
          success: !!success,
        });
      })
      .catch((error) => {
        console.error("Script injection failed:", error);
        chrome.tabs.sendMessage(tabId, {
          type: "VUE_DETECTED",
          success: false,
          error: error.message,
        });
      });
  }

  if (message.type === "INJECT_VUE3") {
    chrome.scripting
      .executeScript({
        target: { tabId: tabId },
        func: injectVue3,
        args: [message.selector],
        world: "MAIN", // Execute in page's main world
      })
      .then((results) => {
        const success = results?.[0]?.result;
        chrome.tabs.sendMessage(tabId, {
          type: "VUE_DETECTED",
          success: !!success,
        });
      })
      .catch((error) => {
        console.error("Script injection failed:", error);
        chrome.tabs.sendMessage(tabId, {
          type: "VUE_DETECTED",
          success: false,
          error: error.message,
        });
      });
  }

  return true;
});

// Vue2 injection function
function injectVue2() {
  return (function() {
    var Vue, walker, node;
    walker = document.createTreeWalker(document.body, 1);
    while ((node = walker.nextNode())) {
      if (node.__vue__) {
        Vue = node.__vue__.$options._base;
        if (!Vue || !Vue.config) {
            return false;
        }
        /**
         * Forcefully reset Vue.config.devtools to true
         * Avoid the problem that vue-devtools cannot be enabled when Vue.config.devtools=true
         */
        Vue.config.devtools = true;
        if (window.__VUE_DEVTOOLS_GLOBAL_HOOK__) {
          window.__VUE_DEVTOOLS_GLOBAL_HOOK__.emit("init", Vue);
          return true;
        }
        console.log("Vue2 DevTools enabled");
        return true;
      }
    }
    return false;
  })();
}

// Vue3 injection function
function injectVue3(selector) {
  return (function() {
    const el = document.querySelector(selector);
    if (el && el.__vue_app__) {
      const vm = el.__vue_app__;

      // Ensure hook exists
      if (!window.__VUE_DEVTOOLS_GLOBAL_HOOK__) {
        console.error("Vue DevTools hook not found");
        return false;
      }

      try {
        // Set required properties
        const hook = window.__VUE_DEVTOOLS_GLOBAL_HOOK__;
        hook.enabled = true;

        // Register app
        if (Array.isArray(hook.apps)) {
          // Check if already registered
          const isRegistered = hook.apps.some(app => app === vm);
          if (!isRegistered) {
            hook.apps.push({
              app: vm,
              version: vm.version,
              types: {
                Comment: Symbol("Comment"),
                Fragment: Symbol("Fragment"),
                Static: Symbol("Static"),
                Text: Symbol("Text"),
              }
            });
          }
        }

        // Initialize devtools
        if (vm.config) {
          vm.config.devtools = true;
        }

        // Send init event
        hook.emit("app:init", vm, vm.version, {
          Fragment: Symbol("Fragment"),
          Text: Symbol("Text"),
          Comment: Symbol("Comment"),
          Static: Symbol("Static")
        });

        console.log("Vue3 DevTools enabled");
        return true;
      } catch (error) {
        console.error("Vue3 DevTools initialization failed:", error);
        return false;
      }
    }
    return false;
  })();
}
