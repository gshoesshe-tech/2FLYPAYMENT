const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

let supabaseClient = null;
let currentUser = null;
let currentProfile = null;

function money(value) {
  const num = Number(value || 0);
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(num);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function localDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function getConfig() {
  if (!window.APP_CONFIG) {
    alert("Missing config.js. Rename config.example.js to config.js and fill your Supabase keys.");
    throw new Error("Missing APP_CONFIG");
  }
  return window.APP_CONFIG;
}

function initSupabase() {
  const config = getConfig();
  if (!window.supabase) {
    throw new Error("Supabase CDN not loaded.");
  }
  supabaseClient = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
  return supabaseClient;
}

function setNotice(id, message, type = "") {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = `notice ${type}`.trim();
  el.textContent = message;
  el.hidden = !message;
}

async function requireAuth() {
  initSupabase();
  const { data, error } = await supabaseClient.auth.getUser();
  if (error || !data.user) {
    window.location.href = "login.html";
    return null;
  }

  currentUser = data.user;

  const { data: profile } = await supabaseClient
    .from("profiles")
    .select("*")
    .eq("id", currentUser.id)
    .single();

  currentProfile = profile || {
    id: currentUser.id,
    email: currentUser.email,
    full_name: currentUser.email,
    role: "admin"
  };

  const userLabel = document.getElementById("userLabel");
  if (userLabel) {
    userLabel.textContent = `${currentProfile.full_name || currentUser.email} • ${currentProfile.role || "admin"}`;
  }

  return currentUser;
}

async function logout() {
  await supabaseClient.auth.signOut();
  window.location.href = "login.html";
}

function populatePaymentMethods() {
  const select = document.getElementById("paymentMethod");
  if (!select) return;

  const config = getConfig();
  const accounts = config.GCASH_ACCOUNTS || [];
  select.innerHTML = `
    <option value="">Select payment method</option>
    ${accounts.map(acc => `<option value="${acc.id}">${acc.label} — ${acc.accountName} — ${acc.accountNumber}</option>`).join("")}
    <option value="cash">Cash</option>
    <option value="bank_transfer">Bank Transfer</option>
    <option value="other">Other</option>
  `;
}

function paymentMethodLabel(value) {
  const config = getConfig();
  const found = (config.GCASH_ACCOUNTS || []).find(acc => acc.id === value);
  if (found) return `${found.label} — ${found.accountName}`;
  const map = {
    cash: "Cash",
    bank_transfer: "Bank Transfer",
    other: "Other"
  };
  return map[value] || value || "—";
}

function statusPill(status) {
  return `<span class="pill ${status}">${String(status || "pending").replace("_", " ").toUpperCase()}</span>`;
}

function customerTypePill(type) {
  return `<span class="pill">${String(type || "online").toUpperCase()}</span>`;
}

async function checkDuplicateReference(referenceNumber, excludeId = null) {
  if (!referenceNumber) return null;

  let query = supabaseClient
    .from("payments")
    .select("id, order_id, customer_name, amount, status, created_at")
    .eq("reference_number", referenceNumber)
    .limit(1);

  const { data, error } = await query;
  if (error || !data || !data.length) return null;

  const match = data[0];
  if (excludeId && match.id === excludeId) return null;
  return match;
}

async function uploadProof(file, orderId, referenceNumber) {
  if (!file) return null;

  const safeOrderId = String(orderId || "NO-ORDER").replace(/[^a-zA-Z0-9_-]/g, "-");
  const safeRef = String(referenceNumber || Date.now()).replace(/[^a-zA-Z0-9_-]/g, "-");
  const ext = file.name.split(".").pop() || "jpg";
  const date = todayISO().replaceAll("-", "/");
  const path = `${date}/${safeOrderId}-${safeRef}-${Date.now()}.${ext}`;

  const { error } = await supabaseClient.storage
    .from("payment-proofs")
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false
    });

  if (error) throw error;

  const { data } = supabaseClient.storage
    .from("payment-proofs")
    .getPublicUrl(path);

  return data.publicUrl;
}

async function createPayment(payload) {
  const duplicate = await checkDuplicateReference(payload.reference_number);
  if (duplicate) {
    payload.status = "duplicate";
    payload.notes = `[AUTO DUPLICATE WARNING] Possible duplicate of Order ID ${duplicate.order_id}. ${payload.notes || ""}`.trim();
  }

  const { data, error } = await supabaseClient
    .from("payments")
    .insert(payload)
    .select()
    .single();

  if (error) throw error;

  await logActivity("created_payment", data.id, `Created payment for ${data.order_id}`);

  return data;
}

