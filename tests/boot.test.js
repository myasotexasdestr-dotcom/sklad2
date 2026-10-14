const { chromium } = require('playwright'); const fs=require('fs');
(async()=>{
  const b=await chromium.launch(require('./_env').launchOpts);
  const R=[];const check=(n,ok)=>{R.push(ok);console.log((ok?'PASS ':'FAIL ')+n)};
  const data0=()=>({locations:[{id:'L1',name:'ЦУМ'}],warehouses:[{id:'wBase',name:'База'},{id:'L1',name:'ЦУМ'}],
    staff:[{id:'o',name:'Власник',pin:'1111',role:'owner',locationId:'L1'},{id:'c',name:'Касир',pin:'2222',role:'cashier',locationId:'L1'},{id:'pp',name:'Заг',pin:'3333',role:'prep',locationId:'L1'},{id:'ck',name:'Кухар',pin:'4444',role:'cook',locationId:'L1'}],
    shiftSchedule:[],stockItems:[],recipeIngredients:[],ingredientStock:[],history:[],products:[],orders:[],sales:[],transfers:[],payouts:[]});
  for(const [pin,label,expect] of [['1111','owner','Огляд'],['2222','cashier','Швидкі дії'],['3333','prep',''],['4444','cook','']]){
    const p=await b.newPage({viewport:{width:390,height:900}});
    p.on('pageerror',e=>console.log('PAGEERR',e.message)); p.on('dialog',d=>d.dismiss());
    await p.route('**://cdn.tailwindcss.com/**',r=>r.abort()); await p.route('**://fonts.g*/**',r=>r.abort()); await p.route('**://telegram.org/**',r=>r.abort());
    let version=1, data=data0(); let cookie=false;
    await p.route('**/api/**',async r=>{const req=r.request();const path=new URL(req.url()).pathname;const j=(s,o)=>r.fulfill({status:s,contentType:'application/json',body:JSON.stringify(o)});
      if(path==='/api/auth/login'){const bb=JSON.parse(req.postData());const s=data.staff.find(x=>x.pin===bb.pin);return s?j(200,{staffId:s.id}):j(401,{});} if(path.startsWith('/api/checkbox'))return j(200,{enabled:false,pending:0});
      if(path==='/api/state'&&req.method()==='GET')return j(200,{version,data}); if(path==='/api/state'){const bb=JSON.parse(req.postData());version++;data=bb.data;return j(200,{version});} return j(404,{});});
    await p.goto(require('./_env').HTML_URL);
    await p.addStyleTag({content:fs.readFileSync(require('./_env').CSS_PATH,'utf8')});
    await p.fill('#pinInput',pin); await p.evaluate(()=>document.getElementById('loginBtn').click()); await p.waitForTimeout(1000);
    const t1=await p.evaluate(()=>document.getElementById('app')?document.getElementById('app').innerText.length:document.body.innerText.length);
    // reload: session restored from cookie flag in localStorage
    await p.evaluate(()=>{ view='settings'; });
    await p.reload(); await p.addStyleTag({content:fs.readFileSync(require('./_env').CSS_PATH,'utf8')}); await p.waitForTimeout(1200);
    const info=await p.evaluate(()=>({view, len:document.body.innerText.length, txt:document.body.innerText.slice(0,80).replace(/\n+/g,' | ')}));
    console.log(label, JSON.stringify(info));
    check(label+': after reload non-empty page, view='+info.view, info.len>100 && info.view!=='settings' || label==='owner');
    await p.close();
  }
  console.log(R.every(x=>x)?'ALL PASS':'SOME FAIL'); await b.close();
})();
