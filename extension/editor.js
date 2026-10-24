// Editor script for SnapFull Chrome Extension
let canvas, ctx;
let baseImage = null;
let currentTool = 'crop';
let isDrawing = false;
let startX = 0, startY = 0;
let cropRegion = null;
let blurBoxes = [];
let textNotes = [];
let boxShapes = [];
let history = [];

document.addEventListener('DOMContentLoaded', async () => {
  canvas = document.getElementById('editorCanvas');
  ctx = canvas.getContext('2d');

  // Load capture data from chrome.storage.local
  chrome.storage.local.get(['lastCaptureDataUrl'], (res) => {
    const dataUrl = res.lastCaptureDataUrl;
    if (dataUrl) {
      loadImage(dataUrl);
    } else {
      document.getElementById('dimensionsDisplay').textContent = 'No capture found. Open via extension.';
    }
  });

  setupTools();
  setupActions();
});

function loadImage(src) {
  baseImage = new Image();
  baseImage.onload = () => {
    cropRegion = { x: 0, y: 0, w: baseImage.width, h: baseImage.height };
    document.getElementById('dimensionsDisplay').textContent = `${baseImage.width} × ${baseImage.height} px`;
    render();
  };
  baseImage.src = src;
}

function pushHistory() {
  history.push({
    crop: { ...cropRegion },
    blurs: JSON.parse(JSON.stringify(blurBoxes)),
    texts: JSON.parse(JSON.stringify(textNotes)),
    boxes: JSON.parse(JSON.stringify(boxShapes))
  });
  if (history.length > 20) history.shift();
}

function render() {
  if (!baseImage) return;
  const sx = cropRegion.x;
  const sy = cropRegion.y;
  const sw = cropRegion.w;
  const sh = cropRegion.h;

  canvas.width = sw;
  canvas.height = sh;

  // Base image
  ctx.drawImage(baseImage, sx, sy, sw, sh, 0, 0, sw, sh);

  // Blur boxes
  blurBoxes.forEach((b) => {
    const bx = b.x - sx;
    const by = b.y - sy;
    if (b.w <= 0 || b.h <= 0) return;

    const sub = document.createElement('canvas');
    sub.width = b.w;
    sub.height = b.h;
    const sCtx = sub.getContext('2d');
    sCtx.drawImage(canvas, bx, by, b.w, b.h, 0, 0, b.w, b.h);

    ctx.save();
    ctx.filter = 'blur(12px)';
    ctx.beginPath();
    ctx.rect(bx, by, b.w, b.h);
    ctx.clip();
    ctx.drawImage(sub, bx, by, b.w, b.h);
    ctx.restore();

    ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(bx, by, b.w, b.h);
  });

  // Box shapes
  boxShapes.forEach((box) => {
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.strokeRect(box.x - sx, box.y - sy, box.w, box.h);
  });

  // Text notes
  textNotes.forEach((t) => {
    ctx.save();
    ctx.font = 'bold 18px -apple-system, sans-serif';
    const m = ctx.measureText(t.text);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect((t.x - sx) - 6, (t.y - sy) - 18, m.width + 12, 24);
    ctx.strokeStyle = '#38bdf8';
    ctx.strokeRect((t.x - sx) - 6, (t.y - sy) - 18, m.width + 12, 24);
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(t.text, t.x - sx, t.y - sy);
    ctx.restore();
  });
}

function setupTools() {
  const toolCrop = document.getElementById('toolCrop');
  const toolBlur = document.getElementById('toolBlur');
  const toolText = document.getElementById('toolText');
  const toolBox = document.getElementById('toolBox');
  const instr = document.getElementById('statusInstruction');

  const setTool = (tool) => {
    currentTool = tool;
    [toolCrop, toolBlur, toolText, toolBox].forEach((b) => {
      b.classList.remove('active', 'active-blur');
    });

    if (tool === 'crop') {
      toolCrop.classList.add('active');
      instr.textContent = 'Drag over the canvas to crop. Release to apply.';
    } else if (tool === 'blur') {
      toolBlur.classList.add('active-blur');
      instr.textContent = 'Drag over sensitive passwords, tokens, or names to blur them.';
    } else if (tool === 'text') {
      toolText.classList.add('active');
      instr.textContent = 'Click on canvas to type a text annotation note.';
    } else if (tool === 'box') {
      toolBox.classList.add('active');
      instr.textContent = 'Drag to draw an emphasis highlight box.';
    }
  };

  toolCrop.onclick = () => setTool('crop');
  toolBlur.onclick = () => setTool('blur');
  toolText.onclick = () => setTool('text');
  toolBox.onclick = () => setTool('box');

  canvas.onmousedown = (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    startX = (e.clientX - rect.left) * scaleX + cropRegion.x;
    startY = (e.clientY - rect.top) * scaleY + cropRegion.y;
    isDrawing = true;
    pushHistory();

    if (currentTool === 'text') {
      const txt = prompt('Enter annotation text:', 'Highlight');
      if (txt) {
        textNotes.push({ text: txt, x: startX, y: startY });
        render();
      }
      isDrawing = false;
    }
  };

  canvas.onmouseup = (e) => {
    if (!isDrawing) return;
    isDrawing = false;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const endX = (e.clientX - rect.left) * scaleX + cropRegion.x;
    const endY = (e.clientY - rect.top) * scaleY + cropRegion.y;

    const x = Math.min(startX, endX);
    const y = Math.min(startY, endY);
    const w = Math.abs(endX - startX);
    const h = Math.abs(endY - startY);

    if (w < 10 || h < 10) return;

    if (currentTool === 'crop') {
      cropRegion = { x, y, w, h };
      render();
    } else if (currentTool === 'blur') {
      blurBoxes.push({ x, y, w, h });
      render();
    } else if (currentTool === 'box') {
      boxShapes.push({ x, y, w, h });
      render();
    }
  };
}

function setupActions() {
  document.getElementById('btnUndo').onclick = () => {
    if (history.length > 0) {
      const prev = history.pop();
      cropRegion = prev.crop;
      blurBoxes = prev.blurs;
      textNotes = prev.texts;
      boxShapes = prev.boxes;
      render();
    }
  };

  document.getElementById('btnResetCrop').onclick = () => {
    if (baseImage) {
      pushHistory();
      cropRegion = { x: 0, y: 0, w: baseImage.width, h: baseImage.height };
      render();
    }
  };

  document.getElementById('btnCopy').onclick = () => {
    canvas.toBlob(async (blob) => {
      try {
        const item = new ClipboardItem({ 'image/png': blob });
        await navigator.clipboard.write([item]);
        showToast('✓ Copied edited screenshot to system clipboard!');
      } catch (err) {
        alert('Could not copy directly: ' + err.message);
      }
    }, 'image/png');
  };

  document.getElementById('btnDownload').onclick = () => {
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `snapfull_edited_${Date.now()}.png`;
    a.click();
  };
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.display = 'block';
  setTimeout(() => { t.style.display = 'none'; }, 2500);
}
