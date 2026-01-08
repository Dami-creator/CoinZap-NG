require("dotenv").config();
const express = require("express");
const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ================= FRONTEND ================= */
app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>CoinZap NG</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<script src="https://js.paystack.co/v1/inline.js"></script>
<style>
body { margin:0;font-family:Segoe UI,sans-serif; background:linear-gradient(135deg,#0f2027,#203a43,#2c5364); color:#fff;}
.container {max-width:420px;margin:40px auto;background:#0d1117;padding:25px;border-radius:18px;box-shadow:0 15px 35px rgba(0,0,0,.6);}
h1{text-align:center;margin-bottom:5px;}
p{text-align:center;opacity:.85;}
select,input,button{width:100%;padding:14px;margin-top:12px;border-radius:10px;border:none;outline:none;font-size:15px;}
select,input{background:#161b22;color:#fff;}
button{background:linear-gradient(90deg,#00e0ff,#00ffa2);color:#000;font-weight:bold;cursor:pointer;margin-top:18px;}
button:hover{opacity:.9;}
#success{margin-top:18px;text-align:center;font-weight:bold;color:#00ffa2;}
.footer{text-align:center;margin-top:15px;font-size:12px;opacity:.6;}
</style>
</head>
<body>
<div class="container">
<h1>⚡ CoinZap NG</h1>
<p>TikTok Coins • Airtime • Data Bundles</p>

<select id="service" onchange="updatePlaceholders()">
<option value="">Select Service</option>
<option value="tiktok">TikTok Coins</option>
<option value="airtime">Airtime</option>
<option value="data">Data Bundle</option>
</select>

<input id="field1" placeholder="Username / Phone Number">
<input id="field2" placeholder="Coins / Network / Data Plan">
<input id="amount" type="number" placeholder="Amount (₦)">

<button onclick="pay()">Pay Now</button>
<div id="success"></div>
<div class="footer">Secure payments powered by Paystack</div>
</div>

<script>
function updatePlaceholders(){
  const service=document.getElementById("service").value;
  const f1=document.getElementById("field1");
  const f2=document.getElementById("field2");
  if(service==="tiktok"){f1.placeholder="TikTok Username";f2.placeholder="Coin Package (e.g. 700 Coins)";}
  else if(service==="airtime"){f1.placeholder="Phone Number";f2.placeholder="Network (MTN, Airtel, Glo)";}
  else if(service==="data"){f1.placeholder="Phone Number";f2.placeholder="Data Plan (e.g. 5GB)";}
}

function pay(){
  const service=document.getElementById("service").value;
  const f1=document.getElementById("field1").value;
  const f2=document.getElementById("field2").value;
  const amount=document.getElementById("amount").value;
  if(!service||!f1||!f2||!amount){alert("Please fill all fields");return;}
  const handler=PaystackPop.setup({
    key:"pk_test_6bdf1c2ad7c596a35b09e1024394bce7a4ff210a",
    email:"customer@coinzap.ng",
    amount:amount*100,
    ref:"CZ_"+Math.floor(Math.random()*1000000000),
    callback:function(response){
      const order=\`
Service: \${service}
Detail1: \${f1}
Detail2: \${f2}
Amount: ₦\${amount}
Reference: \${response.reference}
Status: PAID
\`;
      fetch("/verify-payment",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({reference:response.reference,service,f1,f2,amount,order})});
      document.getElementById("success").innerText=service==="airtime"?"Airtime purchased successfully ✅":service==="data"?"Data bundle purchased successfully ✅":"TikTok Coins purchased successfully ✅";
    }
  });
  handler.openIframe();
}
</script>
</body>
</html>
`);
});

/* ================= BACKEND: Payment Verification + Telegram ================= */
app.post("/verify-payment", async (req, res) => {
  const { reference, order, service, f1, f2, amount } = req.body;
  try {
    const verify = await axios.get(`https://api.paystack.co/transaction/verify/${reference}`,{
      headers:{Authorization:`Bearer ${process.env.PAYSTACK_SECRET_KEY}`}
    });
    if(verify.data.data.status==="success"){
      // Send Telegram
      await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,{
        chat_id:process.env.TELEGRAM_CHAT_ID,
        text:`🛒 CoinZap NG Order\n\n${order}`
      });
      // Save to orders.json
      const ordersPath=path.join(__dirname,"orders.json");
      let orders=await fs.readJson(ordersPath).catch(()=>[]);
      orders.push({reference,service,f1,f2,amount,status:"PAID"});
      await fs.writeJson(ordersPath,orders,{spaces:2});
      return res.json({success:true});
    }
    res.json({success:false});
  }catch(err){res.status(500).json({error:"Verification failed"});}
});

/* ================= ADMIN PANEL ================= */
app.get("/admin",(req,res)=>{
  const password=req.query.password||"";
  if(password!==process.env.ADMIN_PASSWORD)return res.send("Invalid password");
  const ordersPath=path.join(__dirname,"orders.json");
  const orders=fs.readJsonSync(ordersPath);
  let rows="";
  orders.forEach((o,i)=>{
    rows+=`<tr>
    <td>${o.reference}</td>
    <td>${o.service}</td>
    <td>${o.f1}</td>
    <td>${o.f2}</td>
    <td>₦${o.amount}</td>
    <td id="status-${i}">${o.status}</td>
    <td><button onclick="markSent(${i})">Mark as Sent</button></td>
    </tr>`;
  });
  res.send(`
<html><head><title>Admin - CoinZap NG</title></head>
<body>
<h2>Admin Panel - CoinZap NG</h2>
<table border="1" cellpadding="5">
<tr><th>Reference</th><th>Service</th><th>Detail1</th><th>Detail2</th><th>Amount</th><th>Status</th><th>Action</th></tr>
${rows}
</table>
<script>
function markSent(index){
  fetch("/mark-sent",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({index})})
  .then(res=>res.json()).then(d=>{
    if(d.success){document.getElementById("status-"+index).innerText="SENT";}
  });
}
</script>
</body></html>
  `);
});

/* ================= MARK AS SENT ================= */
app.post("/mark-sent", async (req,res)=>{
  const {index}=req.body;
  const ordersPath=path.join(__dirname,"orders.json");
  let orders=await fs.readJson(ordersPath);
  if(orders[index]){
    orders[index].status="SENT";
    await fs.writeJson(ordersPath,orders,{spaces:2});
    return res.json({success:true});
  }
  res.json({success:false});
});

/* ================= SERVER ================= */
const PORT=process.env.PORT||3000;
app.listen(PORT,()=>console.log("CoinZap NG running on port "+PORT));
