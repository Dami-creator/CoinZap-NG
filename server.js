const express = require("express");
const bodyParser = require("body-parser");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const axios = require("axios");
const fs = require("fs-extra");
const { v4: uuidv4 } = require("uuid");

const app = express();
const PORT = process.env.PORT || 3000;

/* ===================== CONFIG ===================== */
const ADMIN_KEY = "Tinubu2026"; // your admin password
const TELEGRAM_HELP = "https://t.me/TyburnUK"; // Help link

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(
  session({
    secret: "coinzap_secret",
    resave: false,
    saveUninitialized: false
  })
);

app.use(express.static("public"));

/* ===================== FILE PATHS ===================== */
const USERS_FILE = "./data/users.json";
const WALLETS_FILE = "./data/wallets.json";
const ORDERS_FILE = "./data/orders.json";

/* ===================== HELPERS ===================== */
function read(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readJsonSync(file);
}

function write(file, data) {
  fs.writeJsonSync(file, data, { spaces: 2 });
}

async function sendTelegram(msg) {
  if (!process.env.TG_BOT_TOKEN || !process.env.TG_CHAT_ID) return;
  await axios.post(
    `https://api.telegram.org/bot${process.env.TG_BOT_TOKEN}/sendMessage`,
    { chat_id: process.env.TG_CHAT_ID, text: msg }
  );
}

function auth(req, res, next) {
  if (!req.session.user) return res.redirect("/login.html");
  next();
}

/* ===================== AUTH ===================== */
app.post("/register", async (req, res) => {
  const { email, password } = req.body;
  const users = read(USERS_FILE);

  if (users.find(u => u.email === email))
    return res.send("User already exists");

  const hash = await bcrypt.hash(password, 10);
  const id = uuidv4();

  users.push({ id, email, password: hash });
  write(USERS_FILE, users);

  const wallets = read(WALLETS_FILE);
  wallets.push({ userId: id, balance: 0 });
  write(WALLETS_FILE, wallets);

  res.redirect("/login.html");
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const users = read(USERS_FILE);
  const user = users.find(u => u.email === email);

  if (!user || !(await bcrypt.compare(password, user.password)))
    return res.send("Invalid login");

  req.session.user = user;
  res.redirect("/dashboard.html");
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login.html"));
});

/* ===================== WALLET ===================== */
app.get("/wallet", auth, (req, res) => {
  const wallets = read(WALLETS_FILE);
  const wallet = wallets.find(w => w.userId === req.session.user.id);
  res.json(wallet);
});

app.post("/fund-wallet", auth, async (req, res) => {
  const amount = Number(req.body.amount);
  const ref = uuidv4();

  await axios.post(
    "https://api.paystack.co/transaction/initialize",
    {
      email: req.session.user.email,
      amount: amount * 100,
      reference: ref,
      callback_url: `${process.env.BASE_URL}/verify-wallet?ref=${ref}`
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET}`
      }
    }
  ).then(r => res.redirect(r.data.data.authorization_url));
});

app.get("/verify-wallet", async (req, res) => {
  const ref = req.query.ref;

  const v = await axios.get(
    `https://api.paystack.co/transaction/verify/${ref}`,
    { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET}` } }
  );

  if (v.data.data.status === "success") {
    const wallets = read(WALLETS_FILE);
    const wallet = wallets.find(w => w.userId === req.session.user.id);
    wallet.balance += v.data.data.amount / 100;
    write(WALLETS_FILE, wallets);

    await sendTelegram(
      `💰 Wallet funded\nUser: ${req.session.user.email}\n₦${v.data.data.amount / 100}`
    );
  }

  res.redirect("/dashboard.html");
});

/* ===================== ORDERS ===================== */
app.post("/order", auth, async (req, res) => {
  const { service, detail, amount } = req.body;
  const wallets = read(WALLETS_FILE);
  const wallet = wallets.find(w => w.userId === req.session.user.id);

  if (wallet.balance < amount)
    return res.send("Insufficient balance");

  wallet.balance -= Number(amount);
  write(WALLETS_FILE, wallets);

  const orders = read(ORDERS_FILE);
  const order = {
    id: uuidv4(),
    user: req.session.user.email,
    service,
    detail,
    amount,
    status: "PAID"
  };
  orders.push(order);
  write(ORDERS_FILE, orders);

  await sendTelegram(
    `🟢 New Order\n${service}\n${detail}\n₦${amount}\nUser: ${order.user}`
  );

  res.redirect("/dashboard.html");
});

/* ===================== ADMIN ===================== */
app.get("/admin", (req, res) => {
  if (req.query.key !== ADMIN_KEY) return res.send("Unauthorized");

  const orders = read(ORDERS_FILE);
  res.json(orders);
});

app.post("/admin/mark", (req, res) => {
  if (req.query.key !== ADMIN_KEY) return res.send("Unauthorized");

  const orders = read(ORDERS_FILE);
  const order = orders.find(o => o.id === req.body.id);
  if (order) order.status = "SENT";
  write(ORDERS_FILE, orders);

  res.send("OK");
});

/* ===================== START ===================== */
app.listen(PORT, () => {
  console.log("CoinZap NG running");
});
