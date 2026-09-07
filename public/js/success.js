const money = (amount, currency = "usd") =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);

const params = new URLSearchParams(window.location.search);
const sessionId = params.get("session_id");
const title = document.getElementById("success-title");
const copy = document.getElementById("success-copy");
const receipt = document.getElementById("receipt");
const card = document.getElementById("success-card");

function failed(message) {
  card.classList.add("failed");
  title.textContent = "Payment not finished";
  copy.textContent = message;
}

async function loadStatus() {
  if (!sessionId) {
    failed("No Checkout Session was found on this page.");
    return;
  }

  const response = await fetch(`/api/session-status?session_id=${encodeURIComponent(sessionId)}`);
  const session = await response.json();
  if (!response.ok) {
    failed(session.error || "Unable to load this payment.");
    return;
  }

  const paid = session.payment_status === "paid" || session.status === "complete";
  if (!paid) {
    failed("This payment is still open or did not complete.");
    return;
  }

  title.textContent = "You’re all set";
  copy.textContent =
    session.mode === "subscription"
      ? "Your membership is active."
      : "Your coins have been added.";

  receipt.hidden = false;
  receipt.innerHTML = `
    <div><dt>Item</dt><dd>${session.product_name || "Purchase"}</dd></div>
    <div><dt>Amount</dt><dd>${money(session.amount_total || 0, session.currency || "usd")}</dd></div>
    ${
      session.customer_email
        ? `<div><dt>Email</dt><dd>${session.customer_email}</dd></div>`
        : ""
    }
  `;
}

loadStatus();
