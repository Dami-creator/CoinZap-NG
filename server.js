const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const fetch = require("node-fetch");
const { v4: uuidv4 } = require("uuid");
const path = require("path");

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

const ORDERS_FILE = "./data/orders.json";
const read = (f) => JSON.parse(fs.readFileSync(f, "utf-8"));
const write = (f, d) => fs.writeFileSync(f, JSON.stringify(d, null, 2));

// Homepage
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public/index.html")));

// Order submission
app.post("/order", async (req, res) => {
  const { type, amount, customerName, customerPhone } = req.body;
  const orderId = uuidv4();

  const orders = read(ORDERS_FILE);
  orders.push({ orderId, type, amount, customerName, customerPhone, status: "pending" });
  write(ORDERS_FILE, orders);

  // Telegram notification
  try {
    const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN;
    const TG_CHAT_ID = process.env.TG_CHAT_ID;
    const msg = `📦 New order!\nType: ${type}\nAmount: ${amount}\nCustomer: ${customerName} (${customerPhone})\nOrder ID: ${orderId}`;
    await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage?chat_id=${TG_CHAT_ID}&text=${encodeURIComponent(msg)}`);
  } catch (err) {
    console.log("Telegram notification failed:", err);
  }

  res.redirect("/success.html");
});

// Admin panel
app.get("/admin", (req, res) => {
  const { key } = req.query;
  if (key !== process.env.ADMIN_KEY) return res.send("Unauthorized");
  res.sendFile(path.join(__dirname, "public/admin.html"));
});

// Admin API for orders
app.get("/api/orders", (req, res) => {
  const { key } = req.query;
  if (key !== process.env.ADMIN_KEY) return res.status(403).json({ error: "Unauthorized" });
  res.json(read(ORDERS_FILE));
});

app.listen(process.env.PORT || 3000, () => console.log("CoinZap NG running"));
