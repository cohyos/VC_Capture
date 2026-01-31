const { verifyAuth, getOrCreateUser } = require('../lib/firebase-admin');
const pricing = require('../lib/pricing');

module.exports = async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    // Auth
    const user = await verifyAuth(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    // Get user data
    const userData = await getOrCreateUser(user.uid, user.email);

    return res.status(200).json({
        credits: userData.credits,
        totalScans: userData.totalScans || 0,
        packs: pricing.packs,
        currency: pricing.currency,
    });
};
