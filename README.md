# Short Story mobile checkout

Mobile web demo of a reading-app storefront. The first page lists two memberships and three coin packs. Tapping a product opens a pull-up sheet with Stripe’s embedded Checkout Form (`ui_mode=form`). After payment, Stripe returns the shopper to a success page.

The server is Flask. Stripe API calls use `requests`, not the Stripe SDK.

## Products

| Product | Type | Price |
| --- | --- | --- |
| 1-Week Trial | Subscription | US$1.99 / week |
| Yearly Plan | Subscription | US$139.99 / year |
| 100 Coins | One-time | US$4.99 |
| 300 Coins | One-time | US$10.99 |
| 500 Coins | One-time | US$16.99 |

## Local setup

1. Copy `.env.example` to `.env` and add sandbox keys from the Stripe Dashboard.
2. Install and run:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

3. Open [http://localhost:5050](http://localhost:5050).

Test card: `4242 4242 4242 4242`, any future expiry, any CVC.

## Vercel

This app uses a Flask entrypoint (`app.py`) and static files in `public/`.

1. Push the repo to GitHub and import it in Vercel, or run `vercel`.
2. Set `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY` in the Vercel project.
3. Optionally set `STRIPE_MANAGED_PAYMENTS=true` if the account can use Managed Payments (Stripe as merchant of record). The server retries without that parameter if Stripe rejects it.
