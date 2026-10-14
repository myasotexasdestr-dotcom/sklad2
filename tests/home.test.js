const { chromium } = require('playwright'); const fs=require('fs');
(async()=>{
  const b=await chromium.launch(require('./_env').launchOpts); const p=await b.newPage({viewport:{width:390,height:1100}});
  p.on('pageerror',e=>console.log('PAGEERR',e.message)); p.on('dialog',d=>d.dismiss());
  await p.route('**://cdn.tailwindcss.com/**',r=>r.abort()); await p.route('**://fonts.g*/**',r=>r.abort()); await p.route('**://telegram.org/**',r=>r.abort());
  let version=1, data={locations:[{id:'L1',name:'ЦУМ'}],warehouses:[{id:'wBase',name:'База'},{id:'wC',name:'ЦУМ',locationId:'L1'}],staff:[{id:'o',name:'Власник',pin:'1111',role:'owner',locationId:'L1'},{id:'c',name:'Каса',pin:'2222',role:'cashier',locationId:'L1'},{id:'pp',name:'Заг',pin:'3333',role:'prep',locationId:'L1'}],shiftSchedule:[{id:'s1',dateKey:new Date().toLocaleDateString('sv'),staffId:'c',locationId:'L1'}],
    stockItems:[{id:'r1',warehouseId:'wBase',name:'Сирі крила',unit:'кг',qty:50,min:0,costPerUnit:5,category:'fastfood',section:'raw'},{id:'r2',warehouseId:'wC',name:'Сирі крила',unit:'кг',qty:0,min:0,costPerUnit:5,category:'fastfood',section:'raw'},{id:'b1',warehouseId:'wBase',name:'Крила BBQ',unit:'кг',qty:10,min:0,costPerUnit:8,category:'fastfood',section:'prep'},{id:'b2',warehouseId:'wC',name:'Крила BBQ',unit:'кг',qty:1,min:5,costPerUnit:8,category:'fastfood',section:'prep'},{id:'s_1',warehouseId:'wC',name:'Пакети',unit:'шт',qty:10,min:0,costPerUnit:1,category:'fastfood',section:'supplies'},{id:'s_2',warehouseId:'wC',name:'Серветки',unit:'шт',qty:5,min:0,costPerUnit:1,category:'fastfood',section:'supplies'},{id:'s_3',warehouseId:'wC',name:'Курка',unit:'кг',qty:3,min:0,costPerUnit:1,category:'meat'},{id:'m1',warehouseId:'wBase',name:'Курка',unit:'кг',qty:1,min:10,costPerUnit:5,category:'meat'},{id:'f1',warehouseId:'wBase',name:'Лаваш',unit:'шт',qty:2,min:10,costPerUnit:5,category:'fastfood'}],
    recipeIngredients:[{id:'ing1',name:'Соус',unit:'кг',yieldAmount:1,components:[],warehouseId:null}],ingredientStock:[],history:[],products:[],orders:[],sales:[],transfers:[],payouts:[]};
  await p.route('**/api/**',async r=>{const req=r.request();const path=new URL(req.url()).pathname;const j=(s,o)=>r.fulfill({status:s,contentType:'application/json',body:JSON.stringify(o)});
    if(path==='/api/auth/login')return j(200,{staffId:JSON.parse(req.postData()||'{}').pin==='1111'?'o':'c'}); if(path.startsWith('/api/checkbox'))return j(200,{enabled:false,pending:0});
    if(path==='/api/state'&&req.method()==='GET')return j(200,{version,data}); if(path==='/api/state'){const bb=JSON.parse(req.postData());version++;data=bb.data;return j(200,{version});} return j(404,{});});
  await p.goto(require('./_env').HTML_URL);
  await p.addStyleTag({content:fs.readFileSync(require('./_env').CSS_PATH,'utf8')});
  await p.fill('#pinInput','1111'); await p.evaluate(()=>document.getElementById('loginBtn').click()); await p.waitForTimeout(1200);
  const R=[];const check=(n,ok)=>{R.push(ok);console.log((ok?'PASS ':'FAIL ')+n)};
  let t=await p.evaluate(()=>document.body.innerText);
  check('owner home titled Сьогодні with attention block', t.includes('Сьогодні') && t.includes('Потребує уваги'));
  check('owner has 3 tabs (no Закупівлі tab)', await p.evaluate(()=>document.querySelectorAll('.navbar-tabs .navitem').length===3));
  check('all four cards present', ['Зміни','Чекає вашого рішення','Треба докупити','Втрати й ризики'].every(x=>t.includes(x)));
  await p.evaluate(()=>{ state.stockItems.push({id:'neg',warehouseId:'wC',name:'Мінусовий',unit:'шт',qty:-3,min:0,costPerUnit:1,category:'meat'}); state.transferCorrections=[{id:'c1',transferId:'x',status:'PENDING',lines:[]}]; render(); });
  t=await p.evaluate(()=>document.body.innerText);
  check('negative stock + pending correction flagged', t.includes('мінус на складі: 1') && t.includes('Виправлень поставок: 1'));
  await p.evaluate(()=>{ view='settings'; render(); }); await p.waitForTimeout(200);
  t=await p.evaluate(()=>document.body.innerText);
  check('settings grouped', ['Щодня','Люди','Продукти','Продажі'].every(x=>t.includes(x)));
  console.log(R.every(Boolean)?'ALL PASS':'SOME FAIL'); await b.close();
})();
