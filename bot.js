const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const TOKEN = '8998241897:AAFW3SfahRTcpe77BWs5AZQomIlNcCiBHKQ';
const DATA_FILE = path.join(__dirname, 'users.json');

let ADMIN_CHAT_ID = null;

function loadUsers() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (e) {}
  return {};
}

function saveUsers(users) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2));
}

let users = loadUsers();

const bot = new TelegramBot(TOKEN, { polling: true });
const app = express();
app.use(cors());
app.use(express.json());

// Prices in Stars
const PRICES = {
  '75': { stars: 1000, title: 'חבילה בסיסית', days: 30 },
  '150': { stars: 2000, title: 'חבילה מלאה', days: 90 }
};

// ========== /start ==========
bot.onText(/\/start(.*)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const param = (match[1] || '').trim();
  const name = msg.from.first_name || 'לקוח';
  const userId = msg.from.id;

  if (!ADMIN_CHAT_ID) ADMIN_CHAT_ID = chatId;

  if (param.startsWith('pay_')) {
    const pkg = param.replace('pay_', '');
    await sendStarsInvoice(chatId, pkg, name);
  } else {
    bot.sendMessage(chatId, `שלום ${name} 👋\n\nלחץ על הכפתור כדי לפתוח את עמוד פעיל.`, {
      reply_markup: {
        inline_keyboard: [[
          { text: '🔥 פתח עמוד פעיל', web_app: { url: 'https://dynamic-piroshki-1cd0f6.netlify.app' } }
        ]]
      }
    });
  }
});

// Send Stars Invoice
async function sendStarsInvoice(chatId, pkg, name) {
  const info = PRICES[pkg] || PRICES['75'];

  try {
    await bot.sendInvoice(chatId, {
      title: info.title,
      description: pkg === '150' 
        ? 'גישה מלאה לכל 4 העמודים למשך 3 חודשים'
        : 'עמוד פעיל + סרטוני עבר למשך חודש',
      payload: `pkg_${pkg}_${chatId}`,
      provider_token: '', // empty for Stars
      currency: 'XTR',
      prices: [{ label: info.title, amount: info.stars }],
      start_parameter: `pay_${pkg}`
    });
  } catch (e) {
    console.log('Invoice error:', e.message);
    bot.sendMessage(chatId, 'שגיאה ביצירת החשבונית. נסה שוב או פנה למנהל.');
  }
}

// Handle data from Mini App
bot.on('message', async (msg) => {
  if (msg.web_app_data) {
    try {
      const data = JSON.parse(msg.web_app_data.data);
      if (data.action === 'buy_stars') {
        const pkg = data.package || '75';
        const name = msg.from.first_name || 'לקוח';
        await sendStarsInvoice(msg.chat.id, pkg, name);
      }
    } catch (e) {
      console.log('web_app_data error', e);
    }
  }
});

// When user is about to pay
bot.on('pre_checkout_query', (query) => {
  bot.answerPreCheckoutQuery(query.id, true);
});

// Successful payment
bot.on('successful_payment', (msg) => {
  const payment = msg.successful_payment;
  const userId = msg.from.id;
  const name = msg.from.first_name || 'לקוח';
  const payload = payment.invoice_payload || '';
  const pkg = payload.includes('150') ? '150' : '75';
  const info = PRICES[pkg];

  const expires = new Date();
  expires.setDate(expires.getDate() + info.days);
  const expiresAt = expires.toISOString().split('T')[0];

  users[userId] = {
    package: pkg,
    expiresAt: expiresAt,
    days: info.days,
    addedAt: new Date().toISOString(),
    paidWith: 'stars',
    stars: info.stars
  };
  saveUsers(users);

  bot.sendMessage(msg.chat.id, 
    `✅ התשלום התקבל!\n\nחבילה: ${info.title}\nבתוקף עד: ${expiresAt}\n\nפתח שוב את עמוד פעיל כדי לראות את התוכן.`
  );

  // Notify admin
  if (ADMIN_CHAT_ID) {
    bot.sendMessage(ADMIN_CHAT_ID, 
      `💰 *תשלום כוכבים חדש*\n\nשם: ${name}\nמזהה: \`${userId}\`\nחבילה: ${info.title}\nכוכבים: ${info.stars}\nעד: ${expiresAt}`,
      { parse_mode: 'Markdown' }
    );
  }
});

// Manual approve (still available)
bot.onText(/\/approve (.+)/, (msg, match) => {
  const parts = match[1].trim().split(/\s+/);
  const userId = parts[0];
  const pkg = parts[1] || '75';
  const days = parseInt(parts[2]) || (pkg === '150' ? 90 : 30);

  const expires = new Date();
  expires.setDate(expires.getDate() + days);
  const expiresAt = expires.toISOString().split('T')[0];

  users[userId] = {
    package: pkg,
    expiresAt: expiresAt,
    days: days,
    addedAt: new Date().toISOString()
  };
  saveUsers(users);

  bot.sendMessage(msg.chat.id, `✅ אושר!\nמזהה: ${userId}\nחבילה: ${pkg}\nעד: ${expiresAt}`);
  bot.sendMessage(userId, `✅ המנוי שלך אושר!\nבתוקף עד: ${expiresAt}`).catch(() => {});
});

bot.onText(/\/add (.+)/, (msg, match) => {
  const parts = match[1].trim().split(/\s+/);
  const userId = parts[0];
  const pkg = parts[1] || '75';
  const expiresAt = parts[2] || null;

  users[userId] = { package: pkg, expiresAt, addedAt: new Date().toISOString() };
  saveUsers(users);
  bot.sendMessage(msg.chat.id, `✅ נוסף!\nמזהה: ${userId}\nחבילה: ${pkg}\nעד: ${expiresAt || 'לא צוין'}`);
});

bot.onText(/\/check (.+)/, (msg, match) => {
  const userId = match[1].trim();
  const u = users[userId];
  if (!u) bot.sendMessage(msg.chat.id, `❌ לא רשום`);
  else bot.sendMessage(msg.chat.id, `✅ רשום\nחבילה: ${u.package}\nעד: ${u.expiresAt || 'לא ידוע'}`);
});

bot.onText(/\/list/, (msg) => {
  bot.sendMessage(msg.chat.id, `סה"כ רשומים: ${Object.keys(users).length}`);
});

// API
app.get('/api/user/:id', (req, res) => {
  const u = users[req.params.id];
  if (!u) return res.json({ isRegistered: false });
  const now = new Date();
  const exp = u.expiresAt ? new Date(u.expiresAt) : null;
  res.json({
    isRegistered: !exp || exp >= now,
    package: u.package,
    expiresAt: u.expiresAt,
    daysLeft: exp ? Math.max(0, Math.ceil((exp - now) / 86400000)) : null
  });
});

app.get('/', (req, res) => res.send('Amud Pail Bot running'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Bot on port', PORT));
console.log('Bot started with Stars support');
