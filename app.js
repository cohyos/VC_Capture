(function () {
    'use strict';

    // --- Platform detection ---
    var isNative = typeof window.Capacitor !== 'undefined' && window.Capacitor.isNativePlatform();

    // --- DOM refs ---
    const apiKeySection = document.getElementById('api-key-section');
    const apiKeyInput = document.getElementById('api-key-input');
    const saveKeyBtn = document.getElementById('save-key-btn');
    const keyStatus = document.getElementById('key-status');

    const captureSection = document.getElementById('capture-section');
    const cameraInput = document.getElementById('camera-input');
    const uploadInput = document.getElementById('upload-input');
    const previewContainer = document.getElementById('preview-container');
    const imagePreview = document.getElementById('image-preview');
    const extractBtn = document.getElementById('extract-btn');

    const loadingSection = document.getElementById('loading-section');
    const resultsSection = document.getElementById('results-section');
    const noDataSection = document.getElementById('no-data-section');

    const errorSection = document.getElementById('error-section');
    const errorTitle = document.getElementById('error-title');
    const errorMessage = document.getElementById('error-message');
    const errorRetryBtn = document.getElementById('error-retry-btn');
    const errorBackBtn = document.getElementById('error-back-btn');
    const loadingText = document.getElementById('loading-text');

    const downloadVcfBtn = document.getElementById('download-vcf-btn');
    const scanAnotherBtn = document.getElementById('scan-another-btn');
    const retryBtn = document.getElementById('retry-btn');

    // Form fields
    const FIELDS = [
        'prefix', 'firstName', 'lastName', 'title', 'company',
        'email', 'phone', 'mobile', 'website', 'address', 'linkedin', 'notes'
    ];

    let currentImageBase64 = null;
    let currentImageMimeType = null;

    // --- API Key Management ---
    function getApiKey() {
        return localStorage.getItem('vc_capture_gemini_key') || '';
    }

    function setApiKey(key) {
        localStorage.setItem('vc_capture_gemini_key', key);
    }

    function initApiKeyUI() {
        const key = getApiKey();
        if (key) {
            apiKeyInput.value = key;
            showStatus('API key saved.', 'success');
            showSection('capture');
        }
    }

    saveKeyBtn.addEventListener('click', function () {
        const key = apiKeyInput.value.trim();
        if (!key) {
            showStatus('Please enter a valid API key.', 'error');
            return;
        }
        setApiKey(key);
        showStatus('API key saved.', 'success');
        showSection('capture');
    });

    function showStatus(msg, type) {
        keyStatus.textContent = msg;
        keyStatus.className = 'status-msg ' + type;
        keyStatus.classList.remove('hidden');
    }

    // --- Section Visibility ---
    function showSection(name) {
        apiKeySection.classList.toggle('hidden', name !== 'apiKey');
        captureSection.classList.toggle('hidden', name !== 'capture' && name !== 'apiKey');
        loadingSection.classList.add('hidden');
        resultsSection.classList.add('hidden');
        noDataSection.classList.add('hidden');
        errorSection.classList.add('hidden');

        if (name === 'capture') {
            captureSection.classList.remove('hidden');
            previewContainer.classList.add('hidden');
            currentImageBase64 = null;
        } else if (name === 'loading') {
            captureSection.classList.add('hidden');
            loadingSection.classList.remove('hidden');
            loadingText.textContent = 'Analyzing business card with AI...';
        } else if (name === 'results') {
            resultsSection.classList.remove('hidden');
        } else if (name === 'noData') {
            noDataSection.classList.remove('hidden');
        } else if (name === 'error') {
            errorSection.classList.remove('hidden');
        }
    }

    function showError(title, message) {
        errorTitle.textContent = title;
        errorMessage.textContent = message;
        showSection('error');
    }

    // --- Image Handling ---
    function handleImageSelect(e) {
        const file = e.target.files[0];
        if (!file) return;

        currentImageMimeType = file.type || 'image/jpeg';

        // Resize the image before converting to base64 to reduce payload
        resizeImage(file, 1600, function (base64) {
            currentImageBase64 = base64;
            imagePreview.src = 'data:' + currentImageMimeType + ';base64,' + base64;
            previewContainer.classList.remove('hidden');
        });
    }

    function resizeImage(file, maxDim, callback) {
        var reader = new FileReader();
        reader.onload = function (ev) {
            var img = new Image();
            img.onload = function () {
                var w = img.width;
                var h = img.height;
                if (w > maxDim || h > maxDim) {
                    if (w > h) {
                        h = Math.round(h * maxDim / w);
                        w = maxDim;
                    } else {
                        w = Math.round(w * maxDim / h);
                        h = maxDim;
                    }
                }
                var canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                var ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                // Get base64 without the data URI prefix
                var dataUrl = canvas.toDataURL('image/jpeg', 0.85);
                var base64 = dataUrl.split(',')[1];
                callback(base64);
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    }

    cameraInput.addEventListener('change', handleImageSelect);
    uploadInput.addEventListener('change', handleImageSelect);

    // --- Native Camera (Capacitor) ---
    if (isNative) {
        var Camera = window.Capacitor.Plugins.Camera;
        var CameraSource = { Camera: 'CAMERA', Photos: 'PHOTOS' };
        var CameraResultType = { Base64: 'base64' };

        // Override click on camera label to use native camera
        document.getElementById('camera-btn-label').addEventListener('click', function (e) {
            e.preventDefault();
            nativeCapture(CameraSource.Camera);
        });

        // Override click on upload label to use native photo picker
        document.getElementById('upload-btn-label').addEventListener('click', function (e) {
            e.preventDefault();
            nativeCapture(CameraSource.Photos);
        });

        async function nativeCapture(source) {
            try {
                var photo = await Camera.getPhoto({
                    quality: 85,
                    allowEditing: false,
                    resultType: CameraResultType.Base64,
                    source: source,
                    width: 1600,
                    height: 1600,
                    correctOrientation: true
                });
                currentImageBase64 = photo.base64String;
                currentImageMimeType = 'image/' + (photo.format || 'jpeg');
                imagePreview.src = 'data:' + currentImageMimeType + ';base64,' + currentImageBase64;
                previewContainer.classList.remove('hidden');
            } catch (err) {
                console.log('Camera cancelled or error:', err);
            }
        }
    }

    // --- Gemini API ---
    extractBtn.addEventListener('click', function () {
        if (!currentImageBase64) return;
        extractCard();
    });

    function sleep(ms) {
        return new Promise(function (resolve) { setTimeout(resolve, ms); });
    }

    async function callGeminiWithRetry(apiKey, requestBody, maxRetries) {
        var delays = [2000, 4000, 8000, 16000];
        var lastError = null;

        for (var attempt = 0; attempt <= maxRetries; attempt++) {
            if (attempt > 0) {
                var waitSec = delays[attempt - 1] / 1000;
                loadingText.textContent = 'Rate limited. Retrying in ' + waitSec + 's... (attempt ' + (attempt + 1) + '/' + (maxRetries + 1) + ')';
                await sleep(delays[attempt - 1]);
                loadingText.textContent = 'Analyzing business card with AI... (attempt ' + (attempt + 1) + '/' + (maxRetries + 1) + ')';
            }

            var response;
            try {
                response = await fetch(
                    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + encodeURIComponent(apiKey),
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(requestBody)
                    }
                );
            } catch (networkErr) {
                lastError = { type: 'network', message: networkErr.message };
                continue;
            }

            if (response.status === 429) {
                lastError = { type: 'rate_limit', message: 'Rate limit exceeded (429)' };
                continue;
            }

            if (response.status === 400 || response.status === 403) {
                return { error: true, type: 'auth', message: 'Invalid API key or permission denied. Please check your Gemini API key in Setup.' };
            }

            if (!response.ok) {
                return { error: true, type: 'api', message: 'Gemini API returned error ' + response.status + '. Please try again.' };
            }

            return { error: false, data: await response.json() };
        }

        // All retries exhausted
        if (lastError && lastError.type === 'rate_limit') {
            return { error: true, type: 'rate_limit', message: 'Gemini API rate limit exceeded. The free tier has limited requests per minute. Please wait a moment and try again.' };
        }
        return { error: true, type: 'network', message: 'Could not connect to Gemini API after ' + (maxRetries + 1) + ' attempts. Please check your internet connection.' };
    }

    async function extractCard() {
        const apiKey = getApiKey();
        if (!apiKey) {
            showSection('apiKey');
            return;
        }

        showSection('loading');

        const prompt = `You are a business card data extractor. Analyze this business card image and extract all contact information.

Return ONLY a valid JSON object with these exact keys (use empty string "" if a field is not found):
{
  "prefix": "",
  "firstName": "",
  "lastName": "",
  "title": "",
  "company": "",
  "email": "",
  "phone": "",
  "mobile": "",
  "website": "",
  "address": "",
  "linkedin": "",
  "notes": ""
}

Rules:
- "prefix" is a name prefix like Mr., Mrs., Dr., Prof., etc.
- "phone" is the landline/office phone number
- "mobile" is the mobile/cell phone number — if only one phone number exists and it looks like a mobile, put it in "mobile"
- "address" is the full street address, city, state, zip, country on one line
- "linkedin" is the LinkedIn profile URL if present
- "notes" is for any other info on the card that doesn't fit the other fields
- Return ONLY the JSON object, no markdown, no explanation
- If the image is not a business card or no contact info is found, return exactly: {"error": "no_data"}`;

        var requestBody = {
            contents: [{
                parts: [
                    { text: prompt },
                    {
                        inlineData: {
                            mimeType: 'image/jpeg',
                            data: currentImageBase64
                        }
                    }
                ]
            }],
            generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 1024
            }
        };

        var result = await callGeminiWithRetry(apiKey, requestBody, 3);

        if (result.error) {
            if (result.type === 'auth') {
                showError('API Key Error', result.message);
            } else if (result.type === 'rate_limit') {
                showError('Rate Limited', result.message);
            } else {
                showError('Connection Error', result.message);
            }
            return;
        }

        // Extract the text response
        const text = result.data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        console.log('Gemini response:', text);

        // Parse JSON from response (handle markdown code blocks)
        let parsed;
        try {
            let jsonStr = text.trim();
            if (jsonStr.startsWith('```')) {
                jsonStr = jsonStr.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
            }
            parsed = JSON.parse(jsonStr);
        } catch (parseErr) {
            console.error('JSON parse error:', parseErr, 'Raw text:', text);
            showSection('noData');
            return;
        }

        if (parsed.error === 'no_data') {
            showSection('noData');
            return;
        }

        // Populate form
        populateForm(parsed);
        loadingSection.classList.add('hidden');
        resultsSection.classList.remove('hidden');
    }

    // --- Form Handling ---
    function populateForm(data) {
        FIELDS.forEach(function (field) {
            var el = document.getElementById('field-' + field);
            if (el) {
                el.value = data[field] || '';
            }
        });
    }

    function getFormData() {
        var data = {};
        FIELDS.forEach(function (field) {
            var el = document.getElementById('field-' + field);
            if (el) {
                data[field] = el.value.trim();
            }
        });
        return data;
    }

    // --- vCard Generation ---
    function generateVCard(data) {
        var lines = [];
        lines.push('BEGIN:VCARD');
        lines.push('VERSION:3.0');

        // Full name
        var fullName = [data.prefix, data.firstName, data.lastName].filter(Boolean).join(' ');
        lines.push('FN:' + escVCard(fullName));
        lines.push('N:' + escVCard(data.lastName) + ';' + escVCard(data.firstName) + ';;' + escVCard(data.prefix) + ';');

        if (data.company) {
            lines.push('ORG:' + escVCard(data.company));
        }
        if (data.title) {
            lines.push('TITLE:' + escVCard(data.title));
        }
        if (data.email) {
            lines.push('EMAIL;TYPE=INTERNET;TYPE=WORK:' + escVCard(data.email));
        }
        if (data.phone) {
            lines.push('TEL;TYPE=WORK,VOICE:' + escVCard(data.phone));
        }
        if (data.mobile) {
            lines.push('TEL;TYPE=CELL,VOICE:' + escVCard(data.mobile));
        }
        if (data.website) {
            lines.push('URL:' + escVCard(data.website));
        }
        if (data.address) {
            // Put full address in the street field of ADR for maximum compatibility
            lines.push('ADR;TYPE=WORK:;;' + escVCard(data.address) + ';;;;');
        }
        if (data.linkedin) {
            lines.push('X-SOCIALPROFILE;TYPE=linkedin:' + escVCard(data.linkedin));
        }
        if (data.notes) {
            lines.push('NOTE:' + escVCard(data.notes));
        }

        lines.push('END:VCARD');
        return lines.join('\r\n');
    }

    function escVCard(str) {
        if (!str) return '';
        return str
            .replace(/\\/g, '\\\\')
            .replace(/;/g, '\\;')
            .replace(/,/g, '\\,')
            .replace(/\n/g, '\\n');
    }

    // --- Download / Save Contact ---
    downloadVcfBtn.addEventListener('click', async function () {
        var data = getFormData();
        var vcf = generateVCard(data);
        var filename = [data.firstName, data.lastName].filter(Boolean).join('_') || 'contact';
        filename = filename.replace(/[^a-zA-Z0-9_-]/g, '_') + '.vcf';

        if (isNative) {
            // On native iOS: write temp file and share it — iOS will show "Add to Contacts"
            try {
                var Filesystem = window.Capacitor.Plugins.Filesystem;
                var Share = window.Capacitor.Plugins.Share;

                var result = await Filesystem.writeFile({
                    path: filename,
                    data: btoa(unescape(encodeURIComponent(vcf))),
                    directory: 'CACHE'
                });

                await Share.share({
                    title: 'Add Contact',
                    url: result.uri,
                    dialogTitle: 'Save Contact'
                });
            } catch (err) {
                console.error('Native share error:', err);
                // Fallback to blob download
                downloadVcfBlob(vcf, filename);
            }
        } else {
            downloadVcfBlob(vcf, filename);
        }
    });

    function downloadVcfBlob(vcf, filename) {
        var blob = new Blob([vcf], { type: 'text/vcard;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // --- Navigation ---
    scanAnotherBtn.addEventListener('click', function () {
        resetInputs();
        showSection('capture');
    });

    retryBtn.addEventListener('click', function () {
        resetInputs();
        showSection('capture');
    });

    errorRetryBtn.addEventListener('click', function () {
        if (currentImageBase64) {
            extractCard();
        } else {
            resetInputs();
            showSection('capture');
        }
    });

    errorBackBtn.addEventListener('click', function () {
        resetInputs();
        showSection('capture');
    });

    function resetInputs() {
        cameraInput.value = '';
        uploadInput.value = '';
        previewContainer.classList.add('hidden');
        currentImageBase64 = null;
        FIELDS.forEach(function (field) {
            var el = document.getElementById('field-' + field);
            if (el) el.value = '';
        });
    }

    // --- Init ---
    initApiKeyUI();
})();
