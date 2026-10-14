const { chromium } = require('playwright'); const fs=require('fs');
(async()=>{
  const b=await chromium.launch(require('./_env').launchOpts); const p=await b.newPage({viewport:{width:390,height:1200}});
  p.on('pageerror',e=>console.log('PAGEERR',e.message)); p.on('dialog',d=>d.dismiss());
  await p.route('**://cdn.tailwindcss.com/**',r=>r.abort()); await p.route('**://fonts.g*/**',r=>r.abort()); await p.route('**://telegram.org/**',r=>r.abort());
  let version=1, data={locations:[{id:'L1',name:'ЦУМ'}],warehouses:[{id:'wBase',name:'База'},{id:'wCum',name:'ЦУМ'}],
    staff:[{id:'o',name:'Власник',pin:'1111',role:'owner',locationId:'L1'},{id:'pp',name:'Заг',pin:'2222',role:'prep',locationId:'L1'}],
    stockItems:[{id:'b1',warehouseId:'wBase',name:'Борошно',unit:'кг',qty:50,min:0,costPerUnit:2,category:'fastfood'},{id:'c1',warehouseId:'wCum',name:'Борошно',unit:'кг',qty:2,min:10,costPerUnit:2,category:'fastfood'},
                {id:'b2',warehouseId:'wBase',name:'Стаканчики',unit:'шт',qty:100,min:0,costPerUnit:1,category:'fastfood'}],
    recipeIngredients:[{id:'i1',name:'Борошно',unit:'кг',yieldAmount:1,components:[{id:'c',productName:'Борошно',unit:'кг',amount:1}],warehouseId:null},
                       {id:'sauce',name:'Соус',unit:'л',yieldAmount:1,isRecipe:true,components:[{id:'c2',productName:'Борошно',unit:'кг',amount:1}],warehouseId:null}],
    ingredientStock:[{id:'r1',warehouseId:'wBase',ingredientId:'sauce',qty:20}],history:[],sales:[],orders:[],products:[],transfers:[]};
  await p.route('**/api/**',async r=>{const req=r.request();const path=new URL(req.url()).pathname;const j=(s,o)=>r.fulfill({status:s,contentType:'application/json',body:JSON.stringify(o)});
    if(path==='/api/auth/login'){const b=JSON.parse(req.postData());const s=data.staff.find(x=>x.pin===b.pin);return s?j(200,{staffId:s.id}):j(401,{});} if(path.startsWith('/api/checkbox'))return j(200,{enabled:false,pending:0});
    if(path==='/api/state'&&req.method()==='GET')return j(200,{version,data}); if(path==='/api/state'){const bb=JSON.parse(req.postData());version++;data=bb.data;return j(200,{version});} return j(404,{});});
  await p.goto(require('./_env').HTML_URL);
  await p.addStyleTag({content:fs.readFileSync(require('./_env').CSS_PATH,'utf8')});
  const R=[];const check=(n,ok)=>{R.push(ok);console.log((ok?'PASS ':'FAIL ')+n)};
  // ---- prep
  await p.fill('#pinInput','2222'); await p.click('#loginBtn'); await p.waitForTimeout(900);
  // Заготівельник тепер бачить лише запити точки; перевіряємо повний склад точки від імені власника.
  await p.evaluate(()=>{ const o=state.staff.find(x=>x.role==='owner'); state.currentUserId=o.id; view='prepTransferLocations'; render(); }); await p.waitForTimeout(200);
  await p.locator('text=ЦУМ').first().click(); await p.waitForTimeout(300);
  let t=await p.evaluate(()=>document.body.innerText);
  check('needs view shows real qty 2 (not zero) & low flag for Борошно', /Борошно[\s\S]*2 кг/.test(t) && t.includes('мало'));
  check('needs view includes raw product Стаканчики', t.includes('Стаканчики'));
  await p.locator('button:has-text("Створити поставку")').click(); await p.waitForTimeout(300);
  check('to-warehouse preselected to ЦУМ', await p.evaluate(()=>document.body.innerText.includes('ЦУМ')));
  await p.locator('button:has-text("Дозаповнити до мінімуму")').click();
  const inputs=p.locator('input[inputmode="decimal"]'); const n=await inputs.count();
  // fill Стаканчики (find row)
  const row=p.locator('div.card:has-text("Стаканчики")').last(); await row.locator('input').fill('30');
  await p.locator('button:has-text("Відправити поставку")').click(); await p.waitForTimeout(500);
  const st=await p.evaluate(()=>({base:stockRowByName('Борошно','wBase').qty, cup:stockRowByName('Стаканчики','wBase').qty, tr:state.transfers.length, st:state.transfers[0]&&state.transfers[0].status, lines:state.transfers[0]&&state.transfers[0].lines.map(l=>l.kind+':'+l.sentQty), view}));
  console.log(JSON.stringify(st));
  check('sent: base flour 50-8=42, cups 100-30=70', st.base===42 && st.cup===70);
  check('transfer SENT with product lines, went to transferList', st.st==='SENT' && st.view==='transferList' && st.lines.includes('ingredient:8') && st.lines.includes('product:30'));
  t=await p.evaluate(()=>document.body.innerText);
  check('sender sees "В дорозі" + cancel', t.includes('В дорозі') && t.includes('Скасувати поставку'));
  // receive as owner via data layer (cashier not set up) with keys
  await p.evaluate(()=>{ const tr=state.transfers[0]; receiveTransfer(tr.id, tr.lines.map(l=>({key:lineKey(l), qty:l.sentQty}))); });
  const rc=await p.evaluate(()=>({f:stockRowByName('Борошно','wCum').qty, cup:(stockRowByName('Стаканчики','wCum')||{}).qty}));
  check('received: ЦУМ flour 2+8=10, cups created 30', rc.f===10 && rc.cup===30);
  // cancel flow
  await p.evaluate(()=>{ const c=transferCatalog('wBase').find(x=>x.name==='Стаканчики'); const tr=createTransfer('wBase','wCum',[{kind:c.kind,stockName:c.name,name:c.name,unit:c.unit,qty:5}]); cancelTransfer(tr.id); });
  check('cancel returns stock', await p.evaluate(()=>stockRowByName('Стаканчики','wBase').qty===70 && state.transfers[0].status==='CANCELLED'));
  // ---- owner entry
  await p.evaluate(()=>{ logout(); }); await p.waitForTimeout(300);
  await p.fill('#pinInput','1111',{force:true}); await p.evaluate(()=>document.getElementById('loginBtn').click()); await p.waitForTimeout(900);
  await p.evaluate(()=>{ view='purchase'; render(); }); await p.waitForTimeout(200);
  check('owner Закупівлі has Поставка button', await p.locator('button:has-text("Поставка")').count()>0);
  await p.evaluate(()=>{ [...document.querySelectorAll('button')].find(b=>b.innerText.trim()==='Поставка').click(); }); await p.waitForTimeout(300);
  check('owner sees locations list', await p.evaluate(()=>document.body.innerText.includes('ЦУМ') && document.body.innerText.includes('Усі поставки')));
  console.log(R.every(x=>x)?'ALL PASS':'SOME FAIL'); await b.close();
})();