async function submitPaymentForm(e) {
  e.preventDefault();
  setNotice("formNotice", "Uploading payment record...", "");

  const form = e.currentTarget;
  const orderId = form.order_id.value.trim();
  const customerType = form.customer_type.value;

  if (!orderId) {
    setNotice("formNotice", "Order ID is required for both online and walk-in records.", "danger");
    return;
  }

  const referenceNumber = form.reference_number.value.trim();
  const amount = Number(form.amount.value || 0);
  const proofFile = form.proof.files[0];

  try {
    const proofUrl = await uploadProof(proofFile, orderId, referenceNumber);

    const payload = {
      order_id: orderId,
      customer_name: form.customer_name.value.trim() || "Walk-in Customer",
      customer_type: customerType,
      payment_method: form.payment_method.value,
      amount,
      reference_number: referenceNumber || null,
      proof_image_url: proofUrl,
      status: "pending",
      notes: form.notes.value.trim() || null,
      submitted_by: currentUser.id
    };

    const saved = await createPayment(payload);
    form.reset();
    populatePaymentMethods();

    if (saved.status === "duplicate") {
      setNotice("formNotice", `Uploaded, but marked as DUPLICATE because the reference number already exists. Order ID: ${saved.order_id}`, "warning");
    } else {
      setNotice("formNotice", `Payment uploaded successfully. Order ID: ${saved.order_id}`, "success");
    }
  } catch (err) {
    console.error(err);
    setNotice("formNotice", err.message || "Upload failed.", "danger");
  }
}

async function logActivity(action, paymentId = null, details = "") {
  try {
    await supabaseClient.from("admin_activity").insert({
      user_id: currentUser?.id || null,
      action,
      payment_id: paymentId,
      details
    });
  } catch (err) {
    console.warn("Activity log failed:", err.message);
  }
}

