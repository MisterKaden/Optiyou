const storedToken = sessionStorage.getItem("optiyouAdminToken") || "";
const token = storedToken || prompt("Admin API token") || "";
if (token && token !== storedToken) {
  sessionStorage.setItem("optiyouAdminToken", token);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: {
      "x-optiyou-admin-token": token,
      ...(options.body ? { "content-type": "application/json" } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
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
  const data = await api("/v1/admin/review-queue");
  renderQueue(data.queue || []);
}

document.getElementById("search").addEventListener("click", async () => {
  const query = encodeURIComponent(document.getElementById("query").value);
  const data = await api(`/v1/admin/products?query=${query}`);
  renderProducts(document.getElementById("products"), data.products || [], "No products found.");
});

document.getElementById("refresh").addEventListener("click", async () => {
  await loadQueue();
});

loadQueue();
