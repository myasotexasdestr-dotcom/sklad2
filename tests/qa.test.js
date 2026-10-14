const { chromium } = require('playwright'); const fs=require('fs');
(async()=>{
  const b=await chromium.launch(require('./_env').launchOpts);
  const R=[];const check=(n,ok)=>{R.push(ok);console.log((ok?'PASS ':'FAIL ')+n)};
  for(const who of ['owner','cashier']){
    const p=await b.newPage({viewport:{width:390,height:900}}); p.on('pageerror',e=>console.log('PAGEERR',e.message));
    await p.route('**://cdn.tailwindcss.com/**',r=>r.abort()); await p.route('**://fonts.g*/**',r=>r.abort()); await p.route('**://telegram.org/**',r=>r.abort());
    const dk=(()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')})();
    let version=1, data={locations:[{id:'loc1',name:'ЦУМ'}],warehouses:[{id:'loc1',name:'ЦУМ'}],staff:[{id:'o',name:'Власник',pin:'1234',role:'owner',locationId:'loc1'},{id:'c',name:'Касир',pin:'4321',role:'cashier',locationId:'loc1'}],stockItems:[],recipeIngredients:[],history:[],sales:[],orders:[],products:[],shiftSchedule:[{id:'s',dateKey:dk,staffId:'c',locationId:'loc1'}]};
    await p.route('**/api/**',async r=>{const req=r.request();const path=new URL(req.url()).pathname;const j=(s,o)=>r.fulfill({status:s,contentType:'application/json',body:JSON.stringify(o)});
      if(path==='/api/auth/login')return j(200,{token:'t',staffId:who==='owner'?'o':'c'}); if(path.startsWith('/api/checkbox'))return j(200,{enabled:false,pending:0});
      if(path==='/api/state'&&req.method()==='GET')return j(200,{version,data}); if(path==='/api/state'){const bb=JSON.parse(req.postData());version++;data=bb.data;return j(200,{version});} return j(404,{});});
    await p.goto(require('./_env').HTML_URL);
    await p.addStyleTag({content:fs.readFileSync(require('./_env').CSS_PATH,'utf8')});
    await p.fill('#pinInput',who==='owner'?'1234':'4321'); await p.click('#loginBtn'); await p.waitForTimeout(900);
    const t=await p.evaluate(()=>document.body.innerText);
    check(who+' home has Glovo quick action', t.includes('Швидкі дії') && t.includes('Glovo'));
    if(who==='owner') check('owner: no Склад quick action', !(await p.evaluate(()=>[...document.querySelectorAll('.qa span:last-child')].map(x=>x.textContent).includes('Склад'))));
    await p.screenshot({path:'qa_'+who+'.png'});
    await p.locator('.qa:has-text("Glovo")').first().click(); await p.waitForTimeout(300);
    check(who+' opens Glovo view', (await p.evaluate(()=>view))==='glovo');

    await p.close();
  }
  console.log(R.every(x=>x)?'ALL PASS':'SOME FAIL'); await b.close();
})();
