const admin = require('firebase-admin');

// Initialize Firebase Admin SDK once (reused across serverless invocations)
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            // Private key comes as a string with escaped newlines from env var
            privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
        }),
    });
}

const db = admin.firestore();

/**
 * Verify Firebase ID token from Authorization header.
 * Returns the decoded token (with uid, email, etc.) or null.
 */
async function verifyAuth(req) {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
        return null;
    }
    const token = authHeader.slice(7);
    try {
        return await admin.auth().verifyIdToken(token);
    } catch (err) {
        console.error('Auth verification failed:', err.message);
        return null;
    }
}

/**
 * Get or create user document in Firestore.
 * New users receive free credits as defined in pricing config.
 */
async function getOrCreateUser(uid, email) {
    const pricing = require('./pricing');
    const userRef = db.collection('users').doc(uid);
    const doc = await userRef.get();

    if (doc.exists) {
        return doc.data();
    }

    // New user — grant free credits
    const userData = {
        email: email || '',
        credits: pricing.freeCredits,
        totalScans: 0,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await userRef.set(userData);
    return userData;
}

/**
 * Deduct one credit from user. Returns true if successful, false if insufficient credits.
 * Uses a transaction to prevent race conditions.
 */
async function deductCredit(uid) {
    const userRef = db.collection('users').doc(uid);
    try {
        return await db.runTransaction(async (tx) => {
            const doc = await tx.get(userRef);
            if (!doc.exists) return false;
            const data = doc.data();
            if (data.credits < 1) return false;
            tx.update(userRef, {
                credits: admin.firestore.FieldValue.increment(-1),
                totalScans: admin.firestore.FieldValue.increment(1),
            });
            return true;
        });
    } catch (err) {
        console.error('Deduct credit error:', err);
        return false;
    }
}

/**
 * Add credits to user account (after successful Stripe payment).
 */
async function addCredits(uid, amount) {
    const userRef = db.collection('users').doc(uid);
    await userRef.update({
        credits: admin.firestore.FieldValue.increment(amount),
    });
}

module.exports = { admin, db, verifyAuth, getOrCreateUser, deductCredit, addCredits };
