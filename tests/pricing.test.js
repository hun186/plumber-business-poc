'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'plumber-pricing-'));
process.env.SQLITE_PATH=path.join(folder,'pricing.sqlite');
delete process.env.VERCEL;
const {DatabaseSync}=require('node:sqlite');
const read=name=>fs.readFileSync(path.join(__dirname,'../db',name),'utf8');
const owner=require('../tools/owner-cli');

// Start with an actual pre-v6 schema and business rows to prove the extension is additive.
const legacy=new DatabaseSync(process.env.SQLITE_PATH);
legacy.exec(read('schema.sqlite.sql'));
legacy.exec(read('inventory.sql'));
legacy.exec(read('catalog.sql').split('-- v0.6 additive price lists.')[0]);
legacy.exec(read('backup.sql'));
legacy.exec('PRAGMA user_version=5');
legacy.prepare('INSERT INTO customers(id,name) VALUES(?,?)').run('c-price','原有業主資料');
legacy.prepare('INSERT INTO projects(id,customer_id,title,type) VALUES(?,?,?,?)').run('p-price','c-price','配線工程','電力工程');
legacy.prepare('INSERT INTO inventory_items(id,sku,name,unit,unit_cost) VALUES(?,?,?,?,?)').run('i-price-wire','WIRE','電線','米',30);
legacy.prepare("INSERT INTO work_templates(id,kind,name,unit,unit_price,materials) VALUES('w-price-legacy','task','舊工項','式',900,'[]')").run();
legacy.close();
test('owner preflight accepts complete v5 database and additive v6 preserves historical rows',()=>{
 assert.equal(owner.verifyEstablishedSchema({databasePath:process.env.SQLITE_PATH}),true);
 const {connection,snapshot}=require('../lib/sqlite');
 const db=connection();
 assert.equal(db.prepare('PRAGMA user_version').get().user_version,6);
 assert.equal(snapshot(db).customers.find(x=>x.id==='c-price').name,'原有業主資料');
 assert.equal(snapshot(db).workTemplates.find(x=>x.id==='w-price-legacy').pricingMode,'manual');
 assert.equal(snapshot(db).inventoryItems.find(x=>x.id==='i-price-wire').saleUnitPrice,null);
 assert.equal(owner.verifyEstablishedSchema({databasePath:process.env.SQLITE_PATH}),true);
});
test('purchase cost and customer sale price persist independently, without changing past issue costs',()=>{
 const {connection,snapshot}=require('../lib/sqlite'),db=connection();
 const {processInventory}=require('../lib/inventory');
 processInventory('itemUpdate',{id:'i-price-wire',sku:'WIRE',name:'電線',unit:'米',unitCost:30,saleUnitPrice:45,alertQty:0,note:''},db);
 let wire=snapshot(db).inventoryItems.find(x=>x.id==='i-price-wire');
 assert.equal(wire.unitCost,30);assert.equal(wire.saleUnitPrice,45);
 assert.throws(()=>processInventory('itemUpdate',{id:'i-price-wire',sku:'WIRE',name:'電線',unit:'米',unitCost:30,saleUnitPrice:-1,alertQty:0,note:''},db),/售價/);
 assert.equal(snapshot(db).inventoryItems.find(x=>x.id==='i-price-wire').saleUnitPrice,45);
});
test('new component-priced template derives material resale and service revenue; quote locks its price snapshot',()=>{
 const {connection,snapshot}=require('../lib/sqlite'),db=connection();
 const {upsertCatalog}=require('../lib/catalog'),{processInventory}=require('../lib/inventory'),kit=require('../catalog-kit');
 upsertCatalog('add',{id:'w-price-auto',parentId:null,kind:'task',name:'插座配線',unit:'式',defaultQty:2,unitPrice:0,pricingMode:'components',serviceUnitPrice:600,materials:[{itemId:'i-price-wire',qty:10}],note:''},db);
 const snap=snapshot(db),work=snap.workTemplates.find(x=>x.id==='w-price-auto');
 assert.equal(work.pricingMode,'components');assert.equal(work.serviceUnitPrice,600);
 const flat=kit.flatten(snap.workTemplates,'w-price-auto',snap.inventoryItems);
 assert.equal(flat.length,1);
 assert.equal(flat[0].price,1050);assert.equal(flat[0].qty,2);
 assert.deepEqual(flat[0].materials[0],{itemId:'i-price-wire',qty:10,unitCost:30,unitSalePrice:45});
 const quote={id:'q-price-1',number:'PRICE-1',projectId:'p-price',customerId:'c-price',date:'2026-11-17',status:'已接受',taxRate:5,items:flat};
 const {mutate}=require('../api/data')._test;
 mutate('add',quote);
 const original=snapshot(db).quotes.find(q=>q.id==='q-price-1');
 let breakdown=kit.quoteIncomeBreakdown(original);
 assert.equal(breakdown.materialSales,900);assert.equal(breakdown.materialCost,600);
 assert.equal(breakdown.materialMargin,300);assert.equal(breakdown.serviceSales,1200);assert.equal(breakdown.totalSales,2100);
 // Future price list revisions affect new quotes, never the saved quote and its cost snapshot.
 processInventory('itemUpdate',{id:'i-price-wire',sku:'WIRE',name:'電線',unit:'米',unitCost:35,saleUnitPrice:50,alertQty:0,note:''},db);
 const after=snapshot(db);
 assert.equal(kit.flatten(after.workTemplates,'w-price-auto',after.inventoryItems)[0].price,1100);
 breakdown=kit.quoteIncomeBreakdown(after.quotes.find(q=>q.id==='q-price-1'));
 assert.equal(breakdown.materialSales,900);assert.equal(breakdown.materialMargin,300);
 assert.equal(after.workTemplates.find(x=>x.id==='w-price-legacy').unitPrice,900);
 assert.equal(kit.flatten(after.workTemplates,'w-price-legacy')[0].price,900);
});
test('accepted quote composition avoids multiple quotes per job and flags old/manual prices as unclassified',()=>{
 const {connection,snapshot}=require('../lib/sqlite'),db=connection();
 const {mutate}=require('../api/data')._test,report=require('../reports');
 mutate('add',{id:'q-price-2',number:'PRICE-2',projectId:'p-price',customerId:'c-price',date:'2026-11-18',status:'已接受',taxRate:5,items:[
  {name:'材料加施工',qty:1,unit:'式',price:1100,pricingMode:'components',serviceUnitPrice:600,
   materials:[{itemId:'i-price-wire',qty:10,unitCost:35,unitSalePrice:50}]},
  {name:'舊手填費用',qty:1,unit:'式',price:200}
 ]});
 const s=snapshot(db);const x=report.quoteComposition(s);
 assert.equal(x.totals.quoteCount,1);
 assert.equal(x.rows[0].number,'PRICE-2');
 assert.equal(x.totals.materialSales,500);assert.equal(x.totals.materialCost,350);
 assert.equal(x.totals.materialMargin,150);assert.equal(x.totals.serviceSales,600);
 assert.equal(x.totals.unclassifiedSales,200);assert.equal(x.totals.totalSales,1300);
 const sheet=report.sheets(s,{},['incomeMix','inventory']);
 assert.deepEqual(sheet.map(x=>x.name),['已接受估價組成','耗材庫存清冊']);
 assert.equal(sheet[0].rows[0][5],150);assert.equal(sheet[1].rows[0][6],50);
});
test('component templates reject unpriced materials without editing existing business records',()=>{
 const {connection}=require('../lib/sqlite'),db=connection();
 const {upsertCatalog}=require('../lib/catalog'),{processInventory}=require('../lib/inventory');
 processInventory('itemAdd',{id:'i-no-price',sku:'UNPRICED',name:'舊耗材',unit:'個',unitCost:40,alertQty:0,note:''},db);
 assert.throws(()=>upsertCatalog('add',{id:'w-not-quoted',parentId:null,kind:'task',name:'未定價',unit:'式',defaultQty:1,unitPrice:0,pricingMode:'components',serviceUnitPrice:20,materials:[{itemId:'i-no-price',qty:1}],note:''},db),/尚未設定對客售價/);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM work_templates WHERE id='w-not-quoted'").get().n,0);
});

