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
  const activeEngine = (settings.engine || 'devtools').toLowerCase();

  if (activeEngine === 'devtools') {
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

    // 1. Get true probed dimensions
    const prep = await prepareTabForCapture(tabId);
    let width = prep.totalWidth;
    let height = prep.totalHeight;

    // 2. Query layout metrics for fallback
    try {
      const metrics = await chrome.debugger.sendCommand(target, 'Page.getLayoutMetrics');
      const contentSize = metrics.cssContentSize || metrics.contentSize || null;
      if (contentSize) {
        width = Math.max(width, Math.ceil(contentSize.width));
        // Only trust CDP height if window is actually scrollable
        if (prep.maxScroll > 15) {
          height = Math.max(height, Math.ceil(contentSize.height));
        }
      }
    } catch (_) {}

    if (height > 16000) {
      throw new Error('Page height exceeds single CDP GPU texture limit; switching to scroll & stitch');
    }

    const format = settings.format === 'jpeg' ? 'jpeg' : 'png';
    const clip = {
      x: 0,
      y: 0,
      width: Math.max(width, 1024),
      height: Math.max(height, 768),
      scale: 1
    };

    const screenshotParams = {
      format,
      fromSurface: true,
      captureBeyondViewport: true,
      clip
    };
    if (format === 'jpeg') {
      screenshotParams.quality = settings.jpegQuality || 90;
    }

    const screenshot = await chrome.debugger.sendCommand(
      target,
      'Page.captureScreenshot',
      screenshotParams
    );

    if (!screenshot || !screenshot.data) {
      throw new Error('CDP capture returned empty data');
    }

    return 'data:image/' + format + ';base64,' + screenshot.data;
  } finally {
    try {
      await cleanupTabAfterCapture(tabId);
    } catch (_) {}
    try {
      await chrome.debugger.detach(target);
    } catch (_) {}
  }
}

// Universal Scroll & Stitch Engine (Runs via direct scripting, works on Cloudflare, SPAs, and all pages)
async function captureWithStitch(tabId, settings) {
  // 1. Prepare page: inject instant scroll style, identify target, get accurate dimensions
  const prep = await prepareTabForCapture(tabId);
  const { totalWidth, totalHeight, viewportHeight, devicePixelRatio, maxScroll } = prep;

  // If the page is not scrollable (single screen or very short page)
  if (maxScroll <= 15 || totalHeight <= viewportHeight + 15) {
    const chunkDataUrl = await chrome.tabs.captureVisibleTab(null, {
      format: settings.format || 'png'
    });
    await cleanupTabAfterCapture(tabId);
    return { dataUrl: chunkDataUrl };
  }

  const frames = [];
  let previousScrollY = 0;
  let canvasDrawnHeight = viewportHeight;
  let step = 0;
  const maxSteps = Math.ceil(totalHeight / (viewportHeight * 0.4)) + 4; // safety threshold

  // Step 0: Ensure we start at the top
  const initialScroll = await scrollTabTo(tabId, 0, false);
  await new Promise((r) => setTimeout(r, 140));

  const firstDataUrl = await chrome.tabs.captureVisibleTab(null, {
    format: 'png'
  });
  frames.push({
    scrollY: 0,
    deltaY: viewportHeight,
    isFirst: true,
    dataUrl: firstDataUrl
  });

  previousScrollY = initialScroll.actualY;

  // Step 1..N: Step down until end of document
  while (canvasDrawnHeight < totalHeight && step < maxSteps) {
    step++;
    const targetScrollY = Math.min(previousScrollY + viewportHeight, maxScroll);

    // If target has nowhere to go beyond previous, we are at the bottom
    if (targetScrollY <= previousScrollY) {
      break;
    }

    const scrollResult = await scrollTabTo(tabId, targetScrollY, settings.hideFixedElements);

    // Repaint wait (generous enough for lazy-loaded assets)
    await new Promise((r) => setTimeout(r, 160));

    const actualY = scrollResult.actualY;
    const deltaY = actualY - previousScrollY;

    // CRITICAL: If the page didn't actually move down, we reached the bottom or it cannot scroll.
    // Break immediately to prevent repeating identical frames!
    if (deltaY <= 0) {
      break;
    }

    const chunkDataUrl = await chrome.tabs.captureVisibleTab(null, {
      format: 'png'
    });

    frames.push({
      scrollY: actualY,
      deltaY: deltaY,
      isFirst: false,
      dataUrl: chunkDataUrl
    });

    canvasDrawnHeight += deltaY;
    previousScrollY = actualY;

    if (actualY >= maxScroll) {
      break;
    }
  }

  // Restore original scroll & visible headers
  await cleanupTabAfterCapture(tabId);

  // Delegate stitching to offscreen document
  const response = await chrome.runtime.sendMessage({
    target: 'offscreen',
    action: 'STITCH_FRAMES',
    frames,
    totalWidth,
    totalHeight: canvasDrawnHeight,
    viewportHeight,
    dpr: devicePixelRatio,
    format: settings.format || 'png'
  });

  if (!response || !response.success) {
    throw new Error(response?.error || 'Failed to stitch full-page frames');
  }

  return { dataUrl: response.dataUrl };
}

