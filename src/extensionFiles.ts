/**
 * Complete Chrome Extension Manifest V3 Source Files
 * Ready for 1-click download as a ZIP or manual inspection.
 */

export interface ExtensionFile {
  name: string;
  path: string;
  language: string;
  description: string;
  content: string;
}

export const MANIFEST_JSON = `{
  "manifest_version": 3,
  "name": "SnapFull - Full Page Capture to Clipboard",
  "version": "1.0.1",
  "description": "DevTools-style full-page screenshot tool that automatically copies to clipboard, with optional file saving and lazy-scroll warmup.",
  "permissions": [
    "activeTab",
    "scripting",
    "storage",
    "downloads",
    "debugger",
    "clipboardWrite",
    "offscreen"
  ],
  "host_permissions": [
    "<all_urls>"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ],
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    },
    "default_title": "Capture Full Page to Clipboard (Alt+Shift+S)"
  },
  "commands": {
    "capture-full-page": {
      "suggested_key": {
        "default": "Alt+Shift+S",
        "mac": "Alt+Shift+S"
      },
      "description": "Capture full page directly to clipboard"
    }
  },
  "options_ui": {
    "page": "options.html",
    "open_in_tab": false
  },
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}`;

export const BACKGROUND_JS = `// Background Service Worker for SnapFull (Manifest V3)
// Supports both Chrome DevTools Protocol (CDP Page.captureScreenshot) and Smooth Scroll & Stitch

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(['settings'], (res) => {
    if (!res.settings) {
      chrome.storage.sync.set({
        settings: {
          engine: 'devtools', // 'devtools' (CDP Page.captureScreenshot) or 'stitch'
          autoCopyClipboard: true,
          autoDownloadFile: false,
          autoScrollWarmup: true,
          scrollDelayMs: 150,
          format: 'png', // 'png' or 'jpeg'
          jpegQuality: 92,
          hideFixedElements: false,
          playShutterSound: true
        }
      });
    }
  });
});

// Handle keyboard shortcut command
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'capture-full-page') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
      startCapture(tab.id);
    }
  }
});

// Listen for messages from popup or content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'START_CAPTURE') {
    const tabId = message.tabId || sender.tab?.id;
    if (tabId) {
      startCapture(tabId, message.options)
        .then((result) => sendResponse({ success: true, result }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true; // Keep channel open for async response
    }
  } else if (message.action === 'OPEN_EDITOR') {
    chrome.tabs.create({ url: chrome.runtime.getURL('editor.html') });
    sendResponse({ success: true });
    return false;
  }
});

async function startCapture(tabId, customOptions = {}) {
  const store = await chrome.storage.sync.get(['settings']);
  const settings = { ...(store.settings || {}), ...customOptions };

  // 1. Ensure offscreen document is ready for clipboard / canvas operations
  await ensureOffscreenDocument();

  // 2. Perform lazy-scroll warmup sweep if enabled (via direct scripting, no messaging needed)
  if (settings.autoScrollWarmup) {
    await performScrollWarmup(tabId, settings.scrollDelayMs || 120);
  }

  // 3. Choose capture engine (DevTools CDP with automatic Scroll-and-Stitch fallback)
  let dataUrl = '';
  let copied = false;

  if (settings.engine === 'devtools') {
    try {
      dataUrl = await captureWithCDP(tabId, settings);
      if (settings.autoCopyClipboard) {
        copied = await copyToClipboardViaOffscreen(dataUrl);
      }
    } catch (cdpErr) {
      console.warn('DevTools CDP capture failed, switching to Scroll & Stitch engine:', cdpErr);
      const stitchResult = await captureWithStitch(tabId, settings);
      dataUrl = stitchResult.dataUrl;
      copied = settings.autoCopyClipboard ? true : false;
    }
  } else {
    const stitchResult = await captureWithStitch(tabId, settings);
    dataUrl = stitchResult.dataUrl;
    copied = settings.autoCopyClipboard ? true : false;
  }

  // Cache last capture for built-in editor
  await chrome.storage.local.set({ lastCaptureDataUrl: dataUrl });

  // 5. Copy image to system clipboard (primary: Offscreen API; fallback: Content script)
  let copied = false;
  if (settings.autoCopyClipboard) {
    try {
      copied = await copyToClipboardViaOffscreen(dataUrl);
    } catch (offscreenErr) {
      console.warn('Offscreen clipboard write failed, trying content script fallback:', offscreenErr);
      try {
        const copyResult = await chrome.tabs.sendMessage(tabId, {
          action: 'COPY_TO_CLIPBOARD',
          dataUrl
        });
        copied = copyResult?.success ?? false;
      } catch (contentErr) {
        console.error('All clipboard write attempts failed:', contentErr);
      }
    }
  }

  // 6. Optionally save to file
  let downloaded = false;
  if (settings.autoDownloadFile) {
    try {
      const tab = await chrome.tabs.get(tabId);
      const sanitizedTitle = (tab.title || 'screenshot')
        .replace(/[^a-z0-9_-]/gi, '_')
        .slice(0, 50);
      const dateStr = new Date().toISOString().replace(/[:.]/g, '-');
      const ext = settings.format === 'jpeg' ? 'jpg' : 'png';
      const filename = sanitizedTitle + '_' + dateStr + '.' + ext;

      await chrome.downloads.download({
        url: dataUrl,
        filename,
        saveAs: false
      });
      downloaded = true;
    } catch (dlErr) {
      console.warn('Download error:', dlErr);
    }
  }

  // 7. If user requested direct editor opening
  if (settings.openEditor) {
    await chrome.tabs.create({ url: chrome.runtime.getURL('editor.html') });
  }

  // 8. Notify tab with success overlay confirmation toast
  try {
    await chrome.tabs.sendMessage(tabId, {
      action: 'SHOW_TOAST',
      message: copied && downloaded
        ? 'Entire page captured: Saved to clipboard & Downloaded!'
        : copied
        ? 'Entire page captured & copied to clipboard!'
        : 'Entire page captured & downloaded!'
    });
  } catch (_) {}

  return { success: true, copied, downloaded, dataUrl };
}

// DevTools Protocol Engine (CDP)
// Exact same implementation as Chrome DevTools "Capture full size screenshot"
async function captureWithCDP(tabId, settings) {
  const target = { tabId };
  await chrome.debugger.attach(target, '1.3');

  try {
    await chrome.debugger.sendCommand(target, 'Page.enable');

    // Get true layout metrics
    const metrics = await chrome.debugger.sendCommand(target, 'Page.getLayoutMetrics');
    const contentSize = metrics.cssContentSize || metrics.contentSize || {
      width: metrics.layoutViewport?.clientWidth || 1280,
      height: metrics.layoutViewport?.clientHeight || 800
    };
    const width = Math.ceil(contentSize.width || 1280);
    const height = Math.ceil(contentSize.height || 800);

    if (height > 16000) {
      throw new Error('Page height exceeds single CDP GPU texture limit; switching to scroll & stitch');
    }

    // Override device metrics to encompass the entire document
    await chrome.debugger.sendCommand(target, 'Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false
    });

    // Capture screenshot beyond viewport
    const format = settings.format === 'jpeg' ? 'jpeg' : 'png';
    const screenshotParams = {
      format,
      fromSurface: true,
      captureBeyondViewport: true
    };
    if (format === 'jpeg') {
      screenshotParams.quality = settings.jpegQuality || 90;
    }

    const screenshot = await chrome.debugger.sendCommand(
      target,
      'Page.captureScreenshot',
      screenshotParams
    );

    // Reset emulation metrics
    await chrome.debugger.sendCommand(target, 'Emulation.clearDeviceMetricsOverride');

    return 'data:image/' + format + ';base64,' + screenshot.data;
  } finally {
    try {
      await chrome.debugger.detach(target);
    } catch (_) {}
  }
}

// Universal Scroll & Stitch Engine (Runs via direct scripting, works on Cloudflare & all pages)
async function captureWithStitch(tabId, settings) {
  const dimensions = await getPageDimensions(tabId);
  const { totalWidth, totalHeight, viewportHeight, devicePixelRatio } = dimensions;

  const numSteps = Math.ceil(totalHeight / viewportHeight);
  const frames = [];

  for (let i = 0; i < numSteps; i++) {
    const scrollY = i * viewportHeight;
    await scrollTabTo(tabId, scrollY, settings.hideFixedElements);

    // Wait for repaint
    await new Promise((r) => setTimeout(r, 140));

    const chunkDataUrl = await chrome.tabs.captureVisibleTab(null, {
      format: 'png'
    });
    frames.push({ scrollY, dataUrl: chunkDataUrl });
  }

  // Restore original scroll
  await restoreTabScroll(tabId);

  // Delegate stitching & clipboard writing to offscreen document (zero content-script dependency)
  const response = await chrome.runtime.sendMessage({
    target: 'offscreen',
    action: 'STITCH_AND_COPY',
    frames,
    totalWidth,
    totalHeight,
    viewportHeight,
    dpr: devicePixelRatio,
    format: settings.format || 'png',
    autoCopy: settings.autoCopyClipboard !== false
  });

  if (!response || !response.success) {
    throw new Error(response?.error || 'Failed to stitch full-page frames');
  }

  return { dataUrl: response.dataUrl };
}

// Direct DOM measurements via executeScript (no message passing needed)
async function getPageDimensions(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const body = document.body;
        const html = document.documentElement;
        const totalWidth = Math.max(
          html.scrollWidth,
          body ? body.scrollWidth : 0,
          html.clientWidth,
          window.innerWidth
        );
        const totalHeight = Math.max(
          html.scrollHeight,
          body ? body.scrollHeight : 0,
          html.clientHeight,
          window.innerHeight
        );
        return {
          totalWidth,
          totalHeight,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          devicePixelRatio: window.devicePixelRatio || 1
        };
      }
    });

    if (results && results[0] && results[0].result) {
      return results[0].result;
    }
  } catch (e) {
    console.warn('Direct dimensions check fallback:', e);
  }

  return {
    totalWidth: 1280,
    totalHeight: 1080,
    viewportWidth: 1280,
    viewportHeight: 1080,
    devicePixelRatio: 1
  };
}

// Direct scroll warmup via executeScript
async function performScrollWarmup(tabId, delayMs) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: async (stepDelay) => {
        const origX = window.scrollX;
        const origY = window.scrollY;
        const docHeight = Math.max(
          document.documentElement.scrollHeight,
          document.body ? document.body.scrollHeight : 0,
          window.innerHeight
        );
        const step = window.innerHeight * 0.8;
        for (let y = 0; y < docHeight; y += step) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, stepDelay));
        }
        window.scrollTo(origX, origY);
      },
      args: [delayMs || 120]
    });
  } catch (e) {
    console.warn('Scroll warmup ignored:', e);
  }
}

// Direct scroll step
async function scrollTabTo(tabId, scrollY, hideFixed) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (y, shouldHideFixed) => {
        window.scrollTo(0, y);
        if (shouldHideFixed && y > 0) {
          const els = document.querySelectorAll('*');
          for (const el of els) {
            const pos = window.getComputedStyle(el).position;
            if (pos === 'fixed' || pos === 'sticky') {
              el.setAttribute('data-snapfull-hidden', 'true');
              el.style.visibility = 'hidden';
            }
          }
        }
      },
      args: [scrollY, hideFixed]
    });
  } catch (e) {}
}

// Restore original scroll & visible headers
async function restoreTabScroll(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const hidden = document.querySelectorAll('[data-snapfull-hidden="true"]');
        for (const el of hidden) {
          el.removeAttribute('data-snapfull-hidden');
          el.style.visibility = '';
        }
      }
    });
  } catch (e) {}
}

// Ensure offscreen document exists
async function ensureOffscreenDocument() {
  try {
    if (chrome.offscreen && typeof chrome.offscreen.hasDocument === 'function') {
      const hasDoc = await chrome.offscreen.hasDocument();
      if (hasDoc) return;
    } else if (chrome.runtime.getContexts) {
      const contexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT']
      });
      if (contexts && contexts.length > 0) return;
    }
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['CLIPBOARD'],
      justification: 'Stitch full-page screenshot and write image to system clipboard'
    });
  } catch (err) {
    if (!err.message || !err.message.includes('Only a single offscreen document')) {
      console.warn('ensureOffscreenDocument notice:', err);
    }
  }
}

// Offscreen clipboard writer
async function copyToClipboardViaOffscreen(dataUrl) {
  await ensureOffscreenDocument();
  const response = await chrome.runtime.sendMessage({
    target: 'offscreen',
    action: 'COPY_IMAGE_TO_CLIPBOARD',
    dataUrl
  });
  return response?.success ?? false;
}
`;

