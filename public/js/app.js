const money = (amount, currency = "usd") =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);

const state = {
  products: [],
  stripe: null,
  selectedId: null,
  checkout: null,
  form: null,
};

const els = {
  membershipList: document.getElementById("membership-list"),
  coinList: document.getElementById("coin-list"),
  backdrop: document.getElementById("sheet-backdrop"),
  sheet: document.getElementById("checkout-sheet"),
  close: document.getElementById("sheet-close"),
  form: document.getElementById("checkout-form"),
  error: document.getElementById("form-error"),
  storeError: document.getElementById("store-error"),
};

function productById(id) {
  return state.products.find((product) => product.id === id);
}

function planCard(product, selectedId) {
  const selected = product.id === selectedId;
  const compare = product.compare_amount
    ? `<p class="compare">US${money(product.compare_amount)}${product.interval_label}</p>`
    : "";
  return `
    <button class="plan-card${selected ? " selected" : ""}" type="button" data-product="${product.id}">
      <span class="radio" aria-hidden="true"><span></span></span>
      <span class="plan-copy">${product.name}</span>
      <span class="plan-price">
        ${compare}
        <p class="price">US${money(product.amount)}</p>
      </span>
    </button>
  `;
}

function coinCard(product) {
  const badge = product.badge ? `<span class="chip">${product.badge}</span>` : "";
  return `
    <button class="coin-card" type="button" data-product="${product.id}">
      <span class="coin-left">
        <span class="coin-icon" aria-hidden="true"></span>
        <span>
          <p class="coin-name">${product.name}${badge}</p>
          <p class="coin-meta">${product.description}</p>
        </span>
      </span>
      <span class="price">US${money(product.amount)}</span>
    </button>
  `;
}

function renderStore() {
  const memberships = state.products.filter((product) => product.group === "membership");
  const coins = state.products.filter((product) => product.group === "coins");
  els.membershipList.innerHTML = memberships.map((product) => planCard(product)).join("");
  els.coinList.innerHTML = coins.map(coinCard).join("");
}

function showError(message) {
  els.error.hidden = !message;
  els.error.textContent = message || "";
}

function setFormLoading(message = "Loading secure checkout…") {
  els.form.hidden = false;
  els.form.innerHTML = `<div class="form-skeleton">${message}</div>`;
}

function openSheet() {
  els.backdrop.hidden = false;
  els.sheet.classList.add("open");
  els.sheet.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeSheet() {
  els.sheet.classList.remove("open");
  els.sheet.setAttribute("aria-hidden", "true");
  els.backdrop.hidden = true;
  document.body.style.overflow = "";
  showError("");
  els.form.hidden = true;
  els.form.innerHTML = "";
}

async function mountCheckoutForm(productId) {
  showError("");
  setFormLoading();

  const response = await fetch("/api/create-checkout-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ product_id: productId }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.clientSecret) {
    throw new Error(payload.error || "Could not start checkout");
  }

  if (state.form && typeof state.form.unmount === "function") {
    state.form.unmount();
  }
  els.form.hidden = false;
  els.form.innerHTML = "";
  state.checkout = state.stripe.initCheckoutFormSdk({
    clientSecret: payload.clientSecret,
    appearance: {
      theme: "stripe",
      variables: {
        colorPrimary: "#f31260",
        borderRadius: "12px",
      },
    },
  });

  state.form = state.checkout.createForm({
    layout: "expanded",
  });
  state.form.mount("#checkout-form");

  const loadActionsResult = await state.checkout.loadActions();
  if (loadActionsResult.type !== "success") {
    throw new Error(loadActionsResult.error?.message || "Checkout failed to load");
  }

  state.form.on("confirm", async (event) => {
    try {
      await loadActionsResult.actions.confirm({ formConfirmEvent: event });
    } catch (error) {
      showError(error.message || "Payment could not be confirmed");
    }
  });
}

async function openCheckout(productId) {
  const product = productById(productId);
  if (!product) return;

  state.selectedId = productId;
  openSheet();

  if (!state.stripe) {
    setFormLoading("Checkout is unavailable.");
    showError("Stripe.js is not initialized. Check your publishable key.");
    return;
  }

  try {
    await mountCheckoutForm(productId);
  } catch (error) {
    setFormLoading("Checkout is unavailable.");
    showError(error.message);
  }
}

function bindEvents() {
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-product]");
    if (!button) return;
    openCheckout(button.dataset.product);
  });

  els.close.addEventListener("click", closeSheet);
  els.backdrop.addEventListener("click", closeSheet);
}

async function init() {
  bindEvents();

  const [configResponse, productsResponse] = await Promise.all([
    fetch("/api/config"),
    fetch("/api/products"),
  ]);
  const config = await configResponse.json();
  const catalog = await productsResponse.json();

  state.products = catalog.products || [];
  renderStore();

  if (!configResponse.ok || !config.publishableKey) {
    els.storeError.hidden = false;
    els.storeError.textContent =
      "Missing Stripe publishable key. Add STRIPE_PUBLISHABLE_KEY to .env.";
    return;
  }

  state.stripe = Stripe(config.publishableKey);
}

init();
