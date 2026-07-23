import { handleVlessWebSocket, buildVlessLink } from "./vless.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 1. Real VLESS traffic: client connects here over WebSocket.
    if (request.headers.get("Upgrade") === "websocket" && url.pathname === (env.VLESS_PATH || "/vless")) {
      const allowedUUIDs = await getAllowedUUIDs(env);
      if (allowedUUIDs.size === 0) {
        return new Response("No users configured", { status: 403 });
      }
      return handleVlessWebSocket(request, allowedUUIDs);
    }

    // 2. Subscription link(s) for V2rayNG: /sub/<SUB_SECRET>
    const subMatch = url.pathname.match(/^\/sub\/([^/]+)$/);
    if (subMatch) {
      if (subMatch[1] !== env.SUB_SECRET) return new Response("Not found", { status: 404 });
      return handleSubscription(request, env);
    }

    // 3. Admin panel: /admin/<SUB_SECRET>
    if (url.pathname === `/admin/${env.SUB_SECRET}`) {
      return new Response(adminHtml(), { headers: { "content-type": "text/html; charset=utf-8" } });
    }

    // 4. Admin API used by the panel (and optionally your Telegram bot)
    if (url.pathname === `/api/users/${env.SUB_SECRET}`) {
      return handleUsersApi(request, env);
    }

    return new Response("OK", { status: 200 });
  },
};

// ---------- KV-backed user list ----------

async function getUsers(env) {
  const raw = await env.USERS_KV.get("users");
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveUsers(env, users) {
  await env.USERS_KV.put("users", JSON.stringify(users));
}

async function getAllowedUUIDs(env) {
  const users = await getUsers(env);
  return new Set(users.map((u) => u.uuid));
}

function randomUUID() {
  return crypto.randomUUID();
}

// ---------- Subscription ----------

function workerHost(request, env) {
  return env.PUBLIC_HOST || new URL(request.url).hostname;
}

async function handleSubscription(request, env) {
  const users = await getUsers(env);
  if (users.length === 0) {
    return new Response("No users yet. Add one from the admin panel.", { status: 404 });
  }
  const host = workerHost(request, env);
  const path = env.VLESS_PATH || "/vless";

  const links = users
    .map((u) => buildVlessLink({ uuid: u.uuid, host, port: 443, path, remark: u.name || "Personal-VLESS" }))
    .join("\n");

  const body = btoa(unescape(encodeURIComponent(links + "\n")));
  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "profile-update-interval": "6",
      "cache-control": "no-store",
    },
  });
}

// ---------- Admin API: GET list / POST add / DELETE remove ----------

async function handleUsersApi(request, env) {
  if (request.method === "GET") {
    const users = await getUsers(env);
    return json({ ok: true, users });
  }

  if (request.method === "POST") {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: "invalid json" }, 400);
    }
    const name = (body.name || "user").toString().slice(0, 60);
    const uuid = randomUUID();
    const users = await getUsers(env);
    users.push({ uuid, name, addedAt: new Date().toISOString() });
    await saveUsers(env, users);
    return json({ ok: true, user: { uuid, name } });
  }

  if (request.method === "DELETE") {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: "invalid json" }, 400);
    }
    if (!body.uuid) return json({ ok: false, error: "uuid required" }, 400);
    const users = await getUsers(env);
    const filtered = users.filter((u) => u.uuid !== body.uuid);
    await saveUsers(env, filtered);
    return json({ ok: true, users: filtered });
  }

  return json({ ok: false, error: "method not allowed" }, 405);
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
}

// ---------- Admin web panel ----------

function adminHtml() {
  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>پنل مدیریت VLESS</title>
<style>
  :root { --bg:#0f1115; --card:#171a21; --border:#262b36; --text:#e6e8ee; --muted:#8b93a3; --accent:#4f8cff; --danger:#ef4444; --ok:#22c55e; }
  * { box-sizing:border-box; }
  body { margin:0; font-family:-apple-system,"Segoe UI",Tahoma,sans-serif; background:var(--bg); color:var(--text); padding:24px; }
  .wrap { max-width:640px; margin:0 auto; }
  h1 { font-size:20px; margin-bottom:4px; }
  .sub { color:var(--muted); font-size:13px; margin-bottom:24px; }
  .card { background:var(--card); border:1px solid var(--border); border-radius:14px; padding:18px; margin-bottom:16px; }
  .row { display:flex; gap:8px; flex-wrap:wrap; }
  input { flex:1; min-width:120px; background:#10131a; border:1px solid var(--border); color:var(--text); padding:10px 12px; border-radius:10px; font-size:14px; }
  button { background:var(--accent); color:white; border:none; padding:10px 16px; border-radius:10px; font-size:14px; cursor:pointer; }
  button.danger { background:var(--danger); }
  .item { display:flex; justify-content:space-between; align-items:center; padding:10px 12px; border:1px solid var(--border); border-radius:10px; margin-bottom:8px; font-size:13px; }
  .item .meta { color:var(--muted); font-size:11px; word-break:break-all; }
  .linkbox { word-break:break-all; background:#10131a; border:1px solid var(--border); padding:10px 12px; border-radius:10px; font-size:12px; color:var(--ok); margin-top:10px; }
  .empty { color:var(--muted); font-size:13px; padding:8px 0; }
</style>
</head>
<body>
<div class="wrap">
  <h1>پنل مدیریت VLESS</h1>
  <div class="sub">مدیریت کاربران (هرکدوم یک UUID جدا)</div>

  <div class="card">
    <div class="row">
      <input id="name" placeholder="اسم کاربر (مثلاً: خودم، دوستم...)">
      <button onclick="addUser()">➕ افزودن کاربر جدید</button>
    </div>
    <div class="linkbox" id="subLink"></div>
  </div>

  <div class="card">
    <strong>کاربران فعلی</strong>
    <div id="list" style="margin-top:10px"><div class="empty">در حال بارگذاری...</div></div>
  </div>
</div>

<script>
const SECRET = location.pathname.split('/').pop();
const base = location.origin;
document.getElementById('subLink').textContent = 'لینک ساب (همه‌ی کاربران): ' + base + '/sub/' + SECRET;

async function load() {
  const res = await fetch(base + '/api/users/' + SECRET);
  const data = await res.json();
  const el = document.getElementById('list');
  if (!data.users.length) { el.innerHTML = '<div class="empty">هنوز کاربری اضافه نشده.</div>'; return; }
  el.innerHTML = data.users.map(u => \`
    <div class="item">
      <div>
        <div>\${u.name}</div>
        <div class="meta">\${u.uuid}</div>
      </div>
      <button class="danger" onclick="removeUser('\${u.uuid}')">حذف</button>
    </div>
  \`).join('');
}

async function addUser() {
  const name = document.getElementById('name').value.trim() || 'user';
  await fetch(base + '/api/users/' + SECRET, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name })
  });
  document.getElementById('name').value = '';
  load();
}

async function removeUser(uuid) {
  await fetch(base + '/api/users/' + SECRET, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ uuid })
  });
  load();
}

load();
</script>
</body>
</html>`;
}
