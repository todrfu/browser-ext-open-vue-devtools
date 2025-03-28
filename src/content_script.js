/**
 * Detect Vue version and inject DevTools
 * @param {Object} vueInfo
 */
function injectDevTools(vueInfo) {
  if (vueInfo.version >= '3.0') {
    injectVue3DevTools(vueInfo);
  } else if (vueInfo.version >= '2.0') {
    injectVue2DevTools();
  } else {
    showNotification('error', 'No vue version detected');
  }
}

/**
 * Inject Vue2 DevTools
 */
function injectVue2DevTools() {
  try {
    chrome.runtime.sendMessage({ 
      type: 'INJECT_VUE2'
    });
  } catch (error) {
    console.error('Injection failed:', error);
    showNotification('error', 'Injection failed: ' + error.message);
  }
}

/**
 * Inject Vue3 DevTools
 * @param {Object} vueInfo
 */
function injectVue3DevTools(vueInfo) {
  try {
    chrome.runtime.sendMessage({ 
        type: 'INJECT_VUE3',
        vueInfo
    });
  } catch (error) {
    console.error('Injection failed:', error);
    showNotification('error', 'Injection failed: ' + error.message);
  }
}

/**
 * Show DevTools notification
 */
function showDevToolsNotification() {
  showNotification('success', 'Please open Chrome DevTools to use Vue DevTools')
}

/**
 * Show notification
 * @param {string} type - Notification type
 * @param {string} message - Notification message
 */
function showNotification(type, message) {
  const existingNotification = document.getElementById('vue-devtools-notification')
  if (existingNotification) {
    existingNotification.remove()
  }

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

  document.body.appendChild(notification)
  
  setTimeout(() => {
    notification.style.opacity = '0'
    setTimeout(() => notification.remove(), 300)
  }, 5000)
}

/**
 * Listen for messages from popup and background
 * @param {Object} message
 * @param {Object} sender
 * @param {Function} sendResponse
 */
chrome.runtime.onMessage.addListener(async (message) => {
  if (message.type === 'ENABLE_VUE_DEVTOOLS') {
    injectDevTools(message.vueInfo)
    return
  }
  
  if (message.type === 'VUE_INJECTED') {
    if (message.success) {
      showDevToolsNotification();
    } else {
      showNotification('error', 'Injection failed');
    }
  }
});
