import app from "./app";

// For Vercel Node serverless function compatibility.
// `@vercel/node` knows how to treat an Express app as the handler.
// Keep regular index.ts for local/server usage.
export default app;
