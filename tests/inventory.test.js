'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),os=require('node:os'),path=require('node:path'),fs=require('node:fs');
process.env.SQLITE_PATH=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'warehouse-test-')),'db.sqlite');delete process.env.VERCEL;
const {connection,snapshot}=require('../lib/sqlite'),{processInventory}=require('../lib/inventory'),reports=require('../reports');
const db=connection();
test('inventory schema migrates without changing existing customer/project data',()=>{
 db.prepare('INSERT INTO customers(id,name) VALUES(?,?)').run('c-wh','客戶');
 db.prepare('INSERT INTO projects(id,customer_id,title,type,status,amount) VALUES(?,?,?,?,?,?)').run('p-wh','c-wh','工程','電力工程','施工中',10000);
 processInventory('itemAdd',{id:'i-wh001',sku:'PIPE-001',name:'水管',unit:'米',unitCost:60,alertQty:5,note:''},db);
 processInventory('receive',{id:'m-recv001',itemId:'i-wh001',date:'2026-10-19',qty:10,unitCost:50},db);
 assert.equal(snapshot(db).inventoryItems[0].stock,10);
});
test('planned usage and actual issue are separate and project material costs join profit',()=>{
 processInventory('requirementAdd',{id:'b-plan001',projectId:'p-wh',itemId:'i-wh001',plannedQty:8,note:''},db);
 processInventory('issue',{id:'m-issue001',itemId:'i-wh001',projectId:'p-wh',date:'2026-10-19',qty:6,note:''},db);
 const snap=snapshot(db);assert.equal(snap.inventoryItems[0].stock,4);assert.equal(snap.materialRequirements[0].plannedQty,8);
 assert.equal(snap.costs[0].amount,360);assert.equal(reports.analyze(snap).totals.profit,9640);
 const sheets=reports.sheets(snap,{},['inventory','materialNeeds','stockMoves']);
 assert.deepEqual(sheets.map(x=>x.name),['耗材庫存清冊','工程材料需求','庫存異動紀錄']);
 assert.equal(sheets[1].rows[0][7],2);
 assert.ok(require('../xlsx-lite').buildWorkbook(sheets).length>1000);
});
test('duplicate issue id and negative stock are rejected atomically',()=>{
 assert.throws(()=>processInventory('issue',{id:'m-issue001',itemId:'i-wh001',projectId:'p-wh',date:'2026-10-19',qty:1},db),/UNIQUE|constraint/i);
 assert.throws(()=>processInventory('issue',{id:'m-other001',itemId:'i-wh001',projectId:'p-wh',date:'2026-10-19',qty:5},db),/庫存不足/);
 assert.equal(snapshot(db).inventoryItems[0].stock,4);
 assert.equal(snapshot(db).inventoryMovements.filter(x=>x.kind==='issue').length,1);
});
test('adjustment supports auditing and protects from negative stock',()=>{
 processInventory('adjust',{id:'m-adjust001',itemId:'i-wh001',date:'2026-10-19',qty:2},db);
 assert.equal(snapshot(db).inventoryItems[0].stock,6);
 assert.throws(()=>processInventory('adjust',{id:'m-adjust002',itemId:'i-wh001',date:'2026-10-19',qty:-7},db),/庫存不足/);
});
test('editing unit cost does not rewrite historical issuance; changing stocked unit denied',()=>{
 processInventory('itemUpdate',{id:'i-wh001',sku:'PIPE-001',name:'水管',unit:'米',unitCost:95,alertQty:5,note:''},db);
 assert.equal(snapshot(db).costs[0].amount,360);
 assert.throws(()=>processInventory('itemUpdate',{id:'i-wh001',sku:'PIPE-001',name:'水管',unit:'包',unitCost:95,alertQty:5,note:''},db),/計量單位/);
});
test('dates, duplicate project needs and canceled jobs are protected',()=>{
 assert.throws(()=>processInventory('receive',{id:'m-bad001',itemId:'i-wh001',date:'2026-02-31',qty:1},db),/日期/);
 assert.throws(()=>processInventory('requirementAdd',{id:'b-plan002',itemId:'i-wh001',projectId:'p-wh',plannedQty:1},db),/UNIQUE|constraint/i);
 db.prepare('UPDATE projects SET status=? WHERE id=?').run('已取消','p-wh');
 assert.throws(()=>processInventory('issue',{id:'m-bad002',itemId:'i-wh001',projectId:'p-wh',date:'2026-10-19',qty:1},db),/已取消/);
});

test('unit of a planned material cannot change after requirement creation',()=>{assert.throws(()=>processInventory('itemUpdate',{id:'i-wh001',sku:'PIPE-001',name:'水管',unit:'包',unitCost:95,alertQty:5,note:''},db),/計量單位/)});

