import JSZip from 'jszip';
import { EXTENSION_FILES, ICON_SVG } from '../extensionFiles';

/**
 * Render SVG icon to PNG canvas blob at specific resolution
 */
export async function renderSvgToPngBlob(svgString: string, size: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas 2D context not available'));
        return;
      }
      ctx.drawImage(img, 0, 0, size, size);
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error(`Failed to convert SVG to PNG at ${size}x${size}`));
      }, 'image/png');
    };

    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };

    img.src = url;
  });
}

/**
 * Packages all extension files into a zip file ready for "Load unpacked" or distribution
 */
export async function generateExtensionZip(): Promise<Blob> {
  const zip = new JSZip();

  // Add all text files
  for (const file of EXTENSION_FILES) {
    if (file.path === 'icons/icon.svg') {
      zip.file(file.path, file.content);
    } else {
      zip.file(file.path, file.content);
    }
  }

  // Generate real PNG icons for Chrome extension manifest
  try {
    const [png16, png48, png128] = await Promise.all([
      renderSvgToPngBlob(ICON_SVG, 16),
      renderSvgToPngBlob(ICON_SVG, 48),
      renderSvgToPngBlob(ICON_SVG, 128),
    ]);

    zip.file('icons/icon16.png', png16);
    zip.file('icons/icon48.png', png48);
    zip.file('icons/icon128.png', png128);
  } catch (err) {
    console.warn('Could not rasterize SVG icons; using SVG fallback', err);
  }

  // Add a helpful README.txt for immediate user loading
  zip.file(
    'README.txt',
    `SnapFull - Chrome Extension Installation Guide
=============================================

How to load this extension in Google Chrome / Brave / Edge:

1. Extract this entire zip file to a folder on your computer (e.g. ~/Downloads/SnapFull).
2. Open Chrome and navigate to: chrome://extensions
3. In the top right corner, toggle ON "Developer mode".
4. Click the "Load unpacked" button in the top left.
5. Select the extracted folder containing "manifest.json".
6. Done! The SnapFull camera icon will appear in your Chrome toolbar.

Quick Usage:
- Click the SnapFull extension icon or press Alt+Shift+S (or Cmd+Shift+S on Mac).
- The entire page will be captured (with optional lazy-scroll warmup).
- The screenshot is immediately copied to your system clipboard!
- Optional: Toggle "Save to file" in the popup to also download as a PNG/JPG.
`
  );

  return zip.generateAsync({ type: 'blob' });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
