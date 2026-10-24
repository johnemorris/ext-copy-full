// Popup interaction script for SnapFull
document.addEventListener('DOMContentLoaded', async () => {
  const btnCapture = document.getElementById('btnCapture');
  const btnCaptureAndEdit = document.getElementById('btnCaptureAndEdit');
  const toggleClipboard = document.getElementById('toggleClipboard');
  const toggleDownload = document.getElementById('toggleDownload');
  const toggleWarmup = document.getElementById('toggleWarmup');
  const toggleEditor = document.getElementById('toggleEditor');
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