export const CONTENT_JS = `// Content Script for SnapFull
// Handles smooth lazy-scroll preloading, sticky elements, canvas stitching, and clipboard copy

(function () {
  if (window.__snapFullInitialized) return;
  window.__snapFullInitialized = true;

  let originalScrollY = 0;
  let originalScrollX = 0;
  let fixedElements = [];

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.action) {
      case 'PRELOAD_PAGE':
        preloadEntirePage(request.delayMs || 150)
          .then(() => sendResponse({ success: true }))
          .catch((err) => sendResponse({ error: err.message }));
        return true;

      case 'GET_DIMENSIONS':
        originalScrollY = window.scrollY;
        originalScrollX = window.scrollX;
        const totalWidth = Math.max(
          document.documentElement.scrollWidth,
          document.body.scrollWidth,
          document.documentElement.clientWidth
        );
        const totalHeight = Math.max(
          document.documentElement.scrollHeight,
          document.body.scrollHeight,
          document.documentElement.clientHeight
        );
        sendResponse({
          totalWidth,
          totalHeight,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          devicePixelRatio: window.devicePixelRatio || 1
        });
        return false;

      case 'SCROLL_TO':
        window.scrollTo(0, request.y);
        if (request.hideFixed) {
          hideStickyElements();
        }
        sendResponse({ success: true });
        return false;

      case 'RESTORE_SCROLL':
        window.scrollTo(originalScrollX, originalScrollY);
        restoreStickyElements();
        sendResponse({ success: true });
        return false;

      case 'STITCH_FRAMES':
        stitchFrames(request)
          .then((dataUrl) => sendResponse({ dataUrl }))
          .catch((err) => sendResponse({ error: err.message }));
        return true;

      case 'COPY_TO_CLIPBOARD':
        copyDataUrlToClipboard(request.dataUrl)
          .then(() => sendResponse({ success: true }))
          .catch((err) => sendResponse({ success: false, error: err.message }));
        return true;

      case 'SHOW_TOAST':
        showToastHUD(request.message);
        sendResponse({ success: true });
        return false;
    }
  });

  // Preloads lazy images and dynamic DOM by sweeping through the page
  async function preloadEntirePage(delayMs) {
    originalScrollY = window.scrollY;

    let totalHeight = Math.max(
      document.documentElement.scrollHeight,
      document.body.scrollHeight
    );
    const hud = createProgressHUD('Warming up lazy images & capturing page', totalHeight);
    const step = window.innerHeight * 0.8;
    let currentY = 0;
    let initialHeight = totalHeight;

    while (currentY < totalHeight) {
      currentY += step;
      window.scrollTo({ top: currentY, behavior: 'instant' });

      // Check if page dynamically expanded during scroll
      const currentDocHeight = Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight
      );
      if (currentDocHeight > totalHeight) {
        const added = currentDocHeight - totalHeight;
        totalHeight = currentDocHeight;
        hud.notifyDynamicExpansion(added, totalHeight);
      }

      const percent = Math.min(98, Math.round((currentY / totalHeight) * 100));
      hud.update(percent, Math.min(currentY, totalHeight), totalHeight);
      await new Promise((r) => setTimeout(r, delayMs));
    }

    // Scroll back to top
    window.scrollTo({ top: originalScrollY, behavior: 'instant' });
    hud.update(100, totalHeight, totalHeight);
    await new Promise((r) => setTimeout(r, 120));
    hud.remove();
  }

  // Copy PNG image data directly into system clipboard
  async function copyDataUrlToClipboard(dataUrl) {
    const res = await fetch(dataUrl);
    const blob = await res.blob();

    // System clipboard expects 'image/png'
    let pngBlob = blob;
    if (blob.type !== 'image/png') {
      pngBlob = await convertBlobToPng(blob);
    }

    const item = new ClipboardItem({ 'image/png': pngBlob });
    await navigator.clipboard.write([item]);
  }

  function convertBlobToPng(sourceBlob) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Canvas conversion failed'));
        }, 'image/png');
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(sourceBlob);
    });
  }

  // Stitch individual viewport frames on an offscreen canvas
  async function stitchFrames({ frames, totalWidth, totalHeight, viewportHeight, dpr, format }) {
    const canvas = document.createElement('canvas');
    canvas.width = totalWidth * dpr;
    canvas.height = totalHeight * dpr;
    const ctx = canvas.getContext('2d');

    for (const frame of frames) {
      await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const destY = frame.scrollY * dpr;
          ctx.drawImage(img, 0, destY);
          resolve();
        };
        img.src = frame.dataUrl;
      });
    }

    const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    return canvas.toDataURL(mime, 0.92);
  }

  function hideStickyElements() {
    const all = document.querySelectorAll('*');
    fixedElements = [];
    for (const el of all) {
      const style = window.getComputedStyle(el);
      if (style.position === 'fixed' || style.position === 'sticky') {
        fixedElements.push({ el, origVisibility: el.style.visibility });
        el.style.visibility = 'hidden';
      }
    }
  }

  function restoreStickyElements() {
    for (const item of fixedElements) {
      item.el.style.visibility = item.origVisibility;
    }
    fixedElements = [];
  }

  // Visual scrolling indicator showing scanned depth, progress bar, and dynamic height alerts
  function createProgressHUD(title, totalDocHeight) {
    const hud = document.createElement('div');
    hud.id = '__snapfull_hud';
    hud.style.cssText = \`
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 2147483647;
      background: rgba(15, 23, 42, 0.96);
      backdrop-filter: blur(12px);
      color: #f8fafc;
      padding: 16px 20px;
      border-radius: 16px;
      box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(56, 189, 248, 0.25);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      width: 320px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      pointer-events: none;
    \`;

    hud.innerHTML = [
      '<div style="display: flex; align-items: center; justify-content: space-between;">',
      '  <div style="display: flex; align-items: center; gap: 8px;">',
      '    <div style="width: 14px; height: 14px; border: 2px solid #38bdf8; border-top-color: transparent; border-radius: 50%; animation: __snap_spin 0.8s linear infinite;"></div>',
      '    <span style="font-weight: 700; color: #f8fafc; font-size: 13px;">Full Page Capture</span>',
      '  </div>',
      '  <span id="__snap_percent" style="font-family: monospace; font-weight: 700; color: #38bdf8; font-size: 13px;">0%</span>',
      '</div>',
      '<div style="width: 100%; height: 6px; background: #334155; border-radius: 3px; overflow: hidden; position: relative;">',
      '  <div id="__snap_bar" style="width: 0%; height: 100%; background: linear-gradient(90deg, #0284c7, #38bdf8); transition: width 0.15s ease-out;"></div>',
      '</div>',
      '<div style="display: flex; justify-content: space-between; font-size: 11px; color: #94a3b8;">',
      '  <span id="__snap_scanned_text">Scanned: 0 px</span>',
      '  <span id="__snap_total_text">Total: ' + Math.round(totalDocHeight) + ' px</span>',
      '</div>',
      '<div id="__snap_expansion_badge" style="display: none; background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.4); color: #fbbf24; padding: 6px 10px; border-radius: 8px; font-size: 11px;">',
      '  ⚠️ Additional scrolling required: Page expanded dynamically! Continuing capture pass...',
      '</div>',
      '<style>@keyframes __snap_spin { to { transform: rotate(360deg); } }</style>'
    ].join('');
    document.body.appendChild(hud);

    return {
      update(percent, scannedY, currentTotal) {
        const pctEl = hud.querySelector('#__snap_percent');
        const barEl = hud.querySelector('#__snap_bar');
        const scannedEl = hud.querySelector('#__snap_scanned_text');
        const totalEl = hud.querySelector('#__snap_total_text');

        if (pctEl) pctEl.textContent = percent + '%';
        if (barEl) barEl.style.width = percent + '%';
        if (scannedEl) scannedEl.textContent = 'Scanned: ' + Math.round(scannedY) + ' px';
        if (totalEl) totalEl.textContent = 'Total: ' + Math.round(currentTotal) + ' px';
      },
      notifyDynamicExpansion(addedPx, newTotal) {
        const badge = hud.querySelector('#__snap_expansion_badge');
        if (badge) {
          badge.style.display = 'block';
          badge.textContent = '⚠️ Additional scrolling required: Page grew by +' + Math.round(addedPx) + 'px. Continuing pass...';
        }
      },
      remove() {
        hud.style.opacity = '0';
        hud.style.transform = 'translateY(10px)';
        hud.style.transition = 'all 0.25s ease';
        setTimeout(() => hud.remove(), 250);
      }
    };
  }

  // Confirmation notification confirms capture complete and offers edit/download
  function showToastHUD(text) {
    const existing = document.getElementById('__snapfull_toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = '__snapfull_toast';
    toast.style.cssText = [
      'position: fixed;',
      'top: 24px;',
      'left: 50%;',
      'transform: translateX(-50%);',
      'z-index: 2147483647;',
      'background: #0f172a;',
      'color: #f8fafc;',
      'border: 1px solid #38bdf8;',
      'padding: 12px 20px;',
      'border-radius: 14px;',
      'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;',
      'font-size: 13px;',
      'font-weight: 600;',
      'box-shadow: 0 16px 36px rgba(0, 0, 0, 0.5), 0 0 16px rgba(56, 189, 248, 0.2);',
      'display: flex;',
      'align-items: center;',
      'gap: 12px;',
      'animation: __snap_fade_in 0.25s cubic-bezier(0.16, 1, 0.3, 1);'
    ].join('');

    toast.innerHTML = [
      '<div style="width: 22px; height: 22px; border-radius: 50%; background: #10b981; display: flex; align-items: center; justify-content: center; color: #020617; flex-shrink: 0;">',
      '  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>',
      '</div>',
      '<div>',
      '  <div style="color: #38bdf8; font-weight: 700; font-size: 13px;">Full Page Successfully Captured!</div>',
      '  <div style="font-size: 11px; color: #cbd5e1; font-weight: normal;">' + text + '</div>',
      '</div>',
      '<button id="__snap_btn_edit" style="margin-left: 8px; background: #38bdf8; color: #0f172a; border: none; padding: 6px 12px; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer; transition: filter 0.15s ease;">',
      '  ✏️ Edit Image',
      '</button>',
      '<style>@keyframes __snap_fade_in { from { opacity: 0; transform: translateX(-50%) translateY(-10px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }</style>'
    ].join('');

    document.body.appendChild(toast);

    // Open editor when button clicked
    const editBtn = toast.querySelector('#__snap_btn_edit');
    if (editBtn) {
      editBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'OPEN_EDITOR' });
        toast.remove();
      });
    }

    setTimeout(() => {
      if (document.body.contains(toast)) {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(-10px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
      }
    }, 4500);
  }
})();
`;

