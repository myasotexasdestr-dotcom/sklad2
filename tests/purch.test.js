const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch(require('./_env').launchOpts);
  const page = await browser.newPage({ viewport: { width: 390, height: 1400 } });
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  page.on('dialog', async d => { await d.dismiss(); });
  await page.route('**://cdn.tailwindcss.com/**', r => r.abort());
  await page.route('**://fonts.googleapis.com/**', r => r.abort());
  await page.route('**://fonts.gstatic.com/**', r => r.abort());
  await page.route('**://telegram.org/**', r => r.abort());

  let version = 1;
  let data = {
    locations: [{id:'loc1', name:'ЦУМ'}],
    warehouses: [{id:'whBase', name:'База'}, {id:'whTsum', name:'ЦУМ'}],
    defaultWarehouseId: 'whBase',
    staff: [{id:'prep1', name:'Заготівельник', pin:'1111', role:'prep', locationId:'loc1'},{id:'cash1', name:'Касир', pin:'2222', role:'cashier', locationId:'loc1'},{id:'own1', name:'Власник', pin:'0000', role:'owner', locationId:'loc1'}],
    currentLocation:'loc1',
    stockItems: [
      {id:'si1', warehouseId:'whBase', name:'Лаваш', unit:'шт', qty:100, min:10, costPerUnit:5, category:'fastfood'},
      {id:'si2', warehouseId:'whTsum', name:'Лаваш', unit:'шт', qty:20, min:10, costPerUnit:5, category:'fastfood'},
      {id:'si4', warehouseId:'whBase', name:'Сир', unit:'кг', qty:10, min:1, costPerUnit:300, category:'x'},
      {id:'si5', warehouseId:'whBase', name:'Майонез', unit:'кг', qty:0.4, min:1, costPerUnit:100, category:'x'},
      {id:'si3', warehouseId:'whBase', name:'Фарш', unit:'кг', qty:30, min:5, costPerUnit:200, category:'meat'}
    ],
    recipeIngredients:[{id:"ing1",isRecipe:true,name:"Соус сирний",unit:"г",yieldAmount:1000,warehouseId:null,components:[{id:"c1",productName:"Сир",unit:"кг",amount:0.5}]}], ingredientStock:[{id:"is1",warehouseId:"whBase",ingredientId:"ing1",qty:500}], history:[], sales:[], products:[], orders:[]
  };
  const sessions = {};
  await page.route('**/api/**', async (route) => {
    const req = route.request(); const path = new URL(req.url()).pathname; const method = req.method();
    const h = req.headers()['authorization'] || ''; const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    const json = (status, obj) => route.fulfill({status, contentType:'application/json', body: JSON.stringify(obj)});
    if(path==='/api/auth/login'){ const b = JSON.parse(req.postData()); const s = data.staff.find(x=>x.pin===b.pin); if(!s) return json(401,{error:'x'}); const t='tok'+Math.random(); sessions[t]=s.id; return json(200,{token:t, staffId:s.id}); }
    if(false) return json(401,{error:'x'});
    if(path==='/api/state' && method==='GET') return json(200,{version, data});
    if(path==='/api/state' && method==='PUT'){ const b = JSON.parse(req.postData()); if(b.version!==version) return json(409,{version,data}); version++; data=b.data; return json(200,{version}); }
    return route.fulfill({status:404, body:''});
  });

  await page.goto(require('./_env').HTML_URL);
  const css = fs.readFileSync(require('./_env').CSS_PATH,'utf8');
  await page.addStyleTag({content: css});
  await page.fill('#pinInput','2222');
  await page.click('#loginBtn'); await page.waitForTimeout(600);
  const results=[]; const check=(n,ok)=>{results.push(ok);console.log((ok?'PASS ':'FAIL ')+n)};




  await page.evaluate(()=>{ state.shiftSchedule=[]; startPurchaseFlow(); });
  await page.waitForTimeout(300);
  check('blocked without shift', (await page.evaluate(()=>view))!=='purchaseCreate');
  await page.evaluate(()=>{ document.querySelectorAll('button').forEach(b=>{ if(b.textContent.includes('Зрозуміло')) b.click(); }); state.locations.push({id:'loc2',name:'Інша'}); state.warehouses.push({id:'loc2',name:'Інша'},{id:'loc1',name:'ЦУМ'}); state.shiftSchedule.push({id:'s1',dateKey:dateKeyFromOffset(0),staffId:'cash1',locationId:'loc1'}); state.activeLocationId='loc2'; startPurchaseFlow(); });
  await page.waitForTimeout(300);
  check('allowed with shift', (await page.evaluate(()=>view))==='purchaseCreate');
  const t = await page.evaluate(()=>document.body.innerText);
  const cardTxt = await page.evaluate(()=>{const n=[...document.querySelectorAll('.card')].find(c=>c.previousElementSibling && c.previousElementSibling.textContent.includes('Зараховуємо'));return n?n.textContent.trim():null;}); console.log(cardTxt); check('warehouse = ЦУМ', cardTxt==='ЦУМ');
  console.log(results.every(x=>x)?'ALL PASS':'SOME FAIL');
  await browser.close();
})();
