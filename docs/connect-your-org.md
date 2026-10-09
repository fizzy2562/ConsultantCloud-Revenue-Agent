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

## 5. Demo records

On the **Connection** tab, click **Set up demo data**. It is safe to run again: it only adds or
fixes what's missing, and lists every step with its result. In the connected Revenue Cloud org it:

- creates the Acme University and Greenfield Health accounts;
- sets up Cloud Essentials, Cloud Pro and Premium Support so Revenue Cloud can quote and price
  them: a price entry for their selling model (without one, adding a line fails with "Required
  fields are missing: [PricebookEntryId]"), Configure During Sale set (without it, lines price
  at 0), and no stray price entry without a selling model;
- starts Revenue Cloud's **Sync Pricing Data** when the price book decision tables are older
  than the demo prices (pricing can't see newer prices until it runs; it takes a minute or two);
- gives Acme a current Cloud Pro subscription as real assets, through a quote, an order,
  activation and assets, so there's something to renew;
- gives Acme an open quote with a Cloud Pro line, so there's something to discount, and replaces
  the line if it was added before the products were priced.

To check any product yourself, ask the agent to "diagnose Cloud Pro" (the `diagnose_product`
tool).

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
