// ===================== IMPORTS =====================
const express = require("express");
const session = require("express-session");
const bodyParser = require("body-parser");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const bcrypt = require("bcrypt");
const fetch = require("node-fetch");

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

// ===================== SESSION CONFIG =====================
app.use(session({
  secret: "tinubu2026secret",
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// ===================== FILE PATHS =====================
const USERS_FILE = "./data/users.json";
const WALLETS_FILE = "./data/wallets.json";
const ORDERS_FILE = "./data/orders.json";

// ===================== HELPERS =====================
const read = (file) => JSON.parse(fs.readFileSync(file, "utf-8"));
const write = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));

// ===================== REGISTRATION =====================
app.post("/register", async (req, res) => {
  let { email, password } = req.body;
  email = email.trim().toLowerCase();
  password = password.trim();

  const users = read(USERS_FILE);

  if (users.find(u => u.email === email)) return res.send("User already exists");

  const hash = await bcrypt.hash(password, 10);
  const id = uuidv4();

  users.push({ id, email, password: hash });
  write(USERS_FILE, users);

  // Initialize wallet
  const wallets = read(WALLETS_FILE);
  wallets.push({ userId: id, balance: 0 });
  write(WALLETS_FILE, wallets);

  res.redirect("/login.html");
});

// ===================== LOGIN =====================
app.post("/login", async (req, res) => {
  let { email, password } = req.body;
  email = email.trim().toLowerCase();
  password = password.trim();

  const users = read(USERS_FILE);
  const user = users.find(u => u.email === email);

  if (!user || !(await bcrypt.compare(password, user.password))) return res.send("Invalid login");

  req.session.user = user;
  res.redirect("/dashboard.html");
});

// ===================== DASHBOARD =====================
app.get("/dashboard", (req, res) => {
  if (!req.session.user) return res.redirect("/login.html");
  res.sendFile(__dirname + "/public/dashboard.html");
});

// ===================== ADMIN PANEL =====================
app.get("/admin", (req, res) => {
  const { key } = req.query;
  if (key !== "Tinubu2026") return res.send("Unauthorized");
  res.sendFile(__dirname + "/public/admin.html");
});

// ===================== ORDER HANDLER =====================
app.post("/order", async (req, res) => {
  if (!req.session.user) return res.send("Please login first");

  const { type, amount } = req.body;
  const userEmail = req.session.user.email;

  const orders = read(ORDERS_FILE);
  const orderId = uuidv4();
  orders.push({ orderId, type, amount, userEmail, status: "pending" });
  write(ORDERS_FILE, orders);

  // Telegram notification
  const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN;
  const TG_CHAT_ID = process.env.TG_CHAT_ID;
  const msg = `New order: ${type} - ${amount} from ${userEmail}`;
  fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage?chat_id=${TG_CHAT_ID}&text=${encodeURIComponent(msg)}`);

  res.send("Order received! Check Telegram for notification.");
});

// ===================== LOGOUT =====================
app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/login.html");
});

// ===================== START SERVER =====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("CoinZap NG running on port", PORT);
});