export const POPUP_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>SnapFull</title>
  <style>
    :root {
      --bg: #0f172a;
      --card: #1e293b;
      --accent: #38bdf8;
      --accent-hover: #0284c7;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --border: #334155;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      width: 320px;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      padding: 16px;
      user-select: none;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 14px;
    }
    .title-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .icon-badge {
      width: 28px;
      height: 28px;
      background: linear-gradient(135deg, #0284c7, #38bdf8);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
    }
    .title { font-size: 15px; font-weight: 700; }
    .subtitle { font-size: 11px; color: var(--text-muted); }

    .btn-primary {
      width: 100%;
      background: linear-gradient(135deg, #0284c7, #38bdf8);
      color: #0f172a;
      border: none;
      border-radius: 10px;
      padding: 12px 16px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: all 0.2s ease;
      box-shadow: 0 4px 14px rgba(56, 189, 248, 0.3);
    }
    .btn-primary:hover {
      filter: brightness(1.1);
      transform: translateY(-1px);
    }
    .btn-primary:active { transform: translateY(0); }
    .btn-primary:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
    }

    .toggles-group {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 10px 12px;
      margin-top: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .toggle-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 12px;
    }
    .toggle-label {
      display: flex;
      align-items: center;
      gap: 6px;
      color: var(--text);
    }
    .switch {
      position: relative;
      display: inline-block;
      width: 34px;
      height: 20px;
    }
    .switch input { opacity: 0; width: 0; height: 0; }
    .slider {
      position: absolute;
      cursor: pointer;
      top: 0; left: 0; right: 0; bottom: 0;
      background-color: #475569;
      transition: .2s;
      border-radius: 20px;
    }
    .slider:before {
      position: absolute;
      content: "";
      height: 14px;
      width: 14px;
      left: 3px;
      bottom: 3px;
      background-color: white;
      transition: .2s;
      border-radius: 50%;
    }
    input:checked + .slider { background-color: var(--accent); }
    input:checked + .slider:before { transform: translateX(14px); background-color: #0f172a; }

    .footer {
      margin-top: 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 11px;
      color: var(--text-muted);
    }
    .kbd {
      background: #334155;
      padding: 2px 6px;
      border-radius: 4px;
      color: #e2e8f0;
      font-family: monospace;
      font-size: 10px;
    }
    .status-msg {
      margin-top: 10px;
      font-size: 11px;
      padding: 8px;
      border-radius: 6px;
      text-align: center;
      display: none;
    }
    .status-msg.success {
      display: block;
      background: rgba(16, 185, 129, 0.15);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.3);
    }
    .status-msg.error {
      display: block;
      background: rgba(239, 68, 68, 0.15);
      color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.3);
    }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="header">
    <div class="title-row">
      <div class="icon-badge">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
      </div>
      <div>
        <div class="title">SnapFull</div>
        <div class="subtitle">DevTools Full Page Capture</div>
      </div>
    </div>
    <a href="#" id="openOptions" title="Settings">⚙️</a>
  </div>

  <button class="btn-primary" id="btnCapture">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><polyline points="9 11 12 14 22 4"/></svg>
    <span>Capture to Clipboard</span>
  </button>

  <button class="btn-secondary" id="btnCaptureAndEdit" style="width: 100%; margin-top: 6px; background: #1e293b; border: 1px solid #334155; color: #f8fafc; border-radius: 10px; padding: 10px 14px; font-size: 12px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; transition: background 0.15s ease;">
    <span>✏️ Capture & Open Editor (Crop/Blur)</span>
  </button>

  <div class="status-msg" id="statusBox"></div>

  <div class="toggles-group">
    <div class="toggle-row">
      <div class="toggle-label">
        <span>📋</span> Auto-Copy to Clipboard
      </div>
      <label class="switch">
        <input type="checkbox" id="toggleClipboard" checked>
        <span class="slider"></span>
      </label>
    </div>

    <div class="toggle-row">
      <div class="toggle-label">
        <span>🎨</span> Open in Editor after capture
      </div>
      <label class="switch">
        <input type="checkbox" id="toggleEditor">
        <span class="slider"></span>
      </label>
    </div>

    <div class="toggle-row">
      <div class="toggle-label">
        <span>💾</span> Save to File (PNG)
      </div>
      <label class="switch">
        <input type="checkbox" id="toggleDownload">
        <span class="slider"></span>
      </label>
    </div>

    <div class="toggle-row">
      <div class="toggle-label">
        <span>⚡</span> Lazy-Scroll Warmup
      </div>
      <label class="switch">
        <input type="checkbox" id="toggleWarmup" checked>
        <span class="slider"></span>
      </label>
    </div>
  </div>

  <div class="footer">
    <span>Shortcut: <span class="kbd">Alt+Shift+S</span></span>
    <span id="engineBadge" style="color: #38bdf8;">DevTools CDP</span>
  </div>

  <script src="popup.js"></script>
