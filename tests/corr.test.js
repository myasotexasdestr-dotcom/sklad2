const { chromium } = require('playwright'); const fs=require('fs');
(async()=>{
  const b=await chromium.launch(require('./_env').launchOpts); const p=await b.newPage({viewport:{width:390,height:1100}});
  p.on('pageerror',e=>console.log('PAGEERR',e.message)); p.on('dialog',d=>d.dismiss());
  await p.route('**://cdn.tailwindcss.com/**',r=>r.abort()); await p.route('**://fonts.g*/**',r=>r.abort()); await p.route('**://telegram.org/**',r=>r.abort());
  let version=1, data={locations:[{id:'L1',name:'ЦУМ'}],warehouses:[{id:'wBase',name:'База'},{id:'wC',name:'ЦУМ',locationId:'L1'}],staff:[{id:'o',name:'Власник',pin:'1111',role:'owner',locationId:'L1'},{id:'c',name:'Каса',pin:'2222',role:'cashier',locationId:'L1'}],shiftSchedule:[{id:'s1',dateKey:new Date().toLocaleDateString('sv'),staffId:'c',locationId:'L1'}],
    stockItems:[{id:'b1',warehouseId:'wBase',name:'Курка',unit:'кг',qty:10,min:0,costPerUnit:5,category:'meat'},{id:'c1',warehouseId:'wC',name:'Курка',unit:'кг',qty:1,min:0,costPerUnit:5,category:'meat'},{id:'s_1',warehouseId:'wC',name:'Пакети',unit:'шт',qty:10,min:0,costPerUnit:1,category:'fastfood',section:'supplies'},{id:'s_2',warehouseId:'wC',name:'Серветки',unit:'шт',qty:5,min:0,costPerUnit:1,category:'fastfood',section:'supplies'},{id:'s_3',warehouseId:'wC',name:'Курка',unit:'кг',qty:3,min:0,costPerUnit:1,category:'meat'},{id:'m1',warehouseId:'wBase',name:'Курка',unit:'кг',qty:1,min:10,costPerUnit:5,category:'meat'},{id:'f1',warehouseId:'wBase',name:'Лаваш',unit:'шт',qty:2,min:10,costPerUnit:5,category:'fastfood'}],
    recipeIngredients:[],ingredientStock:[],history:[],products:[],orders:[],sales:[],transfers:[],payouts:[]};
  await p.route('**/api/**',async r=>{const req=r.request();const path=new URL(req.url()).pathname;const j=(s,o)=>r.fulfill({status:s,contentType:'application/json',body:JSON.stringify(o)});
    if(path==='/api/auth/login')return j(200,{staffId:JSON.parse(req.postData()||'{}').pin==='2222'?'c':'o'}); if(path.startsWith('/api/checkbox'))return j(200,{enabled:false,pending:0});
    if(path==='/api/state'&&req.method()==='GET')return j(200,{version,data}); if(path==='/api/state'){const bb=JSON.parse(req.postData());version++;data=bb.data;return j(200,{version});} return j(404,{});});
  await p.goto(require('./_env').HTML_URL);
  await p.addStyleTag({content:fs.readFileSync(require('./_env').CSS_PATH,'utf8')});
  await p.fill('#pinInput','2222'); await p.evaluate(()=>document.getElementById('loginBtn').click()); await p.waitForTimeout(1200);
  const R=[];const check=(n,ok)=>{R.push(ok);console.log((ok?'PASS ':'FAIL ')+n)};
  const q=(id)=>p.evaluate((id)=>state.stockItems.find(i=>i.id===id).qty,id);
  const asUser=(id)=>p.evaluate((id)=>{ state.currentUserId=id; },id);
  check('qtyProblem 2800 кг vs 2.8 → block/suggest 2.8 (cashier)', await p.evaluate(()=>{const r=qtyProblem(2800,'кг',2.8);return r&&r.level==='block'&&r.suggest===2.8;}));
  check('qtyProblem 2.8 кг ok, 150 кг warn, 500 шт ok', await p.evaluate(()=>!qtyProblem(2.8,'кг',3)&&qtyProblem(150,'кг',0).level==='warn'&&!qtyProblem(500,'шт',0)));
  // send 2 kg normally, receive with 2800 as cashier (bypassing UI) → simulate the mistake having happened
  await p.evaluate(()=>{ createTransfer('wBase','wC',[{kind:'product',stockName:'Курка',name:'Курка',unit:'кг',qty:2.8}]); });
  const tid=await p.evaluate(()=>state.transfers[0].id);
  await p.evaluate((tid)=>{ receiveTransfer(tid,[{key:lineKey(state.transfers[0].lines[0]),qty:2800}]); },tid);
  check('mistake happened: wC 2801, wBase 7.2', await q('c1')===2801 && await q('b1')===7.2);
  // cashier requests correction
  await p.evaluate((tid)=>{ state.currentWarehouse='wC'; },tid);
  const c1=await p.evaluate((tid)=>{ const t=state.transfers[0]; const c=requestTransferCorrection(tid,[{key:lineKey(t.lines[0]),sentQty:2.8,receivedQty:2.8}],'грами'); return c&&c.status; },tid);
  check('non-owner request is PENDING, stock untouched', c1==='PENDING' && await q('c1')===2801);
  check('second request blocked while pending', await p.evaluate((tid)=>requestTransferCorrection(tid,[{key:lineKey(state.transfers[0].lines[0]),sentQty:1,receivedQty:1}])===null,tid));
  // owner sees notification + approves
  await asUser('o');
  check('owner notification', await p.evaluate(()=>computeNotifications().some(n=>n.id.startsWith('tcorr-'))));
  await p.evaluate(()=>{ view='transferList'; render(); }); await p.waitForTimeout(300);
  check('owner sees pending block', await p.evaluate(()=>document.body.innerText.includes('Виправлення на підтвердження')&&/2\s?800/.test(document.body.innerText)));
  await p.evaluate(()=>{ decideTransferCorrection(state.transferCorrections[0].id,true); });
  check('approved: wC 3.8 (1+2.8), wBase 7.2 (sent unchanged 2.8)', await q('c1')===3.8 && await q('b1')===7.2);
  check('line corrected & status', await p.evaluate(()=>state.transfers[0].lines[0].receivedQty===2.8&&state.transfers[0].lines[0].corrected&&state.transferCorrections[0].status==='APPROVED'));
  // reject flow & sender correction
  await p.evaluate(()=>{ createTransfer('wBase','wC',[{kind:'product',stockName:'Курка',name:'Курка',unit:'кг',qty:1}]); const t=state.transfers[0]; receiveTransfer(t.id,[{key:lineKey(t.lines[0]),qty:1}]); });
  await asUser('c');
  await p.evaluate(()=>{ const t=state.transfers[0]; requestTransferCorrection(t.id,[{key:lineKey(t.lines[0]),sentQty:1000,receivedQty:1000}],'x'); });
  await asUser('o');
  await p.evaluate(()=>{ decideTransferCorrection(state.transferCorrections[0].id,false); });
  check('rejected: stock unchanged', await q('c1')===4.8 && await q('b1')===6.2);
  // owner direct fix applies immediately incl. sender side
  await p.evaluate(()=>{ const t=state.transfers[0]; requestTransferCorrection(t.id,[{key:lineKey(t.lines[0]),sentQty:1.5,receivedQty:1.5}],''); });
  check('owner direct: sender -0.5, receiver +0.5', await q('b1')===5.7 && await q('c1')===5.3);
  // UI: cashier receive screen blocks 2800
  await p.evaluate(()=>{ createTransfer('wBase','wC',[{kind:'product',stockName:'Курка',name:'Курка',unit:'кг',qty:2.8}]); state.currentUserId='c'; state.currentWarehouse='wC'; editingTransferId=state.transfers[0].id; view='transferReceive'; render(); }); await p.waitForTimeout(2500);
  await p.locator('input[inputmode="decimal"]').first().fill('2800'); await p.waitForTimeout(150);
  check('hint shown with fix button', await p.evaluate(()=>document.body.innerText.includes('Виправити на 2,8')));
  console.log(await p.evaluate(()=>JSON.stringify({u:state.currentUserId,own:isOwner(),pr:qtyProblem(2800,'кг',2.8)})));
  await p.locator('button:has-text("Підтвердити прийом")').click(); await p.waitForTimeout(200);
  console.log(await p.evaluate(()=>JSON.stringify(state.transfers[0].lines[0])));
  check('receive blocked', await p.evaluate(()=>state.transfers[0].status==='SENT'));
  await p.locator('button:has-text("Виправити на 2,8")').click(); await p.waitForTimeout(150);
  check('value auto-fixed', await p.evaluate(()=>document.querySelector('input[inputmode="decimal"]').value==='2,8'));
  await p.locator('button:has-text("Підтвердити прийом")').click(); await p.waitForTimeout(300);
  check('receive passes after fix', await p.evaluate(()=>state.transfers[0].status==='RECEIVED'));
  console.log(R.every(x=>x)?'ALL PASS':'SOME FAIL'); await b.close();
})();
