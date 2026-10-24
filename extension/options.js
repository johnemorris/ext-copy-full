// Options page script
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