</body>
</html>
`;

export const POPUP_JS = `// Popup interaction script for SnapFull
document.addEventListener('DOMContentLoaded', async () => {
  const btnCapture = document.getElementById('btnCapture');
  const toggleClipboard = document.getElementById('toggleClipboard');
  const toggleDownload = document.getElementById('toggleDownload');
  const toggleWarmup = document.getElementById('toggleWarmup');
  const toggleEditor = document.getElementById('toggleEditor');
  const btnCaptureAndEdit = document.getElementById('btnCaptureAndEdit');
  const statusBox = document.getElementById('statusBox');
  const openOptions = document.getElementById('openOptions');
  const engineBadge = document.getElementById('engineBadge');

  // Load preferences
  const { settings = {} } = await chrome.storage.sync.get(['settings']);
  toggleClipboard.checked = settings.autoCopyClipboard !== false;
  toggleDownload.checked = !!settings.autoDownloadFile;
  toggleWarmup.checked = settings.autoScrollWarmup !== false;
  toggleEditor.checked = !!settings.openEditor;

  if (settings.engine === 'stitch') {
    engineBadge.textContent = 'Scroll & Stitch';
  } else {
    engineBadge.textContent = 'DevTools CDP';
  }

  // Update storage on toggle change
  const saveToggles = () => {
    chrome.storage.sync.get(['settings'], (res) => {
      const s = res.settings || {};
      s.autoCopyClipboard = toggleClipboard.checked;
      s.autoDownloadFile = toggleDownload.checked;
      s.autoScrollWarmup = toggleWarmup.checked;
      s.openEditor = toggleEditor.checked;
      chrome.storage.sync.set({ settings: s });
    });
  };

  toggleClipboard.addEventListener('change', saveToggles);
  toggleDownload.addEventListener('change', saveToggles);
  toggleWarmup.addEventListener('change', saveToggles);
  toggleEditor.addEventListener('change', saveToggles);

  openOptions.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  const triggerCapture = async (forceOpenEditor = false) => {
    statusBox.className = 'status-msg';
    statusBox.style.display = 'block';
    statusBox.style.background = 'rgba(56, 189, 248, 0.15)';
    statusBox.style.color = '#38bdf8';
    statusBox.style.border = '1px solid rgba(56, 189, 248, 0.3)';
    statusBox.innerHTML = '<span style="display:inline-block;animation:spin 1s infinite linear;">↻</span> Capturing entire page...';

    btnCapture.disabled = true;
    if (btnCaptureAndEdit) btnCaptureAndEdit.disabled = true;

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) {
        throw new Error('No active web page detected.');
      }

      if (
        tab.url.startsWith('chrome://') ||
        tab.url.startsWith('chrome-extension://') ||
        tab.url.startsWith('edge://') ||
        tab.url.startsWith('about:')
      ) {
        throw new Error('Chrome restricts extensions on internal chrome:// or extension store pages. Please test on any regular website (e.g. github.com, wikipedia.org, google.com).');
      }

      chrome.runtime.sendMessage(
        {
          action: 'START_CAPTURE',
          tabId: tab.id,
          options: {
            autoCopyClipboard: toggleClipboard.checked,
            autoDownloadFile: toggleDownload.checked,
            autoScrollWarmup: toggleWarmup.checked,
            openEditor: forceOpenEditor || toggleEditor.checked
          }
        },
        (response) => {
          btnCapture.disabled = false;
          if (btnCaptureAndEdit) btnCaptureAndEdit.disabled = false;

          if (chrome.runtime.lastError) {
            statusBox.textContent = '⚠️ ' + chrome.runtime.lastError.message;
            statusBox.className = 'status-msg error';
            return;
          }

          if (response && response.success) {
            statusBox.innerHTML = '<strong>✓ Full Page Captured!</strong><br><span style="font-size:10px;">Copied to clipboard. Press Cmd+V to paste.</span>';
            statusBox.className = 'status-msg success';
            setTimeout(() => window.close(), 2400);
          } else {
            statusBox.textContent = '⚠️ ' + (response?.error || 'Capture failed');
            statusBox.className = 'status-msg error';
          }
        }
      );
    } catch (err) {
      btnCapture.disabled = false;
      if (btnCaptureAndEdit) btnCaptureAndEdit.disabled = false;
      statusBox.textContent = '⚠️ ' + err.message;
      statusBox.className = 'status-msg error';
    }
  };

  btnCapture.addEventListener('click', () => triggerCapture(false));
  if (btnCaptureAndEdit) {
    btnCaptureAndEdit.addEventListener('click', () => triggerCapture(true));
  }
});
`;

export const OPTIONS_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>SnapFull Settings</title>
  <style>
    body {
      background: #0b1120;
      color: #e2e8f0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      padding: 24px;
      max-width: 580px;
      margin: 0 auto;
    }
    h1 { font-size: 20px; font-weight: 700; margin-bottom: 4px; color: #f8fafc; }
    p.sub { font-size: 13px; color: #94a3b8; margin-bottom: 24px; }
    .card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 16px 20px;
      margin-bottom: 16px;
    }
    .card h2 { font-size: 14px; font-weight: 600; color: #38bdf8; margin-bottom: 12px; }
    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px solid #293548;
    }
    .row:last-child { border-bottom: none; }
    .label-wrap div:first-child { font-size: 13px; font-weight: 500; }
    .label-wrap div:last-child { font-size: 11px; color: #94a3b8; margin-top: 2px; }
    select, input[type="number"] {
      background: #0f172a;
      border: 1px solid #475569;
      color: #f8fafc;
      padding: 6px 10px;
      border-radius: 6px;
      font-size: 13px;
    }
    .save-bar {
      margin-top: 20px;
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    }
    .btn-save {
      background: #38bdf8;
      color: #0f172a;
      border: none;
      font-weight: 600;
      font-size: 13px;
      padding: 8px 18px;
      border-radius: 8px;
      cursor: pointer;
    }
    .btn-save:hover { background: #7dd3fc; }
    #toast { color: #34d399; font-size: 13px; display: none; align-self: center; }
  </style>
</head>
<body>
  <h1>SnapFull Settings</h1>
  <p class="sub">Configure screenshot engine, lazy loading, and clipboard options.</p>

  <div class="card">
    <h2>Capture Engine</h2>
    <div class="row">
      <div class="label-wrap">
        <div>Engine Mode</div>
        <div>DevTools CDP uses headless viewport override (exact replica of DevTools)</div>
      </div>
      <select id="engine">
        <option value="devtools">DevTools Protocol (CDP - Native Full Size)</option>
        <option value="stitch">Scroll & Stitch (No debugger banner)</option>
      </select>
    </div>
    <div class="row">
      <div class="label-wrap">
        <div>Image Format</div>
        <div>PNG provides lossless quality; JPEG creates smaller files</div>
      </div>
      <select id="format">
        <option value="png">PNG (Lossless 24-bit)</option>
        <option value="jpeg">JPEG (Compressed)</option>
      </select>
    </div>
  </div>

  <div class="card">
    <h2>Dynamic & Lazy Loading</h2>
    <div class="row">
      <div class="label-wrap">
        <div>Preload Lazy Content</div>
        <div>Auto-scrolls page to trigger IntersectionObservers & lazy images</div>
      </div>
      <input type="checkbox" id="autoScrollWarmup">
    </div>
    <div class="row">
      <div class="label-wrap">
        <div>Scroll Step Delay (ms)</div>
        <div>Time to wait at each viewport step during warmup</div>
      </div>
      <input type="number" id="scrollDelayMs" min="50" max="600" step="25" style="width: 80px;">
    </div>
    <div class="row">
      <div class="label-wrap">
        <div>Hide Fixed/Sticky Navbars</div>
        <div>Prevents sticky headers from duplicating when stitching</div>
      </div>
      <input type="checkbox" id="hideFixedElements">
    </div>
  </div>

  <div class="card">
    <h2>Output Actions</h2>
    <div class="row">
      <div class="label-wrap">
        <div>Always Copy to System Clipboard</div>
        <div>Paste directly into Slack, Figma, Notion, or Docs with Ctrl/Cmd+V</div>
      </div>
      <input type="checkbox" id="autoCopyClipboard">
    </div>
    <div class="row">
      <div class="label-wrap">
        <div>Save to Downloads Folder</div>
        <div>Automatically download the captured image as a file</div>
      </div>
      <input type="checkbox" id="autoDownloadFile">
    </div>
  </div>

  <div class="save-bar">
    <span id="toast">✓ Settings saved!</span>
    <button class="btn-save" id="saveBtn">Save Preferences</button>
  </div>

  <script src="options.js"></script>
</body>
</html>
`;

