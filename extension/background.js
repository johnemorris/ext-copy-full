// Background Service Worker for SnapFull (Manifest V3)
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
          playShutterSound: true,
          openEditor: false
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

  // 1. Inject content script helpers if needed
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content.js']
  });

  // 2. Perform lazy-scroll warmup if requested
  if (settings.autoScrollWarmup) {
    await chrome.tabs.sendMessage(tabId, {
      action: 'PRELOAD_PAGE',
      delayMs: settings.scrollDelayMs || 150
    });
  }

  // 3. Choose engine
  let dataUrl = '';
  if (settings.engine === 'devtools') {
    try {
      dataUrl = await captureWithCDP(tabId, settings);
    } catch (e) {
      console.warn('CDP capture failed, falling back to scroll-stitch:', e);
      dataUrl = await captureWithStitch(tabId, settings);
    }
  } else {
    dataUrl = await captureWithStitch(tabId, settings);
  }

  // 4. Delegate clipboard write to content script (content scripts have DOM clipboard permissions)
  let copied = false;
  if (settings.autoCopyClipboard) {
    const copyResult = await chrome.tabs.sendMessage(tabId, {
      action: 'COPY_TO_CLIPBOARD',
      dataUrl
    });
    copied = copyResult?.success ?? false;
  }

  // Cache last capture for built-in editor
  await chrome.storage.local.set({ lastCaptureDataUrl: dataUrl });

  // 5. Optionally save to file
  let downloaded = false;
  if (settings.autoDownloadFile) {
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
  }

  // 6. If user requested direct editor opening
  if (settings.openEditor) {
    await chrome.tabs.create({ url: chrome.runtime.getURL('editor.html') });
  }

  // 7. Notify tab with success overlay confirmation toast
  await chrome.tabs.sendMessage(tabId, {
    action: 'SHOW_TOAST',
    message: copied && downloaded
      ? 'Entire page captured: Saved to clipboard & Downloaded!'
      : copied
      ? 'Entire page captured & copied to clipboard!'
      : 'Entire page captured & downloaded!'
  });

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
    const { contentSize } = metrics;
    const width = Math.ceil(contentSize.width);
    const height = Math.ceil(contentSize.height);

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

// Scroll & Stitch Engine (fallback without debugger banner)
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
    await new Promise((r) => setTimeout(r, 120));

    const chunkDataUrl = await chrome.tabs.captureVisibleTab(null, {
      format: 'png'
    });
    frames.push({ scrollY, dataUrl: chunkDataUrl });
  }

  // Restore original scroll
  await chrome.tabs.sendMessage(tabId, { action: 'RESTORE_SCROLL' });

  // Delegate stitching to content script canvas
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
