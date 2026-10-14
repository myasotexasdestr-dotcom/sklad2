const { chromium } = require('playwright'); const fs=require('fs');
(async()=>{
  const b=await chromium.launch(require('./_env').launchOpts); const p=await b.newPage({viewport:{width:390,height:900}});
  p.on('pageerror',e=>console.log('PAGEERR',e.message)); p.on('dialog',d=>d.dismiss());
  await p.route('**://cdn.tailwindcss.com/**',r=>r.abort()); await p.route('**://fonts.g*/**',r=>r.abort()); await p.route('**://telegram.org/**',r=>r.abort());
  let version=1, data={locations:[{id:'loc1',name:'ЦУМ'}],warehouses:[{id:'loc1',name:'ЦУМ'}],staff:[{id:'o',name:'Власник',pin:'1234',role:'owner',locationId:'loc1'}],
    stockItems:[{id:'si1',warehouseId:'loc1',name:'Бургер',unit:'шт',qty:10,min:1,costPerUnit:50,category:'fastfood'}],recipeIngredients:[],history:[],sales:[],orders:[],
    products:[{id:'pB',name:'Бургер',category:'fastfood',type:'product',ingredients:[],costPrice:50,price:150,optionGroups:[],comboSlots:[],recipeVersion:1,recipeHistory:[]}]};
  await p.route('**/api/**',async r=>{const req=r.request();const path=new URL(req.url()).pathname;const j=(s,o)=>r.fulfill({status:s,contentType:'application/json',body:JSON.stringify(o)});
    if(path==='/api/auth/login')return j(200,{token:'t',staffId:'o'}); if(path.startsWith('/api/checkbox'))return j(200,{enabled:false,pending:0});
    if(path==='/api/state'&&req.method()==='GET')return j(200,{version,data}); if(path==='/api/state'){const bb=JSON.parse(req.postData());version++;data=bb.data;return j(200,{version});} return j(404,{});});
  await p.goto(require('./_env').HTML_URL);
  await p.addStyleTag({content:fs.readFileSync(require('./_env').CSS_PATH,'utf8')});
  await p.fill('#pinInput','1234'); await p.click('#loginBtn'); await p.waitForTimeout(800);
  const R=[];const check=(n,ok)=>{R.push(ok);console.log((ok?'PASS ':'FAIL ')+n)};
  check('default commission 36', await p.evaluate(()=>state.glovo.commissionPct===36));
  // add glovo item via state (UI modal covered below)
  await p.evaluate(()=>{ state.glovo.items.push({id:'gi1',name:'Бургер Glovo',price:200,productId:'pB'}); view='glovo'; glovoTab='menu'; render(); });
  await p.waitForTimeout(300);
  let t=await p.evaluate(()=>document.body.innerText);
  check('menu tab shows net 128 & profit 78', t.includes('Бургер Glovo')&&/128/.test(t)&&/78/.test(t));
  // add sale through the real form
  await p.evaluate(()=>{ glovoTab='sales'; view='glovo'; render(); });
  await p.waitForTimeout(200);
  await p.locator('button:has-text("Додати продаж Glovo")').first().click(); await p.waitForTimeout(300);
  await p.locator('button:text-is("+")').first().click(); await p.locator('button:text-is("+")').first().click(); // add qty (add + once more via list)
  await p.waitForTimeout(200);
  t=await p.evaluate(()=>document.body.innerText);
  console.log(t.replace(/\n+/g,' | ').slice(0,420));
  await p.locator('button:has-text("Зберегти продаж")').click(); await p.waitForTimeout(600);
  const o=await p.evaluate(()=>({o:state.orders,s:state.sales,q:state.stockItems[0].qty}));
  check('order created source glovo', o.o.length===1 && o.o[0].source==='glovo' && !!o.o[0].glovoId);
  const qty=o.o[0].items[0].qty;
  check('net total = qty*128', o.o[0].total===128*qty && o.s[0].amount===128*qty);
  check('gross/commission', o.o[0].glovo.gross===200*qty && o.o[0].glovo.commission===72*qty);
  check('stock deducted by qty', o.q===10-qty && o.o[0].consumption.length===1);
  const prof=await p.evaluate(()=>locationProfit('loc1').profit); check('profit = (128-50)*qty', prof===78*qty);
  t=await p.evaluate(()=>document.body.innerText); check('sales list shows glovo order', t.includes('Glovo')&&t.includes('Чистий оборот'));
  await p.locator('.card:has-text("🛵")').first().click(); await p.waitForTimeout(200);
  t=await p.evaluate(()=>document.body.innerText); check('expand shows write-off', t.includes('Списано зі складу')&&t.includes('Бургер'));
  // delete restores
  await p.evaluate(()=>{ deleteGlovoOrder(state.orders[0]); saveState(); render(); }); await p.waitForTimeout(300);
  const a=await p.evaluate(()=>({o:state.orders.length,s:state.sales.length,q:state.stockItems[0].qty}));
  check('delete: order+sale gone, stock restored', a.o===0&&a.s===0&&a.q===10);
  await p.screenshot({path:'gl_view.png'});
  console.log(R.every(x=>x)?'ALL PASS':'SOME FAIL'); await b.close();
})();
