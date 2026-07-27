const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

// ========== CONFIG ==========
const TOKEN = '8998241897:AAFW3SfahRTcpe77BWs5AZQomIlNcCiBHKQ';
const ADMIN_IDS = []; // Add your Telegram user ID here later
const DATA_FILE = path.join(__dirname, 'users.json');

// ========== DATA ==========
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

// ========== BOT ==========
const bot = new TelegramBot(TOKEN, { polling: true });
const app = express();
app.use(cors());
app.use(express.json());

// Helper: check if admin
function isAdmin(msg) {
  // For now allow everyone who knows the commands. Later lock to ADMIN_IDS
  return true;
}

// /start
bot.onText(/\/start(.*)/, (msg, match) => {
  const chatId = msg.chat.id;
  const param = (match[1] || '').trim();
  const name = msg.from.first_name || 'לקוח';
  const userId = msg.from.id;
  const username = msg.from.username ? '@' + msg.from.username : 'אין';

  if (param.startsWith('pay_')) {
    const pkg = param.replace('pay_', '');
    const pkgName = pkg === '150' ? '150₪ (3 חודשים - הכל)' : '75₪ (חודשי - בסיסית)';

    // Notify admin (for now send to the same chat if testing, later to admin)
    const text = `🔔 *בקשת רכישה חדשה*\n\n` +
      `שם: ${name}\n` +
      `יוזר: ${username}\n` +
      `מזהה: \`${userId}\`\n` +
      `חבילה: ${pkgName}\n\n` +
      `לאשר:\n\`/approve ${userId} ${pkg}\``;

    bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
    bot.sendMessage(chatId, `הבקשה שלך לחבילה ${pkgName} התקבלה.\nהמנהל יאשר אותך בקרוב.`);
  } else {
    bot.sendMessage(chatId, `שלום ${name} 👋\n\nלחץ על הכפתור למטה כדי לפתוח את עמוד פעיל.`, {
      reply_markup: {
        inline_keyboard: [[
          { text: '🔥 פתח עמוד פעיל', web_app: { url: 'https://chipper-mochi-532256.netlify.app' } }
        ]]
      }
    });
  }
});

// /approve <user_id> <package> [days]
bot.onText(/\/approve (.+)/, (msg, match) => {
  if (!isAdmin(msg)) return;

  const parts = match[1].trim().split(/\s+/);
  const userId = parts[0];
  const pkg = parts[1] || '75';
  const days = parseInt(parts[2]) || (pkg === '150' ? 90 : 30);

  const expires = new Date();
  expires.setDate(expires.getDate() + days);

  users[userId] = {
    package: pkg,
    expiresAt: expires.toISOString().split('T')[0],
    days: days,
    addedAt: new Date().toISOString()
  };
  saveUsers(users);

  bot.sendMessage(msg.chat.id, `✅ אושר!\nמזהה: ${userId}\nחבילה: ${pkg}\nעד: ${users[userId].expiresAt}`);
  
  // Try notify the user
  bot.sendMessage(userId, `✅ המנוי שלך אושר!\nחבילה: ${pkg === '150' ? 'מלאה' : 'בסיסית'}\nבתוקף עד: ${users[userId].expiresAt}\n\nפתח שוב את עמוד פעיל.`).catch(() => {});
});

// /add <user_id> <package> <YYYY-MM-DD>
bot.onText(/\/add (.+)/, (msg, match) => {
  if (!isAdmin(msg)) return;

  const parts = match[1].trim().split(/\s+/);
  const userId = parts[0];
  const pkg = parts[1] || '75';
  const expiresAt = parts[2] || null;

  users[userId] = {
    package: pkg,
    expiresAt: expiresAt,
    addedAt: new Date().toISOString()
  };
  saveUsers(users);

  bot.sendMessage(msg.chat.id, `✅ נוסף!\nמזהה: ${userId}\nחבילה: ${pkg}\nעד: ${expiresAt || 'לא צוין'}`);
});

// /check <user_id>
bot.onText(/\/check (.+)/, (msg, match) => {
  const userId = match[1].trim();
  const u = users[userId];
  if (!u) {
    bot.sendMessage(msg.chat.id, `❌ ${userId} לא רשום`);
  } else {
    bot.sendMessage(msg.chat.id, `✅ רשום\nחבילה: ${u.package}\nעד: ${u.expiresAt || 'לא ידוע'}`);
  }
});

// /list
bot.onText(/\/list/, (msg) => {
  if (!isAdmin(msg)) return;
  const count = Object.keys(users).length;
  bot.sendMessage(msg.chat.id, `סה"כ רשומים: ${count}`);
});

// API for Mini App to check user status
app.get('/api/user/:id', (req, res) => {
  const id = req.params.id;
  const u = users[id];
  if (!u) {
    return res.json({ isRegistered: false });
  }
  const now = new Date();
  const exp = u.expiresAt ? new Date(u.expiresAt) : null;
  const isActive = !exp || exp >= now;

  res.json({
    isRegistered: isActive,
    package: u.package,
    expiresAt: u.expiresAt,
    daysLeft: exp ? Math.max(0, Math.ceil((exp - now) / (1000*60*60*24))) : null
  });
});

app.get('/', (req, res) => res.send('Amud Pail Bot is running'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Server + Bot running on port', PORT);
});

console.log('Bot started...');