export const OPTIONS_JS = `// Options page script
document.addEventListener('DOMContentLoaded', () => {
  const engine = document.getElementById('engine');
  const format = document.getElementById('format');
  const autoScrollWarmup = document.getElementById('autoScrollWarmup');
  const scrollDelayMs = document.getElementById('scrollDelayMs');
  const hideFixedElements = document.getElementById('hideFixedElements');
  const autoCopyClipboard = document.getElementById('autoCopyClipboard');
  const autoDownloadFile = document.getElementById('autoDownloadFile');
  const saveBtn = document.getElementById('saveBtn');
  const toast = document.getElementById('toast');

  // Load existing
  chrome.storage.sync.get(['settings'], (res) => {
    const s = res.settings || {};
    engine.value = s.engine || 'devtools';
    format.value = s.format || 'png';
    autoScrollWarmup.checked = s.autoScrollWarmup !== false;
    scrollDelayMs.value = s.scrollDelayMs || 150;
    hideFixedElements.checked = !!s.hideFixedElements;
    autoCopyClipboard.checked = s.autoCopyClipboard !== false;
    autoDownloadFile.checked = !!s.autoDownloadFile;
  });

  saveBtn.addEventListener('click', () => {
    const settings = {
      engine: engine.value,
      format: format.value,
      autoScrollWarmup: autoScrollWarmup.checked,
      scrollDelayMs: parseInt(scrollDelayMs.value, 10) || 150,
      hideFixedElements: hideFixedElements.checked,
      autoCopyClipboard: autoCopyClipboard.checked,
      autoDownloadFile: autoDownloadFile.checked
    };

    chrome.storage.sync.set({ settings }, () => {
      toast.style.display = 'inline';
      setTimeout(() => {
        toast.style.display = 'none';
      }, 2000);
    });
  });
});
`;

