// Pricing configuration — edit these values to change pack options
// After changing, redeploy to Vercel and update Stripe product prices to match

module.exports = {
    currency: 'usd',

    // Free credits for new users
    freeCredits: 5,

    // Credit packs — each must have a matching Stripe Price ID in environment variables
    // Environment variable pattern: STRIPE_PRICE_<PACK_ID> (e.g., STRIPE_PRICE_PACK_10)
    packs: [
        { id: 'pack_10',  scans: 10,  price: 300,  label: '10 Scans',  priceLabel: '$3.00' },
        { id: 'pack_25',  scans: 25,  price: 600,  label: '25 Scans',  priceLabel: '$6.00' },
        { id: 'pack_50',  scans: 50,  price: 1000, label: '50 Scans',  priceLabel: '$10.00' },
        { id: 'pack_100', scans: 100, price: 1500, label: '100 Scans', priceLabel: '$15.00' },
    ],

    // Price is in cents (Stripe uses smallest currency unit)
    // 300 = $3.00, 600 = $6.00, etc.
};
