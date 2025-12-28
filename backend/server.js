require('dotenv').config(); // Load environment variables from .env file


const { createClient } = require('@supabase/supabase-js');
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const app = express();

// Supabase
const supabaseUrl = 'https://bqlpkwrnbnkaetaajxcw.supabase.co'
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey)


const rateLimit = require('express-rate-limit');

// Load environment variables
const GOOGLE_EXTRACTOR_API_KEY = process.env.GOOGLE_EXTRACTOR_KEY;
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const frontendUrl = process.env.NODE_ENV === 'production' ? process.env.FRONTEND_URL : 'http://localhost:4200';
const auth0Domain = process.env.AUTH0_DOMAIN;
const auth0ClientId = process.env.AUTH0_CLIENT_ID;
const auth0ClientSecret = process.env.AUTH0_CLIENT_SECRET;

// CORS setup
const allowedOrigins = [
    'https://keyword-extractor-plus.netlify.app', // Your Netlify URL
    'https://seoextraction.com',
    'http://localhost:4200', // Local testing URL (if you're working locally)
];

app.use(cors({
    origin: (origin, callback) => {
        if (allowedOrigins.indexOf(origin) !== -1 || !origin) {
            callback(null, true); // Allow the request
        } else {
            callback(new Error('Not allowed by CORS')); // Reject the request
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Middleware to parse JSON for all routes except /webhook
app.use((req, res, next) => {
    if (req.originalUrl === '/webhook') {
        next(); // Skip JSON parsing for /webhook
    } else {
        express.json()(req, res, next); // Apply JSON parsing
    }
});

// Rate limit for the keyword extraction route
const limiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 100, // Limit to 100 requests per hour
    message: "Too many requests from this IP, please try again after an hour."
});
app.use('/extract-keywords', limiter); // Apply rate limiter to the API endpoint

// Function to fetch the Auth0 Management API token dynamically
async function getAuth0ManagementToken() {
    try {
        const response = await axios.post(`https://${auth0Domain}/oauth/token`, {
            client_id: auth0ClientId,
            client_secret: auth0ClientSecret,
            audience: `https://${auth0Domain}/api/v2/`,
            grant_type: 'client_credentials',
        });
        return response.data.access_token;
    } catch (error) {
        console.error('Error fetching Auth0 Management token:', error.message);
        throw new Error('Unable to get Auth0 Management token');
    }
}

/**
 * Function to track the usage of the app and update the `usageCount` in Auth0's app_metadata.
 * 
 * @param {string} userId - The user's unique identifier (sub) from Auth0.
 * @returns {Promise<number>} The updated usage count.
 */
async function trackUsage(userId, shouldIncreaseCounter = true) {
    try {
        // Fetch Auth0 Management API token
        const auth0Token = await getAuth0ManagementToken(); // Function to fetch the Auth0 Management token

        // Fetch the user from Auth0 to get current app_metadata
        const url = `https://${auth0Domain}/api/v2/users/${userId}`;
        const response = await axios.get(url, {
            headers: {
                Authorization: `Bearer ${auth0Token}`,
            },
        });

        // Get the current usage count from app_metadata, default to 0 if not set
        let usageCount = response.data.app_metadata?.usageCount || 0;

        // Define the usage limit (for example, 100 requests per month)
        const usageLimit = 5;

        // If the usage limit is exceeded, throw an error
        if (usageCount >= usageLimit && shouldIncreaseCounter) {
            throw new Error('Usage limit reached');
        }

        // Increment the usage count
        if (shouldIncreaseCounter) {
            usageCount++;
        }

        // Update the app_metadata in Auth0 with the new usage count
        await axios.patch(
            `https://${auth0Domain}/api/v2/users/${userId}`,
            { app_metadata: { usageCount } },
            {
                headers: {
                    Authorization: `Bearer ${auth0Token}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        // Return the updated usage count
        return usageCount;
    } catch (error) {
        // Handle errors (e.g., if the usage limit is reached, or API errors)
        throw new Error(`Error tracking usage: ${error.message}`);
    }
}

async function createInvoiceForUser(stripeCustomerId, description, amountInCents) {
    try {

        // Create the invoice, now the created invoice item should be automatically included
        const invoice = await stripe.invoices.create({
            customer: stripeCustomerId,
            auto_advance: true, // Automatically finalize and attempt payment immediately
        });

        // Create a new invoice item (line item)
        const invoiceItem = await stripe.invoiceItems.create({
            customer: stripeCustomerId,
            amount: amountInCents, // Charge amount in cents (e.g., $10 = 1000)
            currency: 'usd',
            description: description,
            invoice: invoice.id
        });

        // Finalize the invoice (make sure the invoice is finalized)
        const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id);

        // Return the finalized invoice
        return finalizedInvoice;
    } catch (error) {
        console.error('Error creating invoice:', error);
        throw new Error('Unable to create invoice');
    }
}




async function getValidPaymentMethod(stripeCustomerId) {
    try {
        // Retrieve the Stripe customer details
        const customer = await stripe.customers.retrieve(stripeCustomerId);

        // Check for a default payment method
        if (customer.invoice_settings.default_payment_method) {
            const paymentMethod = await stripe.paymentMethods.retrieve(
                customer.invoice_settings.default_payment_method
            );
            return { default_payment_method: paymentMethod };
        } else {
            return { default_payment_method: null };
        }
    } catch (error) {
        console.error('Error fetching payment method:', error);
        throw new Error('Failed to fetch payment method');
    }
}


// Route to extract keywords
app.post('/extract-keywords', async (req, res) => {
    const { text, user, isRegistered } = req.body;
    userId = user.sub;

    // Validate input
    if (!text) {
        return res.status(400).json({ error: 'Text input is required.' });
    }
    if (!userId) {
        return res.status(400).json({ error: 'User ID is required.' });
    }
    if (!GOOGLE_EXTRACTOR_API_KEY) {
        return res.status(500).json({ error: 'Server configuration error.' });
    }

    try {
        // Only charge if user is registered (i.e., premium user)
        if (isRegistered) {
            // Calculate charge based on text length (per character)
            const charCount = text.length;
            const chargePerCharacter = 0.01; // Example charge: $0.01 per 100 characters
            const amountInCents = Math.ceil((charCount / 100) * chargePerCharacter * 100); // Charge in cents

            // Check if the user has a valid payment method
            const paymentMethod = await getValidPaymentMethod(user.stripeCustomerId);
            if (!paymentMethod) {
                return res.status(400).json({ error: 'No valid payment method found.' });
            }

            // Create an invoice and charge the user
            const chargeResponse = await createInvoiceForUser(user.stripeCustomerId, 'Text extraction service', amountInCents);
            if (!chargeResponse || chargeResponse.error) {
                return res.status(500).json({ error: 'Failed to create invoice or charge user.' });
            }
        }
        else {
            try {
                const usageCount = await trackUsage(userId, true); 
            } catch (error){
                res.status(500).json({ error: error.message });
            }
            

        }

        // Perform the keyword extraction regardless of whether the user is free or premium
        const endpoint = `https://language.googleapis.com/v1/documents:analyzeEntities?key=${GOOGLE_EXTRACTOR_API_KEY}`;
        const response = await axios.post(endpoint, {
            document: {
                content: text,
                type: 'PLAIN_TEXT',
            },
        });

        // Extract keywords and filter based on salience
        const keywords = response.data.entities
            .filter(entity => entity.salience > 0.1)
            .map(entity => ({
                name: entity.name,
                type: entity.type,
                salience: entity.salience,
            }));

        // Return extracted keywords
        res.status(200).json({ success: true, keywords });
    } catch (error) {
        res.status(500).json({ error: 'Failed to extract keywords.' });
    }
});


// Webhook to handle Stripe events
async function updateAuth0User(auth0Sub, stripeCustomerId) {
    try {
        const auth0Token = await getAuth0ManagementToken();
        const url = `https://${auth0Domain}/api/v2/users/${auth0Sub}`;

        const response = await axios.patch(url, {
            app_metadata: {
                stripeCustomerId: stripeCustomerId  // Save the Stripe customer ID
            }
        }, {
            headers: {
                Authorization: `Bearer ${auth0Token}`,
                'Content-Type': 'application/json'
            }
        });
        console.log('Auth0 user updated:', response.data);
    } catch (error) {
        console.error('Error updating Auth0 user:', error.response?.data || error.message);
    }
}

// User limit threshold
const USER_LIMIT = 3;

// Check if the user limit has been reached
app.get('/user-count', async (req, res) => {
    try {
        const userCount = await getUserCount(); // Call the reusable function
        return res.json({ success: true, userCount });
    } catch (err) {
        console.error('Error in /user-count route:', err);
        return res.status(500).json({ success: false, message: err.message });
    }
});

async function getUserCount() {
    try {
        // Fetch user count from the 'users' table
        const { data, error } = await supabase
            .from('users')
            .select('auth_sub', { count: 'exact' });

        if (error) {
            console.error('Error fetching user count:', error);
            throw new Error('Failed to fetch user count');
        }

        // Get the user count
        return data?.length || 0; // Ensure we return 0 if no data

    } catch (err) {
        console.error('Error in getUserCount function:', err);
        throw new Error('Internal error while fetching user count');
    }
}

/**
 * Endpoint: /api/user-metadata
 * 
 * Purpose:
 * This function retrieves the user's metadata (app_metadata) from Auth0 and tracks their usage.
 * If the user exceeds their usage limit, they will be blocked.
 */
app.post('/api/user-metadata', async (req, res) => {
    console.log('API hit: /api/user-metadata'); // Debugging log
    const userToken = req.body.token; // Token sent from frontend that contains user information.
    const trackUsageFlag = req.body.trackUsage !== undefined ? req.body.trackUsage : true;

    if (!userToken) {
        return res.status(400).json({ error: 'Token is required' });
    }

    try {
        // Decode the user token to extract user ID (sub)
        const userId = userToken.sub;

        if (!userId) {
            return res.status(400).json({ error: 'Invalid token' });
        }

        // Track the user's usage (increment the usageCount and check if the limit is exceeded)
        const usageCount = await trackUsage(userId, trackUsageFlag);  // Call the trackUsage function

        // Now fetch the user's metadata from Auth0
        const auth0Token = await getAuth0ManagementToken();
        const url = `https://${auth0Domain}/api/v2/users/${userId}`;
        const response = await axios.get(url, {
            headers: {
                Authorization: `Bearer ${auth0Token}`,
            },
        });

        // Return the user's app_metadata along with the updated usage count
        res.status(200).json({
            app_metadata: response.data.app_metadata,
            usageCount: usageCount, // Include updated usage count in the response
        });
    } catch (error) {
        console.error('Error fetching metadata or tracking usage:', error.message);
        res.status(500).json({ error: 'Failed to fetch metadata or track usage' });
    }
});

app.get('/payment-method', async (req, res) => {
    try {
        const customerId = req.query.stripeCustomerId; // Assume you pass the customer ID as a query parameter
        if (!customerId) {
            return res.status(400).json({ error: 'Customer ID is required' });
        }

        // Call the reusable function to get the valid payment method
        const result = await getValidPaymentMethod(customerId);

        // Return the payment method details in the response
        res.json(result);
    } catch (error) {
        console.error('Error in /payment-method endpoint:', error);
        res.status(500).json({ error: 'Failed to fetch payment method' });
    }
});

app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const endpointSecret = stripeWebhookSecret;

    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
        console.error(`Webhook signature verification failed: ${err.message}`);
        return res.status(400).send(`Webhook error: ${err.message}`);
    }


    if (event.type === 'checkout.session.completed') {

    }

    if (event.type === 'payment_method.attached') {
        const paymentMethod = event.data.object; // The attached payment method
        const stripeCustomerId = paymentMethod.customer; // Customer ID from the payment method
        const paymentMethodId = paymentMethod.id; // Payment method ID

        try {
            // Query Auth0 by Stripe Customer ID
            const auth0Token = await getAuth0ManagementToken();  // Fetch the token dynamically
            const url = `https://${auth0Domain}/api/v2/users?q=app_metadata.stripeCustomerId:"${stripeCustomerId}"&search_engine=v3`;
            const response = await axios.get(url, {
                headers: {
                    Authorization: `Bearer ${auth0Token}`,
                },
            });
    
            const user = response.data[0]; // Fetch the user
            if (user) {

                // If the user exists, update their payment status in Auth0
                await axios.patch(
                    `https://${auth0Domain}/api/v2/users/${user.user_id}`,
                    { app_metadata: { isRegistered: true } },
                    {
                        headers: {
                            Authorization: `Bearer ${auth0Token}`,
                            'Content-Type': 'application/json',
                        },
                    }
                );
    
                // Insert the user into Supabase if they don't already exist
                const { data, error } = await supabase
                    .from('users')
                    .upsert([
                        {
                            auth_sub: user.user_id, // Auth0 user ID
                        },
                    ]);
    
                if (error) {
                    console.error('Error inserting user into Supabase:', error);
                    return res.status(500).json({ error: 'Failed to add user to database.' });
                }
    
                // Set card as default payment method
                await stripe.customers.update(stripeCustomerId, {
                    invoice_settings: {
                        default_payment_method: paymentMethodId, // Use the payment method ID here
                    },
                });

                console.log(`User payment is now registered and set payment as default: ${user.user_id}`);
            } else {
                console.error('No Auth0 user found for the given Stripe Customer ID.');
            }
        } catch (error) {
            console.error('Error updating Auth0 user or adding to Supabase:', error.response?.data || error.message);
        }
    } else {
        console.log(`Unhandled event type ${event.type}`);
    }

    if (event.type === 'setup_intent.succeeded') {
        const setupIntent = event.data.object;
        const stripeCustomerId = setupIntent.customer;  // Customer ID from the SetupIntent object

        try {
            // Query Auth0 by Stripe Customer ID
            const auth0Token = await getAuth0ManagementToken();  // Fetch the token dynamically
            const url = `https://${auth0Domain}/api/v2/users?q=app_metadata.stripeCustomerId:"${stripeCustomerId}"&search_engine=v3`;
            const response = await axios.get(url, {
                headers: {
                    Authorization: `Bearer ${auth0Token}`,
                },
            });

            const user = response.data[0];
            if (user) {
                // Update app_metadata with isRegistered: true
                await axios.patch(
                    `https://${auth0Domain}/api/v2/users/${user.user_id}`,
                    { app_metadata: { isRegistered: true } },
                    {
                        headers: {
                            Authorization: `Bearer ${auth0Token}`,
                            'Content-Type': 'application/json',
                        },
                    }
                );
                console.log(`isRegistered status added to user: ${user.user_id}`);
            } else {
                console.error('No Auth0 user found for the given Stripe Customer ID.');
            }
        } catch (error) {
            console.error('Error updating Auth0 user:', error.response?.data || error.message);
        }
    }

    // Handle successful payment
    if (event.type === 'invoice.payment_succeeded') {
        const invoice = event.data.object;
        console.log(`Payment for invoice ${invoice.id} succeeded.`);
        // Process the user's request (e.g., text extraction)
        // processUserRequest(invoice.customer);
    }

    // Handle failed payment
    if (event.type === 'invoice.payment_failed') {
        const invoice = event.data.object;
        console.log(`Payment for invoice ${invoice.id} failed.`);
        // Notify the user or retry payment
        handleFailedPayment(invoice.customer);
    }



    else {
        console.log(`Unhandled event type ${event.type}`);
    }

    res.json({ received: true });
});

// Create a payment intent for Stripe
app.post('/create-payment-intent', async (req, res) => {
    const { amount } = req.body;

    try {
        const paymentIntent = await stripe.paymentIntents.create({
            amount,
            currency: 'usd',
        });
        res.send({ clientSecret: paymentIntent.client_secret });
    } catch (error) {
        res.status(500).send({ error: error.message });
    }
});

// Create a Stripe customer
app.post('/create-customer', async (req, res) => {
    const { email, name } = req.body;

    try {
        const customer = await stripe.customers.create({
            email,
            name,
        });

        res.status(200).json({ customerId: customer.id });
    } catch (error) {
        console.error('Error creating customer:', error);
        res.status(500).json({ error: 'Failed to create customer in Stripe.' });
    }
});

// Setup Payment upon clicking 'Setup Payment' button
app.post('/setup-payment-session', async (req, res) => {
    const { customerId, user } = req.body;

    try {
        let stripeCustomerId = customerId;

        if (!user?.app_metadata?.stripeCustomerId) {
            const customer = await stripe.customers.create({
                email: user.email,
                name: user.name,
            });

            stripeCustomerId = customer.id;

            // Store Stripe customer ID in Auth0
            await updateAuth0User(user.sub, stripeCustomerId);  // Use user.sub (Auth0 user ID)
        }


        // Create a Stripe Checkout Session for payment method setup
        const session = await stripe.checkout.sessions.create({
            customer: stripeCustomerId,
            payment_method_types: ['card'], // The payment method types you support
            mode: 'setup', // Use 'setup' for saving the payment method, not charging immediately
            success_url: `${frontendUrl}/success`,
            cancel_url: `${frontendUrl}/cancel`,
        });

        // Send the session ID back to the frontend
        res.json({ sessionId: session.id, success:`${frontendUrl}/home` });

    } catch (error) {
        console.error('Error creating checkout session:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Not currently used
app.post('/create-checkout-session', async (req, res) => {
    const { customerId, user } = req.body;

    try {
        let stripeCustomerId = customerId;

        if (!user?.app_metadata?.stripeCustomerId) {
            const customer = await stripe.customers.create({
                email: user.email,
                name: user.name,
            });

            stripeCustomerId = customer.id;

            // Store Stripe customer ID in Auth0
            await updateAuth0User(user.sub, stripeCustomerId);  // Use user.sub (Auth0 user ID)
        }

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        product_data: { name: 'Premium Subscription' },
                        unit_amount: 999,
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            success_url: `${frontendUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${frontendUrl}/cancel`,
            customer: stripeCustomerId,
        });

        res.json({ sessionId: session.id });
    } catch (error) {
        console.error('Error creating checkout session:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Check subscription status
app.get('/check-subscription/:stripeCustomerId', async (req, res) => {
    const { stripeCustomerId } = req.params;

    try {
        const subscriptions = await stripe.subscriptions.list({
            customer: stripeCustomerId,
            status: 'active',
            limit: 1
        });

        const isRegistered = subscriptions.data.length > 0;

        res.status(200).json({ isRegistered });
    } catch (error) {
        console.error('Error checking subscription:', error.message);
        res.status(500).json({ error: 'Failed to check subscription.' });
    }
});

// Protect routes that require premium access
app.use('/premium/*', (req, res, next) => {
    if (!req.user || !req.user.isRegistered) {
        return res.status(403).json({ error: 'Premium features require a subscription.' });
    }
    next();
});

// Test route
app.get('/test', (req, res) => {
    console.log('test hit')
    res.send('I\'m working!');
});

// Start server
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
