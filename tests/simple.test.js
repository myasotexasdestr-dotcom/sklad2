const { chromium } = require('playwright'); const fs=require('fs');
(async()=>{
  const b=await chromium.launch(require('./_env').launchOpts); const p=await b.newPage({viewport:{width:390,height:1100}});
  p.on('pageerror',e=>console.log('PAGEERR',e.message)); p.on('dialog',d=>d.dismiss());
  await p.route('**://cdn.tailwindcss.com/**',r=>r.abort()); await p.route('**://fonts.g*/**',r=>r.abort()); await p.route('**://telegram.org/**',r=>r.abort());
  let version=1, data={locations:[{id:'L1',name:'ЦУМ'}],warehouses:[{id:'wBase',name:'База'},{id:'wC',name:'ЦУМ',locationId:'L1'}],staff:[{id:'o',name:'Власник',pin:'1111',role:'owner',locationId:'L1'},{id:'c',name:'Каса',pin:'2222',role:'cashier',locationId:'L1'},{id:'pp',name:'Заг',pin:'3333',role:'prep',locationId:'L1'}],shiftSchedule:[{id:'s1',dateKey:new Date().toLocaleDateString('sv'),staffId:'c',locationId:'L1'}],
    stockItems:[{id:'r1',warehouseId:'wBase',name:'Сирі крила',unit:'кг',qty:50,min:0,costPerUnit:5,category:'fastfood',section:'raw'},{id:'r2',warehouseId:'wC',name:'Сирі крила',unit:'кг',qty:0,min:0,costPerUnit:5,category:'fastfood',section:'raw'},{id:'b1',warehouseId:'wBase',name:'Крила BBQ',unit:'кг',qty:10,min:0,costPerUnit:8,category:'fastfood',section:'prep'},{id:'b2',warehouseId:'wC',name:'Крила BBQ',unit:'кг',qty:1,min:5,costPerUnit:8,category:'fastfood',section:'prep'},{id:'s_1',warehouseId:'wC',name:'Пакети',unit:'шт',qty:10,min:0,costPerUnit:1,category:'fastfood',section:'supplies'},{id:'s_2',warehouseId:'wC',name:'Серветки',unit:'шт',qty:5,min:0,costPerUnit:1,category:'fastfood',section:'supplies'},{id:'s_3',warehouseId:'wC',name:'Курка',unit:'кг',qty:3,min:0,costPerUnit:1,category:'meat'},{id:'m1',warehouseId:'wBase',name:'Курка',unit:'кг',qty:1,min:10,costPerUnit:5,category:'meat'},{id:'f1',warehouseId:'wBase',name:'Лаваш',unit:'шт',qty:2,min:10,costPerUnit:5,category:'fastfood'}],
    recipeIngredients:[{id:'ing1',name:'Соус',unit:'кг',yieldAmount:1,components:[],warehouseId:null}],ingredientStock:[],history:[],products:[],orders:[],sales:[],transfers:[],payouts:[]};
  await p.route('**/api/**',async r=>{const req=r.request();const path=new URL(req.url()).pathname;const j=(s,o)=>r.fulfill({status:s,contentType:'application/json',body:JSON.stringify(o)});
    if(path==='/api/auth/login')return j(200,{staffId:JSON.parse(req.postData()||'{}').pin==='2222'?'c':'o'}); if(path.startsWith('/api/checkbox'))return j(200,{enabled:false,pending:0});
    if(path==='/api/state'&&req.method()==='GET')return j(200,{version,data}); if(path==='/api/state'){const bb=JSON.parse(req.postData());version++;data=bb.data;return j(200,{version});} return j(404,{});});
  await p.goto(require('./_env').HTML_URL);
  await p.addStyleTag({content:fs.readFileSync(require('./_env').CSS_PATH,'utf8')});
  await p.fill('#pinInput','2222'); await p.evaluate(()=>document.getElementById('loginBtn').click()); await p.waitForTimeout(1200);
  const R=[];const check=(n,ok)=>{R.push(ok);console.log((ok?'PASS ':'FAIL ')+n)};
  const q=(id)=>p.evaluate((id)=>state.stockItems.find(i=>i.id===id).qty,id);
  // cashier requests Соус
  await p.evaluate(()=>{ state.activeLocationId='L1'; addTask({title:'req',description:'x',createdBy:'Каса',source:'cashier_request',request:{locationId:'L1',warehouseId:'wC',items:[{ingredientId:'ing1',name:'Соус',unit:'кг',qty:2}]}}); });
  const rq=await p.evaluate(()=>{const m=requestedForWarehouse('wC');return Array.from(m.entries()).map(([k,v])=>k+':'+v.qty+':'+v.from).join('|');});
  console.log(rq);
  check('requested = deficit Крила BBQ 4 + request Соус 2 (no raw)', rq.includes('p:крила bbq:4:deficit') && rq.includes('i:ing1:2:request') && !rq.includes('сирі'));
  // prep opens transfer start
  await p.evaluate(()=>{ state.currentUserId='pp'; state.currentWarehouse='wBase'; viewingLocationId='L1'; transferReturnTo='locationTransferNeeds'; view='transferStart'; render(); }); await p.waitForTimeout(500);
  const txt=await p.evaluate(()=>document.body.innerText);
  check('prep sees requested only', txt.includes('Крила BBQ') && txt.includes('Соус') && !txt.includes('Сирі крила'));
  check('prefilled with requested qty', await p.evaluate(()=>{const v=[...document.querySelectorAll('input[inputmode="decimal"]')].map(i=>i.value);return v.includes('4')||v.includes('2');}));
  // prepDashboard queue
  await p.evaluate(()=>{ view='prepDashboard'; render(); }); await p.waitForTimeout(300);
  check('dashboard shows Заявки точок', await p.evaluate(()=>document.body.innerText.includes('Заявки точок')&&document.body.innerText.includes('Крила BBQ')));
  // location needs view for prep
  await p.evaluate(()=>{ viewingLocationId='L1'; view='locationTransferNeeds'; render(); }); await p.waitForTimeout(300);
  check('needs view: Що просить точка, no Усі залишки', await p.evaluate(()=>document.body.innerText.includes('Що просить точка')&&!document.body.innerText.includes('Усі залишки')&&document.body.innerText.includes('Відправити запитане')));
  // send via UI
  await p.evaluate(()=>{ transferReturnTo='locationTransferNeeds'; view='transferStart'; render(); }); await p.waitForTimeout(500);
  await p.locator('button:has-text("Відправити поставку")').click(); await p.waitForTimeout(400);
  const after=await p.evaluate(()=>({n:state.transfers.length,t:state.tasks[0].status,st:state.transfers[0]&&state.transfers[0].lines.map(l=>l.name+':'+l.sentQty).join()}));
  console.log(JSON.stringify(after));
  check('transfer sent with requested lines & request closed', after.n===1 && after.t==='done');
  // owner: swap item correction. Create wrong transfer: raw sent instead of BBQ
  await p.evaluate(()=>{ state.currentUserId='o'; createTransfer('wBase','wC',[{kind:'product',stockName:'Сирі крила',name:'Сирі крила',unit:'кг',qty:3}]); const t=state.transfers[0]; receiveTransfer(t.id,[{key:lineKey(t.lines[0]),qty:3}]); });
  check('wrong state: raw base 47 (50-3), wC raw 3', await q('r1')===47 && await q('r2')===3);
  const bb=await p.evaluate(()=>[state.stockItems.find(i=>i.id==='b1').qty,state.stockItems.find(i=>i.id==='b2').qty]);
  await p.evaluate(()=>{ const t=state.transfers[0]; const c=transferCatalog('wBase').find(x=>x.name==='Крила BBQ'); const corr=requestTransferCorrection(t.id,[{key:lineKey(t.lines[0]),sentQty:3,receivedQty:3,item:{key:catalogKey(c),kind:c.kind,ingredientId:null,stockName:c.name,name:c.name,unit:c.unit}}],'не те'); });
  check('swap applied: raw restored (50/0), BBQ base -3, wC +3', await q('r1')===50 && await q('r2')===0 && await q('b1')===bb[0]-3 && await q('b2')===bb[1]+3);
  check('line now named Крила BBQ', await p.evaluate(()=>state.transfers[0].lines[0].name==='Крила BBQ' && state.transfers[0].lines[0].origItem.name==='Сирі крила'));
  // non-owner swap goes pending
  await p.evaluate(()=>{ state.currentUserId='pp'; });
  // settings grouped
  await p.evaluate(()=>{ state.currentUserId='o'; view='settings'; settingsMoreOpen=false; render(); }); await p.waitForTimeout(300);
  let st=await p.evaluate(()=>document.body.innerText);
  check('settings: Додатково collapsed hides Зв\'язки готовки; placeholders gone', st.includes('Додатково')&&!st.includes('Зв\'язки готовки')&&!st.includes('Постачальники')&&!st.includes('Історія закупівель'));
  await p.evaluate(()=>{ [...document.querySelectorAll('button')].find(b=>b.innerText.includes('Додатково')).click(); }); await p.waitForTimeout(200);
  check('expanded shows Норми розхідників', await p.evaluate(()=>document.body.innerText.includes('Норми розхідників')));
  console.log(R.every(x=>x)?'ALL PASS':'SOME FAIL'); await b.close();
})();
