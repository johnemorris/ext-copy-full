# SnapFull — Chrome Full Page Capture to Clipboard Extension

> DevTools-style full-page screenshot tool for Manifest V3 that automatically copies to your clipboard, features dynamic lazy-scroll preloading, height expansion alerts, and a built-in canvas editor (crop, privacy blur/redaction, and text notes).

---

## 🚀 How to Load & Run Locally in Google Chrome (Step-by-Step)

If you cloned this repository from GitHub, **the Chrome Extension is located in the `extension/` folder**. Follow these 4 quick steps:

### Step 1: Open Chrome Extensions
Open Google Chrome (or Edge, Brave, Arc, Opera) and paste this into your URL address bar:
```text
chrome://extensions
```
and press **Enter**.

### Step 2: Enable Developer Mode
In the **top-right corner** of the `chrome://extensions` page, flip the toggle switch to turn on **"Developer mode"**.

### Step 3: Click "Load unpacked"
In the **top-left corner**, click the **"Load unpacked"** button.

### Step 4: Select the `extension/` Folder
In the file chooser dialog, navigate into this cloned repository and select the **`extension`** subfolder (the folder containing `manifest.json`):

```text
your-cloned-repo/
  ├── extension/          <--- SELECT THIS FOLDER IN CHROME!
  │   ├── manifest.json
  │   ├── background.js
  │   ├── content.js
  │   ├── popup.html
  │   ├── popup.js
  │   ├── editor.html
  │   ├── editor.js
  │   ├── options.html
  │   ├── options.js
  │   └── icons/
  ├── src/
  ├── package.json
  └── README.md
```

🎉 **That's it!** The SnapFull camera icon will appear in your Chrome toolbar.

---

## ⚡ Quick Usage Guide

1. **Capture Any Page**:
   - Navigate to any website (e.g. GitHub, Wikipedia, Reddit, any news site or dashboard).
   - Click the **SnapFull** extension icon in your toolbar, or press the keyboard shortcut:
     - **Windows/Linux**: `Alt + Shift + S`
     - **Mac**: `Option + Shift + S`
2. **Automatic Clipboard Copy**:
   - The entire document is swept and captured beyond the viewport.
   - The screenshot is **automatically written to your system clipboard** as a 24-bit PNG.
   - Switch to Slack, Google Docs, Figma, Notion, Photoshop, or Jira and press **`Ctrl + V`** (or **`Cmd + V`** on Mac) to paste!
3. **Optional Save to File**:
   - Toggle **"Save to File (PNG)"** in the popup or settings to auto-download the file to your Downloads folder.
4. **Built-in Image Editor**:
   - Click **"Capture & Edit"** or click **"Edit Image"** on the on-screen confirmation toast to:
     - **Crop**: Drag a bounding box to focus on a specific part of the page.
     - **Blur / Redact**: Draw over passwords, API tokens, emails, or personal data to apply Gaussian blur.
     - **Text Annotations**: Click to add callout notes and badges.
     - **Box / Arrows**: Highlight buttons and bugs.
     - Click **"Copy to Clipboard"** or **"Save PNG"** when done.

---

## 🖥️ Running the In-Browser Simulator & Testbed (Optional)

This repository also includes an interactive web testbed and laboratory built with React & Vite. If you want to run the web simulator:

```bash
# 1. Install dependencies
npm install

# 2. Start the dev server
npm run dev
```

Then open `http://localhost:3000` in your browser. The simulator lets you test the scrolling sweep, lazy-load warmup, dynamic height expansion, and canvas editor right in the browser.

---

## 📁 Repository Structure

| Path | Purpose |
|------|---------|
| `extension/` | **The ready-to-load Chrome Extension (Manifest V3)** |
| `extension/manifest.json` | Extension manifest with debugger, activeTab, storage, and commands permissions |
| `extension/background.js` | Service worker managing Chrome DevTools Protocol (`Page.captureScreenshot`) |
| `extension/content.js` | Content script for visual scroll progress HUD, dynamic height detection, and clipboard write |
| `extension/popup.html / .js` | Toolbar popup action with 1-click capture, toggles, and shortcuts |
| `extension/editor.html / .js` | Built-in canvas image editor for crop, blur redaction, and annotations |
| `extension/options.html / .js` | Extension options page to switch capture engines and scroll speeds |
| `extension/icons/` | Rasterized PNG icons (16px, 48px, 128px) and source SVG |
| `src/` | Interactive React simulator and documentation hub |
