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
    staff: [{id:'prep1', name:'Заготівельник', pin:'1111', role:'prep', locationId:'loc1'},{id:'own1', name:'Власник', pin:'0000', role:'owner', locationId:'loc1'}],
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
  await page.fill('#pinInput','0000');
  await page.click('#loginBtn'); await page.waitForTimeout(600);
  const results=[]; const check=(n,ok)=>{results.push(ok);console.log((ok?'PASS ':'FAIL ')+n)};



  await page.evaluate(()=>{
    const today = dateKeyFromOffset(0);
    state.orders.push(
      {id:'o1', locationId:'loc1', category:'fastfood', items:[
        {id:'l1', productId:'p1', name:'Шаурма', price:100, qty:3, productType:'product', costPriceSnapshot:40},
        {id:'l2', productId:'p2', name:'Бургер', price:150, qty:2, productType:'dish', recipeSnapshot:[{cost:30},{cost:20}], optionsCostSnapshot:5}
      ], total:600, ts:'x', dateKey:today, who:'t'},
      {id:'o2', locationId:'loc1', category:'fastfood', items:[{id:'l3', productId:'p1', name:'Шаурма', price:100, qty:1, productType:'product', costPriceSnapshot:40}], total:100, ts:'x', dateKey:dateKeyFromOffset(3), who:'t'},
      {id:'o3', locationId:'other', category:'fastfood', items:[{id:'l4', productId:'p1', name:'Шаурма', price:999, qty:1, productType:'product', costPriceSnapshot:1}], total:999, ts:'x', dateKey:today, who:'t'}
    );
    view='dashboard'; render();
  });
  // today: revenue 3*100+2*150=600; cost 3*40 + 2*(50+5)=120+110=230 => profit 370
  const lp = await page.evaluate(()=>locationProfit('loc1', o=>o.dateKey===dateKeyFromOffset(0)));
  check('profit today = 600-230 = 370', lp.revenue===600 && lp.cost===230 && lp.profit===370);
  const lpAll = await page.evaluate(()=>locationProfit('loc1'));
  check('other locations excluded; all-time 700-270=430', lpAll.revenue===700 && lpAll.profit===430);
  await page.waitForTimeout(250); await page.addStyleTag({content: css});
  let t = await page.locator('body').innerText();
  check('dashboard card shows Профіт', t.includes('Профіт'));
  check('dashboard shows 370', t.replace(/\s/g,'').includes('370'));
  await page.evaluate(()=>{ analyticsPeriod=7; view='analytics'; render(); });
  await page.waitForTimeout(250); await page.addStyleTag({content: css});
  t = await page.locator('body').innerText();
  check('analytics block present', t.includes('Чистий прибуток по локаціях') && t.includes('продажі') && t.includes('собівартість'));
  check('analytics 7d: +430', t.replace(/\s/g,'').includes('+430'));
  await page.evaluate(()=>{ analyticsPeriod=1; render(); });
  await page.waitForTimeout(200);
  t = await page.locator('body').innerText();
  check('analytics today: +370', t.replace(/\s/g,'').includes('+370'));
  await page.screenshot({path:'profit.png', fullPage:true});
  await browser.close();
  console.log(results.every(Boolean)?'ALL PASSED':'SOME FAILED');
})();
