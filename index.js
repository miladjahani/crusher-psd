import "dotenv/config";
import fs from "fs";
import crypto from "crypto";
import TelegramBot from "node-telegram-bot-api";
import {
  verifyToken,
  createKvNamespace,
  uploadWorker,
  enableWorkersDev,
  getWorkersDevSubdomain,
} from "./cf-api.js";

const { BOT_TOKEN } = process.env;
if (!BOT_TOKEN) {
  console.error("Missing BOT_TOKEN in .env");
  process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Worker source that gets deployed into each user's own Cloudflare account.
const WORKER_JS = fs.readFileSync(new URL("./worker-source/worker.js", import.meta.url), "utf8");
const VLESS_JS = fs.readFileSync(new URL("./worker-source/vless.js", import.meta.url), "utf8");

// Ephemeral, in-memory only — never written to disk, never logged.
// { [chatId]: { step: "await_account_id" | "await_token", accountId?: string } }
const sessions = new Map();

function randomSecret(len = 32) {
  return crypto.randomBytes(len).toString("base64url");
}

async function safeDeleteMessage(chatId, messageId) {
  try {
    await bot.deleteMessage(chatId, messageId);
  } catch {
    // Bot might lack delete rights in some chat types — not fatal.
  }
}

const WELCOME = `👋 این ربات یک پروکسی شخصی VLESS روی *اکانت کلودفلر خودت* دیپلوی می‌کنه.

⚠️ نکات امنیتی مهم قبل از شروع:
• توکنی که می‌فرستی هیچ‌جا ذخیره نمی‌شه — فقط لحظه‌ای برای دیپلوی استفاده و بلافاصله پاک می‌شه.
• پیامی که توکن توش هست رو خودم از چت پاک می‌کنم.
• لطفاً یک توکن با دسترسی محدود بساز، نه توکن کامل ادمین:
  Cloudflare Dashboard → My Profile → API Tokens → Create Token → Custom Token
  فقط این دو Permission رو بده:
  - Account → Workers Scripts → Edit
  - Account → Workers KV Storage → Edit

آماده‌ای؟ /deploy رو بزن.`;

bot.onText(/^\/start$/, (msg) => {
  bot.sendMessage(msg.chat.id, WELCOME, { parse_mode: "Markdown" });
});

bot.onText(/^\/deploy$/, (msg) => {
  sessions.set(msg.chat.id, { step: "await_account_id" });
  bot.sendMessage(
    msg.chat.id,
    "مرحله ۱/۲ — Account ID کلودفلرت رو بفرست.\n(از Dashboard → سمت راست صفحه‌ی هر دامنه، یا Workers & Pages → Overview پیدا می‌شه)"
  );
});

bot.onText(/^\/cancel$/, (msg) => {
  sessions.delete(msg.chat.id);
  bot.sendMessage(msg.chat.id, "لغو شد.");
});

bot.on("message", async (msg) => {
  if (!msg.text || msg.text.startsWith("/")) return;
  const session = sessions.get(msg.chat.id);
  if (!session) return;

  if (session.step === "await_account_id") {
    session.accountId = msg.text.trim();
    session.step = "await_token";
    sessions.set(msg.chat.id, session);
    return bot.sendMessage(
      msg.chat.id,
      "مرحله ۲/۲ — حالا API Token رو بفرست (همونی که با دو Permission بالا ساختی).\n" +
        "⚠️ همین که بفرستیش، پیامت رو پاک می‌کنم."
    );
  }

  if (session.step === "await_token") {
    const token = msg.text.trim();
    const accountId = session.accountId;

    // Remove the token from chat history immediately.
    await safeDeleteMessage(msg.chat.id, msg.message_id);
    sessions.delete(msg.chat.id); // done with the session either way

    const statusMsg = await bot.sendMessage(msg.chat.id, "⏳ در حال بررسی توکن...");

    try {
      await verifyToken(token);

      await bot.editMessageText("⏳ ساخت KV namespace...", {
        chat_id: msg.chat.id,
        message_id: statusMsg.message_id,
      });
      const scriptName = `personal-vless-${crypto.randomBytes(3).toString("hex")}`;
      const kvId = await createKvNamespace(accountId, token, `${scriptName}-users`);

      await bot.editMessageText("⏳ در حال دیپلوی Worker...", {
        chat_id: msg.chat.id,
        message_id: statusMsg.message_id,
      });
      const subSecret = randomSecret();
      const bindings = [
        { type: "kv_namespace", name: "USERS_KV", namespace_id: kvId },
        { type: "secret_text", name: "SUB_SECRET", text: subSecret },
        { type: "plain_text", name: "VLESS_PATH", text: "/vless" },
      ];
      await uploadWorker(accountId, token, scriptName, { "worker.js": WORKER_JS, "vless.js": VLESS_JS }, bindings);
      await enableWorkersDev(accountId, token, scriptName);
      const subdomain = await getWorkersDevSubdomain(accountId, token);

      const baseUrl = `https://${scriptName}.${subdomain}.workers.dev`;
      await bot.editMessageText(
        `✅ دیپلوی موفق بود!\n\n` +
          `پنل مدیریت (برای اضافه‌کردن کاربر):\n${baseUrl}/admin/${subSecret}\n\n` +
          `لینک ساب‌اسکریپشن (بعد از اضافه‌کردن کاربر از پنل):\n${baseUrl}/sub/${subSecret}\n\n` +
          `⚠️ این دو لینک رو مثل پسورد نگه دار.`,
        { chat_id: msg.chat.id, message_id: statusMsg.message_id }
      );
    } catch (err) {
      await bot.editMessageText(`❌ دیپلوی شکست خورد:\n${err.message}`, {
        chat_id: msg.chat.id,
        message_id: statusMsg.message_id,
      });
    }
    // token, accountId (local vars) fall out of scope here and are garbage-collected.
    // Nothing about them was ever written to disk or to a database.
  }
});

console.log("Deploy bot running (self-service, no token storage).");
