# VC Capture — Business Card Scanner

A Progressive Web App (PWA) that scans business cards using your iPhone camera and extracts contact details with Google Gemini AI. Review and edit the results, then download a `.vcf` vCard file you can import directly into your Contacts app.

## Features

- **Camera capture** or image upload for business card scanning
- **AI-powered extraction** using Google Gemini 2.0 Flash (vision model)
- **Editable results** — review and correct extracted fields before saving
- **vCard (.vcf) export** — downloads a standard vCard file importable into iOS Contacts, Android, Outlook, etc.
- **PWA installable** — add to iPhone home screen for app-like experience
- **Offline shell** — cached assets via service worker
- **Dark theme** — modern, mobile-first UI optimized for iPhone

## Setup

### 1. Get a Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Create a free API key
3. The free tier includes generous usage limits for Gemini Flash

### 2. Host the App

The app is static HTML/CSS/JS — no build step required. You can serve it with any static file server:

**Local development:**
```bash
# Python
python3 -m http.server 8080

# Node.js (npx)
npx serve .

# PHP
php -S localhost:8080
```

Then open `http://localhost:8080` in your browser.

**For iPhone access**, you need HTTPS (required for camera access and PWA features). Options:

- **GitHub Pages** — push to a `gh-pages` branch
- **Netlify / Vercel** — drag and drop the folder
- **ngrok** — `ngrok http 8080` for quick HTTPS tunneling during development

### 3. Use the App

1. Open the app URL on your iPhone in Safari
2. Enter your Gemini API key (saved locally in your browser)
3. Tap **Take Photo** to capture a business card, or **Upload Image** to select from your gallery
4. Tap **Extract Details** — the AI analyzes the card
5. Review and edit the extracted fields
6. Tap **Download vCard (.vcf)** — iOS will prompt you to add the contact

### 4. Install as PWA (Optional)

On iPhone Safari:
1. Tap the **Share** button (square with arrow)
2. Select **Add to Home Screen**
3. The app will appear as a native-looking icon on your home screen

## File Structure

```
VC_Capture/
├── index.html          # Main HTML page
├── styles.css          # Mobile-first dark theme styles
├── app.js              # Application logic (capture, API, vCard)
├── sw.js               # Service worker for offline caching
├── manifest.json       # PWA manifest
├── icons/
│   ├── icon-192.png    # PWA icon 192x192
│   └── icon-512.png    # PWA icon 512x512
└── README.md
```

## Technology

- **Frontend**: Vanilla HTML/CSS/JavaScript (no frameworks, no build step)
- **AI**: Google Gemini 2.0 Flash via REST API (client-side calls)
- **Output**: vCard 3.0 format (.vcf)
- **PWA**: Web App Manifest + Service Worker

## Privacy

- Your Gemini API key is stored only in your browser's localStorage
- Images are sent directly from your device to Google's Gemini API
- No data is stored on any server — everything runs client-side
