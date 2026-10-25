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

  if (message.action === 'STITCH_FRAMES' || message.action === 'STITCH_AND_COPY') {
    stitchFrames(message)
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

// Stitches tiled viewport screenshots into a single seamless full-page image
async function stitchFrames({ frames, totalWidth, totalHeight, viewportHeight, dpr = 1, format }) {
  if (!frames || frames.length === 0) {
    throw new Error('No frames provided for stitching');
  }

  // Fast-path: single frame needs no canvas operations
  if (frames.length === 1) {
    return { dataUrl: frames[0].dataUrl };
  }

  let calculatedHeight = 0;
  const hasDeltaInfo = frames.some((f) => typeof f.deltaY === 'number');

  if (hasDeltaInfo) {
    for (const frame of frames) {
      calculatedHeight += frame.deltaY || 0;
    }
  }
  if (!calculatedHeight) {
    calculatedHeight = totalHeight || viewportHeight || 1080;
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(totalWidth * dpr);
  canvas.height = Math.round(calculatedHeight * dpr);
  const ctx = canvas.getContext('2d');

  let currentDestY = 0;

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const imgWidth = img.width;
        const imgHeight = img.height;

        if (hasDeltaInfo) {
          const isFirst = frame.isFirst || i === 0;
          if (isFirst) {
            // Draw full first viewport
            const drawH = Math.min(canvas.height, Math.round((frame.deltaY || viewportHeight) * dpr));
            ctx.drawImage(img, 0, 0, imgWidth, imgHeight, 0, 0, canvas.width, drawH);
            currentDestY += drawH;
          } else {
            // Seamless slice: only the newly revealed bottom strip of the screen
            const ratioY = imgHeight / viewportHeight;
            const sliceHeight = Math.round((frame.deltaY || viewportHeight) * ratioY);
            const sliceStartY = Math.max(0, imgHeight - sliceHeight);
            const destH = Math.round((frame.deltaY || viewportHeight) * dpr);

            ctx.drawImage(
              img,
              0,
              sliceStartY,
              imgWidth,
              sliceHeight,
              0,
              currentDestY,
              canvas.width,
              destH
            );
            currentDestY += destH;
          }
        } else {
          // Legacy fallback: direct scrollY positioning
          const destY = Math.round((frame.scrollY || 0) * dpr);
          ctx.drawImage(img, 0, destY);
        }
        resolve();
      };
      img.onerror = reject;
      img.src = frame.dataUrl;
    });
  }

  const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const quality = format === 'jpeg' ? 0.92 : undefined;
  const dataUrl = canvas.toDataURL(mime, quality);

  return { dataUrl };
}

