'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),os=require('node:os'),fs=require('node:fs'),path=require('node:path');
process.env.SQLITE_PATH=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'plumber-catalog-test-')),'catalog.sqlite');
delete process.env.VERCEL;
const {connection,snapshot}=require('../lib/sqlite');
const {upsertCatalog}=require('../lib/catalog');
const {processInventory}=require('../lib/inventory');
const kit=require('../catalog-kit');
const {mutate}=require('../api/data')._test;
const db=connection();
const base={unit:'式',defaultQty:1,unitPrice:0,materials:[],note:''};
function pkg(id,name,parentId=null,defaultQty=1){return { ...base,id,name,parentId,defaultQty,kind:'package' }}
function item(id,name,parentId,defaultQty=1,unitPrice=500,materials=[]){return {...base,id,name,parentId,defaultQty,unitPrice,materials,kind:'task'}}
test('v0.4 additive catalog tables and inventory-linked recipes',()=>{
 db.prepare('INSERT INTO customers(id,name) VALUES(?,?)').run('c-cat','客戶');
 db.prepare('INSERT INTO projects(id,customer_id,title,status) VALUES(?,?,?,?)').run('p-cat','c-cat','辦公室整修','施工中');
 for(const [id,sku,name] of [['i-cat-wire','WIRE','電線'],['i-cat-pipe','PIPE','配管']])
  processInventory('itemAdd',{id,sku,name,unit:'米',unitCost:25,alertQty:3,note:''},db);
 upsertCatalog('add',pkg('w-office','辦公室整修'),db);
 upsertCatalog('add',pkg('w-electrical','配電工程','w-office',2),db);
 upsertCatalog('add',item('w-socket','插座施工','w-electrical',3,500,[{itemId:'i-cat-wire',qty:1.5},{itemId:'i-cat-pipe',qty:.25}]),db);
 assert.equal(snapshot(db).workTemplates.length,3);
});
test('nested package selection flattens quote lines with BOM snapshots',()=>{
 const snap=snapshot(db);
 const flat=kit.flatten(snap.workTemplates,'w-office');
 assert.equal(flat.length,1);
 assert.equal(flat[0].name,'辦公室整修 / 配電工程 / 插座施工');
 assert.equal(flat[0].qty,6);
 assert.equal(flat[0].price,500);
 assert.deepEqual(flat[0].materials,[{itemId:'i-cat-wire',qty:1.5},{itemId:'i-cat-pipe',qty:.25}]);
 assert.deepEqual(kit.quoteMaterials({items:flat}),[{itemId:'i-cat-wire',plannedQty:9},{itemId:'i-cat-pipe',plannedQty:1.5}]);
 mutate('add',{id:'q-cat',number:'QT-CATALOG-001',projectId:'p-cat',customerId:'c-cat',date:'2026-10-20',status:'已接受',taxRate:5,items:flat,note:'測試'});
 assert.equal(snapshot(db).quotes[0].items[0].qty,6);
});
test('accepted quote synchronization is repeatable, manual plans override without double demand',()=>{
 upsertCatalog('syncQuote',{quoteId:'q-cat'},db);
 upsertCatalog('syncQuote',{quoteId:'q-cat'},db);
 assert.equal(snapshot(db).quoteMaterialPlans.length,2);
 let active=snapshot(db).materialRequirements;
 assert.equal(active.length,2);
 assert.equal(active.find(x=>x.itemId==='i-cat-wire').plannedQty,9);
 assert.equal(active.find(x=>x.itemId==='i-cat-pipe').plannedQty,1.5);
 processInventory('requirementAdd',{id:'b-override',projectId:'p-cat',itemId:'i-cat-wire',plannedQty:8,note:'人工調整'},db);
 active=snapshot(db).materialRequirements;
 assert.equal(active.length,2);
 assert.equal(active.find(x=>x.itemId==='i-cat-wire').plannedQty,8);
 assert.equal(active.find(x=>x.itemId==='i-cat-wire').source,undefined);
 assert.equal(active.find(x=>x.itemId==='i-cat-pipe').source,'quote');
});
test('editing catalog does not retroactively rewrite a saved quote',()=>{
 upsertCatalog('update',item('w-socket','插座施工','w-electrical',3,999,[{itemId:'i-cat-wire',qty:2}]),db);
 const quoted=snapshot(db).quotes.find(q=>q.id==='q-cat').items[0];
 assert.equal(quoted.price,500);
 assert.deepEqual(kit.quoteMaterials({items:[quoted]}),[{itemId:'i-cat-wire',plannedQty:9},{itemId:'i-cat-pipe',plannedQty:1.5}]);
});
test('cycles and missing inventory items rejected atomically',()=>{
 assert.throws(()=>upsertCatalog('update',pkg('w-office','辦公室整修','w-electrical'),db),/自身|後代/);
 assert.throws(()=>upsertCatalog('add',item('w-invalid','無效','w-office',1,100,[{itemId:'i-no-such',qty:1}]),db),/不存在/);
 assert.equal(snapshot(db).workTemplates.length,3);
});
test('quote sync rejects draft and does not clear prior material plans',()=>{
 mutate('add',{id:'q-draft',number:'QT-CATALOG-002',projectId:'p-cat',customerId:'c-cat',date:'2026-10-20',status:'草稿',taxRate:5,items:[{name:'手動項',unit:'式',qty:1,price:100}],note:''});
 assert.throws(()=>upsertCatalog('syncQuote',{quoteId:'q-draft'},db),/已接受/);
 assert.equal(snapshot(db).quoteMaterialPlans.length,2);
});
test('sidebar navigation has toggle groups and independently scrollable area',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 const css=fs.readFileSync(path.join(__dirname,'../styles.css'),'utf8');
 assert.match(html,/<details data-group="quotes"/);
 assert.match(html,/<details data-group="stock"/);
 assert.match(html,/data-page="catalog"/);
 assert.match(css,/\.sidebar nav\{display:block;flex:1 1 auto;min-height:0;overflow-y:auto/);
});