test('versioned v6 database with missing pricing table fails closed without rebuilding lost tables',()=>{
 const file=path.join(folder,'damaged-v6.sqlite');
 const {connection}=require('../lib/sqlite');
 // VACUUM INTO gives an isolated copy without touching the test's active main DB.
 connection().exec("VACUUM INTO '"+file.replace(/'/g,"''")+"'");
 const db=new DatabaseSync(file);
 db.exec('DROP TABLE work_component_pricing');
 db.close();
 assert.throws(()=>owner.verifyEstablishedSchema({databasePath:file}),/v0.6.*遺失|v0.6.*不完整/);
 const reader=new DatabaseSync(file,{readOnly:true});
 try{assert.equal(reader.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='work_component_pricing'").get().n,0)}
 finally{reader.close()}
});
test('partial v5 sidecar upgrade is rejected before creating missing pricing table',()=>{
 const file=path.join(folder,'partial-v5.sqlite');
 const db=new DatabaseSync(file);
 db.exec(read('schema.sqlite.sql'));
 db.exec(read('inventory.sql'));
 db.exec(read('catalog.sql').split('-- v0.6 additive price lists.')[0]);
 db.exec(read('backup.sql'));
 db.exec("CREATE TABLE inventory_sale_prices(item_id TEXT PRIMARY KEY REFERENCES inventory_items(id),unit_sale_price REAL NOT NULL CHECK(unit_sale_price>=0)); PRAGMA user_version=5");
 db.close();
 assert.throws(()=>owner.verifyEstablishedSchema({databasePath:file}),/v0.6.*不完整/);
});
