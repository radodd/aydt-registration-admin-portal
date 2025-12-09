// scripts/check-env.mjs

const REQUIRED_ENV_VARS = [
  // Example keys – adjust to your actual needs:
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  //   'SUPABASE_SERVICE_ROLE_KEY',
  //   'STRIPE_SECRET_KEY',
  //   'STRIPE_WEBHOOK_SECRET',
  //   'RESEND_API_KEY',
  // add any others your app needs to run/build
];

let missing = [];

for (const key of REQUIRED_ENV_VARS) {
  if (!process.env[key]) {
    missing.push(key);
  }
}

if (missing.length > 0) {
  console.error("❌ Missing required environment variables:");
  for (const key of missing) {
    console.error(`  - ${key}`);
  }
  process.exit(1);
} else {
  console.log("✅ All required environment variables are set.");
}
