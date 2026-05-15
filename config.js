// Rename this file to config.js
// Fill these values before deploying.
// Do NOT expose your Supabase Service Role key on the frontend.

window.APP_CONFIG = {
  SUPABASE_URL: "https://wfqnckfxbsunbnhonk.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndmcW5ja2Z4Ym5zdW5ibm5ob25rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4MTcwMzYsImV4cCI6MjA5NDM5MzAzNn0.BJBNGRvOipxXJuQZezzg9dYS0vxjxI3O4KaOEFGq_FQ",

  // Optional: Google Apps Script Web App URL.
  // Deploy google-apps-script.js as Web App, then paste the URL here.
  // This is only called when a payment is marked as VERIFIED.
  GOOGLE_SHEETS_WEBHOOK_URL: "https://script.google.com/macros/s/AKfycbybeFHSjypQdnKtBkXDT5VatotwuHeUAXsuyvBWhM7fA1_ZrOc74uro4MK8YWKju5g6/exec",

  BRAND_NAME: "2FLY Payment Verification Hub",

  GCASH_ACCOUNTS: [
    {
      id: "gcash_1",
      label: "GCash 1",
      accountName: "Lorna Diaz",
      accountNumber: "0912 669 9412"
    },
    {
      id: "gcash_2",
      label: "GCash 2",
      accountName: "Account Name 2",
      accountNumber: "09XX XXX XXXX"
    },
    {
      id: "gcash_3",
      label: "GCash 3",
      accountName: "Account Name 3",
      accountNumber: "09XX XXX XXXX"
    }
  ]
};
