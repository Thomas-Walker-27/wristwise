# WristWise

A watch discovery and learning website for ENGR 310. The homepage and account system are implemented; AI recommendations, payments, and the paid demo account are future steps.

## Development

Use Node.js 22 or newer and the existing checkout (a separate worktree is unnecessary).

1. Run `npm ci`.
2. Copy `.env.example` to `.env.local` and securely set `DATABASE_URL` to your Neon Postgres connection string. Never commit this file or paste credentials into chat.
3. Run `npm run dev` from this directory. The development server listens on port 3000.
4. Run `npm test` for account integration tests against an isolated PGlite database. These tests do not connect to Neon.
5. Run `npm run build` to prepare the public website assets.

## Vercel

Keep the Framework Preset as Other and the Root Directory at the repository root. `vercel.json` selects the build command and public output directory. Vercel deploys `api/auth.js` as a Node.js function; only the explicitly copied website assets are published as static files.

Set the secret `DATABASE_URL` in Vercel for every environment in which accounts should work. It is currently configured by the project owner for Production; previews need a separate binding if they will be tested. Redeploy after changing environment variables. The Neon role must be allowed to create the application tables. The first account request creates `users`, `sessions`, and `auth_limits` if missing; it does not alter existing tables.

Account data stays in Neon. Passwords use salted scrypt hashes; opaque sessions are stored as hashes in the database. Sessions last seven days and use HttpOnly, SameSite=Lax cookies with Secure enabled on Vercel. Logout revokes the session. Mutating requests check the site's origin. Login and signup share persistent per-email and per-IP limits of 20 attempts per 15 minutes.

## Deployment check

After deploying, open the homepage, choose Join WristWise, create a fresh account, reload the account page, log out, and log back in. In Neon, confirm the email appears in the `users` table. Do not share screenshots containing password hashes or session data. This live test is needed to verify the Vercel environment variable and Neon permissions; local tests cannot establish those.

Accounts are free and do not grant a paid subscription. This version has no email verification or password-reset flow. The required paid demo account will be provisioned when paid access is implemented.
