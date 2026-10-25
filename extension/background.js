// Background Service Worker for SnapFull (Manifest V3)
// Robust full-page screenshot engine with Chrome DevTools Protocol & Scroll-and-Stitch
// Offscreen document handles 100% reliable canvas stitching and clipboard writing on all pages (including Cloudflare)

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(['settings'], (res) => {
    if (!res.settings) {
      chrome.storage.sync.set({
        settings: {
          engine: 'devtools', // 'devtools' or 'stitch'
          autoCopyClipboard: true,
          autoDownloadFile: false,
          autoScrollWarmup: true,
          scrollDelayMs: 120,
          format: 'png',
          jpegQuality: 92,
          hideFixedElements: false,
          playShutterSound: true,
          openEditor: false
        }
      });
    }
  });
});

// Handle keyboard shortcut command (Alt+Shift+S or Option+Shift+S)
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'capture-full-page') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
      startCapture(tab.id);
    }
  }
});

// Listen for messages from popup or editor
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
    } catch (cdpErr) {
      console.warn('DevTools CDP capture failed, switching to Scroll & Stitch engine:', cdpErr);
      const stitchResult = await captureWithStitch(tabId, settings);
      dataUrl = stitchResult.dataUrl;
    }
  } else {
    const stitchResult = await captureWithStitch(tabId, settings);
    dataUrl = stitchResult.dataUrl;
  }

  if (!dataUrl) {
    throw new Error('Screenshot capture produced an empty image.');
  }

  // Copy to clipboard with active tab focus
  if (settings.autoCopyClipboard) {
    copied = await writeImageToClipboard(tabId, dataUrl);
  }


  // 4. Cache last capture for built-in editor
  await chrome.storage.local.set({ lastCaptureDataUrl: dataUrl });

  // 5. Optionally save to file
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

  // 6. If user requested editor
  if (settings.openEditor) {
    await chrome.tabs.create({ url: chrome.runtime.getURL('editor.html') });
  }

  // 7. Try showing toast overlay in tab (gracefully ignored if page restricts content scripts)
  try {
    const toastMsg = copied && downloaded
      ? 'Entire page captured: Saved to clipboard & Downloaded!'
      : copied
      ? 'Entire page captured & copied to clipboard!'
      : 'Entire page captured!';
    try {
      await chrome.tabs.sendMessage(tabId, { action: 'SHOW_TOAST', message: toastMsg });
    } catch (_) {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js']
      });
      await chrome.tabs.sendMessage(tabId, { action: 'SHOW_TOAST', message: toastMsg });
    }
  } catch (_) {
    // If content script was blocked by Cloudflare CSP, clipboard copy already succeeded!
  }

  return { success: true, copied, downloaded, dataUrl };
}

// DevTools Protocol Engine (CDP Page.captureScreenshot)
async function captureWithCDP(tabId, settings) {
  const target = { tabId };
  await chrome.debugger.attach(target, '1.3');

  try {
    await chrome.debugger.sendCommand(target, 'Page.enable');

    // Query layout metrics
    const metrics = await chrome.debugger.sendCommand(target, 'Page.getLayoutMetrics');
    const contentSize = metrics.cssContentSize || metrics.contentSize || null;

    let width = contentSize ? Math.ceil(contentSize.width) : 0;
    let height = contentSize ? Math.ceil(contentSize.height) : 0;

    // Fallback to DOM measurements if metrics are empty
    if (!width || !height) {
      const domDim = await getPageDimensions(tabId);
      width = domDim.totalWidth;
      height = domDim.totalHeight;
    }

    if (height > 16000) {
      throw new Error('Page height exceeds single CDP GPU texture limit; switching to scroll & stitch');
    }

    // Override device metrics to encompass the entire document
    await chrome.debugger.sendCommand(target, 'Emulation.setDeviceMetricsOverride', {
      width: Math.max(width, 1024),
      height: Math.max(height, 768),
      deviceScaleFactor: 1,
      mobile: false
    });

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

  // Delegate stitching to offscreen document
  const response = await chrome.runtime.sendMessage({
    target: 'offscreen',
    action: 'STITCH_FRAMES',
    frames,
    totalWidth,
    totalHeight,
    viewportHeight,
    dpr: devicePixelRatio,
    format: settings.format || 'png'
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

// Writes image directly to macOS/Windows clipboard using active tab document focus
async function writeImageToClipboard(tabId, dataUrl) {
  // Strategy 1: Active Tab execution (Guarantees document focus required by macOS)
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      args: [dataUrl],
      func: async (url) => {
        try {
          window.focus();
          // Pure JS base64 to Blob conversion (safe from CSP connect-src blocks)
          const parts = url.split(',');
          const mimeMatch = parts[0].match(/:(.*?);/);
          const mime = mimeMatch ? mimeMatch[1] : 'image/png';
          const bstr = atob(parts[1]);
          let n = bstr.length;
          const u8arr = new Uint8Array(n);
          while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
          }
          let pngBlob = new Blob([u8arr], { type: mime });

          // Guarantee PNG MIME for OS clipboard
          if (mime !== 'image/png') {
            pngBlob = await new Promise((resolve, reject) => {
              const img = new Image();
              img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas blob failed'))), 'image/png');
              };
              img.onerror = reject;
              img.src = url;
            });
          }

          const item = new ClipboardItem({ 'image/png': pngBlob });
          await navigator.clipboard.write([item]);
          return { success: true };
        } catch (err) {
          return { success: false, error: err.message };
        }
      }
    });

    if (results && results[0]?.result?.success) {
      return true;
    }
  } catch (err) {
    console.warn('Tab clipboard write notice:', err);
  }

  // Strategy 2: Offscreen fallback
  try {
    await ensureOffscreenDocument();
    const response = await chrome.runtime.sendMessage({
      target: 'offscreen',
      action: 'COPY_IMAGE_TO_CLIPBOARD',
      dataUrl
    });
    if (response?.success) return true;
  } catch (_) {}

  return false;
}
