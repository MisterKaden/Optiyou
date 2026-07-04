const storedToken = sessionStorage.getItem("optiyouAdminToken") || "";
const token = storedToken || prompt("Admin API token") || "";
if (token && token !== storedToken) {
  sessionStorage.setItem("optiyouAdminToken", token);
}

async function adminFetch(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: {
      "x-optiyou-admin-token": token,
      ...(options.body ? { "content-type": "application/json" } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (!response.ok) {
    throw new Error("admin_request_failed");
  }

  return response;
}

async function api(path, options = {}) {
  const response = await adminFetch(path, options);
  return response.json();
}

function text(tagName, content, className) {
  const element = document.createElement(tagName);
  element.textContent = content;
  if (className) {
    element.className = className;
  }
  return element;
}

function renderProducts(target, rows, empty) {
  target.replaceChildren();
  if (!rows.length) {
    target.append(text("p", empty));
    return;
  }

  for (const row of rows) {
    const item = document.createElement("div");
    item.className = "item";
    item.append(
      text("strong", row.name || row.id || "Unknown product"),
      text("p", row.gtin || row.status || "")
    );
    target.append(item);
  }
}

function renderQueue(rows) {
  const target = document.getElementById("queue");
  target.replaceChildren();
  if (!rows.length) {
    target.append(text("p", "Nothing pending review."));
    return;
  }

  for (const row of rows) {
    const item = document.createElement("div");
    const meta = document.createElement("div");
    const uploads = document.createElement("div");
    const actions = document.createElement("div");

    item.className = "item";
    meta.className = "meta";
    uploads.className = "uploads";
    actions.className = "actions";

    meta.append(
      text("span", `Status: ${row.status || "unknown"}`),
      text("span", `Uploads: ${row.uploadsReceived || 0}/${row.totalUploads || 0}`)
    );

    for (const upload of row.uploads || []) {
      uploads.append(text("div", `${upload.kind}: ${upload.status} - ${upload.r2Key}`, "upload"));
    }

    actions.append(
      decisionButton(row.id, "approved", "Approve"),
      decisionButton(row.id, "rejected", "Reject", "danger"),
      decisionButton(row.id, "needs_review", "Needs review", "secondary")
    );

    item.append(text("strong", row.gtin || row.id || "Unknown contribution"), meta, uploads, actions);
    target.append(item);
  }
}

function decisionButton(id, status, label, className) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  if (className) {
    button.className = className;
  }
  button.addEventListener("click", async () => {
    await api(`/v1/admin/contributions/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: { status }
    });
    await loadQueue();
  });
  return button;
}

async function loadQueue() {
  try {
    const data = await api("/v1/admin/review-queue");
    renderQueue(data.queue || []);
  } catch {
    document.getElementById("queue").replaceChildren(text("p", "Could not load review queue."));
  }
}

document.getElementById("search").addEventListener("click", async () => {
  const query = encodeURIComponent(document.getElementById("query").value);
  try {
    const data = await api(`/v1/admin/products?query=${query}`);
    renderProducts(document.getElementById("products"), data.products || [], "No products found.");
  } catch {
    document.getElementById("products").replaceChildren(text("p", "Could not search products."));
  }
});

function renderMetrics(metrics) {
  const target = document.getElementById("metrics");
  target.replaceChildren();
  if (!metrics) {
    target.append(text("p", "No metrics available."));
    return;
  }

  target.append(text("p", `Total products: ${metrics.products?.total ?? 0}`, "metric-total"));
  const live = metrics.scans?.analyticsEngine;
  if (live) {
    const liveLabel = live.status === "ready"
      ? `Live scans: ${formatCount(live.last24Hours)} / 24h`
      : `Live scans: ${statusLabel(live.status)}`;
    target.append(text("p", liveLabel, "metric-total"));
  }

  const groups = [
    ["By vertical", metrics.products?.byVertical],
    ["By verification", metrics.products?.byVerification],
    ["Food grade bands", metrics.scores?.foodByBand],
    ["Cosmetic grade bands", metrics.scores?.cosmeticByBand],
    ["Contributions", metrics.contributions?.byStatus],
    ["Scan outcomes", metrics.scans?.byResult]
  ];

  const wrap = document.createElement("div");
  wrap.className = "metric-grid";
  for (const [label, obj] of groups) {
    wrap.append(metricGroup(label, obj));
  }
  if (live) {
    wrap.append(
      metricGroup("Analytics Engine", {
        status: statusLabel(live.status),
        dataset: live.dataset,
        "7 days": formatCount(live.last7Days)
      }),
      metricGroup("Live outcomes", live.byOutcome24h),
      metricGroup("Scan source", live.bySource24h),
      metricGroup("Scan vertical", live.byVertical24h),
      metricGroup("Avg scores", scoreMetrics(live)),
      metricGroup("Top GTINs", Object.fromEntries((live.topGtins24h || []).map((row) => [row.gtin, row.scans]))),
      metricGroup("7-day trend", Object.fromEntries((live.trend7d || []).map((row) => [formatTrendBucket(row.t), row.scans])))
    );
  }
  target.append(wrap);
}

function metricGroup(label, obj) {
  const block = document.createElement("div");
  block.className = "metric-group";
  block.append(text("h3", label));
  const entries = Object.entries(obj || {});
  if (!entries.length) {
    block.append(text("div", "—", "metric-row"));
  }
  for (const [key, value] of entries) {
    block.append(text("div", `${humanizeMetricKey(key)}: ${value}`, "metric-row"));
  }
  return block;
}

function scoreMetrics(live) {
  const scores = {};
  if (live.avgOptiScore !== null && live.avgOptiScore !== undefined) {
    scores.OptiScore = live.avgOptiScore;
  }
  if (live.avgOptiFit !== null && live.avgOptiFit !== undefined) {
    scores.OptiFit = live.avgOptiFit;
  }
  return scores;
}

function humanizeMetricKey(key) {
  return String(key).replaceAll("_", " ");
}

function formatCount(value) {
  return Number(value || 0).toLocaleString();
}

function statusLabel(status) {
  switch (status) {
    case "ready":
      return "live";
    case "unavailable":
      return "unavailable";
    default:
      return "not configured";
  }
}

function formatTrendBucket(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "unknown";
  }
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(seconds * 1000));
}

async function loadMetrics() {
  try {
    const data = await api("/v1/admin/metrics");
    renderMetrics(data.metrics);
  } catch {
    document.getElementById("metrics").replaceChildren(text("p", "Could not load metrics."));
  }
}

function renderWaitlist(signups) {
  const target = document.getElementById("waitlist");
  target.replaceChildren();
  if (!signups.length) {
    target.append(text("p", "No signups yet."));
    return;
  }

  target.append(text("p", `${signups.length} latest signups`, "metric-total"));

  for (const signup of signups) {
    const item = document.createElement("div");
    item.className = "item";
    const meta = document.createElement("div");
    meta.className = "meta";
    const created = signup.createdAt ? new Date(signup.createdAt).toLocaleString() : "";
    meta.append(
      text("span", signup.source || "landing_page"),
      text("span", signup.cfCountry || "country unknown"),
      text("span", created),
      text("span", signup.utmSource || "direct")
    );
    item.append(text("strong", signup.email), meta);
    target.append(item);
  }
}

async function loadWaitlist() {
  try {
    const data = await api("/v1/admin/waitlist?limit=100");
    renderWaitlist(data.signups || []);
  } catch {
    document.getElementById("waitlist").replaceChildren(text("p", "Could not load waitlist."));
  }
}

async function exportWaitlist() {
  const button = document.getElementById("export-waitlist");
  button.disabled = true;
  try {
    const response = await adminFetch("/v1/admin/waitlist?format=csv&limit=5000");
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "optiyou-waitlist.csv";
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } finally {
    button.disabled = false;
  }
}

function renderEvidence(cards) {
  const target = document.getElementById("evidence");
  target.replaceChildren();
  if (!cards.length) {
    target.append(text("p", "No evidence cards."));
    return;
  }

  for (const card of cards) {
    const item = document.createElement("div");
    item.className = "item";
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.append(
      text("span", `${card.domain} · tier ${card.evidenceTier} · ${card.evidenceStatus}`),
      text("span", `${card.concernLevel}${card.contested ? " · contested" : ""} · ${card.reviewStatus}`)
    );
    item.append(text("strong", `${card.ingredientName} (${card.magnitudeBand})`), meta);
    if (card.needsHumanVerification) {
      item.append(text("div", "needs human verification", "warn"));
    }
    target.append(item);
  }
}

async function loadEvidence() {
  const status = document.getElementById("evidence-status").value;
  try {
    const data = await api(`/v1/admin/evidence${status ? `?status=${encodeURIComponent(status)}` : ""}`);
    renderEvidence(data.cards || []);
  } catch {
    document.getElementById("evidence").replaceChildren(text("p", "Could not load evidence cards."));
  }
}

document.getElementById("refresh").addEventListener("click", async () => {
  await loadQueue();
});
document.getElementById("refresh-metrics").addEventListener("click", loadMetrics);
document.getElementById("load-evidence").addEventListener("click", loadEvidence);
document.getElementById("refresh-waitlist").addEventListener("click", loadWaitlist);
document.getElementById("export-waitlist").addEventListener("click", exportWaitlist);

loadQueue();
loadMetrics();
loadEvidence();
loadWaitlist();
