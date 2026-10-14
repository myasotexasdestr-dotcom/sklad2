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
    recipeIngredients:[{id:'m1',name:'7up',unit:'шт',yieldAmount:1,warehouseId:null,components:[{id:'x',productName:'7up',unit:'шт',amount:1}]},{id:'ing1',isRecipe:true,name:'Соус сирний',unit:'г',yieldAmount:1000,warehouseId:null,components:[{id:'c1',productName:'Сир',unit:'кг',amount:0.5},{id:'c2',productName:'Майонез',unit:'кг',amount:0.6}]}], ingredientStock:[], history:[], sales:[], products:[], orders:[]
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
  await page.click('#loginBtn');
  await page.waitForTimeout(500);

  const results = [];
  const check = (name, ok) => { results.push(ok); console.log((ok?'PASS ':'FAIL ')+name); };

  await page.evaluate(()=>{ state.allowNegativeStock=false; state.currentWarehouse='whBase'; view='ingredients'; render(); });
  await page.waitForTimeout(200);
  await page.addStyleTag({content: css});
  check('Приготувати button present', (await page.locator('[data-prep]').count())===1);
  await page.click('[data-prep]');
  await page.waitForTimeout(200);
  await page.addStyleTag({content: css});
  let t = await page.locator('body').innerText();
  check('prepare view opens', t.includes('Заготовка: Соус сирний') && t.includes('Скільки чого взято'));
  const ins = page.locator('input[inputmode="decimal"]');
  check('3 inputs (out + 2 components)', (await ins.count())===3);
  check('prefilled 1000/0.5/0.6', (await ins.nth(0).inputValue())==='1000' && (await ins.nth(1).inputValue())==='0.5' && (await ins.nth(2).inputValue())==='0.6');
  check('shortage flagged for Майонез', t.includes('не вистачає'));
  // Insufficient stock -> no change
  await page.click('text=Приготувати >> nth=-1');
  await page.waitForTimeout(300);
  let q = await page.evaluate(()=>({sir:state.stockItems.find(i=>i.id==='si4').qty, may:state.stockItems.find(i=>i.id==='si5').qty, ing:state.ingredientStock.length, prep:state.preparations.length}));
  check('blocked on shortage: nothing changed', q.sir===10 && q.may===0.4 && q.ing===0 && q.prep===0);
  check('shortage alert shown', (await page.locator('body').innerText()).includes('Не вистачає на складі'));
  await page.click('text=Зрозуміло');
  await page.waitForTimeout(200);
  // Scale output to 500 -> comps scale to 0.25 / 0.3
  await ins.nth(0).fill('500');
  check('scaled 0.25/0.3', (await ins.nth(1).inputValue())==='0.25' && (await ins.nth(2).inputValue())==='0.3');
  await ins.nth(1).fill('0.3');
  await ins.nth(0).fill('400');
  check('touched field stays 0.3, untouched rescales', (await ins.nth(1).inputValue())==='0.3' && (await ins.nth(2).inputValue())==='0.24');
  await ins.nth(0).fill('500');
  await ins.nth(2).fill('0.3');
  await page.click('button:has-text("Приготувати") >> nth=-1');
  await page.waitForTimeout(900);
  q = await page.evaluate(()=>({sir:state.stockItems.find(i=>i.id==='si4').qty, may:state.stockItems.find(i=>i.id==='si5').qty, out:ingredientQtyAt('ing1','whBase'), prep:state.preparations.length, view, hist:state.history.filter(h=>/Заготовка/.test(h.reason)).length, audit:state.auditLog.some(a=>a.type==='preparation')}));
  check('Сир 10 -> 9.7', q.sir===9.7);
  check('Майонез 0.4 -> 0.1', Math.abs(q.may-0.1)<1e-9);
  check('соус +500', q.out===500);
  check('record+history+audit', q.prep===1 && q.hist===3 && q.audit);
  check('returned to ingredients list', q.view==='ingredients');
  const srv = data.preparations && data.preparations.length===1 && data.ingredientStock.length===1;
  check('persisted to server', !!srv);
  t = await page.locator('body').innerText();
  check('list shows Наявно: 500 г', t.includes('Наявно: 500'));

  await page.evaluate(()=>{ state.stockItems.find(i=>i.id==='si5').qty=5; view='settings'; render(); });
  await page.waitForTimeout(200);
  await page.addStyleTag({content: css});
  await page.evaluate(()=>{ settingsMoreOpen=true; render(); }); await page.waitForTimeout(200);
  t = await page.locator('body').innerText();
  check('settings has Нова заготовка + Рецепти', t.includes('Нова заготовка') && t.includes('Рецепти'));
  await page.click('text=Нова заготовка');
  await page.waitForTimeout(200);
  await page.addStyleTag({content: css});
  t = await page.locator('body').innerText();
  check('picker step shown', t.includes('Оберіть рецепт') && t.includes('Соус сирний'));
  await page.click('button:has-text("Далі")');
  await page.waitForTimeout(200);
  await page.addStyleTag({content: css});
  const ins2 = page.locator('input[inputmode="decimal"]');
  check('recipe pulled: 3 inputs, prefilled', (await ins2.count())===3 && (await ins2.nth(1).inputValue())==='0.5');
  await ins2.nth(0).fill('2000');
  check('scaled x2', (await ins2.nth(1).inputValue())==='1' && (await ins2.nth(2).inputValue())==='1.2');
  await page.click('button:has-text("Приготувати") >> nth=-1');
  await page.waitForTimeout(900);
  q = await page.evaluate(()=>({out:ingredientQtyAt('ing1','whBase'), view, n:state.preparations.length}));
  check('second prep via picker: 2500 total, back to settings', q.out===2500 && q.view==='settings' && q.n===2);

  await page.evaluate(()=>{ view='ingredients'; render(); });
  await page.waitForTimeout(200);
  t = await page.locator('body').innerText();
  check('recipe list shows no product names', !t.includes('Сир, Майонез') && t.includes('Соус сирний'));
  await page.evaluate(()=>{ view='productionStart'; render(); });
  await page.waitForTimeout(200);
  await page.addStyleTag({content: css});
  check('Нова готовка has recipe button', (await page.locator('button:has-text("Приготувати за рецептом")').count())===1);
  await page.click('button:has-text("Приготувати за рецептом")');
  await page.waitForTimeout(200);
  t = await page.locator('body').innerText();
  check('opens recipe picker', t.includes('Оберіть рецепт'));

  await page.evaluate(()=>{ view='ingredients'; render(); });
  await page.waitForTimeout(200);
  t = await page.locator('body').innerText();
  check('1:1 ingredient 7up hidden from recipes', !t.includes('7up') && t.includes('Соус сирний'));
  await page.evaluate(()=>{ preparingIngredientId=null; view='ingredientPrepare'; render(); });
  await page.waitForTimeout(200);
  await page.addStyleTag({content: css});
  t = await page.locator('body').innerText();
  check('picker lists only recipe', !t.includes('7up') && t.includes('Соус сирний'));

  // create recipe via form -> flagged and visible
  await page.evaluate(()=>{ editingIngredientId=null; view='ingredientAdd'; render(); });
  await page.waitForTimeout(200);
  await page.addStyleTag({content: css});
  await page.locator('input[placeholder="Наприклад, Соус часниковий"]').fill('Соус часниковий');
  await page.evaluate(()=>{});
  await page.locator('input[placeholder="Кількість"]').fill('0.2');
  await page.click('button:has-text("Додати")');
  await page.locator('input[placeholder="1"]').fill('500');
  await page.click('button:has-text("Зберегти")');
  await page.waitForTimeout(900);
  const fl = await page.evaluate(()=>{ const r=state.recipeIngredients.find(i=>i.name==='Соус часниковий'); return r && r.isRecipe===true; });
  check('new recipe flagged isRecipe', !!fl);
  t = await page.locator('body').innerText();
  check('new recipe visible, 7up hidden', t.includes('Соус часниковий') && !t.includes('7up'));

  // ---- Prep role: only prepare, no create/edit/delete ----
  await page.evaluate(()=>{ state.currentUserId='prep1'; state.currentWarehouse='whBase'; view='ingredients'; render(); });
  await page.waitForTimeout(250);
  await page.addStyleTag({content: css});
  t = await page.locator('body').innerText();
  check('prep sees recipe list', t.includes('Соус сирний') && !t.includes('7up'));
  check('prep: no add-recipe button', !t.includes('Додати рецепт'));
  check('prep: no delete buttons', (await page.locator('[data-del]').count())===0);
  check('prep: has Приготувати + Нова заготовка', (await page.locator('[data-prep]').count())>=1 && t.includes('Нова заготовка'));
  await page.locator('text=Соус сирний').first().click();
  await page.waitForTimeout(200);
  check('prep: row click does not open editor', (await page.evaluate(()=>view))==='ingredients');
  await page.evaluate(()=>{ state.currentUserId=null; });
  await page.screenshot({path:'prep.png', fullPage:true});
  await browser.close();
  console.log(results.every(Boolean) ? 'ALL PASSED' : 'SOME FAILED');
})();
