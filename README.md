# WristWise

A watch discovery and learning website for ENGR 310. The homepage, accounts, and AI recommendation workflow are implemented. Payments and paid demo access are future steps.

## Development

Use Node.js 22 or newer and the existing checkout (a separate worktree is unnecessary).

1. Run `npm ci`.
2. Copy `.env.example` to `.env.local` and securely set `DATABASE_URL` to your Neon Postgres connection string. Never commit this file or paste credentials into chat.
3. Run `npm run dev` from this directory. The development server listens on port 3000.
4. Run `npm test` for account and recommendation integration tests against an isolated PGlite database. AI provider responses are mocked in tests; these tests do not connect to Neon or OpenAI.
5. Run `npm run build` to prepare the public website assets.

## Vercel

Keep the Framework Preset as Other and the Root Directory at the repository root. `vercel.json` selects the build command and public output directory. Vercel deploys `api/auth.js` as a Node.js function; only the explicitly copied website assets are published as static files.

Set the secret `DATABASE_URL` in Vercel for every environment in which accounts should work. It is currently configured by the project owner for Production; previews need a separate binding if they will be tested. Redeploy after changing environment variables. The Neon role must be allowed to create the application tables. The first account request creates `users`, `sessions`, and `auth_limits` if missing; it does not alter existing tables.

Account data stays in Neon. Passwords use salted scrypt hashes; opaque sessions are stored as hashes in the database. Sessions last seven days and use HttpOnly, SameSite=Lax cookies with Secure enabled on Vercel. Logout revokes the session. Mutating requests check the site's origin. Login and signup share persistent per-email and per-IP limits of 20 attempts per 15 minutes.

## Deployment check

After deploying, open the homepage, choose Join WristWise, create a fresh account, reload the account page, log out, and log back in. In Neon, confirm the email appears in the `users` table. Do not share screenshots containing password hashes or session data. This live test is needed to verify the Vercel environment variable and Neon permissions; local tests cannot establish those.

Accounts are free and do not grant a paid subscription. This version has no email verification or password-reset flow. The required paid demo account will be provisioned when paid access is implemented.

## AI recommendations

Set the secret `OPENAI_API_KEY` in Vercel Production, or in ignored `.env.local` for local development. OpenAI API billing/credits must be enabled independently of any ChatGPT subscription. The key is read only on the server. No extra packages or browser API keys are needed.

After signing in, the account page offers budget (USD), style, preferred brands, and interests. The server calls OpenAI’s Responses API using `gpt-4.1-mini`, requests structured JSON with three watches, and validates fields and budget bounds before saving. OpenAI is sent only those preferences, without the user's account email or password. Response storage is disabled at OpenAI via `store: false`. This is not a zero-retention guarantee.

Shortlists persist in the `recommendations` table; users can retrieve only their own five latest results. A database-backed atomic counter allows ten requests per account per rolling 24-hour window starting with the first request. Failed AI attempts count toward this limit to control costs. Provider requests time out after 25 seconds; the Vercel function has a 60-second maximum duration. Output is rendered as text, never injected HTML. Suggested prices are approximate, not verified live retailer prices.

To verify the live integration, log in, enter a realistic budget such as $100–$500, choose a style, and request a shortlist. Confirm three useful matches appear, refresh to check saved history, and log in as another account to check that history is private. If the service reports a billing limit, check the OpenAI API project's billing and rate limits. If it reports missing configuration, verify `OPENAI_API_KEY` is a Production variable and redeploy. Never share its value in logs or screenshots.
