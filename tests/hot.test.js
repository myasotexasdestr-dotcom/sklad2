const { chromium } = require('playwright'); const fs=require('fs');
(async()=>{
  const b=await chromium.launch(require('./_env').launchOpts); const p=await b.newPage({viewport:{width:390,height:1100}});
  p.on('pageerror',e=>console.log('PAGEERR',e.message)); p.on('dialog',d=>d.dismiss());
  await p.route('**://cdn.tailwindcss.com/**',r=>r.abort()); await p.route('**://fonts.g*/**',r=>r.abort()); await p.route('**://telegram.org/**',r=>r.abort());
  let version=1, data={locations:[{id:'L1',name:'ЦУМ'}],warehouses:[{id:'wBase',name:'База'},{id:'wC',name:'ЦУМ',locationId:'L1'}],staff:[{id:'o',name:'Власник',pin:'1111',role:'owner',locationId:'L1'},{id:'c',name:'Каса',pin:'2222',role:'cashier',locationId:'L1'}],shiftSchedule:[{id:'s1',dateKey:new Date().toLocaleDateString('sv'),staffId:'c',locationId:'L1'}],
    stockItems:[{id:'s_1',warehouseId:'wC',name:'Пакети',unit:'шт',qty:10,min:0,costPerUnit:1,category:'fastfood',section:'supplies'},{id:'s_2',warehouseId:'wC',name:'Серветки',unit:'шт',qty:5,min:0,costPerUnit:1,category:'fastfood',section:'supplies'},{id:'s_3',warehouseId:'wC',name:'Курка',unit:'кг',qty:3,min:0,costPerUnit:1,category:'meat'},{id:'m1',warehouseId:'wBase',name:'Курка',unit:'кг',qty:1,min:10,costPerUnit:5,category:'meat'},{id:'f1',warehouseId:'wBase',name:'Лаваш',unit:'шт',qty:2,min:10,costPerUnit:5,category:'fastfood'}],
    recipeIngredients:[{id:'ing1',name:'Соус',unit:'кг',yieldAmount:1,components:[],warehouseId:null}],ingredientStock:[],history:[],products:[],orders:[],sales:[],transfers:[],payouts:[]};
  await p.route('**/api/**',async r=>{const req=r.request();const path=new URL(req.url()).pathname;const j=(s,o)=>r.fulfill({status:s,contentType:'application/json',body:JSON.stringify(o)});
    if(path==='/api/auth/login')return j(200,{staffId:JSON.parse(req.postData()||'{}').pin==='2222'?'c':'o'}); if(path.startsWith('/api/checkbox'))return j(200,{enabled:false,pending:0});
    if(path==='/api/state'&&req.method()==='GET')return j(200,{version,data}); if(path==='/api/state'){const bb=JSON.parse(req.postData());version++;data=bb.data;return j(200,{version});} return j(404,{});});
  await p.goto(require('./_env').HTML_URL);
  await p.addStyleTag({content:fs.readFileSync(require('./_env').CSS_PATH,'utf8')});
  await p.fill('#pinInput','2222'); await p.evaluate(()=>document.getElementById('loginBtn').click()); await p.waitForTimeout(1200);
  const R=[];const check=(n,ok)=>{R.push(ok);console.log((ok?'PASS ':'FAIL ')+n)};
  await p.evaluate(()=>{ view='cashierRequest'; render(); }); await p.waitForTimeout(400);
  check('cashierRequest renders', await p.evaluate(()=>document.body.innerText.includes('Запросити поставку')&&document.body.innerText.includes('Позиції запиту')));
  await p.locator('input[inputmode="decimal"]').first().fill('2800'); await p.waitForTimeout(150);
  await p.locator('button:has-text("Додати позицію")').click(); await p.waitForTimeout(150);
  check('request guard blocks 2800 кг', await p.evaluate(()=>document.body.innerText.includes('Перевірте кількість')));
  await p.evaluate(()=>{ view='purchaseCreate'; render(); }); await p.waitForTimeout(400);
  check('purchase renders', await p.evaluate(()=>document.body.innerText.includes('Додати позицію')));
  await p.locator('input[inputmode="decimal"]').first().fill('2800'); await p.waitForTimeout(150);
  await p.locator('button:has-text("Додати позицію")').click(); await p.waitForTimeout(150);
  check('purchase guard blocks (Пакети шт 2800 → warn needs confirm)', await p.evaluate(()=>document.body.innerText.includes('Перевірте кількість')));
  console.log(R.every(x=>x)?'ALL PASS':'SOME FAIL'); await b.close();
})();
