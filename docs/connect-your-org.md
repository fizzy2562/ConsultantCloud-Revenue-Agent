# Connect your own Salesforce org

The app runs on built-in demo data until you sign in. This guide connects it to your own org, so
the agent reads and changes real records. It takes about 15 minutes.

## What you need

- **For User mode and Architect mode:** an org with Revenue Cloud (Agentforce Revenue
  Management) provisioned, and a user who can work with its quotes and product catalog. A plain
  Developer Edition org doesn't have the Revenue Cloud objects.
- **For the CPQ migration report:** a Salesforce CPQ org. It is read-only: the report never
  changes anything there.
- The app running locally on `http://localhost:3000` (see the README).

## 1. Create an External Client App

In the org: **Setup → External Client App Manager → New External Client App**.

1. **Basic information:** a name such as `Revenue Agent`; distribution state **Local**.
2. **Enable OAuth**, then:
   - **Callback URL:** `http://localhost:3000/api/auth/callback`. Add your hosted URL on its own
     line too if you deploy it, for example `https://your-app.vercel.app/api/auth/callback`.
   - **OAuth scopes:**
     - *Manage user data via APIs (api)*
     - *Perform requests at any time (refresh_token, offline_access)*
     - *Access unique user identifiers (openid)*
   - **Flow enablement and security:**
     - tick **Require Proof Key for Code Exchange (PKCE)**;
     - untick **Require secret for Web Server Flow**, because the app signs in with PKCE and has
       no client secret;
     - untick **Require secret for Refresh Token Flow**.
3. **Create.** Then open **Settings → OAuth Settings → Consumer Key and Secret** and copy the
   **Consumer Key**. You don't need the secret.

New External Client Apps can take a few minutes before sign-in works.

## 2. Configure the app

In `apps/web/.env`:

```bash
SF_OAUTH_CLIENT_ID=<the consumer key>
SF_LOGIN_URL=https://<your-my-domain>.my.salesforce.com
```

Using the org's My Domain URL sends users straight to the right login page. Restart the app.

## 3. Sign in

Open **http://localhost:3000**, go to the **Connection** tab and click **Sign in with Salesforce**.
Use `localhost`, not `127.0.0.1`: the callback URL has to match exactly.

Once you're signed in, User and Architect mode work against your org. Sign out on the same tab
to go back to the demo data.

## 4. The CPQ org (optional)

Repeat steps 1–3 in the CPQ org, and set these in `apps/web/.env`:

```bash
CPQ_OAUTH_CLIENT_ID=<the CPQ org's consumer key>
CPQ_LOGIN_URL=https://<cpq-my-domain>.my.salesforce.com
```

Then sign in to the CPQ org on the Connection tab and use **Architect → Generate CPQ Migration
Report**.

## 5. Demo records (optional)

To create the demo accounts and products (Acme University, Greenfield Health, Cloud
Essentials, Cloud Pro and Premium Support) in your org:

```bash
sf apex run --file salesforce/scripts/setup-demo-data.apex --target-org <alias>
```

It is safe to run more than once. Two limits on a real org:
- **Quote lines:** adding a line depends on Revenue Cloud's product discovery index picking up
  new products, which can take a while.
- **Renewals:** the script inserts an Asset directly. Revenue Cloud only renews assets created
  through its own order-to-asset process, so the renewal scenario needs a real asset.

The full renewal, discount and approval flow is always available on the built-in demo data.

## Hosting it

On a hosted deployment, also set:
- `SESSION_SECRET`: a long random value (`openssl rand -hex 32`). It encrypts the session
  cookies, and sign-in fails without it.
- `SF_OAUTH_REDIRECT_URI`: your hosted callback URL, if the platform's request URL isn't the
  public one.

Visitors who haven't signed in get the demo data, never your org.

## Troubleshooting

- **`redirect_uri_mismatch`:** the callback URL in the External Client App doesn't exactly
  match the one the app sent. Check `localhost` versus `127.0.0.1`, the port, and
  `SF_OAUTH_REDIRECT_URI`.
- **"OAuth isn't configured for this connection":** `SF_OAUTH_CLIENT_ID` (or
  `CPQ_OAUTH_CLIENT_ID`) isn't set. Restart after editing `.env`.
- **Sign-in works but tools fail with permission errors:** the user needs access to Revenue
  Cloud quoting and the product catalog in that org.
