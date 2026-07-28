const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const TOKEN = '8998241897:AAFW3SfahRTcpe77BWs5AZQomIlNcCiBHKQ';
const DATA_FILE = path.join(__dirname, 'users.json');

// Put your personal Telegram user ID here later to receive notifications
// You can get it from @userinfobot
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

// ========== Handle /start ==========
bot.onText(/\/start(.*)/, (msg, match) => {
  const chatId = msg.chat.id;
  const param = (match[1] || '').trim();
  const name = msg.from.first_name || 'לקוח';
  const userId = msg.from.id;
  const username = msg.from.username ? '@' + msg.from.username : 'אין';

  // Save admin chat id on first interaction with the owner
  if (!ADMIN_CHAT_ID) {
    ADMIN_CHAT_ID = chatId;
  }

  if (param.startsWith('pay_')) {
    const pkg = param.replace('pay_', '');
    const pkgName = pkg === '150' ? '150₪ (מלאה)' : '75₪ (בסיסית)';

    bot.sendMessage(chatId, `קיבלתי את הבקשה שלך לחבילה ${pkgName}.\nהמנהל יאשר אותך בקרוב.`);

    // Notify admin
    const notify = `🔔 *בקשת רכישה*\n\nשם: ${name}\nיוזר: ${username}\nמזהה: \`${userId}\`\nחבילה: ${pkgName}\n\nלאשר:\n\`/approve ${userId} ${pkg}\``;
    if (ADMIN_CHAT_ID) {
      bot.sendMessage(ADMIN_CHAT_ID, notify, { parse_mode: 'Markdown' });
    }
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

// ========== Handle web_app_data (from Mini App sendData) ==========
bot.on('message', (msg) => {
  if (msg.web_app_data) {
    try {
      const data = JSON.parse(msg.web_app_data.data);
      const name = msg.from.first_name || 'לקוח';
      const userId = msg.from.id;
      const username = msg.from.username ? '@' + msg.from.username : 'אין';
      const pkg = data.package || '75';
      const pkgName = pkg === '150' ? '150₪ (מלאה)' : '75₪ (בסיסית)';

      bot.sendMessage(msg.chat.id, `✅ קיבלתי את ההודעה שלך.\nהמנהל יאשר את החבילה בקרוב.`);

      const notify = `🔔 *לקוח לחץ "שילמתי"*\n\nשם: ${name}\nיוזר: ${username}\nמזהה: \`${userId}\`\nחבילה: ${pkgName}\n\nלאשר:\n\`/approve ${userId} ${pkg}\``;

      // Send to the same chat for now (later we lock to real admin)
      bot.sendMessage(msg.chat.id, notify, { parse_mode: 'Markdown' });

      if (ADMIN_CHAT_ID && ADMIN_CHAT_ID !== msg.chat.id) {
        bot.sendMessage(ADMIN_CHAT_ID, notify, { parse_mode: 'Markdown' });
      }
    } catch (e) {
      console.log('web_app_data error', e);
    }
  }
});

// ========== /approve ==========
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

  bot.sendMessage(msg.chat.id, `✅ אושר בהצלחה!\nמזהה: ${userId}\nחבילה: ${pkg}\nעד: ${expiresAt}`);

  // Notify the user
  bot.sendMessage(userId, `✅ המנוי שלך אושר!\nחבילה: ${pkg === '150' ? 'מלאה' : 'בסיסית'}\nבתוקף עד: ${expiresAt}\n\nפתח שוב את עמוד פעיל.`).catch(() => {});
});

// ========== /add ==========
bot.onText(/\/add (.+)/, (msg, match) => {
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

// ========== /check ==========
bot.onText(/\/check (.+)/, (msg, match) => {
  const userId = match[1].trim();
  const u = users[userId];
  if (!u) {
    bot.sendMessage(msg.chat.id, `❌ ${userId} לא רשום`);
  } else {
    bot.sendMessage(msg.chat.id, `✅ רשום\nחבילה: ${u.package}\nעד: ${u.expiresAt || 'לא ידוע'}`);
  }
});

// ========== /list ==========
bot.onText(/\/list/, (msg) => {
  const count = Object.keys(users).length;
  bot.sendMessage(msg.chat.id, `סה"כ רשומים במערכת: ${count}`);
});

// API for Mini App
app.get('/api/user/:id', (req, res) => {
  const id = req.params.id;
  const u = users[id];
  if (!u) return res.json({ isRegistered: false });

  const now = new Date();
  const exp = u.expiresAt ? new Date(u.expiresAt) : null;
  const isActive = !exp || exp >= now;

  res.json({
    isRegistered: isActive,
    package: u.package,
    expiresAt: u.expiresAt,
    daysLeft: exp ? Math.max(0, Math.ceil((exp - now) / (1000 * 60 * 60 * 24))) : null
  });
});

app.get('/', (req, res) => res.send('Amud Pail Bot is running'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Bot running on port', PORT));
console.log('Bot started...');
