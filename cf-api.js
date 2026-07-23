// Minimal Cloudflare API client — only the calls we need for self-service deploy.
// No token is ever written to disk or logged here; the caller is responsible
// for discarding it after use.

const API = "https://api.cloudflare.com/client/v4";

async function cf(path, token, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  const data = await res.json();
  if (!data.success) {
    const msg = (data.errors || []).map((e) => e.message).join("; ") || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data.result;
}

/** Verifies the token is valid and has the permissions we're about to use. */
export async function verifyToken(token) {
  return cf("/user/tokens/verify", token);
}

export async function createKvNamespace(accountId, token, title) {
  const result = await cf(`/accounts/${accountId}/storage/kv/namespaces`, token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title }),
  });
  return result.id;
}

/**
 * Uploads a module Worker made of multiple JS files.
 * files: { "worker.js": "...source...", "vless.js": "...source..." }
 * bindings: array of Cloudflare binding objects (kv_namespace, secret_text, plain_text, ...)
 */
export async function uploadWorker(accountId, token, scriptName, files, bindings) {
  const form = new FormData();
  const metadata = {
    main_module: "worker.js",
    bindings,
    compatibility_date: "2026-07-01",
  };
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  for (const [filename, content] of Object.entries(files)) {
    form.append(
      filename,
      new Blob([content], { type: "application/javascript+module" }),
      filename
    );
  }

  const res = await fetch(`${API}/accounts/${accountId}/workers/scripts/${scriptName}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const data = await res.json();
  if (!data.success) {
    const msg = (data.errors || []).map((e) => e.message).join("; ") || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data.result;
}

export async function enableWorkersDev(accountId, token, scriptName) {
  return cf(`/accounts/${accountId}/workers/scripts/${scriptName}/subdomain`, token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ enabled: true }),
  });
}

export async function getWorkersDevSubdomain(accountId, token) {
  const result = await cf(`/accounts/${accountId}/workers/subdomain`, token);
  return result.subdomain; // e.g. "yourname"
}
