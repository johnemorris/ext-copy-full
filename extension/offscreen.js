// Offscreen document script for SnapFull
// Handles canvas stitching and reliable clipboard writing in Chrome Manifest V3
// Completely independent of web page context, CSP, or focus restrictions

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== 'offscreen') return;

  if (message.action === 'COPY_IMAGE_TO_CLIPBOARD') {
    copyDataUrlToClipboard(message.dataUrl)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // async
  }

  if (message.action === 'STITCH_AND_COPY') {
    stitchFramesAndCopy(message)
      .then((res) => sendResponse({ success: true, dataUrl: res.dataUrl }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // async
  }
});

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

function convertBlobToPng(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas toBlob failed'))), 'image/png');
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

// Stitches tiled viewport screenshots into a single full-page image and copies to clipboard
async function stitchFramesAndCopy({ frames, totalWidth, totalHeight, viewportHeight, dpr, format, autoCopy }) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(totalWidth * dpr);
  canvas.height = Math.round(totalHeight * dpr);
  const ctx = canvas.getContext('2d');

  for (const frame of frames) {
    await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const destY = Math.round(frame.scrollY * dpr);
        ctx.drawImage(img, 0, destY);
        resolve();
      };
      img.onerror = reject;
      img.src = frame.dataUrl;
    });
  }

  const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const dataUrl = canvas.toDataURL(mime, 0.92);

  if (autoCopy !== false) {
    await new Promise((resolve, reject) => {
      canvas.toBlob(async (blob) => {
        if (!blob) {
          reject(new Error('Canvas toBlob failed during stitch'));
          return;
        }
        try {
          let pngBlob = blob;
          if (blob.type !== 'image/png') {
            pngBlob = await convertBlobToPng(blob);
          }
          const item = new ClipboardItem({ 'image/png': pngBlob });
          await navigator.clipboard.write([item]);
          resolve();
        } catch (clipErr) {
          reject(clipErr);
        }
      }, 'image/png');
    });
  }

  return { dataUrl };
}
