import os
from pathlib import Path

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory

load_dotenv()

ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / "public"
STRIPE_API = "https://api.stripe.com/v1"
STRIPE_API_VERSION = "2026-08-26.dahlia"

PRODUCTS = {
    "trial_week": {
        "id": "trial_week",
        "name": "1-Week Trial",
        "kind": "subscription",
        "amount": 199,
        "compare_amount": 1999,
        "currency": "usd",
        "interval": "week",
        "interval_label": "/w",
        "description": "Unlimited Reading of All Short Stories",
        "group": "membership",
    },
    "yearly": {
        "id": "yearly",
        "name": "Yearly Plan",
        "kind": "subscription",
        "amount": 13999,
        "compare_amount": None,
        "currency": "usd",
        "interval": "year",
        "interval_label": "/y",
        "description": "Unlimited Reading of All Short Stories",
        "group": "membership",
    },
    "coins_100": {
        "id": "coins_100",
        "name": "100 Coins",
        "kind": "payment",
        "amount": 499,
        "compare_amount": None,
        "currency": "usd",
        "interval": None,
        "interval_label": "",
        "description": "Unlock chapters and tip authors",
        "group": "coins",
        "badge": None,
    },
    "coins_300": {
        "id": "coins_300",
        "name": "300 Coins",
        "kind": "payment",
        "amount": 1099,
        "compare_amount": None,
        "currency": "usd",
        "interval": None,
        "interval_label": "",
        "description": "Unlock chapters and tip authors",
        "group": "coins",
        "badge": "Popular",
    },
    "coins_500": {
        "id": "coins_500",
        "name": "500 Coins",
        "kind": "payment",
        "amount": 1699,
        "compare_amount": None,
        "currency": "usd",
        "interval": None,
        "interval_label": "",
        "description": "Unlock chapters and tip authors",
        "group": "coins",
        "badge": "Best value",
    },
}

app = Flask(__name__)


def _secret_key():
    key = os.environ.get("STRIPE_SECRET_KEY", "").strip()
    if not key:
        raise RuntimeError("STRIPE_SECRET_KEY is not set")
    return key


def _publishable_key():
    return os.environ.get("STRIPE_PUBLISHABLE_KEY", "").strip()


def _managed_payments_enabled():
    return os.environ.get("STRIPE_MANAGED_PAYMENTS", "true").lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def _public_origin():
    proto = request.headers.get("X-Forwarded-Proto", request.scheme)
    host = request.headers.get("X-Forwarded-Host") or request.headers.get(
        "Host", request.host
    )
    return f"{proto}://{host}"


def stripe_request(method, path, data=None, params=None):
    return requests.request(
        method,
        f"{STRIPE_API}{path}",
        auth=(_secret_key(), ""),
        headers={"Stripe-Version": STRIPE_API_VERSION},
        data=data,
        params=params,
        timeout=30,
    )


def create_checkout_session(product):
    return_url = f"{_public_origin()}/success?session_id={{CHECKOUT_SESSION_ID}}"
    mode = "subscription" if product["kind"] == "subscription" else "payment"

    data = {
        "mode": mode,
        "ui_mode": "form",
        "return_url": return_url,
        "integration_identifier": "short_story_mobile_form",
        "line_items[0][quantity]": 1,
        "line_items[0][price_data][currency]": product["currency"],
        "line_items[0][price_data][unit_amount]": product["amount"],
        "line_items[0][price_data][product_data][name]": product["name"],
        "line_items[0][price_data][product_data][description]": product["description"],
        "metadata[product_id]": product["id"],
        "metadata[product_name]": product["name"],
        "email_collection": "if_required",
    }

    if product["kind"] == "subscription":
        data["line_items[0][price_data][recurring][interval]"] = product["interval"]

    use_managed = _managed_payments_enabled()
    if use_managed:
        data["managed_payments[enabled]"] = "true"

    response = stripe_request("POST", "/checkout/sessions", data=data)

    if use_managed and response.status_code >= 400:
        data.pop("managed_payments[enabled]", None)
        response = stripe_request("POST", "/checkout/sessions", data=data)

    return response


@app.get("/api/config")
def api_config():
    publishable_key = _publishable_key()
    if not publishable_key:
        return jsonify({"error": "STRIPE_PUBLISHABLE_KEY is not set"}), 500
    return jsonify({"publishableKey": publishable_key})


@app.get("/api/products")
def api_products():
    return jsonify({"products": list(PRODUCTS.values())})


@app.post("/api/create-checkout-session")
def api_create_checkout_session():
    payload = request.get_json(silent=True) or {}
    product_id = payload.get("product_id")
    product = PRODUCTS.get(product_id)
    if not product:
        return jsonify({"error": "Unknown product"}), 400

    try:
        response = create_checkout_session(product)
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 500

    body = response.json()
    if response.status_code >= 400:
        message = body.get("error", {}).get("message") or "Unable to create Checkout Session"
        return jsonify({"error": message}), response.status_code

    return jsonify(
        {
            "clientSecret": body.get("client_secret"),
            "sessionId": body.get("id"),
        }
    )


@app.get("/api/session-status")
def api_session_status():
    session_id = (request.args.get("session_id") or "").strip()
    if not session_id.startswith("cs_"):
        return jsonify({"error": "Invalid session_id"}), 400

    try:
        response = stripe_request(
            "GET",
            f"/checkout/sessions/{session_id}",
            params={"expand[]": "line_items"},
        )
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 500

    body = response.json()
    if response.status_code >= 400:
        message = body.get("error", {}).get("message") or "Unable to retrieve session"
        return jsonify({"error": message}), response.status_code

    line_items = (body.get("line_items") or {}).get("data") or []
    first_item = line_items[0] if line_items else {}
    return jsonify(
        {
            "status": body.get("status"),
            "payment_status": body.get("payment_status"),
            "mode": body.get("mode"),
            "amount_total": body.get("amount_total"),
            "currency": body.get("currency"),
            "customer_email": (body.get("customer_details") or {}).get("email"),
            "product_name": first_item.get("description")
            or (body.get("metadata") or {}).get("product_name"),
        }
    )


@app.get("/")
def index():
    return send_from_directory(PUBLIC, "index.html")


@app.get("/success")
def success():
    return send_from_directory(PUBLIC, "success.html")


@app.get("/<path:filename>")
def public_files(filename):
    return send_from_directory(PUBLIC, filename)


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.environ.get("PORT", 5050)), debug=True)
