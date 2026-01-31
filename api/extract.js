const { verifyAuth, getOrCreateUser, deductCredit } = require('../lib/firebase-admin');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

const PROMPT = `You are a business card data extractor. Analyze this business card image and extract all contact information.

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

module.exports = async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // Auth
    const user = await verifyAuth(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized. Please sign in.' });

    // Get/create user record
    const userData = await getOrCreateUser(user.uid, user.email);

    // Check credits
    if (userData.credits < 1) {
        return res.status(402).json({ error: 'No credits remaining. Please purchase a credit pack.' });
    }

    // Validate request body
    const { imageBase64 } = req.body || {};
    if (!imageBase64 || typeof imageBase64 !== 'string') {
        return res.status(400).json({ error: 'Missing imageBase64 in request body.' });
    }

    // Limit image size (base64 ~4MB max → ~3MB raw image)
    if (imageBase64.length > 5 * 1024 * 1024) {
        return res.status(400).json({ error: 'Image too large. Maximum 4MB.' });
    }

    // Call Gemini
    let geminiData;
    try {
        const geminiRes = await fetch(GEMINI_URL + '?key=' + encodeURIComponent(GEMINI_API_KEY), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: PROMPT },
                        { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } }
                    ]
                }],
                generationConfig: { temperature: 0.1, maxOutputTokens: 1024 }
            })
        });

        if (!geminiRes.ok) {
            const errText = await geminiRes.text();
            console.error('Gemini API error:', geminiRes.status, errText);
            return res.status(502).json({ error: 'AI service error. Please try again.' });
        }

        geminiData = await geminiRes.json();
    } catch (err) {
        console.error('Gemini fetch error:', err);
        return res.status(502).json({ error: 'Could not reach AI service.' });
    }

    // Parse response
    const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    let parsed;
    try {
        let jsonStr = text.trim();
        if (jsonStr.startsWith('```')) {
            jsonStr = jsonStr.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
        }
        parsed = JSON.parse(jsonStr);
    } catch (parseErr) {
        console.error('JSON parse error:', parseErr, 'Raw:', text);
        return res.status(200).json({ result: null, noData: true, creditsRemaining: userData.credits });
    }

    if (parsed.error === 'no_data') {
        return res.status(200).json({ result: null, noData: true, creditsRemaining: userData.credits });
    }

    // Deduct credit (only on successful extraction)
    const deducted = await deductCredit(user.uid);
    if (!deducted) {
        return res.status(402).json({ error: 'No credits remaining. Please purchase a credit pack.' });
    }

    return res.status(200).json({
        result: parsed,
        noData: false,
        creditsRemaining: userData.credits - 1,
    });
};
