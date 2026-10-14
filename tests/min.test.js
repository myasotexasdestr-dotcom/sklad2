const { chromium } = require('playwright'); const fs=require('fs');
(async()=>{
  const b=await chromium.launch(require('./_env').launchOpts); const p=await b.newPage({viewport:{width:390,height:1100}});
  p.on('pageerror',e=>console.log('PAGEERR',e.message)); p.on('dialog',d=>d.dismiss());
  await p.route('**://cdn.tailwindcss.com/**',r=>r.abort()); await p.route('**://fonts.g*/**',r=>r.abort()); await p.route('**://telegram.org/**',r=>r.abort());
  let version=1, data={locations:[{id:'L1',name:'ЦУМ'}],warehouses:[{id:'wBase',name:'База'}],staff:[{id:'o',name:'Власник',pin:'1111',role:'owner',locationId:'L1'}],
    stockItems:[{id:'m1',warehouseId:'wBase',name:'Курка',unit:'кг',qty:1,min:10,costPerUnit:5,category:'meat'},{id:'f1',warehouseId:'wBase',name:'Лаваш',unit:'шт',qty:2,min:10,costPerUnit:5,category:'fastfood'}],
    recipeIngredients:[],ingredientStock:[],history:[],products:[],orders:[],sales:[],transfers:[],payouts:[]};
  await p.route('**/api/**',async r=>{const req=r.request();const path=new URL(req.url()).pathname;const j=(s,o)=>r.fulfill({status:s,contentType:'application/json',body:JSON.stringify(o)});
    if(path==='/api/auth/login')return j(200,{staffId:'o'}); if(path.startsWith('/api/checkbox'))return j(200,{enabled:false,pending:0});
    if(path==='/api/state'&&req.method()==='GET')return j(200,{version,data}); if(path==='/api/state'){const bb=JSON.parse(req.postData());version++;data=bb.data;return j(200,{version});} return j(404,{});});
  await p.goto(require('./_env').HTML_URL);
  await p.addStyleTag({content:fs.readFileSync(require('./_env').CSS_PATH,'utf8')});
  await p.fill('#pinInput','1111'); await p.evaluate(()=>document.getElementById('loginBtn').click()); await p.waitForTimeout(1200);
  const R=[];const check=(n,ok)=>{R.push(ok);console.log((ok?'PASS ':'FAIL ')+n)};
  check('migration zeroed meat min, fastfood kept', await p.evaluate(()=>state.stockItems.find(i=>i.id==='m1').min===0 && state.stockItems.find(i=>i.id==='f1').min===10));
  check('meat never low; fastfood low', await p.evaluate(()=>!itemIsLow(state.stockItems[0]) && itemIsLow(state.stockItems[1])));
  check('lowStockFor only fastfood', await p.evaluate(()=>{const l=lowStockFor('wBase');return l.length===1&&l[0].id==='f1'}));
  check('notifications: one grouped low-stock alert, only fastfood', await p.evaluate(()=>{const l=computeNotifications().filter(n=>n.id.startsWith('lowstock-'));return l.length===1 && l[0].id.endsWith('-f1') && l[0].title.includes('1 поз.');}));
  await p.evaluate(()=>{ state.currentWarehouse='wBase'; view='stock'; stockSubview='stock'; render(); }); await p.waitForTimeout(300);
  const t=await p.evaluate(()=>document.body.innerText);
  check('stock list: meat row has no "мін"/"мало", fastfood has', /Курка[\s\S]{0,60}1 кг(?![\s\S]{0,12}мало)/.test(t) && t.includes('Лаваш'));
  await p.evaluate(()=>{ editingStockItemId=null; view='stockItemAdd'; render(); }); await p.waitForTimeout(300);
  let vis=await p.evaluate(()=>document.body.innerText.includes('Мінімальний залишок'));
  check('add form default (meat): no min field', vis===false);
  await p.locator('button:has-text("Фастфуд")').first().click(); await p.waitForTimeout(200);
  check('switch to fastfood shows min field', await p.evaluate(()=>[...document.querySelectorAll('div')].some(d=>d.offsetParent!==null && d.innerText && d.innerText.startsWith('Мінімальний залишок'))));
  await p.locator('button:has-text("М\'ясо з Техасу")').first().click(); await p.waitForTimeout(200);
  check('back to meat hides it', await p.evaluate(()=>![...document.querySelectorAll('div')].some(d=>d.offsetParent!==null && d.innerText && d.innerText.startsWith('Мінімальний залишок'))));
  await p.evaluate(()=>{ addStockItem('Свинина','кг',3,7,5,false,'meat'); addStockItem('Соус','шт',1,4,5,false,'fastfood'); });
  check('addStockItem forces meat min 0', await p.evaluate(()=>state.stockItems.find(i=>i.name==='Свинина').min===0 && state.stockItems.find(i=>i.name==='Соус').min===4));
  console.log(R.every(x=>x)?'ALL PASS':'SOME FAIL'); await b.close();
})();