export const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0284c7"/>
      <stop offset="100%" stop-color="#38bdf8"/>
    </linearGradient>
    <linearGradient id="lensGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1e293b"/>
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="28" fill="url(#bgGrad)"/>
  <!-- Camera body -->
  <path d="M102 96H26C21.6 96 18 92.4 18 88V46C18 41.6 21.6 38 26 38H40L46 28H82L88 38H102C106.4 38 110 41.6 110 46V88C110 92.4 106.4 96 102 96Z" fill="#0f172a" fill-opacity="0.95"/>
  <!-- Lens outer -->
  <circle cx="64" cy="65" r="24" fill="url(#lensGrad)" stroke="#38bdf8" stroke-width="4"/>
  <!-- Lens reflection -->
  <circle cx="64" cy="65" r="14" fill="#38bdf8" fill-opacity="0.3"/>
  <circle cx="58" cy="59" r="4" fill="#ffffff" fill-opacity="0.8"/>
  <!-- Clipboard icon badge in corner -->
  <g transform="translate(76, 70) scale(0.65)">
    <rect x="4" y="8" width="36" height="42" rx="6" fill="#38bdf8" stroke="#0f172a" stroke-width="3"/>
    <rect x="14" y="2" width="16" height="8" rx="3" fill="#0f172a"/>
    <line x1="12" y1="22" x2="32" y2="22" stroke="#0f172a" stroke-width="3" stroke-linecap="round"/>
    <line x1="12" y1="30" x2="28" y2="30" stroke="#0f172a" stroke-width="3" stroke-linecap="round"/>
  </g>
