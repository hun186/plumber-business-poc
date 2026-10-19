'use strict';
const {connection}=require('./sqlite');
const round3=v=>Math.round((Number(v)+Number.EPSILON)*1000)/1000;
function invalid(message,status=400){const e=new Error(message);e.status=status;throw e}
function str(v,label,max=200){if(typeof v!=='string'||!v.trim()||v.length>max)invalid(label+'不合法');return v.trim()}
function num(v,label,{min=0,positive=false}={}){if(v===null||v===''||typeof v==='boolean'||!Number.isFinite(Number(v))||Number(v)<min||(positive&&Number(v)<=0))invalid(label+'不合法');return Number(v)}
function date(v){if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||Number.isNaN(Date.parse(v+'T00:00:00Z'))||new Date(v+'T00:00:00Z').toISOString().slice(0,10)!==v)invalid('日期不合法');return v}
function id(v,p){if(typeof v!=='string'||!new RegExp('^'+p+'-[a-zA-Z0-9-]{2,76}$').test(v))invalid('無效識別碼');return v}
function quantity3(qty){return Number.isFinite(qty)&&/^-?(?:0|[1-9]\d*)(?:\.\d{1,3})?$/.test(String(qty));}
function stock(db,itemId){return round3(db.prepare('SELECT COALESCE(SUM(qty),0) AS quantity FROM inventory_movements WHERE item_id=?').get(itemId).quantity)}
function inventorySnapshot(db=connection()){
 return {
 inventoryItems:db.prepare('SELECT i.id,i.sku,i.name,i.unit,i.unit_cost AS unitCost,i.alert_qty AS alertQty,i.note,COALESCE(ROUND(SUM(m.qty),3),0) AS stock FROM inventory_items i LEFT JOIN inventory_movements m ON m.item_id=i.id GROUP BY i.id ORDER BY i.name COLLATE NOCASE').all(),
 materialRequirements:db.prepare('SELECT id,project_id AS projectId,item_id AS itemId,planned_qty AS plannedQty,note FROM material_requirements ORDER BY created_at DESC').all(),
 inventoryMovements:db.prepare('SELECT id,item_id AS itemId,project_id AS projectId,move_date AS date,kind,qty,unit_cost AS unitCost,note FROM inventory_movements ORDER BY created_at DESC,id DESC').all()
 };
}
function processInventory(action,p,db=connection()){
 if(!p||typeof p!=='object'||Array.isArray(p))invalid('資料格式錯誤');
 const allowed={itemAdd:['id','sku','name','unit','unitCost','alertQty','note'],itemUpdate:['id','sku','name','unit','unitCost','alertQty','note'],requirementAdd:['id','projectId','itemId','plannedQty','note'],requirementUpdate:['id','plannedQty','note'],receive:['id','itemId','date','qty','note','unitCost'],issue:['id','itemId','projectId','date','qty','note'],adjust:['id','itemId','date','qty','note']};
 if(!allowed[action])invalid('不支援的庫存操作');
 for(const k of Object.keys(p))if(!allowed[action].includes(k))invalid('不支援欄位 '+k);
 db.exec('BEGIN IMMEDIATE');
 try{
  if(action==='itemAdd'||action==='itemUpdate'){
   const itemId=id(p.id,'i'),sku=str(p.sku,'料號',40),name=str(p.name,'品名',120),unit=str(p.unit,'單位',20),cost=num(p.unitCost,'單位成本'),alert=num(p.alertQty,'告警量'),note=String(p.note||'');
   if(note.length>500)invalid('備註太長');
   if(action==='itemAdd')db.prepare('INSERT INTO inventory_items(id,sku,name,unit,unit_cost,alert_qty,note) VALUES(?,?,?,?,?,?,?)').run(itemId,sku,name,unit,cost,alert,note);
   else{
    const before=db.prepare('SELECT unit FROM inventory_items WHERE id=?').get(itemId);
    if(before&&before.unit!==unit&&(db.prepare('SELECT 1 FROM inventory_movements WHERE item_id=? LIMIT 1').get(itemId)||db.prepare('SELECT 1 FROM material_requirements WHERE item_id=? LIMIT 1').get(itemId)))invalid('已有進出庫紀錄的品項不可改計量單位');
    if(!db.prepare('UPDATE inventory_items SET sku=?,name=?,unit=?,unit_cost=?,alert_qty=?,note=? WHERE id=?').run(sku,name,unit,cost,alert,note,itemId).changes)invalid('耗材不存在',404)
   }
  }else if(action==='requirementAdd'||action==='requirementUpdate'){
   const requirementId=id(p.id,'b'),qty=num(p.plannedQty,'預計用量',{positive:true});
   if(!quantity3(qty))invalid('數量最多小數三位');
   const note=String(p.note||'');if(note.length>500)invalid('備註太長');
   if(action==='requirementAdd'){
    id(p.projectId,'p');id(p.itemId,'i');
    db.prepare('INSERT INTO material_requirements(id,project_id,item_id,planned_qty,note) VALUES(?,?,?,?,?)').run(requirementId,p.projectId,p.itemId,qty,note)
   }else if(!db.prepare('UPDATE material_requirements SET planned_qty=?,note=? WHERE id=?').run(qty,note,requirementId).changes)invalid('需求不存在',404);
  }else{
   const movementId=id(p.id,'m'),itemId=id(p.itemId,'i'),item=db.prepare('SELECT unit_cost AS unitCost FROM inventory_items WHERE id=?').get(itemId);
   if(!item)invalid('耗材不存在',404);
   const day=date(p.date);let qty=num(p.qty,'異動數量',{min:action==='adjust'?-Infinity:0,positive:action!=='adjust'});
   if(!quantity3(qty))invalid('數量最多小數三位');
   if(action==='adjust'&&qty===0)invalid('盤點調整不能為零');
   if(action==='issue')qty=-qty;
   let projectId=null;
   if(action==='issue'){
    projectId=id(p.projectId,'p');const project=db.prepare('SELECT status FROM projects WHERE id=?').get(projectId);
    if(!project)invalid('案件不存在',404);
    if(project.status==='已取消')invalid('已取消案件不可領料')
   }
   if(round3(stock(db,itemId)+qty)<0)invalid('庫存不足，禁止扣成負數',409);
   const cost=action==='receive'?num(p.unitCost??item.unitCost,'進貨單價'):item.unitCost,note=String(p.note||'');
   if(note.length>500)invalid('備註太長');
   db.prepare('INSERT INTO inventory_movements(id,item_id,project_id,move_date,kind,qty,unit_cost,note) VALUES(?,?,?,?,?,?,?,?)').run(movementId,itemId,projectId,day,action,qty,cost,note);
  }
  db.exec('COMMIT');return inventorySnapshot(db);
 }catch(e){db.exec('ROLLBACK');throw e}
}
module.exports={stock,inventorySnapshot,processInventory};
