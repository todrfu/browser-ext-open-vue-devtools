// Store Vue version info for tabs
const tabVueVersions = new Map();

/**
 * Detect Vue version
 * @returns {Object} - Vue info
 */
function detectVueVersion() {
  function getSelector(element) {
    if (!(element instanceof Element)) {
      return null;
    }

    let selector = element.tagName.toLowerCase();

    if (element.id) {
      selector += `#${element.id}`;
      return selector;
    }

    if (element.className) {
      selector += `.${Array.from(element.classList).join(".")}`;
    }

    let parent = element.parentElement;
    while (parent) {
      const parentSelector = parent.tagName.toLowerCase();
      if (parent.id) {
        selector = `${parentSelector}#${parent.id} > ${selector}`;
        return selector;
      } else {
        selector = `${parentSelector} > ${selector}`;
      }
      parent = parent.parentElement;
    }

    return selector;
  }

  return (function () {
    // detect vue2
    let isVue2 = false;
    let isVue3 = false;
    const walker = document.createTreeWalker(document.body, 1);
    let node;
    while ((node = walker.nextNode())) {
      if (node.__vue__) {
        isVue2 = true;
        break;
      }
      if (node.__vue_app__) {
        isVue3 = true;
        break;
      }
    }

    if (isVue2) {
      let version = window.Vue?.version;
      if (!version) {
        version = node.__vue__?.constructor.version;
      }
      return {
        version: version || "2.x",
        root: getSelector(node),
      };
    }

    if (isVue3) {
      return { version: node.__vue_app__.version, root: getSelector(node) };
    }

    return { version: "0" };
  })();
}

/**
 * Set icon state
 * @param {number} tabId
 * @param {boolean} isEnabled - Whether the icon is enabled
 */
function setIconState(tabId, isEnabled) {
  chrome.action.setIcon({
    tabId: tabId,
    path: {
      16: `/icons/${isEnabled ? "enabled" : "disabled"}_16.png`,
      32: `/icons/${isEnabled ? "enabled" : "disabled"}_32.png`,
      48: `/icons/${isEnabled ? "enabled" : "disabled"}_48.png`,
      128: `/icons/${isEnabled ? "enabled" : "disabled"}_128.png`,
    },
  });
}

/**
 * Detect Vue version in tab and update icon
 * @param {number} tabId
 */
async function detectAndUpdateTab(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: detectVueVersion,
      world: "MAIN",
    });

    const vueInfo = results?.[0]?.result || { version: "0" };
    tabVueVersions.set(tabId, vueInfo);

    // Update icon state
    setIconState(tabId, vueInfo.version > "0");

    return vueInfo;
  } catch (error) {
    console.error("Vue detection failed:", error);
    tabVueVersions.set(tabId, { version: "0" });
    setIconState(tabId, false);
    return { version: "0" };
  }
}

/**
 * Vue2 injection function
 * @returns {boolean} - Whether the injection is successful
 */
function injectVue2() {
  return (function () {
    var Vue, walker, node;
    walker = document.createTreeWalker(document.body, 1);
    while ((node = walker.nextNode())) {
      if (node.__vue__) {
        Vue = node.__vue__.$options._base;
        if (!Vue || !Vue.config) {
          return false;
        }
        // Forcefully reset Vue.config.devtools to true
        Vue.config.devtools = true;
        if (window.__VUE_DEVTOOLS_GLOBAL_HOOK__) {
          // Avoid the problem that vue-devtools cannot be enabled when Vue.config.devtools=true
          window.__VUE_DEVTOOLS_GLOBAL_HOOK__.emit("init", Vue);
          console.log("Vue2 DevTools enabled");
          return true;
        }
        console.error("Vue DevTools hook not found");
        return true;
      }
    }
    return false;
  })();
}

/**
 * Vue3 injection function
 * @param {Object} vueInfo
 * @returns {boolean} - Whether the injection is successful
 */
function injectVue3(vueInfo) {
  return (function () {
    const el = document.querySelector(vueInfo.root);
    if (el && el.__vue_app__) {
      const vm = el.__vue_app__;
      const hook = window.__VUE_DEVTOOLS_GLOBAL_HOOK__;

      if (!hook) {
        console.error("Vue DevTools hook not found");
        return false;
      }

      try {
        // Set required properties
        hook.enabled = true;

        // Register app
        if (Array.isArray(hook.apps)) {
          // Check if already registered
          const isRegistered = hook.apps.some((app) => app === vm);
          if (!isRegistered) {
            hook.apps.push({
              app: vm,
              version: vm.version,
              types: {
                Comment: Symbol("Comment"),
                Fragment: Symbol("Fragment"),
                Static: Symbol("Static"),
                Text: Symbol("Text"),
              },
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
          Static: Symbol("Static"),
        });

        return true;
      } catch (error) {
        console.error("Vue3 DevTools initialization failed:", error);
        return false;
      }
    }
    return false;
  })();
}

/**
 * Execute inject script
 * @param {Function} injectFunc - Inject function
 * @param {number} tabId
 * @param {Object} vueInfo
 */
function executeInjectScript(injectFunc, tabId, vueInfo) {
  chrome.scripting
    .executeScript({
      target: { tabId: tabId },
      func: injectFunc,
      args: vueInfo ? [vueInfo] : [],
      world: "MAIN", // Execute in page's main world
    })
    .then((results) => {
      const success = results?.[0]?.result;
      chrome.tabs.sendMessage(tabId, {
        type: "VUE_INJECTED",
        success: !!success,
      });
    })
    .catch((error) => {
      console.error("Script injection failed:", error);
      chrome.tabs.sendMessage(tabId, {
        type: "VUE_INJECTED",
        success: false,
        error: error.message,
      });
    });
}

/**
 * Get tab Vue info
 * @param {Object} message
 * @param {Function} sendResponse
 */
function getTabVueInfo(message, sendResponse) {
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

/**
 * Listen for tab updates
 * @param {number} tabId
 * @param {Object} changeInfo - Change info
 * @param {Object} tab
 */
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url?.startsWith("http")) {
    detectAndUpdateTab(tabId);
  }
});

/**
 * Listen for tab activation
 * @param {Object} tab
 */
chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId, (tab) => {
    if (tab.url?.startsWith("http")) {
      detectAndUpdateTab(tabId);
    }
  });
});

/**
 * Listen for tab removal
 * @param {number} tabId
 */
chrome.tabs.onRemoved.addListener((tabId) => {
  tabVueVersions.delete(tabId);
});

/**
 * Listen for messages from content script and popup
 * @param {Object} message
 * @param {Object} sender
 * @param {Function} sendResponse
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { tabId = sender.tab?.id, type, vueInfo } = message;

  if (!tabId) {
    console.error("Unable to get tabId");
    return;
  }

  if (type === "GET_VUE_VERSION") {
    getTabVueInfo(message, sendResponse);
    return;
  }

  if (type === "INJECT_VUE2") {
    executeInjectScript(injectVue2, tabId, vueInfo);
    return;
  }

  if (type === "INJECT_VUE3") {
    executeInjectScript(injectVue3, tabId, vueInfo);
  }
});
