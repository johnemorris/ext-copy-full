// Offscreen document script for reliable clipboard writes in Chrome Manifest V3
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

  // If blob is not image/png, convert it via an in-memory canvas
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
