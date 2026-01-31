const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { addCredits, db } = require('../lib/firebase-admin');
const pricing = require('../lib/pricing');

// Vercel serverless functions need raw body for Stripe signature verification.
// This config tells Vercel not to parse the body.
module.exports.config = {
    api: {
        bodyParser: false,
    },
};

// Read raw body from request stream
function getRawBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!sig || !webhookSecret) {
        console.error('Missing Stripe signature or webhook secret');
        return res.status(400).json({ error: 'Missing signature' });
    }

    let event;
    try {
        const rawBody = await getRawBody(req);
        event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).json({ error: 'Invalid signature' });
    }

    // Handle checkout.session.completed
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const uid = session.metadata?.uid;
        const packId = session.metadata?.packId;
        const scans = parseInt(session.metadata?.scans, 10);

        if (!uid || !packId || !scans) {
            console.error('Webhook missing metadata:', session.metadata);
            return res.status(400).json({ error: 'Missing metadata' });
        }

        // Prevent duplicate processing — check if we already processed this session
        const paymentRef = db.collection('payments').doc(session.id);
        const paymentDoc = await paymentRef.get();
        if (paymentDoc.exists) {
            console.log('Payment already processed:', session.id);
            return res.status(200).json({ received: true });
        }

        // Add credits
        await addCredits(uid, scans);

        // Record payment
        await paymentRef.set({
            uid: uid,
            packId: packId,
            scans: scans,
            amount: session.amount_total,
            currency: session.currency,
            stripeSessionId: session.id,
            createdAt: new Date().toISOString(),
        });

        console.log('Credits added:', scans, 'for user:', uid, 'session:', session.id);
    }

    return res.status(200).json({ received: true });
};
