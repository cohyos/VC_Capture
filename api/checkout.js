const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { verifyAuth } = require('../lib/firebase-admin');
const pricing = require('../lib/pricing');

// Map pack IDs to Stripe Price IDs from environment variables
function getStripePriceId(packId) {
    // Environment variable: STRIPE_PRICE_PACK_10, STRIPE_PRICE_PACK_25, etc.
    const envKey = 'STRIPE_PRICE_' + packId.toUpperCase();
    return process.env[envKey] || null;
}

module.exports = async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // Auth
    const user = await verifyAuth(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    // Validate pack selection
    const { packId } = req.body || {};
    const pack = pricing.packs.find(p => p.id === packId);
    if (!pack) {
        return res.status(400).json({ error: 'Invalid pack selected.' });
    }

    const stripePriceId = getStripePriceId(packId);
    if (!stripePriceId) {
        console.error('Missing Stripe Price ID for pack:', packId);
        return res.status(500).json({ error: 'Payment configuration error. Please contact support.' });
    }

    // Determine base URL for redirects
    const origin = req.headers.origin || req.headers.referer || process.env.APP_URL || 'https://cohyos.github.io/VC_Capture';

    try {
        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            payment_method_types: ['card'],
            line_items: [{
                price: stripePriceId,
                quantity: 1,
            }],
            metadata: {
                uid: user.uid,
                packId: pack.id,
                scans: String(pack.scans),
            },
            success_url: origin + '?payment=success',
            cancel_url: origin + '?payment=cancelled',
        });

        return res.status(200).json({ url: session.url });
    } catch (err) {
        console.error('Stripe checkout error:', err);
        return res.status(500).json({ error: 'Could not create payment session.' });
    }
};