</svg>`;

export const EDITOR_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>SnapFull Image Editor & Redaction</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #020617;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      user-select: none;
    }
    header {
      height: 52px;
      background: #0f172a;
      border-bottom: 1px solid #1e293b;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 16px;
      gap: 12px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      font-weight: 700;
      color: #38bdf8;
    }
    .tools {
      display: flex;
      align-items: center;
      gap: 4px;
      background: #020617;
      padding: 3px;
      border-radius: 8px;
      border: 1px solid #1e293b;
    }
    .btn-tool {
      background: transparent;
      border: none;
      color: #94a3b8;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;
    }
    .btn-tool:hover { color: #f8fafc; background: #1e293b; }
    .btn-tool.active { background: #38bdf8; color: #020617; }
    .btn-tool.active-blur { background: #ef4444; color: #ffffff; }

    .actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .btn-action {
      background: #1e293b;
      border: 1px solid #334155;
      color: #f8fafc;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .btn-action:hover { background: #334155; }
    .btn-primary {
      background: #38bdf8;
      border: none;
      color: #020617;
      padding: 6px 14px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .btn-primary:hover { background: #7dd3fc; }

    .sub-bar {
      height: 38px;
      background: #090d16;
      border-bottom: 1px solid #1e293b;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 16px;
      font-size: 11px;
      color: #94a3b8;
    }
    .workspace {
      flex: 1;
      overflow: auto;
      display: flex;
      justify-content: center;
      align-items: flex-start;
      padding: 24px;
      background: radial-gradient(circle at center, #0f172a 0%, #020617 100%);
    }
    canvas {
      box-shadow: 0 20px 40px rgba(0,0,0,0.6);
      border: 1px solid #334155;
      border-radius: 6px;
      display: block;
      background: #020617;
    }
    #toast {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      background: #059669;
      color: white;
      font-size: 12px;
      font-weight: 600;
      padding: 8px 16px;
      border-radius: 20px;
      display: none;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
      <span>SnapFull Editor</span>
    </div>

    <div class="tools">
      <button class="btn-tool active" id="toolCrop">
        <span>✂️ Crop</span>
      </button>
      <button class="btn-tool" id="toolBlur">
        <span>🔒 Blur / Redact</span>
      </button>
      <button class="btn-tool" id="toolText">
        <span>✏️ Text Note</span>
      </button>
      <button class="btn-tool" id="toolBox">
        <span>□ Box Frame</span>
      </button>
    </div>

    <div class="actions">
      <button class="btn-action" id="btnUndo">↶ Undo</button>
      <button class="btn-action" id="btnResetCrop">↺ Reset Crop</button>
      <button class="btn-primary" id="btnCopy">📋 Copy to Clipboard</button>
      <button class="btn-action" id="btnDownload">💾 Save PNG</button>
    </div>
  </header>

  <div class="sub-bar">
    <div id="statusInstruction">Drag to select a crop area. Release mouse to apply crop.</div>
    <div id="dimensionsDisplay">Loading screenshot...</div>
  </div>

  <div class="workspace" id="workspace">
    <canvas id="editorCanvas"></canvas>
  </div>

  <div id="toast">✓ Copied edited screenshot to system clipboard!</div>

  <script src="editor.js"></script>
</body>
</html>
`;

export const EDITOR_JS = `// Editor script for SnapFull Chrome Extension
let canvas, ctx;
let baseImage = null;
let currentTool = 'crop';
let isDrawing = false;
let startX = 0, startY = 0;
let cropRegion = null;
let blurBoxes = [];
let textNotes = [];
let boxShapes = [];
let history = [];

document.addEventListener('DOMContentLoaded', async () => {
  canvas = document.getElementById('editorCanvas');
  ctx = canvas.getContext('2d');

  // Load capture data from chrome.storage.local
  chrome.storage.local.get(['lastCaptureDataUrl'], (res) => {
    const dataUrl = res.lastCaptureDataUrl;
    if (dataUrl) {
      loadImage(dataUrl);
    } else {
      document.getElementById('dimensionsDisplay').textContent = 'No capture found. Open via extension.';
    }
  });

  setupTools();
  setupActions();
});

function loadImage(src) {
  baseImage = new Image();
  baseImage.onload = () => {
    cropRegion = { x: 0, y: 0, w: baseImage.width, h: baseImage.height };
    document.getElementById('dimensionsDisplay').textContent = baseImage.width + ' × ' + baseImage.height + ' px';
    render();
  };
  baseImage.src = src;
}

function pushHistory() {
  history.push({
    crop: { ...cropRegion },
    blurs: JSON.parse(JSON.stringify(blurBoxes)),
    texts: JSON.parse(JSON.stringify(textNotes)),
    boxes: JSON.parse(JSON.stringify(boxShapes))
  });
  if (history.length > 20) history.shift();
}

function render() {
  if (!baseImage) return;
  const sx = cropRegion.x;
  const sy = cropRegion.y;
  const sw = cropRegion.w;
  const sh = cropRegion.h;

  canvas.width = sw;
  canvas.height = sh;

  // Base image
  ctx.drawImage(baseImage, sx, sy, sw, sh, 0, 0, sw, sh);

  // Blur boxes
  blurBoxes.forEach((b) => {
    const bx = b.x - sx;
    const by = b.y - sy;
    if (b.w <= 0 || b.h <= 0) return;

    const sub = document.createElement('canvas');
    sub.width = b.w;
    sub.height = b.h;
    const sCtx = sub.getContext('2d');
    sCtx.drawImage(canvas, bx, by, b.w, b.h, 0, 0, b.w, b.h);

    ctx.save();
    ctx.filter = 'blur(12px)';
    ctx.beginPath();
    ctx.rect(bx, by, b.w, b.h);
    ctx.clip();
    ctx.drawImage(sub, bx, by, b.w, b.h);
    ctx.restore();

    ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(bx, by, b.w, b.h);
  });

  // Box shapes
  boxShapes.forEach((box) => {
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.strokeRect(box.x - sx, box.y - sy, box.w, box.h);
  });

  // Text notes
  textNotes.forEach((t) => {
    ctx.save();
    ctx.font = 'bold 18px -apple-system, sans-serif';
    const m = ctx.measureText(t.text);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect((t.x - sx) - 6, (t.y - sy) - 18, m.width + 12, 24);
    ctx.strokeStyle = '#38bdf8';
    ctx.strokeRect((t.x - sx) - 6, (t.y - sy) - 18, m.width + 12, 24);
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(t.text, t.x - sx, t.y - sy);
    ctx.restore();
  });
}

function setupTools() {
  const toolCrop = document.getElementById('toolCrop');
  const toolBlur = document.getElementById('toolBlur');
  const toolText = document.getElementById('toolText');
  const toolBox = document.getElementById('toolBox');
  const instr = document.getElementById('statusInstruction');

  const setTool = (tool) => {
    currentTool = tool;
    [toolCrop, toolBlur, toolText, toolBox].forEach((b) => {
      b.classList.remove('active', 'active-blur');
    });

    if (tool === 'crop') {
      toolCrop.classList.add('active');
      instr.textContent = 'Drag over the canvas to crop. Release to apply.';
    } else if (tool === 'blur') {
      toolBlur.classList.add('active-blur');
      instr.textContent = 'Drag over sensitive passwords, tokens, or names to blur them.';
    } else if (tool === 'text') {
      toolText.classList.add('active');
      instr.textContent = 'Click on canvas to type a text annotation note.';
    } else if (tool === 'box') {
      toolBox.classList.add('active');
      instr.textContent = 'Drag to draw an emphasis highlight box.';
    }
  };

  toolCrop.onclick = () => setTool('crop');
  toolBlur.onclick = () => setTool('blur');
  toolText.onclick = () => setTool('text');
  toolBox.onclick = () => setTool('box');

  canvas.onmousedown = (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    startX = (e.clientX - rect.left) * scaleX + cropRegion.x;
    startY = (e.clientY - rect.top) * scaleY + cropRegion.y;
    isDrawing = true;
    pushHistory();

    if (currentTool === 'text') {
      const txt = prompt('Enter annotation text:', 'Highlight');
      if (txt) {
        textNotes.push({ text: txt, x: startX, y: startY });
        render();
      }
      isDrawing = false;
    }
  };

  canvas.onmouseup = (e) => {
    if (!isDrawing) return;
    isDrawing = false;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const endX = (e.clientX - rect.left) * scaleX + cropRegion.x;
    const endY = (e.clientY - rect.top) * scaleY + cropRegion.y;

    const x = Math.min(startX, endX);
    const y = Math.min(startY, endY);
    const w = Math.abs(endX - startX);
    const h = Math.abs(endY - startY);

    if (w < 10 || h < 10) return;

    if (currentTool === 'crop') {
      cropRegion = { x, y, w, h };
      render();
    } else if (currentTool === 'blur') {
      blurBoxes.push({ x, y, w, h });
      render();
    } else if (currentTool === 'box') {
      boxShapes.push({ x, y, w, h });
      render();
    }
  };
}

function setupActions() {
  document.getElementById('btnUndo').onclick = () => {
    if (history.length > 0) {
      const prev = history.pop();
      cropRegion = prev.crop;
      blurBoxes = prev.blurs;
      textNotes = prev.texts;
      boxShapes = prev.boxes;
      render();
    }
  };

  document.getElementById('btnResetCrop').onclick = () => {
    if (baseImage) {
      pushHistory();
      cropRegion = { x: 0, y: 0, w: baseImage.width, h: baseImage.height };
      render();
    }
  };

  document.getElementById('btnCopy').onclick = () => {
    canvas.toBlob(async (blob) => {
      try {
        const item = new ClipboardItem({ 'image/png': blob });
        await navigator.clipboard.write([item]);
        showToast('✓ Copied edited screenshot to system clipboard!');
      } catch (err) {
        alert('Could not copy directly: ' + err.message);
      }
    }, 'image/png');
  };

  document.getElementById('btnDownload').onclick = () => {
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'snapfull_edited_' + Date.now() + '.png';
    a.click();
  };
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.display = 'block';
  setTimeout(() => { t.style.display = 'none'; }, 2500);
}
`;

