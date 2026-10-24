// Background Service Worker for SnapFull (Manifest V3)
// Supports Chrome DevTools Protocol (CDP Page.captureScreenshot) with seamless Scroll & Stitch fallback
// Uses Chrome Offscreen Document for 100% reliable clipboard write on macOS and Windows

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(['settings'], (res) => {
    if (!res.settings) {
      chrome.storage.sync.set({
        settings: {
          engine: 'devtools', // 'devtools' or 'stitch'
          autoCopyClipboard: true,
          autoDownloadFile: false,
          autoScrollWarmup: true,
          scrollDelayMs: 150,
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

// Listen for messages from popup, editor, or content scripts
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

  // 1. Inject content script into active tab
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content.js']
  });

  // 2. Perform lazy-scroll warmup sweep if requested
  if (settings.autoScrollWarmup) {
    try {
      await chrome.tabs.sendMessage(tabId, {
        action: 'PRELOAD_PAGE',
        delayMs: settings.scrollDelayMs || 150
      });
    } catch (e) {
      console.warn('Preload scroll warning:', e);
    }
  }

  // 3. Choose capture engine (DevTools CDP or Smooth Scroll-and-Stitch)
  let dataUrl = '';
  if (settings.engine === 'devtools') {
    try {
      dataUrl = await captureWithCDP(tabId, settings);
    } catch (cdpErr) {
      console.warn('DevTools CDP capture failed, falling back to Scroll & Stitch:', cdpErr);
      dataUrl = await captureWithStitch(tabId, settings);
    }
  } else {
    dataUrl = await captureWithStitch(tabId, settings);
  }

  if (!dataUrl) {
    throw new Error('Screenshot capture produced empty image.');
  }

  // 4. Cache last capture for built-in editor
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

  // 7. Open editor if requested
  if (settings.openEditor) {
    await chrome.tabs.create({ url: chrome.runtime.getURL('editor.html') });
  }

  // 8. Notify the tab with confirmation notification
  try {
    await chrome.tabs.sendMessage(tabId, {
      action: 'SHOW_TOAST',
      message: copied && downloaded
        ? 'Entire page captured: Saved to clipboard & Downloaded!'
        : copied
        ? 'Entire page captured & copied to clipboard!'
        : downloaded
        ? 'Entire page captured & downloaded!'
        : 'Entire page captured!'
    });
  } catch (_) {
    // If tab was closed or unresponsive, ignore toast error
  }

  return { success: true, copied, downloaded, dataUrl };
}

// DevTools Protocol Engine (CDP)
async function captureWithCDP(tabId, settings) {
  const target = { tabId };
  await chrome.debugger.attach(target, '1.3');

  try {
    await chrome.debugger.sendCommand(target, 'Page.enable');

    // Get true document metrics (compatible with all Chrome versions)
    const metrics = await chrome.debugger.sendCommand(target, 'Page.getLayoutMetrics');
    const contentSize = metrics.cssContentSize || metrics.contentSize || {
      width: metrics.layoutViewport?.clientWidth || 1920,
      height: metrics.layoutViewport?.clientHeight || 1080
    };

    const width = Math.ceil(contentSize.width || 1280);
    const height = Math.ceil(contentSize.height || 800);

    // If page is extraordinarily tall (> 16,000px), GPU texture limits can fail single CDP capture
    if (height > 16000) {
      throw new Error('Page height exceeds single CDP GPU texture limit; switching to scroll & stitch');
    }

    // Override device metrics
    await chrome.debugger.sendCommand(target, 'Emulation.setDeviceMetricsOverride', {
      width,
      height,
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

    // Reset emulation metrics
    await chrome.debugger.sendCommand(target, 'Emulation.clearDeviceMetricsOverride');

    return 'data:image/' + format + ';base64,' + screenshot.data;
  } finally {
    try {
      await chrome.debugger.detach(target);
    } catch (_) {}
  }
}

// Scroll & Stitch Engine (Universal compatibility on all pages)
async function captureWithStitch(tabId, settings) {
  const dimensions = await chrome.tabs.sendMessage(tabId, { action: 'GET_DIMENSIONS' });
  const { totalWidth, totalHeight, viewportHeight, devicePixelRatio } = dimensions;

  const numSteps = Math.ceil(totalHeight / viewportHeight);
  const frames = [];

  for (let i = 0; i < numSteps; i++) {
    const scrollY = i * viewportHeight;
    await chrome.tabs.sendMessage(tabId, {
      action: 'SCROLL_TO',
      y: scrollY,
      hideFixed: settings.hideFixedElements && i > 0
    });

    // Wait for paint
    await new Promise((r) => setTimeout(r, 140));

    const chunkDataUrl = await chrome.tabs.captureVisibleTab(null, {
      format: 'png'
    });
    frames.push({ scrollY, dataUrl: chunkDataUrl });
  }

  // Restore original scroll
  await chrome.tabs.sendMessage(tabId, { action: 'RESTORE_SCROLL' });

  // Stitch frames on offscreen canvas inside tab
  const stitched = await chrome.tabs.sendMessage(tabId, {
    action: 'STITCH_FRAMES',
    frames,
    totalWidth,
    totalHeight,
    viewportHeight,
    dpr: devicePixelRatio,
    format: settings.format || 'png'
  });

  return stitched.dataUrl;
}

// Offscreen Document clipboard writer (avoids document-not-focused errors on macOS)
async function copyToClipboardViaOffscreen(dataUrl) {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT']
  });

  if (!existingContexts.length) {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['CLIPBOARD'],
      justification: 'Write screenshot image to system clipboard'
    });
  }

  const response = await chrome.runtime.sendMessage({
    target: 'offscreen',
    action: 'COPY_IMAGE_TO_CLIPBOARD',
    dataUrl
  });

  return response?.success ?? false;
}
