// How we recognise a secret from its variable name, and what an attacker could
// do with it. Ordered: the first matching pattern wins, so specific names come
// before wildcards (FIREBASE_PRIVATE_KEY before FIREBASE_*).
//
// rotateUrl is only set for providers' standard API-key pages. These pages sit
// behind a login, so we could confirm each URL responds but not see the page
// itself; for every other service the playbook says "in your dashboard"
// instead of guessing a link.

const PUBLIC = { criticality: 'public', publicByDesign: true };

export const SERVICE_RULES = [
  {
    pattern: /^STRIPE_WEBHOOK_SECRET$/,
    serviceKey: 'stripe',
    serviceLabel: 'Stripe',
    capability: 'Forge payment events your server will trust',
    criticality: 'high',
    rotateUrl: 'https://dashboard.stripe.com/webhooks',
  },
  {
    pattern: /^(STRIPE_SECRET_KEY|STRIPE_SK|STRIPE_API_KEY)$/,
    serviceKey: 'stripe',
    serviceLabel: 'Stripe',
    capability: 'Create charges, issue refunds, and read customer and payment data',
    criticality: 'critical',
    rotateUrl: 'https://dashboard.stripe.com/apikeys',
  },
  {
    // Publishable keys are designed to be in the browser: they can only start
    // a checkout, never move money or read data.
    pattern: /^(STRIPE_PUBLISHABLE_KEY|STRIPE_PK)$/,
    serviceKey: 'stripe',
    serviceLabel: 'Stripe',
    capability: 'Public by design: it can only start a checkout in your website',
    ...PUBLIC,
  },
  {
    pattern: /^RAZORPAY_KEY_SECRET$/,
    serviceKey: 'razorpay',
    serviceLabel: 'Razorpay',
    capability: 'Create and refund payments',
    criticality: 'critical',
    rotateUrl: 'https://dashboard.razorpay.com/app/keys',
  },
  {
    // The key ID identifies your account in the checkout; it is useless without the secret.
    pattern: /^RAZORPAY_KEY_ID$/,
    serviceKey: 'razorpay',
    serviceLabel: 'Razorpay',
    capability: 'Public by design: it identifies your account in the checkout',
    ...PUBLIC,
  },
  {
    pattern: /^SUPABASE_SERVICE_ROLE_KEY$/,
    serviceKey: 'supabase',
    serviceLabel: 'Supabase',
    capability: 'Full database access that bypasses Row Level Security',
    criticality: 'critical',
  },
  {
    // The anon key and URL are meant for the browser; Row Level Security
    // policies decide what they can reach.
    pattern: /^(SUPABASE_ANON_KEY|SUPABASE_URL)$/,
    serviceKey: 'supabase',
    serviceLabel: 'Supabase',
    capability: 'Public by design: Row Level Security decides what it can reach',
    ...PUBLIC,
  },
  {
    pattern: /^(MONGO_URI|MONGODB_URI)$/,
    serviceKey: 'mongodb',
    serviceLabel: 'MongoDB',
    capability: "Read, change, or delete all of your app's data",
    criticality: 'critical',
    rotationNotes: 'Create a new database user or password, update the connection string, then remove the old one.',
  },
  {
    pattern: /^(DATABASE_URL|POSTGRES_URL)$/,
    serviceKey: 'database',
    serviceLabel: 'Your database',
    capability: "Read, change, or delete all of your app's data",
    criticality: 'critical',
    rotationNotes: 'Create a new database user or password, update the connection string, then remove the old one.',
  },
  {
    pattern: /^(JWT_SECRET|SESSION_SECRET|AUTH_SECRET|NEXTAUTH_SECRET)$/,
    serviceKey: 'app_auth',
    serviceLabel: "Your app's login system",
    capability: 'Forge sessions as any user, including admins',
    criticality: 'critical',
    rotationNotes: 'Rotating this logs every user out. That is expected and safe.',
  },
  {
    pattern: /^(AWS_SECRET_ACCESS_KEY|AWS_ACCESS_KEY_ID)$/,
    serviceKey: 'aws',
    serviceLabel: 'AWS',
    capability: 'Use your cloud account and run up your bill',
    criticality: 'critical',
    rotationNotes: 'Create a second access key for the same user, deploy it, then deactivate and delete the old one.',
  },
  {
    pattern: /^(GITHUB_TOKEN|GH_TOKEN)$/,
    serviceKey: 'github',
    serviceLabel: 'GitHub',
    capability: 'Read or change your repositories',
    criticality: 'critical',
    rotateUrl: 'https://github.com/settings/tokens',
    rotationNotes: 'Give the new token only the permissions your app needs.',
  },
  {
    pattern: /^CLERK_SECRET_KEY$/,
    serviceKey: 'clerk',
    serviceLabel: 'Clerk',
    capability: 'Manage every user account in your app',
    criticality: 'critical',
  },
  {
    pattern: /^LITELLM_/,
    serviceKey: 'litellm',
    serviceLabel: 'LiteLLM proxy',
    capability: 'Use every AI provider key configured in your proxy',
    criticality: 'critical',
  },
  {
    pattern: /^(FIREBASE_PRIVATE_KEY|FIREBASE_SERVICE_ACCOUNT.*)$/,
    serviceKey: 'firebase_admin',
    serviceLabel: 'Firebase Admin',
    capability: 'Full admin access to your Firebase project',
    criticality: 'critical',
    rotationNotes: 'Generate a new private key for the service account, deploy it, then delete the old key.',
  },
  {
    // Firebase web config (API key, auth domain, project ID) is shipped to
    // every browser by design; security rules decide what it can reach.
    pattern: /^FIREBASE_/,
    serviceKey: 'firebase',
    serviceLabel: 'Firebase',
    capability: 'Public by design: security rules decide what it can reach',
    ...PUBLIC,
  },
  {
    pattern: /^OPENAI_API_KEY$/,
    serviceKey: 'openai',
    serviceLabel: 'OpenAI',
    capability: 'Spend your OpenAI credits',
    criticality: 'high',
    rotateUrl: 'https://platform.openai.com/api-keys',
  },
  {
    pattern: /^ANTHROPIC_API_KEY$/,
    serviceKey: 'anthropic',
    serviceLabel: 'Anthropic',
    capability: 'Spend your Anthropic credits',
    criticality: 'high',
    rotateUrl: 'https://platform.claude.com/settings/keys',
  },
  {
    pattern: /^(GEMINI_API_KEY|GOOGLE_API_KEY)$/,
    serviceKey: 'google_ai',
    serviceLabel: 'Google AI',
    capability: 'Spend your Google AI credits',
    criticality: 'high',
    rotateUrl: 'https://aistudio.google.com/app/apikey',
  },
  {
    pattern: /^RESEND_API_KEY$/,
    serviceKey: 'resend',
    serviceLabel: 'Resend',
    capability: 'Send emails as your domain, for example to phish your users',
    criticality: 'high',
    rotateUrl: 'https://resend.com/api-keys',
  },
  {
    pattern: /^SENDGRID_API_KEY$/,
    serviceKey: 'sendgrid',
    serviceLabel: 'SendGrid',
    capability: 'Send emails as your domain, for example to phish your users',
    criticality: 'high',
    rotateUrl: 'https://app.sendgrid.com/settings/api_keys',
  },
  {
    pattern: /^MAILGUN_API_KEY$/,
    serviceKey: 'mailgun',
    serviceLabel: 'Mailgun',
    capability: 'Send emails as your domain, for example to phish your users',
    criticality: 'high',
  },
  {
    pattern: /^TWILIO_AUTH_TOKEN$/,
    serviceKey: 'twilio',
    serviceLabel: 'Twilio',
    capability: 'Send SMS and make calls billed to you',
    criticality: 'high',
  },
  {
    pattern: /^CLOUDINARY_API_SECRET$/,
    serviceKey: 'cloudinary',
    serviceLabel: 'Cloudinary',
    capability: 'Upload, change, or delete your media',
    criticality: 'medium',
  },
];

/** Used for names no rule recognises; the user can correct it later. */
export const UNKNOWN_SERVICE = {
  serviceKey: 'unknown',
  serviceLabel: 'Unrecognised',
  capability: 'We do not recognise this variable, so we cannot say what it unlocks',
  criticality: 'medium',
};