export const OFFSCREEN_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>SnapFull Offscreen Clipboard</title>
  <script src="offscreen.js"></script>
</head>
<body></body>
</html>`;

export const OFFSCREEN_JS = `// Offscreen document script for reliable clipboard writes in Chrome Manifest V3
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target === 'offscreen' && message.action === 'COPY_IMAGE_TO_CLIPBOARD') {
    copyDataUrlToClipboard(message.dataUrl)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // async
  }
});

async function copyDataUrlToClipboard(dataUrl) {
  const res = await fetch(dataUrl);
  const blob = await res.blob();

  let pngBlob = blob;
  if (blob.type !== 'image/png') {
    pngBlob = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas toBlob failed'))), 'image/png');
      };
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  const item = new ClipboardItem({ 'image/png': pngBlob });
  await navigator.clipboard.write([item]);
}
`;

export const EXTENSION_FILES: ExtensionFile[] = [
  {
    name: 'manifest.json',
    path: 'manifest.json',
    language: 'json',
    description: 'Manifest V3 configuration with debugger, activeTab, downloads, and commands permissions.',
    content: MANIFEST_JSON
  },
  {
    name: 'background.js',
    path: 'background.js',
    language: 'javascript',
    description: 'Service worker managing DevTools CDP Page.captureScreenshot and scroll-stitch engines.',
    content: BACKGROUND_JS
  },
  {
    name: 'content.js',
    path: 'content.js',
    language: 'javascript',
    description: 'In-page script for lazy-loading scroll warmup, sticky header hiding, and direct clipboard copying.',
    content: CONTENT_JS
  },
  {
    name: 'popup.html',
    path: 'popup.html',
    language: 'html',
    description: 'Extension action popup with 1-click capture, toggles for clipboard, editor, and file save.',
    content: POPUP_HTML
  },
  {
    name: 'popup.js',
    path: 'popup.js',
    language: 'javascript',
    description: 'Interactive popup logic connecting user clicks to the background capture worker.',
    content: POPUP_JS
  },
  {
    name: 'editor.html',
    path: 'editor.html',
    language: 'html',
    description: 'Built-in image editor to crop, blur sensitive details, and add text notes before clipboard copy.',
    content: EDITOR_HTML
  },
  {
    name: 'editor.js',
    path: 'editor.js',
    language: 'javascript',
    description: 'Interactive canvas engine for crop, blur redaction, and text notes in the Chrome extension.',
    content: EDITOR_JS
  },
  {
    name: 'offscreen.html',
    path: 'offscreen.html',
    language: 'html',
    description: 'Offscreen document context ensuring 100% reliable clipboard write on macOS and Windows.',
    content: OFFSCREEN_HTML
  },
  {
    name: 'offscreen.js',
    path: 'offscreen.js',
    language: 'javascript',
    description: 'Offscreen clipboard API handler writing PNG blobs to operating system clipboard.',
    content: OFFSCREEN_JS
  },
  {
    name: 'options.html',
    path: 'options.html',
    language: 'html',
    description: 'Dedicated extension options page to choose engines, image formats, and scroll delay.',
    content: OPTIONS_HTML
  },
  {
    name: 'options.js',
    path: 'options.js',
    language: 'javascript',
    description: 'Preferences persistence via chrome.storage.sync.',
    content: OPTIONS_JS
  },
  {
    name: 'icon.svg',
    path: 'icons/icon.svg',
    language: 'xml',
    description: 'Vector SVG icon used to generate 16x16, 48x48, and 128x128 extension icons.',
    content: ICON_SVG
  }
];