// Prepares tab for seamless scroll capture:
// 1. Injects temporary override for scroll-behavior and CSS transitions to guarantee instant scrolling
// 2. Probes true maximum scroll capacity directly in the browser DOM (immune to inflated scrollHeight)
// 3. Identifies the primary scroll container (window or nested overflow element)
async function prepareTabForCapture(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        // 1. Force instant scrolling across all elements
        let style = document.getElementById('__snapfull_instant_scroll__');
        if (!style) {
          style = document.createElement('style');
          style.id = '__snapfull_instant_scroll__';
          style.textContent = `
            html, body, * {
              scroll-behavior: auto !important;
              transition-duration: 0.001ms !important;
              animation-duration: 0.001ms !important;
            }
          `;
          (document.head || document.documentElement).appendChild(style);
        }

        // 2. Save original scroll positions
        const origX = window.scrollX || window.pageXOffset || 0;
        const origY = window.scrollY || window.pageYOffset || 0;
        window.__snapfull_orig_scroll = { x: origX, y: origY };

        // 3. Probe TRUE window max scroll by testing browser clamp
        window.scrollTo(0, 99999999);
        const winMaxScroll = window.scrollY || window.pageYOffset || 0;
        // Restore immediately
        window.scrollTo(origX, origY);

        const vWidth = window.innerWidth;
        const vHeight = window.innerHeight;
        const dpr = window.devicePixelRatio || 1;

        // If window can genuinely scroll (more than 15px beyond viewport)
        if (winMaxScroll > 15) {
          return {
            isContainer: false,
            totalWidth: Math.max(document.documentElement.scrollWidth, document.body ? document.body.scrollWidth : 0, vWidth),
            totalHeight: winMaxScroll + vHeight,
            viewportWidth: vWidth,
            viewportHeight: vHeight,
            devicePixelRatio: dpr,
            maxScroll: winMaxScroll
          };
        }

        // Window cannot scroll. Probe for nested scrollable containers
        let bestContainer = null;
        let maxContainerScroll = 0;

        const candidateNodes = document.querySelectorAll('main, #root, #__next, #app, [class*="scroll"], [class*="content"], [class*="wrap"], [id*="wrap"], div, section, article');
        for (const el of candidateNodes) {
          if (el === document.documentElement || el === document.body) continue;
          const ch = el.clientHeight;
          if (ch > 200) {
            const origTop = el.scrollTop;
            el.scrollTop = 99999999;
            const probedMax = el.scrollTop;
            el.scrollTop = origTop;

            if (probedMax > maxContainerScroll && probedMax > 20) {
              maxContainerScroll = probedMax;
              bestContainer = el;
            }
          }
        }

        if (bestContainer && maxContainerScroll > 20) {
          bestContainer.setAttribute('data-snapfull-scroll-container', 'true');
          window.__snapfull_orig_container_scroll = bestContainer.scrollTop;
          return {
            isContainer: true,
            totalWidth: Math.max(bestContainer.scrollWidth, vWidth),
            totalHeight: maxContainerScroll + vHeight,
            viewportWidth: vWidth,
            viewportHeight: vHeight,
            devicePixelRatio: dpr,
            maxScroll: maxContainerScroll
          };
        }

        // Truly a single-screen page!
        return {
          isContainer: false,
          totalWidth: vWidth,
          totalHeight: vHeight,
          viewportWidth: vWidth,
          viewportHeight: vHeight,
          devicePixelRatio: dpr,
          maxScroll: 0
        };
      }
    });

    if (results && results[0] && results[0].result) {
      return results[0].result;
    }
  } catch (err) {
    console.warn('prepareTabForCapture error:', err);
  }

  return {
    isContainer: false,
    totalWidth: 1280,
    totalHeight: 1080,
    viewportWidth: 1280,
    viewportHeight: 1080,
    devicePixelRatio: 1,
    maxScroll: 0
  };
}

