const { chromium } = require('playwright'); const fs=require('fs');
(async()=>{
  const b=await chromium.launch(require('./_env').launchOpts); const p=await b.newPage({viewport:{width:390,height:900}});
  p.on('pageerror',e=>console.log('PAGEERR',e.message)); p.on('dialog',d=>d.dismiss());
  await p.route('**://cdn.tailwindcss.com/**',r=>r.abort()); await p.route('**://fonts.g*/**',r=>r.abort()); await p.route('**://telegram.org/**',r=>r.abort());
  const d=new Date(); const dk=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); const now=Date.now();
  const oldDk='2000-01-01';
  const prodBurger={id:'pB',name:'Бургер',category:'fastfood',type:'dish',ingredients:[{ingredientId:'i1',name:'Борошно',unit:'кг',amount:0.5,cost:10}],costPrice:10,price:100,optionGroups:[],comboSlots:[],recipeVersion:1,recipeHistory:[]};
  const prodCola={id:'pC',name:'Кола',category:'fastfood',type:'product',ingredients:[],costPrice:20,price:50,optionGroups:[],comboSlots:[],recipeVersion:1,recipeHistory:[]};
  const prodSteak={id:'pS',name:'Стейк',category:'meat',type:'dish',ingredients:[{ingredientId:'i1',name:'Борошно',unit:'кг',amount:0.1,cost:2}],costPrice:2,price:300,optionGroups:[],comboSlots:[],recipeVersion:1,recipeHistory:[]};
  let version=1, data={locations:[{id:'L1',name:'ЦУМ'}],warehouses:[{id:'wBase',name:'База'},{id:'wCum',name:'ЦУМ'}],staff:[{id:'o',name:'Власник',pin:'1111',role:'owner',locationId:'L1'}],
    stockItems:[{id:'f1',warehouseId:'wCum',name:'Борошно',unit:'кг',qty:10,min:0,costPerUnit:2},{id:'c1',warehouseId:'wCum',name:'Кола',unit:'шт',qty:9,min:0,costPerUnit:2}],
    recipeIngredients:[{id:'i1',name:'Борошно',unit:'кг',yieldAmount:1,components:[{id:'c',productName:'Борошно',unit:'кг',amount:1}],warehouseId:null}],ingredientStock:[],
    history:[{id:'h1',stockItemId:'c1',name:'Кола',unit:'шт',delta:-1,reason:'Продаж',ts:'x',tsMs:now,warehouseId:'wCum',who:'Checkbox',orderRef:'R1'}],
    products:[prodBurger,prodCola,prodSteak],transfers:[],payouts:[],
    checkbox:{registerMap:{},itemMap:{'n:бургер чб':'pB','n:стейк чб':'pS','c:cola':'pC'},goodsSeen:{'n:бургер чб':{name:'Бургер ЧБ',price:100},'n:стейк чб':{name:'Стейк ЧБ',price:300},'c:cola':{name:'Кола',code:'cola',price:50}},stats:{applied:1,unmappedLines:2,unmappedRegisters:0}},
    orders:[{id:'o1',checkboxId:'R1',locationId:'L1',category:'fastfood',dateKey:dk,tsMs:now,ts:'x',who:'Checkbox',comment:'Checkbox',total:350,
      items:[{id:'a',name:'Кола',checkboxName:'Кола',checkboxKey:'c:cola',price:50,qty:1,productId:'pC',productType:'product',category:'fastfood',costPriceSnapshot:20,recipeSnapshot:[]},
             {id:'b',name:'Бургер ЧБ',checkboxName:'Бургер ЧБ',checkboxKey:'n:бургер чб',price:100,qty:2,productId:null,productType:'unmapped',unmapped:true,category:null,costPriceSnapshot:0,recipeSnapshot:[]},
             {id:'c',name:'Стейк ЧБ',checkboxName:'Стейк ЧБ',price:300,qty:1,productId:null,productType:'unmapped',unmapped:true,category:null,costPriceSnapshot:0,recipeSnapshot:[]}],consumption:[{name:'Кола',unit:'шт',delta:-1}]},
            {id:'oldo',checkboxId:'R0',locationId:'L1',category:'fastfood',dateKey:oldDk,tsMs:1,ts:'x',who:'Checkbox',total:100,items:[{id:'z',name:'Х',checkboxName:'Бургер ЧБ',price:100,qty:1,productId:null,productType:'unmapped',unmapped:true}]}],
    sales:[{id:'s1',locationId:'L1',category:'fastfood',amount:350,dateKey:dk,tsMs:now,ts:'x',who:'Checkbox',checkboxId:'R1'}]};
  await p.route('**/api/**',async r=>{const req=r.request();const path=new URL(req.url()).pathname;const j=(s,o)=>r.fulfill({status:s,contentType:'application/json',body:JSON.stringify(o)});
    if(path==='/api/auth/login')return j(200,{staffId:'o'}); if(path.startsWith('/api/checkbox'))return j(200,{enabled:false,pending:0});
    if(path==='/api/state'&&req.method()==='GET')return j(200,{version,data}); if(path==='/api/state'){const bb=JSON.parse(req.postData());version++;data=bb.data;return j(200,{version});} return j(404,{});});
  await p.goto(require('./_env').HTML_URL);
  await p.addStyleTag({content:fs.readFileSync(require('./_env').CSS_PATH,'utf8')});
  await p.fill('#pinInput','1111'); await p.evaluate(()=>document.getElementById('loginBtn').click()); await p.waitForTimeout(1500);
  const R=[];const check=(n,ok)=>{R.push(ok);console.log((ok?'PASS ':'FAIL ')+n)};
  const st=await p.evaluate(()=>({orders:state.orders.filter(o=>o.checkboxId&&o.checkboxId.startsWith('R1')).map(o=>({id:o.checkboxId,cat:o.category,total:o.total,items:o.items.map(l=>l.name+':'+l.qty+':'+(l.unmapped?'U':'M')),cons:(o.consumption||[]).length})),
    flour:stockRowByName('Борошно','wCum').qty, cola:stockRowByName('Кола','wCum').qty, sales:state.sales.filter(x=>String(x.checkboxId).startsWith('R1')).map(x=>x.category+':'+x.amount), hist:state.history.filter(h=>String(h.orderRef||'').startsWith('R1')).map(h=>h.name+':'+h.delta), old:state.orders.find(o=>o.id==='oldo').items[0].unmapped}));
  console.log(JSON.stringify(st));
  check('split into fastfood + meat orders', st.orders.length===2 && st.orders.some(o=>o.cat==='meat'&&o.total===300) && st.orders.some(o=>o.cat==='fastfood'&&o.total===250));
  check('no unmapped lines left', st.orders.every(o=>o.items.every(i=>i.endsWith(':M'))));
  check('flour 10 - (2*0.5 + 0.1) = 8.9', Math.abs(st.flour-8.9)<1e-6);
  check('cola net unchanged 9 (reversed & reapplied)', st.cola===9);
  check('history rebuilt without duplicates (cola, flour x2)', st.hist.length===3 && st.hist.filter(x=>x.startsWith('Кола')).length===1);
  check('sales rebuilt by category totals 300+250', st.sales.length===2 && st.sales.includes('meat:300') && st.sales.includes('fastfood:250'));
  check('old-day receipt untouched', st.old===true);
  check('idempotent second run', await p.evaluate(()=>reprocessCheckboxToday())===0 && (await p.evaluate(()=>stockRowByName('Борошно','wCum').qty))===8.9 || Math.abs((await p.evaluate(()=>stockRowByName('Борошно','wCum').qty))-8.9)<1e-6);
  console.log(R.every(x=>x)?'ALL PASS':'SOME FAIL'); await b.close();
})();
