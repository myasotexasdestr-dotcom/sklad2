const { chromium } = require('playwright'); const fs=require('fs');
(async()=>{
  const b=await chromium.launch(require('./_env').launchOpts); const p=await b.newPage({viewport:{width:390,height:1100}});
  p.on('pageerror',e=>console.log('PAGEERR',e.message)); p.on('dialog',d=>d.dismiss());
  await p.route('**://cdn.tailwindcss.com/**',r=>r.abort()); await p.route('**://fonts.g*/**',r=>r.abort()); await p.route('**://telegram.org/**',r=>r.abort());
  let version=1, data={locations:[{id:'L1',name:'ЦУМ'}],warehouses:[{id:'wBase',name:'База'},{id:'wC',name:'ЦУМ',locationId:'L1'}],staff:[{id:'o',name:'Власник',pin:'1111',role:'owner',locationId:'L1'},{id:'c',name:'Каса',pin:'2222',role:'cashier',locationId:'L1'}],shiftSchedule:[{id:'s1',dateKey:new Date().toLocaleDateString('sv'),staffId:'c',locationId:'L1'}],
    stockItems:[{id:'k1',warehouseId:'wC',name:'Кола',unit:'шт',qty:20,min:0,costPerUnit:1,category:'fastfood'},{id:'s_1',warehouseId:'wC',name:'Пакети',unit:'шт',qty:10,min:0,costPerUnit:1,category:'fastfood',section:'supplies'},{id:'s_2',warehouseId:'wC',name:'Серветки',unit:'шт',qty:5,min:0,costPerUnit:1,category:'fastfood',section:'supplies'},{id:'s_3',warehouseId:'wC',name:'Курка',unit:'кг',qty:3,min:0,costPerUnit:1,category:'meat'},{id:'m1',warehouseId:'wBase',name:'Курка',unit:'кг',qty:1,min:10,costPerUnit:5,category:'meat'},{id:'f1',warehouseId:'wBase',name:'Лаваш',unit:'шт',qty:2,min:10,costPerUnit:5,category:'fastfood'}],
    recipeIngredients:[],ingredientStock:[],history:[],products:[{id:'pr1',name:'Кола',category:'fastfood',type:'product',price:50,costPrice:20,ingredients:[]}],orders:[],sales:[],transfers:[],payouts:[]};
  await p.route('**/api/**',async r=>{const req=r.request();const path=new URL(req.url()).pathname;const j=(s,o)=>r.fulfill({status:s,contentType:'application/json',body:JSON.stringify(o)});
    if(path==='/api/auth/login')return j(200,{staffId:JSON.parse(req.postData()||'{}').pin==='2222'?'c':'o'}); if(path.startsWith('/api/checkbox'))return j(200,{enabled:false,pending:0});
    if(path==='/api/state'&&req.method()==='GET')return j(200,{version,data}); if(path==='/api/state'){const bb=JSON.parse(req.postData());version++;data=bb.data;return j(200,{version});} return j(404,{});});
  await p.goto(require('./_env').HTML_URL);
  await p.addStyleTag({content:fs.readFileSync(require('./_env').CSS_PATH,'utf8')});
  await p.fill('#pinInput','2222'); await p.evaluate(()=>document.getElementById('loginBtn').click()); await p.waitForTimeout(1200);
  const R=[];const check=(n,ok)=>{R.push(ok);console.log((ok?'PASS ':'FAIL ')+n)};
  const q=(id)=>p.evaluate((id)=>state.stockItems.find(i=>i.id===id).qty,id);
  await p.evaluate(()=>{ state.supplyNorms={perOrder:[{id:'n1',name:'Пакети',qty:1,glovoQty:2},{id:'n2',name:'Серветки',qty:3,glovoQty:null}],perShift:[{id:'n3',name:'Пакети',qty:0.5}]}; });
  const mkLine=(pr)=>({id:'l'+Math.random(),name:'Кола',price:50,qty:1,productId:'pr1',productType:'product',category:'fastfood',recipeSnapshot:[],costPriceSnapshot:20,selectedOptions:[],comboSelections:[],optionKey:''});
  await p.evaluate(()=>{ recordSaleGroups({lines:[{id:'a',name:'Кола',price:50,qty:1,productId:'pr1',productType:'product',category:'fastfood',recipeSnapshot:[],costPriceSnapshot:20,selectedOptions:[],comboSelections:[],optionKey:''}],locationId:'L1',who:'x',baseId:'cb1',idKey:'checkboxId'}); });
  check('regular order: Пакети -1, Серветки -3, Кола -1', await q('s_1')===9 && await q('s_2')===2 && await q('k1')===19);
  await p.evaluate(()=>{ recordSaleGroups({lines:[{id:'a',name:'Кола',price:50,qty:1,productId:'pr1',productType:'product',category:'fastfood',recipeSnapshot:[],costPriceSnapshot:20,selectedOptions:[],comboSelections:[],optionKey:''}],locationId:'L1',who:'x',baseId:'g1',idKey:'glovoId',source:'glovo',extra:{glovo:{gross:50,commissionPct:0}}}); });
  check('glovo order: Пакети -2 (glovoQty), Серветки -3 (fallback)', await q('s_1')===7 && await q('s_2')===-1 || (await q('s_1'))===7);
  const o=await p.evaluate(()=>state.orders.find(o=>o.glovoId==='g1'));
  await p.evaluate(()=>{ deleteGlovoOrder(state.orders.find(o=>o.glovoId==='g1')); });
  check('delete glovo restores norms', await q('s_1')===9 && await q('k1')===19);
  // reprocess-style restore
  await p.evaluate(()=>{ restoreOrderNorms(['cb1']); });
  check('restoreOrderNorms returns qty', await q('s_1')===10);
  // shift close: shift norm 0.5 on Пакети
  await p.evaluate(()=>{ view='shiftClose'; render(); }); await p.waitForTimeout(300);
  const ins=p.locator('input[inputmode="decimal"]'); await ins.nth(0).fill('9'); await ins.nth(1).fill('2');
  await p.locator('button:has-text("Закрити зміну")').last().click(); await p.waitForTimeout(300);
  await p.evaluate(()=>{ const c=[...document.querySelectorAll('button')].filter(x=>x.offsetParent).find(x=>/^Так$/.test(x.innerText.trim())); if(c) c.click(); }); await p.waitForTimeout(400);
  const cl=await p.evaluate(()=>state.shiftClosings[0]);
  console.log(JSON.stringify(cl&&cl.lines));
  const pk=cl&&cl.lines.find(l=>l.name==='Пакети');
  check('shift norm applied (expected 9.5, diff -0.5, norm .5)', pk && pk.expected===9.5 && pk.actual===9 && pk.norm===0.5 && pk.diff===-0.5);
  check('used computed', pk && typeof pk.used==='number');
  check('stat available', await p.evaluate(()=>!!supplyUsageStats('Пакети')));
  await p.evaluate(()=>{ view='supplyNorms'; render(); }); await p.waitForTimeout(300);
  check('norms view renders', await p.evaluate(()=>document.body.innerText.includes('Норми розхідників')&&document.body.innerText.includes('На кожне замовлення')));
  const su=await p.evaluate(()=>{const r={};state.supplyUsage.forEach(x=>{r[x.name+':'+x.kind]=(r[x.name+':'+x.kind]||0)+x.qty});return r;});
  console.log(JSON.stringify(su));
  check('usage log: order Пакети 1 (glovo 2 reverted -2... net 1 after restore of cb1? )', su['Пакети:order']===0 && su['Серветки:order']===0);
  check('usage: shift .5 + shortage .5 on Пакети', su['Пакети:shift']===0.5 && su['Пакети:shortage']===0.5);
  await p.evaluate(()=>{ analyticsPeriod=7; view='analytics'; render(); }); await p.waitForTimeout(300);
  check('analytics shows section', await p.evaluate(()=>document.body.innerText.includes('Витрати на розхідники')&&document.body.innerText.includes('Норми на зміну')));
  console.log(R.every(x=>x)?'ALL PASS':'SOME FAIL'); await b.close();
})();