async function fetchPayments(filters = {}) {
  let query = supabaseClient
    .from("payments")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300);

  if (filters.status && filters.status !== "all") query = query.eq("status", filters.status);
  if (filters.customer_type && filters.customer_type !== "all") query = query.eq("customer_type", filters.customer_type);
  if (filters.payment_method && filters.payment_method !== "all") query = query.eq("payment_method", filters.payment_method);
  if (filters.date) {
    const start = `${filters.date}T00:00:00`;
    const end = `${filters.date}T23:59:59`;
    query = query.gte("created_at", start).lte("created_at", end);
  }
  if (filters.search) {
    const s = filters.search.trim();
    if (s) query = query.or(`order_id.ilike.%${s}%,customer_name.ilike.%${s}%,reference_number.ilike.%${s}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

function renderPaymentCards(payments, mountId = "paymentList") {
  const mount = document.getElementById(mountId);
  if (!mount) return;

  if (!payments.length) {
    mount.innerHTML = `<div class="empty">No payments found.</div>`;
    return;
  }

  mount.innerHTML = payments.map(p => `
    <div class="payment-card">
      <div class="payment-top">
        <div>
          <div class="payment-title">${p.order_id}</div>
          <div class="helper">${p.customer_name || "—"} • ${localDateTime(p.created_at)}</div>
          <div class="payment-meta">
            ${statusPill(p.status)}
            ${customerTypePill(p.customer_type)}
            <span class="pill">${paymentMethodLabel(p.payment_method)}</span>
            <span class="pill">${money(p.amount)}</span>
            <span class="pill">REF: ${p.reference_number || "—"}</span>
          </div>
        </div>
        <button class="btn secondary small" onclick="openPaymentModal('${p.id}')">View</button>
      </div>
      ${p.notes ? `<div class="notice">${escapeHtml(p.notes)}</div>` : ""}
      <div class="payment-actions">
        <button class="btn success small" onclick="updatePaymentStatus('${p.id}', 'verified')">Verify</button>
        <button class="btn warning small" onclick="updatePaymentStatus('${p.id}', 'needs_review')">Needs Review</button>
        <button class="btn danger small" onclick="updatePaymentStatus('${p.id}', 'rejected')">Reject</button>
        ${currentProfile?.role === "owner" ? `<button class="btn danger small" onclick="deletePayment('${p.id}')">Delete</button>` : ""}
      </div>
    </div>
  `).join("");
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function openPaymentModal(id) {
  const { data, error } = await supabaseClient
    .from("payments")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    alert(error.message);
    return;
  }

  const modal = document.getElementById("paymentModal");
  const content = document.getElementById("paymentModalContent");
  content.innerHTML = `
    <div class="card-header">
      <div>
        <h2>${data.order_id}</h2>
        <p>${data.customer_name || "—"} • ${localDateTime(data.created_at)}</p>
      </div>
      <button class="btn secondary small" onclick="closeModal()">Close</button>
    </div>

    <div class="grid two">
      <div class="metric"><div class="metric-label">Amount</div><div class="metric-value">${money(data.amount)}</div></div>
      <div class="metric"><div class="metric-label">Status</div><div class="metric-value">${String(data.status).replace("_", " ")}</div></div>
    </div>

    <div class="payment-meta" style="margin-top:14px">
      ${customerTypePill(data.customer_type)}
      <span class="pill">${paymentMethodLabel(data.payment_method)}</span>
      <span class="pill">REF: ${data.reference_number || "—"}</span>
      <span class="pill">Verified: ${localDateTime(data.verified_at)}</span>
    </div>

    ${data.notes ? `<div class="notice">${escapeHtml(data.notes)}</div>` : ""}

    ${data.proof_image_url ? `<a href="${data.proof_image_url}" target="_blank"><img class="proof-img" src="${data.proof_image_url}" alt="Payment proof"></a>` : `<div class="empty">No proof image uploaded.</div>`}

    <div class="payment-actions">
      <button class="btn success" onclick="updatePaymentStatus('${data.id}', 'verified')">Verify / Good to Go</button>
      <button class="btn warning" onclick="updatePaymentStatus('${data.id}', 'needs_review')">Needs Review</button>
      <button class="btn danger" onclick="updatePaymentStatus('${data.id}', 'rejected')">Reject</button>
      ${currentProfile?.role === "owner" ? `<button class="btn danger" onclick="deletePayment('${data.id}')">Delete</button>` : ""}
    </div>
  `;

  modal.classList.add("show");
}

function closeModal() {
  const modal = document.getElementById("paymentModal");
  if (modal) modal.classList.remove("show");
}

async function updatePaymentStatus(id, status) {
  try {
    const payload = {
      status,
      updated_at: new Date().toISOString()
    };

    if (status === "verified") {
      payload.verified_by = currentUser.id;
      payload.verified_at = new Date().toISOString();
    }

    const { data, error } = await supabaseClient
      .from("payments")
      .update(payload)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    await logActivity(`marked_${status}`, id, `Payment ${data.order_id} marked as ${status}`);

    if (status === "verified") {
      await syncPaymentToSheets(data);
    }

    closeModal();
    if (window.loadAdminPayments) await window.loadAdminPayments();
    if (window.loadReports) await window.loadReports();

  } catch (err) {
    console.error(err);
    alert(err.message || "Status update failed.");
  }
}

async function deletePayment(id) {
  if (currentProfile?.role !== "owner") {
    alert("Only owner can delete payments.");
    return;
  }

  if (!confirm("Delete this payment record? This cannot be undone.")) return;

  const { error } = await supabaseClient.from("payments").delete().eq("id", id);
  if (error) {
    alert(error.message);
    return;
  }

  await logActivity("deleted_payment", id, "Owner deleted payment record");
  closeModal();
  if (window.loadAdminPayments) await window.loadAdminPayments();
}

async function syncPaymentToSheets(payment) {
  const config = getConfig();
  const url = config.GOOGLE_SHEETS_WEBHOOK_URL;

  if (!url) {
    console.warn("Google Sheets webhook URL not configured. Skipping sync.");
    return;
  }

  const payload = {
    secret: config.SHEETS_WEBHOOK_SECRET || "",
    payment: {
      id: payment.id,
      order_id: payment.order_id,
      customer_name: payment.customer_name,
      customer_type: payment.customer_type,
      payment_method: paymentMethodLabel(payment.payment_method),
      payment_method_raw: payment.payment_method,
      amount: payment.amount,
      reference_number: payment.reference_number,
      status: payment.status,
      proof_image_url: payment.proof_image_url,
      notes: payment.notes,
      created_at: payment.created_at,
      verified_at: payment.verified_at,
      verified_by: currentProfile?.full_name || currentUser?.email || ""
    }
  };

  try {
    await fetch(url, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    console.warn("Sheets sync failed:", err.message);
  }
}

function summarizePayments(payments) {
  const verified = payments.filter(p => p.status === "verified");
  const sum = arr => arr.reduce((total, p) => total + Number(p.amount || 0), 0);

  const byMethod = {};
  const byType = {};

  verified.forEach(p => {
    byMethod[p.payment_method] = (byMethod[p.payment_method] || 0) + Number(p.amount || 0);
    byType[p.customer_type] = (byType[p.customer_type] || 0) + Number(p.amount || 0);
  });

  return {
    total: sum(verified),
    verifiedCount: verified.length,
    pendingCount: payments.filter(p => p.status === "pending").length,
    reviewCount: payments.filter(p => p.status === "needs_review").length,
    rejectedCount: payments.filter(p => p.status === "rejected").length,
    duplicateCount: payments.filter(p => p.status === "duplicate").length,
    byMethod,
    byType
  };
}

function renderMetrics(summary) {
  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  set("metricTotal", money(summary.total));
  set("metricVerified", summary.verifiedCount);
  set("metricPending", summary.pendingCount);
  set("metricReview", summary.reviewCount);
  set("metricOnline", money(summary.byType.online || 0));
  set("metricWalkin", money(summary.byType.walkin || 0));
  set("metricGcash1", money(summary.byMethod.gcash_1 || 0));
  set("metricGcash2", money(summary.byMethod.gcash_2 || 0));
  set("metricGcash3", money(summary.byMethod.gcash_3 || 0));
  set("metricCash", money(summary.byMethod.cash || 0));
}

async function setupLoginPage() {
  initSupabase();

  const form = document.getElementById("loginForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    setNotice("loginNotice", "Signing in...", "");

    const email = form.email.value.trim();
    const password = form.password.value;

    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

    if (error) {
      setNotice("loginNotice", error.message, "danger");
      return;
    }

    window.location.href = "admin.html";
  });
}

async function setupSubmitPage() {
  await requireAuth();
  populatePaymentMethods();

  const form = document.getElementById("paymentForm");
  if (form) form.addEventListener("submit", submitPaymentForm);

  const customerType = document.getElementById("customerType");
  const orderHelp = document.getElementById("orderHelp");
  if (customerType && orderHelp) {
    customerType.addEventListener("change", () => {
      if (customerType.value === "walkin") {
        orderHelp.textContent = "Manual too. Example: WALKIN-20260515-001 or your own counter code.";
      } else {
        orderHelp.textContent = "Use your website/order dashboard Order ID.";
      }
    });
  }
}

async function setupAdminPage() {
  await requireAuth();
  populatePaymentMethods();

  window.loadAdminPayments = async function() {
    const filters = {
      status: document.getElementById("statusFilter")?.value || "pending",
      customer_type: document.getElementById("typeFilter")?.value || "all",
      payment_method: document.getElementById("paymentMethodFilter")?.value || "all",
      search: document.getElementById("searchInput")?.value || ""
    };

    const payments = await fetchPayments(filters);
    renderPaymentCards(payments, "paymentList");
    renderMetrics(summarizePayments(payments));
  };

  ["statusFilter", "typeFilter", "paymentMethodFilter"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", window.loadAdminPayments);
  });

  const searchInput = document.getElementById("searchInput");
  if (searchInput) searchInput.addEventListener("input", debounce(window.loadAdminPayments, 350));

  await window.loadAdminPayments();
}

async function setupReportsPage() {
  await requireAuth();
  populatePaymentMethods();

  const dateInput = document.getElementById("reportDate");
  if (dateInput && !dateInput.value) dateInput.value = todayISO();

  window.loadReports = async function() {
    const filters = {
      date: document.getElementById("reportDate")?.value || todayISO(),
      customer_type: document.getElementById("typeFilter")?.value || "all",
      payment_method: document.getElementById("paymentMethodFilter")?.value || "all",
      status: "all"
    };

    const payments = await fetchPayments(filters);
    const summary = summarizePayments(payments);
    renderMetrics(summary);
    renderReportTable(payments);
  };

  ["reportDate", "typeFilter", "paymentMethodFilter"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", window.loadReports);
  });

  await window.loadReports();
}

function renderReportTable(payments) {
  const tbody = document.getElementById("reportRows");
  if (!tbody) return;

  if (!payments.length) {
    tbody.innerHTML = `<tr><td colspan="9">No records found.</td></tr>`;
    return;
  }

  tbody.innerHTML = payments.map(p => `
    <tr>
      <td>${localDateTime(p.created_at)}</td>
      <td>${p.order_id}</td>
      <td>${escapeHtml(p.customer_name || "—")}</td>
      <td>${String(p.customer_type || "—").toUpperCase()}</td>
      <td>${paymentMethodLabel(p.payment_method)}</td>
      <td>${money(p.amount)}</td>
      <td>${p.reference_number || "—"}</td>
      <td>${String(p.status || "—").replace("_", " ").toUpperCase()}</td>
      <td>${p.proof_image_url ? `<a href="${p.proof_image_url}" target="_blank">View</a>` : "—"}</td>
    </tr>
  `).join("");
}

function debounce(fn, delay) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}

window.logout = logout;
window.openPaymentModal = openPaymentModal;
window.closeModal = closeModal;
window.updatePaymentStatus = updatePaymentStatus;
window.deletePayment = deletePayment;

document.addEventListener("DOMContentLoaded", async () => {
  const page = document.body.dataset.page;
  try {
    if (page === "login") await setupLoginPage();
    if (page === "submit") await setupSubmitPage();
    if (page === "admin") await setupAdminPage();
    if (page === "reports") await setupReportsPage();
  } catch (err) {
    console.error(err);
  }
});
