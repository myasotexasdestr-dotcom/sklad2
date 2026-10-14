const { chromium } = require('playwright'); const fs=require('fs');
(async()=>{
  const b=await chromium.launch(require('./_env').launchOpts); const p=await b.newPage({viewport:{width:390,height:1100}});
  p.on('pageerror',e=>console.log('PAGEERR',e.message)); p.on('dialog',d=>d.dismiss());
  await p.route('**://cdn.tailwindcss.com/**',r=>r.abort()); await p.route('**://fonts.g*/**',r=>r.abort()); await p.route('**://telegram.org/**',r=>r.abort());
  let version=1, data={locations:[{id:'L1',name:'ЦУМ'}],warehouses:[{id:'wC',name:'ЦУМ',locationId:'L1'}],staff:[{id:'o',name:'Власник',pin:'1111',role:'owner'}],currentLocation:'L1',currentWarehouse:'wC',defaultWarehouseId:'wC',
    stockItems:[{id:'k',warehouseId:'wC',name:'Кола 0.5',unit:'шт',qty:10,min:0,costPerUnit:10,category:'fastfood'},{id:'sp',warehouseId:'wC',name:'Спрайт 0.5',unit:'шт',qty:10,min:0,costPerUnit:10,category:'fastfood'},{id:'fa',warehouseId:'wC',name:'Фанта 0.5',unit:'шт',qty:10,min:0,costPerUnit:10,category:'fastfood'}],
    products:[{id:'pk',name:'Кола 0.5',type:'product',category:'fastfood',costPrice:10,price:30,ingredients:[],optionGroups:[],comboSlots:[]},{id:'psp',name:'Спрайт 0.5',type:'product',category:'fastfood',costPrice:10,price:30,ingredients:[],optionGroups:[],comboSlots:[]},{id:'pfa',name:'Фанта 0.5',type:'product',category:'fastfood',costPrice:10,price:30,ingredients:[],optionGroups:[],comboSlots:[]},
      {id:'cmb',name:'Комбо',type:'combo',category:'fastfood',costPrice:10,price:200,ingredients:[],optionGroups:[],comboSlots:[{id:'s1',label:'Напій',productIds:['pk','psp','pfa']}]}],
    recipeIngredients:[],ingredientStock:[],history:[],orders:[],sales:[],transfers:[],payouts:[],
    checkbox:{enabled:true,itemMap:{'c:1':'cmb'},registerMap:{},goodsSeen:{},stats:{applied:0,unmappedLines:0,unmappedRegisters:0}}};
  await p.route('**/api/**',async r=>{const req=r.request();const path=new URL(req.url()).pathname;const j=(s,o)=>r.fulfill({status:s,contentType:'application/json',body:JSON.stringify(o)});
    if(path==='/api/auth/login')return j(200,{staffId:JSON.parse(req.postData()||'{}').pin==='1111'?'o':'c'}); if(path.startsWith('/api/checkbox'))return j(200,{enabled:false,pending:0});
    if(path==='/api/state'&&req.method()==='GET')return j(200,{version,data}); if(path==='/api/state'){const bb=JSON.parse(req.postData());version++;data=bb.data;return j(200,{version});} return j(404,{});});
  await p.goto(require('./_env').HTML_URL);
  await p.addStyleTag({content:fs.readFileSync(require('./_env').CSS_PATH,'utf8')});
  await p.fill('#pinInput','1111'); await p.evaluate(()=>document.getElementById('loginBtn').click()); await p.waitForTimeout(1200);
  const R=[];const check=(n,ok)=>{R.push(ok);console.log((ok?'PASS ':'FAIL ')+n)};
  const q=(id)=>p.evaluate((id)=>state.stockItems.find(i=>i.id===id).qty,id);
  const rcpt=(id,goods)=>p.evaluate(([id,goods])=>{ applyCheckboxReceipt({id,ms:Date.now(),isReturn:false,fiscalCode:'',registerId:'',cashier:'',goods}); return true; },[id,goods]);
  const cmb={key:'c:1',code:'1',name:'Комбо',qty:1,sum:200,price:200};
  // 1) напій як додаток до рядка
  await rcpt('r1',[{...cmb,addons:[{name:'Спрайт 0.5',qty:1}]}]);
  check('add-on Спрайт: Спрайт -1, Кола не чіпали', await q('sp')===9 && await q('k')===10);
  // 2) напій окремим безкоштовним рядком
  await rcpt('r2',[cmb,{key:'c:99',code:'99',name:'фанта 0,5',qty:1,sum:0,price:0}]);
  check('нульовий рядок Фанта: Фанта -1', await q('fa')===9);
  check('нульовий рядок не списано вдруге і не унесений як unmapped', await p.evaluate(()=>{const o=state.orders.find(x=>x.checkboxId==='r2');return o.items.length===1 && state.checkbox.stats.unmappedLines===0;}));
  // 3) без підказок — перша позиція слота (Кола)
  await rcpt('r3',[cmb]);
  check('без підказок: перша позиція (Кола) -1', await q('k')===9);
  // 4) звичайний платний рядок не вважається вибором напою
  await rcpt('r4',[cmb,{key:'c:98',code:'98',name:'Спрайт 0.5',qty:1,sum:30,price:30}]);
  check('платний Спрайт окремо не підміняє вибір: Кола -1 (комбо) , Спрайт не списано (рядок не прив\'язаний)', await q('k')===8 && await q('sp')===9);
  console.log(R.every(Boolean)?'ALL PASS':'SOME FAIL'); await b.close();
})();