// Direct DOM measurements via executeScript
async function getPageDimensions(tabId) {
  const prep = await prepareTabForCapture(tabId);
  return {
    totalWidth: prep.totalWidth,
    totalHeight: prep.totalHeight,
    viewportWidth: prep.viewportWidth,
    viewportHeight: prep.viewportHeight,
    devicePixelRatio: prep.devicePixelRatio
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
          window.scrollTo({ top: y, behavior: 'instant' });
          await new Promise((r) => setTimeout(r, stepDelay));
        }
        window.scrollTo({ top: origY, left: origX, behavior: 'instant' });
      },
      args: [delayMs || 120]
    });
  } catch (e) {
    console.warn('Scroll warmup ignored:', e);
  }
}

// Direct scroll step: scrolls window and/or active container, and returns actual reached scroll position
async function scrollTabTo(tabId, scrollY, hideFixed) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: (targetY, shouldHideFixed) => {
        // 1. Scroll window
        window.scrollTo({ top: targetY, left: 0, behavior: 'instant' });

        // 2. Also scroll container if marked
        const container = document.querySelector('[data-snapfull-scroll-container="true"]');
        if (container) {
          container.scrollTop = targetY;
        }

        // 3. Measure actual visual scroll position achieved
        const docY = window.scrollY || window.pageYOffset || 0;
        const contY = container ? container.scrollTop : 0;
        const actualY = container ? contY : docY;

        // 4. Optionally hide fixed / sticky elements when scrolled past top to prevent ghosting
        if (shouldHideFixed && actualY > 0) {
          const allEls = document.querySelectorAll('*');
          for (const el of allEls) {
            if (!el.getAttribute('data-snapfull-fixed-processed')) {
              const style = window.getComputedStyle(el);
              const pos = style.position;
              if (pos === 'fixed' || pos === 'sticky') {
                el.setAttribute('data-snapfull-fixed-processed', 'true');
                el.setAttribute('data-snapfull-orig-visibility', el.style.visibility || '');
                el.style.visibility = 'hidden';
              }
            }
          }
        }

        return { actualY };
      },
      args: [scrollY, hideFixed]
    });

    if (results && results[0] && results[0].result) {
      return results[0].result;
    }
  } catch (e) {
    console.warn('scrollTabTo error:', e);
  }

  // If scroll failed, return 0 so the loop breaks instead of duplicating frames
  return { actualY: 0 };
}

// Cleans up injected styles, restores scroll position, and unhides fixed elements
async function cleanupTabAfterCapture(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        // Remove style override
        const style = document.getElementById('__snapfull_instant_scroll__');
        if (style) style.remove();

        // Restore window scroll
        if (window.__snapfull_orig_scroll) {
          window.scrollTo(window.__snapfull_orig_scroll.x, window.__snapfull_orig_scroll.y);
          delete window.__snapfull_orig_scroll;
        }

        // Restore container scroll
        const container = document.querySelector('[data-snapfull-scroll-container="true"]');
        if (container) {
          if (typeof window.__snapfull_orig_container_scroll === 'number') {
            container.scrollTop = window.__snapfull_orig_container_scroll;
            delete window.__snapfull_orig_container_scroll;
          }
          container.removeAttribute('data-snapfull-scroll-container');
        }

        // Restore visibility of fixed / sticky elements
        const hiddenEls = document.querySelectorAll('[data-snapfull-fixed-processed="true"]');
        for (const el of hiddenEls) {
          const orig = el.getAttribute('data-snapfull-orig-visibility');
          el.style.visibility = orig || '';
          el.removeAttribute('data-snapfull-fixed-processed');
          el.removeAttribute('data-snapfull-orig-visibility');
        }
      }
    });
  } catch (e) {
    console.warn('cleanupTabAfterCapture notice:', e);
  }
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
