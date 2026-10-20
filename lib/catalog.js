'use strict';
const {connection}=require('./sqlite');
const Kit=require('../catalog-kit');
function problem(message,status=400){const e=new Error(message);e.status=status;throw e}
function text(v,label,max=150){if(typeof v!=='string'||!v.trim()||v.length>max)problem(label+'不合法');return v.trim()}
function count(v,label,{allowZero=false}={}){if(v===null||v===''||typeof v==='boolean'||!Number.isFinite(Number(v))||Number(v)<0||(!allowZero&&Number(v)===0)||Number(v)>10000000)problem(label+'不合法');return Number(v)}
function decimal(v,label){const n=count(v,label);if(!/^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/.test(String(n)))problem(label+'最多三位小數');return n}
function catalogSnapshot(db=connection()){
 return {
  workTemplates:db.prepare('SELECT id,parent_id AS parentId,kind,name,unit,default_qty AS defaultQty,unit_price AS unitPrice,materials,note FROM work_templates ORDER BY created_at,id').all().map(t=>({...t,materials:JSON.parse(t.materials)})),
  quoteMaterialPlans:db.prepare('SELECT project_id AS projectId,item_id AS itemId,quote_id AS quoteId,planned_qty AS plannedQty FROM quote_material_plans ORDER BY project_id,item_id').all()
 };
}
function upsertCatalog(action,p,db=connection()){
 if(!p||typeof p!=='object'||Array.isArray(p))problem('無效的工項資料');
 if(action==='syncQuote'){
  if(typeof p.quoteId!=='string'||p.quoteId.length>80)problem('估價單編號不合法');
  db.exec('BEGIN IMMEDIATE');
  try{
   const quote=db.prepare('SELECT id,project_id AS projectId,status,items FROM quotes WHERE id=?').get(p.quoteId);
   if(!quote)problem('找不到估價單',404);
   if(quote.status!=='已接受')problem('僅能將已接受估價單同步至工程用料');
   const project=db.prepare('SELECT status FROM projects WHERE id=?').get(quote.projectId);
   if(!project||project.status==='已取消')problem('已取消或不存在的工程不能同步');
   const rows=Kit.quoteMaterials({items:JSON.parse(quote.items)});
   if(!rows.length)problem('此估價單未包含材料配方，無法建立備料計畫');
   for(const row of rows){
    if(!/^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/.test(String(row.plannedQty)))problem('合併材料數量最多三位小數');
    if(!db.prepare('SELECT 1 FROM inventory_items WHERE id=?').get(row.itemId))problem('估價單參照的耗材已不存在');
   }
   db.prepare('DELETE FROM quote_material_plans WHERE quote_id=?').run(quote.id);
   db.prepare('DELETE FROM quote_material_plans WHERE project_id=?').run(quote.projectId);
   for(const row of rows)db.prepare('INSERT INTO quote_material_plans(project_id,item_id,quote_id,planned_qty) VALUES(?,?,?,?)').run(quote.projectId,row.itemId,quote.id,row.plannedQty);
   db.exec('COMMIT');return catalogSnapshot(db);
  }catch(e){db.exec('ROLLBACK');throw e}
 }
 if(!['add','update'].includes(action))problem('不支援的工項操作');
 const keys=['id','parentId','kind','name','unit','defaultQty','unitPrice','materials','note'];
 for(const k of Object.keys(p||{}))if(!keys.includes(k))problem('不支援的欄位 '+k);
 if(typeof p.id!=='string'||!/^w-[a-zA-Z0-9-]{2,76}$/.test(p.id))problem('工項 ID 不合法');
 if(!['package','task'].includes(p.kind))problem('工項種類不合法');
 const name=text(p.name,'工項名稱',120),unit=text(p.unit,'計量單位',30),qty=decimal(p.defaultQty,'預設數量');
 const price=count(p.unitPrice,'工項價格',{allowZero:true});
 const note=String(p.note||'');if(note.length>500)problem('備註過長');
 const parent=p.parentId||null;if(parent!==null&&(typeof parent!=='string'||!/^w-[a-zA-Z0-9-]{2,76}$/.test(parent)))problem('父項編號不合法');
 if(!Array.isArray(p.materials)||p.materials.length>80)problem('材料配方不合法');
 if(p.kind==='package'&&(price!==0||p.materials.length))problem('包項只負責分組，價格及用料應設定於子工項');
 let recipe=[];
 if(p.kind==='task'){
  const seen=new Set();
  recipe=p.materials.map(m=>{
   if(!m||typeof m.itemId!=='string'||seen.has(m.itemId))problem('材料配方品項不得重複');
   seen.add(m.itemId);return {itemId:m.itemId,qty:decimal(m.qty,'單位工項耗材用量')};
  });
 }
 db.exec('BEGIN IMMEDIATE');
 try{
  if(parent){
   const parentRow=db.prepare('SELECT id,parent_id AS parentId,kind FROM work_templates WHERE id=?').get(parent);
   if(!parentRow||parentRow.kind!=='package')problem('父層必須為存在的包項');
   let cursor=parentRow,depth=0;
   while(cursor){
    if(cursor.id===p.id)problem('不可將工項放在自身或後代底下');
    if(++depth>=12)problem('工項最多 12 層');
    cursor=cursor.parentId?db.prepare('SELECT id,parent_id AS parentId FROM work_templates WHERE id=?').get(cursor.parentId):null;
   }
  }
  if(action==='update'&&p.kind==='task'&&db.prepare('SELECT 1 FROM work_templates WHERE parent_id=? LIMIT 1').get(p.id))problem('含有子工項的包項不可直接改成一般工項');
  const candidates=db.prepare('SELECT id,parent_id AS parentId,kind FROM work_templates').all();
  try{Kit.ensureHierarchyDepth(candidates,{id:p.id,parentId:parent,kind:p.kind})}
  catch(error){problem(error.message)}
  for(const m of recipe)if(!db.prepare('SELECT 1 FROM inventory_items WHERE id=?').get(m.itemId))problem('材料配方參照不存在的耗材');
  const args=[parent,p.kind,name,unit,qty,price,JSON.stringify(recipe),note];
  if(action==='add')db.prepare('INSERT INTO work_templates(id,parent_id,kind,name,unit,default_qty,unit_price,materials,note) VALUES(?,?,?,?,?,?,?,?,?)').run(p.id,...args);
  else if(!db.prepare('UPDATE work_templates SET parent_id=?,kind=?,name=?,unit=?,default_qty=?,unit_price=?,materials=?,note=? WHERE id=?').run(...args,p.id).changes)problem('找不到工項範本',404);
  db.exec('COMMIT');return catalogSnapshot(db);
 }catch(e){db.exec('ROLLBACK');throw e}
}
module.exports={catalogSnapshot,upsertCatalog};
