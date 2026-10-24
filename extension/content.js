// Content Script for SnapFull
// Handles smooth lazy-scroll preloading, visual progress HUD, sticky elements, canvas stitching, and clipboard copy

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
    hud.style.cssText = `
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
    `;

    hud.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <div style="width: 14px; height: 14px; border: 2px solid #38bdf8; border-top-color: transparent; border-radius: 50%; animation: __snap_spin 0.8s linear infinite;"></div>
          <span style="font-weight: 700; color: #f8fafc; font-size: 13px;">Full Page Capture</span>
        </div>
        <span id="__snap_percent" style="font-family: monospace; font-weight: 700; color: #38bdf8; font-size: 13px;">0%</span>
      </div>

      <!-- Visual Progress Bar -->
      <div style="width: 100%; height: 6px; background: #334155; border-radius: 3px; overflow: hidden; position: relative;">
        <div id="__snap_bar" style="width: 0%; height: 100%; background: linear-gradient(90deg, #0284c7, #38bdf8); transition: width 0.15s ease-out;"></div>
      </div>

      <!-- Scanned metrics -->
      <div style="display: flex; justify-content: space-between; font-size: 11px; color: #94a3b8;">
        <span id="__snap_scanned_text">Scanned: 0 px</span>
        <span id="__snap_total_text">Total: ${Math.round(totalDocHeight)} px</span>
      </div>

      <!-- Dynamic alert when additional scrolling is required -->
      <div id="__snap_expansion_badge" style="display: none; background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.4); color: #fbbf24; padding: 6px 10px; border-radius: 8px; font-size: 11px;">
        ⚠️ Additional scrolling required: Page expanded dynamically! Continuing capture pass...
      </div>

      <style>@keyframes __snap_spin { to { transform: rotate(360deg); } }</style>
    `;
    document.body.appendChild(hud);

    return {
      update(percent, scannedY, currentTotal) {
        const pctEl = hud.querySelector('#__snap_percent');
        const barEl = hud.querySelector('#__snap_bar');
        const scannedEl = hud.querySelector('#__snap_scanned_text');
        const totalEl = hud.querySelector('#__snap_total_text');

        if (pctEl) pctEl.textContent = `${percent}%`;
        if (barEl) barEl.style.width = `${percent}%`;
        if (scannedEl) scannedEl.textContent = `Scanned: ${Math.round(scannedY)} px`;
        if (totalEl) totalEl.textContent = `Total: ${Math.round(currentTotal)} px`;
      },
      notifyDynamicExpansion(addedPx, newTotal) {
        const badge = hud.querySelector('#__snap_expansion_badge');
        if (badge) {
          badge.style.display = 'block';
          badge.textContent = `⚠️ Additional scrolling required: Page grew by +${Math.round(addedPx)}px. Continuing pass...`;
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
    toast.style.cssText = `
      position: fixed;
      top: 24px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 2147483647;
      background: #0f172a;
      color: #f8fafc;
      border: 1px solid #38bdf8;
      padding: 12px 20px;
      border-radius: 14px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      font-weight: 600;
      box-shadow: 0 16px 36px rgba(0, 0, 0, 0.5), 0 0 16px rgba(56, 189, 248, 0.2);
      display: flex;
      align-items: center;
      gap: 12px;
      animation: __snap_fade_in 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    `;

    toast.innerHTML = `
      <div style="width: 22px; height: 22px; border-radius: 50%; background: #10b981; display: flex; align-items: center; justify-content: center; color: #020617; flex-shrink: 0;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <div>
        <div style="color: #38bdf8; font-weight: 700; font-size: 13px;">Full Page Successfully Captured!</div>
        <div style="font-size: 11px; color: #cbd5e1; font-weight: normal;">${text}</div>
      </div>
      <button id="__snap_btn_edit" style="margin-left: 8px; background: #38bdf8; color: #0f172a; border: none; padding: 6px 12px; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer; transition: filter 0.15s ease;">
        ✏️ Edit Image
      </button>
      <style>
        @keyframes __snap_fade_in { from { opacity: 0; transform: translateX(-50%) translateY(-10px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
      </style>
    `;

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