test('shared stock is checked against all active project demand in UI and Excel data',()=>{
 const d={
  customers:[],costs:[],payments:[],quotes:[],inventoryItems:[{id:'i-shared',sku:'SHARED',name:'共用管材',unit:'米',stock:10,alertQty:2,unitCost:1}],
  projects:[{id:'p-a',title:'工程 A',status:'施工中',type:'給排水工程',amount:800},{id:'p-b',title:'工程 B',status:'施工中',type:'給排水工程',amount:800}],
  materialRequirements:[{id:'b-a',projectId:'p-a',itemId:'i-shared',plannedQty:8},{id:'b-b',projectId:'p-b',itemId:'i-shared',plannedQty:8}],
  inventoryMovements:[]
 };
 const summary=reports.materialCoverage(d);
 assert.equal(summary.byItem.get('i-shared').totalDemand,16);
 assert.equal(summary.byItem.get('i-shared').shortfall,6);
 const sheet=reports.sheets(d,{},['materialNeeds'])[0];
 assert.equal(sheet.rows.length,2);
 assert.ok(sheet.rows.every(row=>row[9].includes('共缺 6')));
 d.projects[1].status='已取消';
 assert.equal(reports.materialCoverage(d).byItem.get('i-shared').shortfall,0);
});
test('up to three decimals are accepted in stock movements and planned requirements',()=>{
 processInventory('itemAdd',{id:'i-decimal',sku:'DECIMAL-001',name:'管線',unit:'米',unitCost:5,alertQty:0,note:''},db);
 processInventory('receive',{id:'m-decimal',itemId:'i-decimal',date:'2026-10-19',qty:1.001,unitCost:5},db);
 assert.equal(snapshot(db).inventoryItems.find(i=>i.id==='i-decimal').stock,1.001);
 processInventory('requirementAdd',{id:'b-decimal',projectId:'p-wh',itemId:'i-decimal',plannedQty:1.001},db);
 assert.equal(snapshot(db).materialRequirements.find(r=>r.id==='b-decimal').plannedQty,1.001);
 assert.throws(()=>processInventory('receive',{id:'m-invalid-4dp',itemId:'i-decimal',date:'2026-10-19',qty:0.0001},db),/小數三位/);
});
test('duplicate key errors from node:sqlite contain recognizable constraint details',()=>{
 let error;
 try{processInventory('receive',{id:'m-decimal',itemId:'i-decimal',date:'2026-10-19',qty:1},db)}catch(e){error=e}
 assert.ok(error);
 const conflict=[1555,2067].includes(Number(error.errcode))||/UNIQUE constraint failed|PRIMARY KEY constraint failed/i.test(String(error.message||''));
 assert.equal(conflict,true);
});

test('XLSX warehouse quantity columns retain up to three decimals in displayed number format',()=>{
 const xlsx=require('../xlsx-lite');
 const workbook=xlsx.buildWorkbook([
  {name:'耗材庫存清冊',headers:reports.columns.inventory.headers,rows:[['P-1','水管','米',1.001,0.001,10,10.01,'正常','']]},
  {name:'工程材料需求',headers:reports.columns.materialNeeds.headers,rows:[['p','工程','P-1','水管','米',1.001,0.001,1,5,'可備料','']]},
  {name:'庫存異動紀錄',headers:reports.columns.stockMoves.headers,rows:[['m','2026-10-20','P-1','水管','領用',-1.001,10,'p','']]}
 ]);
 const bytes=Buffer.from(workbook).toString('utf8');
 assert.match(bytes,/<numFmt numFmtId="164" formatCode="#,##0\.###"\/>/);
 assert.match(bytes,/<cellXfs count="5">/);
 assert.match(bytes,/<c r="D2" s="4"><v>1\.001<\/v><\/c>/);
 assert.match(bytes,/<c r="E2" s="4"><v>0\.001<\/v><\/c>/);
 assert.match(bytes,/<c r="F2" s="4"><v>1\.001<\/v><\/c>/);
 assert.match(bytes,/<c r="F2" s="4"><v>-1\.001<\/v><\/c>/);
});
test('browser demo blocks unit changes after a plan and rejects negative receipt price',async()=>{
 const vm=require('node:vm');
 const script=fs.readFileSync(path.join(__dirname,'../inventory-ui.js'),'utf8');
 const item={id:'i-demo',sku:'D-01',name:'水管',unit:'米',unitCost:10,alertQty:0,stock:3,note:''};
 const saved=[],messages=[],buttons={
  edit:{dataset:{editItem:'i-demo'}},
  move:{dataset:{moveItem:'i-demo'}}
 };
 let formSubmit;
 const sandbox={
  state:{server:false,data:{inventoryItems:[item],materialRequirements:[{id:'b-demo',itemId:'i-demo',projectId:'p-demo',plannedQty:2}],inventoryMovements:[],projects:[{id:'p-demo',status:'施工中',title:'工程'}],costs:[]}},
  $:()=>null,$$:(q)=>q==='[data-edit-item]'?[buttons.edit]:q==='[data-move-item]'?[buttons.move]:[],
  esc:x=>String(x??''),openModal:(heading,html,fn)=>{formSubmit=fn;},closeModal:()=>{},render:()=>{},
  toast:s=>messages.push(s),saveLocal:()=>saved.push(true),today:()=>'2026-10-20',
  uid:p=>p+'-demo02',money:x=>String(x),project:id=>({title:'工程'}),
  BusinessReports:reports
 };
 const ui=vm.runInNewContext(script+'\nInventoryUI;',sandbox);
 ui.bind();buttons.edit.onclick();
 formSubmit(new Map([['sku','D-01'],['name','水管'],['unit','包'],['unitCost','10'],['alertQty','0'],['note','']]));
 assert.equal(item.unit,'米');assert.equal(saved.length,0);
 assert.ok(messages.some(x=>x.includes('單位')));
 buttons.move.onclick();
 formSubmit(new Map([['kind','receive'],['itemId','i-demo'],['projectId',''],['date','2026-10-20'],['qty','1'],['unitCost','-1'],['note','']]));
 assert.equal(sandbox.state.data.inventoryMovements.length,0);
 assert.ok(messages.some(x=>x.includes('進貨單價')));
});
