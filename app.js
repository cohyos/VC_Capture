(function () {
    'use strict';

    // --- Platform detection ---
    var isNative = typeof window.Capacitor !== 'undefined' && window.Capacitor.isNativePlatform();
    var config = window.APP_CONFIG || {};
    var API_URL = config.apiUrl || '';

    // --- Firebase Init ---
    firebase.initializeApp(config.firebase);
    var auth = firebase.auth();
    var currentUser = null;
    var userCredits = 0;

    // --- DOM refs ---
    var authSection = document.getElementById('auth-section');
    var googleSigninBtn = document.getElementById('google-signin-btn');
    var emailAuthForm = document.getElementById('email-auth-form');
    var emailSigninBtn = document.getElementById('email-signin-btn');
    var emailSignupBtn = document.getElementById('email-signup-btn');
    var authEmail = document.getElementById('auth-email');
    var authPassword = document.getElementById('auth-password');
    var authStatus = document.getElementById('auth-status');

    var userBar = document.getElementById('user-bar');
    var userEmailEl = document.getElementById('user-email');
    var creditsBadge = document.getElementById('credits-badge');
    var signOutBtn = document.getElementById('sign-out-btn');

    var captureSection = document.getElementById('capture-section');
    var cameraInput = document.getElementById('camera-input');
    var uploadInput = document.getElementById('upload-input');
    var previewContainer = document.getElementById('preview-container');
    var imagePreview = document.getElementById('image-preview');
    var extractBtn = document.getElementById('extract-btn');

    var loadingSection = document.getElementById('loading-section');
    var loadingText = document.getElementById('loading-text');
    var resultsSection = document.getElementById('results-section');
    var noDataSection = document.getElementById('no-data-section');

    var errorSection = document.getElementById('error-section');
    var errorTitle = document.getElementById('error-title');
    var errorMessage = document.getElementById('error-message');
    var errorRetryBtn = document.getElementById('error-retry-btn');
    var errorBackBtn = document.getElementById('error-back-btn');

    var downloadVcfBtn = document.getElementById('download-vcf-btn');
    var scanAnotherBtn = document.getElementById('scan-another-btn');
    var retryBtn = document.getElementById('retry-btn');

    var buyCreditsSection = document.getElementById('buy-credits-section');
    var buyCurrentCredits = document.getElementById('buy-credits-current');
    var packsContainer = document.getElementById('packs-container');
    var buyBackBtn = document.getElementById('buy-back-btn');

    var FIELDS = [
        'prefix', 'firstName', 'lastName', 'title', 'company',
        'email', 'phone', 'mobile', 'website', 'address', 'linkedin', 'notes'
    ];

    var currentImageBase64 = null;
    var currentImageMimeType = null;

    // --- Auth ---
    function showAuthStatus(msg, type) {
        authStatus.textContent = msg;
        authStatus.className = 'status-msg ' + type;
        authStatus.classList.remove('hidden');
    }

    googleSigninBtn.addEventListener('click', async function () {
        try {
            var provider = new firebase.auth.GoogleAuthProvider();
            await auth.signInWithPopup(provider);
        } catch (err) {
            showAuthStatus(err.message, 'error');
        }
    });

    emailAuthForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        var email = authEmail.value.trim();
        var pass = authPassword.value;
        try {
            await auth.signInWithEmailAndPassword(email, pass);
        } catch (err) {
            showAuthStatus(err.message, 'error');
        }
    });

    emailSignupBtn.addEventListener('click', async function () {
        var email = authEmail.value.trim();
        var pass = authPassword.value;
        if (!email || pass.length < 6) {
            showAuthStatus('Enter email and password (min 6 characters).', 'error');
            return;
        }
        try {
            await auth.createUserWithEmailAndPassword(email, pass);
        } catch (err) {
            showAuthStatus(err.message, 'error');
        }
    });

    signOutBtn.addEventListener('click', function () {
        auth.signOut();
    });

    // Auth state listener
    auth.onAuthStateChanged(async function (user) {
        currentUser = user;
        if (user) {
            userBar.classList.remove('hidden');
            userEmailEl.textContent = user.email || 'User';
            authSection.classList.add('hidden');
            await loadCredits();
            showSection('capture');
            checkPaymentReturn();
        } else {
            userBar.classList.add('hidden');
            userCredits = 0;
            updateCreditsBadge();
            showSection('auth');
        }
    });

    // --- API helpers ---
    async function getAuthToken() {
        if (!currentUser) return null;
        return await currentUser.getIdToken();
    }

    async function apiCall(endpoint, method, body) {
        var token = await getAuthToken();
        if (!token) throw new Error('Not authenticated');

        var opts = {
            method: method,
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json',
            },
        };
        if (body) opts.body = JSON.stringify(body);

        var res = await fetch(API_URL + endpoint, opts);
        var data = await res.json();

        if (!res.ok) {
            var err = new Error(data.error || 'API error');
            err.status = res.status;
            throw err;
        }
        return data;
    }

    // --- Credits ---
    async function loadCredits() {
        try {
            var data = await apiCall('/api/credits', 'GET');
            userCredits = data.credits;
            updateCreditsBadge();
        } catch (err) {
            console.error('Load credits error:', err);
        }
    }

    function updateCreditsBadge() {
        creditsBadge.textContent = userCredits + ' credit' + (userCredits !== 1 ? 's' : '');
    }

    // Click credits badge to open buy credits
    creditsBadge.addEventListener('click', function () {
        showBuyCredits();
    });

    // --- Section Visibility ---
    function showSection(name) {
        authSection.classList.add('hidden');
        captureSection.classList.add('hidden');
        loadingSection.classList.add('hidden');
        resultsSection.classList.add('hidden');
        noDataSection.classList.add('hidden');
        errorSection.classList.add('hidden');
        buyCreditsSection.classList.add('hidden');

        if (name === 'auth') {
            authSection.classList.remove('hidden');
        } else if (name === 'capture') {
            captureSection.classList.remove('hidden');
            previewContainer.classList.add('hidden');
            currentImageBase64 = null;
        } else if (name === 'loading') {
            loadingSection.classList.remove('hidden');
            loadingText.textContent = 'Analyzing business card with AI...';
        } else if (name === 'results') {
            resultsSection.classList.remove('hidden');
        } else if (name === 'noData') {
            noDataSection.classList.remove('hidden');
        } else if (name === 'error') {
            errorSection.classList.remove('hidden');
        } else if (name === 'buyCredits') {
            buyCreditsSection.classList.remove('hidden');
        }
    }

    function showError(title, message) {
        errorTitle.textContent = title;
        errorMessage.textContent = message;
        showSection('error');
    }

    // --- Image Handling ---
    function handleImageSelect(e) {
        var file = e.target.files[0];
        if (!file) return;
        currentImageMimeType = file.type || 'image/jpeg';
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
                var w = img.width, h = img.height;
                if (w > maxDim || h > maxDim) {
                    if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
                    else { w = Math.round(w * maxDim / h); h = maxDim; }
                }
                var canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                callback(canvas.toDataURL('image/jpeg', 0.85).split(',')[1]);
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

        document.getElementById('camera-btn-label').addEventListener('click', function (e) {
            e.preventDefault();
            nativeCapture(CameraSource.Camera);
        });

        document.getElementById('upload-btn-label').addEventListener('click', function (e) {
            e.preventDefault();
            nativeCapture(CameraSource.Photos);
        });

        async function nativeCapture(source) {
            try {
                var photo = await Camera.getPhoto({
                    quality: 85, allowEditing: false,
                    resultType: CameraResultType.Base64,
                    source: source, width: 1600, height: 1600, correctOrientation: true
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

    // --- Extract (server-side) ---
    extractBtn.addEventListener('click', function () {
        if (!currentImageBase64) return;
        extractCard();
    });

    async function extractCard() {
        if (userCredits < 1) {
            showBuyCredits();
            return;
        }

        showSection('loading');

        try {
            var data = await apiCall('/api/extract', 'POST', { imageBase64: currentImageBase64 });

            if (data.noData) {
                showSection('noData');
                return;
            }

            if (typeof data.creditsRemaining === 'number') {
                userCredits = data.creditsRemaining;
                updateCreditsBadge();
            }

            populateForm(data.result);
            showSection('results');
        } catch (err) {
            if (err.status === 402) {
                showBuyCredits();
            } else if (err.status === 401) {
                showError('Session Expired', 'Please sign in again.');
            } else {
                showError('Extraction Error', err.message || 'Could not extract card details.');
            }
        }
    }

    // --- Form Handling ---
    function populateForm(data) {
        FIELDS.forEach(function (f) {
            var el = document.getElementById('field-' + f);
            if (el) el.value = (data && data[f]) || '';
        });
    }

    function getFormData() {
        var data = {};
        FIELDS.forEach(function (f) {
            var el = document.getElementById('field-' + f);
            if (el) data[f] = el.value.trim();
        });
        return data;
    }

    // --- vCard Generation ---
    function generateVCard(data) {
        var lines = ['BEGIN:VCARD', 'VERSION:3.0'];
        var fullName = [data.prefix, data.firstName, data.lastName].filter(Boolean).join(' ');
        lines.push('FN:' + esc(fullName));
        lines.push('N:' + esc(data.lastName) + ';' + esc(data.firstName) + ';;' + esc(data.prefix) + ';');
        if (data.company) lines.push('ORG:' + esc(data.company));
        if (data.title) lines.push('TITLE:' + esc(data.title));
        if (data.email) lines.push('EMAIL;TYPE=INTERNET;TYPE=WORK:' + esc(data.email));
        if (data.phone) lines.push('TEL;TYPE=WORK,VOICE:' + esc(data.phone));
        if (data.mobile) lines.push('TEL;TYPE=CELL,VOICE:' + esc(data.mobile));
        if (data.website) lines.push('URL:' + esc(data.website));
        if (data.address) lines.push('ADR;TYPE=WORK:;;' + esc(data.address) + ';;;;');
        if (data.linkedin) lines.push('X-SOCIALPROFILE;TYPE=linkedin:' + esc(data.linkedin));
        if (data.notes) lines.push('NOTE:' + esc(data.notes));
        lines.push('END:VCARD');
        return lines.join('\r\n');
    }

    function esc(str) {
        if (!str) return '';
        return str.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
    }

    // --- Download / Save Contact ---
    downloadVcfBtn.addEventListener('click', async function () {
        var data = getFormData();
        var vcf = generateVCard(data);
        var filename = [data.firstName, data.lastName].filter(Boolean).join('_') || 'contact';
        filename = filename.replace(/[^a-zA-Z0-9_-]/g, '_') + '.vcf';

        if (isNative) {
            try {
                var Filesystem = window.Capacitor.Plugins.Filesystem;
                var Share = window.Capacitor.Plugins.Share;
                var result = await Filesystem.writeFile({
                    path: filename,
                    data: btoa(unescape(encodeURIComponent(vcf))),
                    directory: 'CACHE'
                });
                await Share.share({ title: 'Add Contact', url: result.uri, dialogTitle: 'Save Contact' });
            } catch (err) {
                console.error('Native share error:', err);
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
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // --- Buy Credits ---
    async function showBuyCredits() {
        buyCurrentCredits.textContent = userCredits;

        try {
            var data = await apiCall('/api/credits', 'GET');
            userCredits = data.credits;
            updateCreditsBadge();
            buyCurrentCredits.textContent = data.credits;
            renderPacks(data.packs);
        } catch (err) {
            // Use default packs if API fails
            renderPacks([
                { id: 'pack_10', scans: 10, price: 300, label: '10 Scans', priceLabel: '$3.00' },
                { id: 'pack_25', scans: 25, price: 600, label: '25 Scans', priceLabel: '$6.00' },
                { id: 'pack_50', scans: 50, price: 1000, label: '50 Scans', priceLabel: '$10.00' },
                { id: 'pack_100', scans: 100, price: 1500, label: '100 Scans', priceLabel: '$15.00' },
            ]);
        }

        showSection('buyCredits');
    }

    function renderPacks(packs) {
        packsContainer.innerHTML = '';
        packs.forEach(function (pack, i) {
            var perScan = (pack.price / 100 / pack.scans).toFixed(2);
            var div = document.createElement('div');
            div.className = 'pack-card' + (i === packs.length - 1 ? ' popular' : '');
            div.innerHTML =
                '<div class="pack-scans">' + pack.label + '</div>' +
                '<div class="pack-price">' + pack.priceLabel + '</div>' +
                '<div class="pack-per-scan">$' + perScan + '/scan</div>';
            div.addEventListener('click', function () {
                purchasePack(pack.id);
            });
            packsContainer.appendChild(div);
        });
    }

    async function purchasePack(packId) {
        try {
            var data = await apiCall('/api/checkout', 'POST', { packId: packId });
            if (data.url) {
                window.location.href = data.url;
            }
        } catch (err) {
            showError('Payment Error', err.message || 'Could not start checkout.');
        }
    }

    buyBackBtn.addEventListener('click', function () {
        showSection('capture');
    });

    // --- Check for payment return ---
    function checkPaymentReturn() {
        var params = new URLSearchParams(window.location.search);
        if (params.get('payment') === 'success') {
            // Reload credits after successful payment
            setTimeout(async function () {
                await loadCredits();
                showSection('capture');
            }, 1000);
            // Clean URL
            window.history.replaceState({}, '', window.location.pathname);
        } else if (params.get('payment') === 'cancelled') {
            window.history.replaceState({}, '', window.location.pathname);
        }
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
        FIELDS.forEach(function (f) {
            var el = document.getElementById('field-' + f);
            if (el) el.value = '';
        });
    }
})();
