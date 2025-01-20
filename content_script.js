// Detect Vue version and inject appropriate DevTools
async function detectAndInjectDevTools(vueInfo) {
  if (vueInfo.version === 2) {
    injectVue2DevTools();
  } else if (vueInfo.version === 3) {
    injectVue3DevTools(vueInfo);
  } else {
    showNotification('error', 'No Vue instance detected, please check your config');
  }
}

// Listen for messages from popup and background
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.type === 'ENABLE_VUE_DEVTOOLS') {
    detectAndInjectDevTools(message.vueInfo)
  }
  
  if (message.type === 'VUE_DETECTED') {
    if (message.success) {
      showDevToolsNotification();
    } else {
      showNotification('error', 'No Vue instance detected, please check your config');
    }
  }
});

// Inject Vue2 DevTools
function injectVue2DevTools() {
  try {
    // Use chrome.scripting API to inject into page environment
    chrome.runtime.sendMessage({ 
      type: 'INJECT_VUE2'
    });
  } catch (error) {
    console.error('Injection failed:', error);
    showNotification('error', 'Injection failed: ' + error.message);
  }
}

// Inject Vue3 DevTools
function injectVue3DevTools(vueInfo) {
  try {
    // Use chrome.scripting API to inject into page environment
    chrome.runtime.sendMessage({ 
        type: 'INJECT_VUE3',
        vueInfo
    });
  } catch (error) {
    console.error('Injection failed:', error);
    showNotification('error', 'Injection failed: ' + error.message);
  }
}

// Show DevTools notification
function showDevToolsNotification() {
  const devToolsOpen = window.__VUE_DEVTOOLS_GLOBAL_HOOK__ && 
                      window.__VUE_DEVTOOLS_GLOBAL_HOOK__.Vue

  showNotification('success', devToolsOpen ? 
    'Please reopen Chrome DevTools to enable Vue DevTools' : 
    'Please open Chrome DevTools to use Vue DevTools'
  )
}

// Show notification
function showNotification(type, message) {
  // Remove existing notification
  const existingNotification = document.getElementById('vue-devtools-notification')
  if (existingNotification) {
    existingNotification.remove()
  }

  // Create fixed position notification container
  const notification = document.createElement('div')
  notification.id = 'vue-devtools-notification'
  notification.style.cssText = `
    position: fixed;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    padding: 12px 24px;
    background: ${type === 'success' ? '#4CAF50' : '#f44336'};
    color: white;
    border-radius: 0 0 4px 4px;
    z-index: 9999;
    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    transition: opacity 0.3s ease-in-out;
    text-align: center;
    font-size: 14px;
    max-width: 90%;
    word-break: break-word;
  `
  notification.textContent = message

  // Add to page top
  document.body.appendChild(notification)
  
  // Fade out after 5 seconds
  setTimeout(() => {
    notification.style.opacity = '0'
    setTimeout(() => notification.remove(), 300)
  }, 5000)
}