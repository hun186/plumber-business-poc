'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const os=require('node:os'),path=require('node:path'),fs=require('node:fs');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'plumber-test-'));
process.env.SQLITE_PATH=path.join(directory,'poctest.sqlite');
process.env.APP_ADMIN_PASSWORD='test-only-not-production';
process.env.AUTH_SECRET='a-very-long-test-only-secret-at-least-thirty-two-characters';
delete process.env.VERCEL;
const {connection,snapshot}=require('../lib/sqlite');
const {mutate}=require('../api/data')._test;
const reports=require('../reports');
const xlsx=require('../xlsx-lite');
const server=require('../server');
const sample={customers:[{id:'c1',name:'大明水電'}],projects:[
{id:'p1',customerId:'c1',title:'修馬桶',type:'維修保養',status:'已完工',startDate:'2026-08-12',amount:10000},
{id:'p2',customerId:'c1',title:'辦公室配電',type:'電力工程',status:'施工中',startDate:'2026-09-02',amount:20000},
{id:'p3',customerId:'c1',title:'取消的專案',type:'電力工程',status:'已取消',startDate:'2026-09-02',amount:99999}],
 costs:[{id:'x1',projectId:'p1',date:'2026-08-13',category:'人工',amount:3000},{id:'x2',projectId:'p1',date:'2026-08-13',category:'材料',amount:2000},{id:'x3',projectId:'p2',date:'2026-09-08',category:'材料',amount:8000}],
 payments:[{id:'r1',projectId:'p1',date:'2026-08-19',amount:10000}],quotes:[]};
test('SQLite persists data with referential integrity and cost categories',()=>{
 const db=connection();assert.ok(fs.existsSync(process.env.SQLITE_PATH));
 mutate('add',{id:'c-test',name:'測試客戶',phone:'02-1234'});
 mutate('add',{id:'p-test',customerId:'c-test',title:'電路工程',type:'電力工程',status:'施工中',startDate:'2026-10-18',dueDate:'2026-10-30',amount:10000});
 mutate('add',{id:'x-test',projectId:'p-test',date:'2026-10-18',category:'人工',amount:3000,note:'測試工資'});
 mutate('add',{id:'r-test',projectId:'p-test',date:'2026-10-18',amount:2000});
 mutate('add',{id:'q-test',number:'QT-TEST-001',projectId:'p-test',customerId:'c-test',date:'2026-10-18',taxRate:5,status:'已接受',items:[{name:'配線',qty:2,unit:'式',price:1000}]});
 const snap=snapshot();assert.equal(snap.projects[0].title,'電路工程');assert.equal(snap.costs[0].amount,3000);assert.equal(snap.quotes[0].items[0].name,'配線');
 assert.equal(db.prepare('select amount from costs where id=?').get('x-test').amount,3000);
 assert.throws(()=>mutate('add',{id:'x-bad',projectId:'p-missing',date:'2026-10-18',category:'人工',amount:2}));
 assert.throws(()=>mutate('add',{id:'q-bad',number:'QT-BAD',projectId:'p-test',customerId:'c-not-matching',date:'2026-10-18',taxRate:5,items:[{name:'燈具',qty:1,unit:'組',price:200}]}));
 assert.throws(()=>mutate('add',{id:'x-bad2',projectId:'p-test',date:'2026-10-18',category:'假成本',amount:1}));
 mutate('update',{id:'x-test',amount:4000});assert.equal(snapshot().costs[0].amount,4000);
 // Review regression: quote's customer must continue to match its project, including PATCH-like updates.
 mutate('update',{id:'q-test',status:'已寄出'});
 assert.throws(()=>mutate('update',{id:'q-test',customerId:'c-not-matching'}),/估價單的客戶/);
 assert.throws(()=>mutate('update',{id:'p-test',customerId:'c-not-matching'}),/已有估價單/);
 assert.throws(()=>mutate('update',{id:'q-test',taxRate:101}),/營業稅率/);
 assert.throws(()=>mutate('add',{id:'x-invalid-date',projectId:'p-test',date:'2026-02-31',category:'材料',amount:100}),/日期格式/);
 assert.equal(snapshot().quotes[0].status,'已寄出');

});
test('Gross profit separates contract value, costs and collections',()=>{
 const a=reports.analyze(sample);
 assert.equal(a.totals.projects,2);assert.equal(a.totals.revenue,30000);assert.equal(a.totals.cost,13000);
 assert.equal(a.totals.profit,17000);assert.equal(a.totals.collected,10000);
 assert.equal(a.byType.find(x=>x.type==='維修保養').margin,.5);
 assert.equal(a.byCost.find(x=>x.category==='材料').amount,10000);
 const filtered=reports.analyze(sample,{from:'2026-09-01',to:'2026-09-30',type:'電力工程'});
 assert.equal(filtered.totals.projects,1);assert.equal(filtered.totals.profit,12000);
 assert.throws(()=>reports.analyze(sample,{from:'2026-10-01',to:'2026-09-01'}));
});
test('Excel export has workbook sheets with sanitized client-provided values',()=>{
 const w=reports.sheets(sample,{type:'維修保養'},['byType','byCost','profit','summary']);
 assert.deepEqual(w.map(s=>s.name),['類別毛利統計','成本類別統計','個案毛利分析','營運摘要']);
 assert.equal(w[0].rows[0][4],5000);
 const bytes=xlsx.buildWorkbook([{name:'安全報表',headers:['文字','金額'],rows:[['=HYPERLINK("http://example.com")',123],['資料<&>',-5]]}]);
 assert.equal(Buffer.from(bytes).toString('utf8',0,2),'PK');assert.ok(bytes.length>2000);
 fs.writeFileSync(path.join(directory,'report.xlsx'),bytes);
});
test('local HTTP API requires authentication and an allowed origin',async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const base='http://127.0.0.1:'+server.address().port;
  let response=await fetch(base+'/api/status');assert.equal((await response.json()).mode,'sqlite');
  response=await fetch(base+'/api/data');assert.equal(response.status,401);
  response=await fetch(base+'/api/login',{method:'POST',headers:{'content-type':'application/json',origin:'https://attacker.test'},body:JSON.stringify({password:process.env.APP_ADMIN_PASSWORD})});assert.equal(response.status,403);
  response=await fetch(base+'/api/login',{method:'POST',headers:{'content-type':'application/json',origin:base},body:JSON.stringify({password:process.env.APP_ADMIN_PASSWORD})});assert.equal(response.status,200);
  const cookie=response.headers.get('set-cookie').split(';')[0];
  response=await fetch(base+'/api/data',{headers:{cookie}});assert.equal(response.status,200);assert.equal((await response.json()).data.costs[0].amount,4000);
  response=await fetch(base+'/api/data',{method:'POST',headers:{'content-type':'application/json',origin:base,cookie},body:JSON.stringify({action:'add',payload:{id:'x-http',projectId:'p-test',date:'2026-10-18',category:'材料',amount:500}})});
  assert.equal(response.status,200);assert.ok((await response.json()).data.costs.some(x=>x.id==='x-http'));
 }finally{await new Promise(resolve=>server.close(resolve))}
});
test('Vercel disables non-durable SQLite even if env vars exist',()=>{process.env.VERCEL='1';const {enabled}=require('../api/_auth');assert.equal(enabled(),false);delete process.env.VERCEL});
