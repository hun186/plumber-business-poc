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
