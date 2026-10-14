const { chromium } = require('playwright'); const fs=require('fs');
(async()=>{
  const b=await chromium.launch(require('./_env').launchOpts); const p=await b.newPage({viewport:{width:390,height:1100}});
  p.on('pageerror',e=>console.log('PAGEERR',e.message)); p.on('dialog',d=>d.dismiss());
  await p.route('**://cdn.tailwindcss.com/**',r=>r.abort()); await p.route('**://fonts.g*/**',r=>r.abort()); await p.route('**://telegram.org/**',r=>r.abort());
  let version=1, data={locations:[{id:'L1',name:'ЦУМ'}],warehouses:[{id:'wBase',name:'База'},{id:'wC',name:'ЦУМ',locationId:'L1'}],staff:[{id:'o',name:'Власник',pin:'1111',role:'owner',locationId:'L1'},{id:'c',name:'Каса',pin:'2222',role:'cashier',locationId:'L1'}],shiftSchedule:[{id:'s1',dateKey:new Date().toLocaleDateString('sv'),staffId:'c',locationId:'L1'}],
    stockItems:[{id:'s_1',warehouseId:'wC',name:'Пакети',unit:'шт',qty:10,min:0,costPerUnit:1,category:'fastfood',section:'supplies'},{id:'s_2',warehouseId:'wC',name:'Серветки',unit:'шт',qty:5,min:0,costPerUnit:1,category:'fastfood',section:'supplies'},{id:'s_3',warehouseId:'wC',name:'Курка',unit:'кг',qty:3,min:0,costPerUnit:1,category:'meat'},{id:'m1',warehouseId:'wBase',name:'Курка',unit:'кг',qty:1,min:10,costPerUnit:5,category:'meat'},{id:'f1',warehouseId:'wBase',name:'Лаваш',unit:'шт',qty:2,min:10,costPerUnit:5,category:'fastfood'}],
    recipeIngredients:[],ingredientStock:[],history:[],products:[],orders:[],sales:[],transfers:[],payouts:[]};
  await p.route('**/api/**',async r=>{const req=r.request();const path=new URL(req.url()).pathname;const j=(s,o)=>r.fulfill({status:s,contentType:'application/json',body:JSON.stringify(o)});
    if(path==='/api/auth/login')return j(200,{staffId:JSON.parse(req.postData()||'{}').pin==='2222'?'c':'o'}); if(path.startsWith('/api/checkbox'))return j(200,{enabled:false,pending:0});
    if(path==='/api/state'&&req.method()==='GET')return j(200,{version,data}); if(path==='/api/state'){const bb=JSON.parse(req.postData());version++;data=bb.data;return j(200,{version});} return j(404,{});});
  await p.goto(require('./_env').HTML_URL);
  await p.addStyleTag({content:fs.readFileSync(require('./_env').CSS_PATH,'utf8')});
  await p.fill('#pinInput','2222'); await p.evaluate(()=>document.getElementById('loginBtn').click()); await p.waitForTimeout(1200);
  const R=[];const check=(n,ok)=>{R.push(ok);console.log((ok?'PASS ':'FAIL ')+n)};
  console.log(await p.evaluate(()=>[curUser()&&curUser().role, view, isScheduledToday(), cashierShiftLocationId()].join()));
  check('close button on home', await p.evaluate(()=>document.body.innerText.includes('Закрити зміну')));
  await p.evaluate(()=>{ view='shiftClose'; render(); }); await p.waitForTimeout(300);
  const t=await p.evaluate(()=>document.body.innerText);
  check('lists supplies only', t.includes('Пакети')&&t.includes('Серветки')&&!t.includes('Курка'));
  await p.locator('button:has-text("Закрити зміну")').last().click(); await p.waitForTimeout(200);
  check('requires all fields', await p.evaluate(()=>document.body.innerText.includes('Введіть залишок')));
  const ins=p.locator('input[inputmode="decimal"]'); await ins.nth(0).fill('7'); await ins.nth(1).fill('5');
  await p.locator('button:has-text("Закрити зміну")').last().click(); await p.waitForTimeout(300);
  await p.evaluate(()=>{ const b=[...document.querySelectorAll('button')].reverse().find(x=>/Так|Підтвердити|OK|Закрити/.test(x.innerText)&&x.offsetParent); window.__b=b&&b.innerText; });
  console.log(await p.evaluate(()=>window.__b));
  await p.evaluate(()=>{ const bs=[...document.querySelectorAll('button')].filter(x=>x.offsetParent); const c=bs.find(x=>/^(Так|Підтвердити|Закрити|OK|Ок)$/i.test(x.innerText.trim())&&x.closest('[class*=modal],[id*=modal],[style*=fixed]')); if(c) c.click(); }); await p.waitForTimeout(400);
  const st=await p.evaluate(()=>({n:state.shiftClosings.length, q:state.stockItems.find(i=>i.id==='s_1').qty, l:state.shiftClosings[0]&&state.shiftClosings[0].lines.map(x=>x.diff).join(), log:state.auditLog[0]&&state.auditLog[0].description}));
  console.log(JSON.stringify(st));
  check('closing saved & stock corrected', st.n===1 && st.q===7 && st.l==='-3,0');
  check('audit logged with diff', /Пакети -3/.test(st.log||''));
  await p.evaluate(()=>{ view='stock'; render(); }); await p.waitForTimeout(300);
  check('home shows closed', await p.evaluate(()=>document.body.innerText.includes('Зміну закрито')));
  console.log(R.every(x=>x)?'ALL PASS':'SOME FAIL'); await b.close();
})();
