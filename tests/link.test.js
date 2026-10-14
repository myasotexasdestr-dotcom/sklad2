const { chromium } = require('playwright'); const fs=require('fs');
(async()=>{
  const b=await chromium.launch(require('./_env').launchOpts); const p=await b.newPage({viewport:{width:390,height:900}});
  p.on('pageerror',e=>console.log('PAGEERR',e.message)); p.on('dialog',d=>d.dismiss());
  await p.route('**://cdn.tailwindcss.com/**',r=>r.abort()); await p.route('**://fonts.g*/**',r=>r.abort()); await p.route('**://telegram.org/**',r=>r.abort());
  let version=1, data={locations:[{id:'loc1',name:'ЦУМ'}],warehouses:[{id:'base',name:'База'},{id:'loc1',name:'ЦУМ'}],staff:[{id:'o',name:'Власник',pin:'1234',role:'owner',locationId:'loc1'}],
    stockItems:[{id:'f1',warehouseId:'loc1',name:'Борошно',unit:'кг',qty:10,min:1,costPerUnit:20,category:'fastfood'},{id:'f0',warehouseId:'base',name:'Борошно',unit:'кг',qty:50,min:1,costPerUnit:20,category:'fastfood'}],
    recipeIngredients:[{id:'i1',name:'Борошно',unit:'кг',yieldAmount:1,components:[{id:'c',productName:'Борошно',unit:'кг',amount:1}],warehouseId:null},
                       {id:'i2',name:'Соус',unit:'л',yieldAmount:1,isRecipe:true,components:[{id:'c2',productName:'Борошно',unit:'кг',amount:1}],warehouseId:null}],
    ingredientStock:[{id:'r1',warehouseId:'loc1',ingredientId:'i1',qty:3},{id:'r2',warehouseId:'loc1',ingredientId:'i2',qty:4}],history:[],sales:[],orders:[],products:[]};
  await p.route('**/api/**',async r=>{const req=r.request();const path=new URL(req.url()).pathname;const j=(s,o)=>r.fulfill({status:s,contentType:'application/json',body:JSON.stringify(o)});
    if(path==='/api/auth/login')return j(200,{staffId:'o'}); if(path.startsWith('/api/checkbox'))return j(200,{enabled:false,pending:0});
    if(path==='/api/state'&&req.method()==='GET')return j(200,{version,data}); if(path==='/api/state'){const bb=JSON.parse(req.postData());version++;data=bb.data;return j(200,{version});} return j(404,{});});
  await p.goto(require('./_env').HTML_URL);
  await p.addStyleTag({content:fs.readFileSync(require('./_env').CSS_PATH,'utf8')});
  await p.fill('#pinInput','1234'); await p.click('#loginBtn'); await p.waitForTimeout(800);
  const R=[];const check=(n,ok)=>{R.push(ok);console.log((ok?'PASS ':'FAIL ')+n)};
  check('migration drops linked ingredientStock, keeps recipe', await p.evaluate(()=>state.ingredientStock.length===1&&state.ingredientStock[0].ingredientId==='i2'));
  check('linked qty reads product stock', await p.evaluate(()=>ingredientQtyAt('i1','loc1')===10 && ingredientQtyAt('i1','base')===50));
  await p.evaluate(()=>{ applySaleConsumption([{productType:'dish',qty:2,recipeSnapshot:[{ingredientId:'i1',name:'Борошно',unit:'кг',amount:0.5},{ingredientId:'i2',name:'Соус',unit:'л',amount:1}]}],'loc1'); });
  check('sale decrements product stock 10→9', await p.evaluate(()=>stockRowByName('Борошно','loc1').qty===9));
  check('recipe ingredient still own stock 4→2', await p.evaluate(()=>ingredientQtyAt('i2','loc1')===2));
  await p.evaluate(()=>{ recordPurchase('loc1',[{kind:'product',name:'Борошно',unit:'кг',qty:5,costPerUnit:20,category:'fastfood'}]); });
  check('purchase of product visible via ingredient 9→14', await p.evaluate(()=>ingredientQtyAt('i1','loc1')===14));
  await p.evaluate(()=>{ const t=createTransfer('base','loc1',[{ingredientId:'i1',name:'Борошно',unit:'кг',qty:20}]); receiveTransfer(t.id,[{ingredientId:'i1',qty:20}]); });
  check('transfer moves raw product base 50→30, loc 14→34', await p.evaluate(()=>stockRowByName('Борошно','base').qty===30 && stockRowByName('Борошно','loc1').qty===34));
  check('purchase list has no linked ingredient dup', await p.evaluate(()=>purchaseCandidates().filter(c=>c.name==='Борошно').length===1));
  check('history has sale row linked to product', await p.evaluate(()=>state.history.some(h=>h.stockItemId==='f1'&&h.reason==='Продаж')));
  console.log(R.every(x=>x)?'ALL PASS':'SOME FAIL'); await b.close();
})();
