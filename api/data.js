'use strict';
const {enabled,authenticated,trustedOrigin}=require('./_auth');
const {connection,snapshot}=require('../lib/sqlite');
const configs={
 c:{table:'customers',keys:{name:'name',phone:'phone',address:'address',email:'email',note:'note'},required:['name']},
 p:{table:'projects',keys:{customerId:'customer_id',title:'title',type:'type',status:'status',startDate:'start_date',dueDate:'due_date',amount:'amount',note:'note'},required:['customerId','title']},
 q:{table:'quotes',keys:{number:'number',projectId:'project_id',customerId:'customer_id',date:'quote_date',status:'status',taxRate:'tax_rate',note:'note',items:'items'},required:['number','projectId','customerId','date','taxRate','items']},
 r:{table:'payments',keys:{projectId:'project_id',date:'paid_date',amount:'amount',note:'note'},required:['projectId','date','amount']},
 x:{table:'costs',keys:{projectId:'project_id',date:'cost_date',category:'category',amount:'amount',note:'note'},required:['projectId','date','category','amount']}
};
function invalid(msg){const e=new Error(msg);e.status=400;throw e}
const isDate=x=>{
 if(typeof x!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(x))return false;
 const date=new Date(x+'T00:00:00Z');
 return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===x;
};
function validate(cfg,p,conn,action) {
 if(!p||typeof p!=='object'||Array.isArray(p)||typeof p.id!=='string'||!/^([cpqrx]-[a-z\d-]+|[cpqrx]\d+)$/.test(p.id)||p.id.length>80)invalid('無效資料編號');
 for(const k of cfg.required)if(action==='add'&&!String(p[k]??'').trim())invalid('缺少必填欄位 '+k);
 for(const [k,v] of Object.entries(p)){
  if(k==='id')continue;
  if(!Object.hasOwn(cfg.keys,k))invalid('不支援的欄位 '+k);
  if(Array.isArray(v)&&k!=='items')invalid('欄位格式錯誤');
  if(typeof v==='string'&&v.length>4000)invalid('欄位超過長度限制');
  if(v!==null&&typeof v==='object'&&k!=='items')invalid('不支援的欄位格式');
 }
 if(['payments','costs'].includes(cfg.table)&&Object.hasOwn(p,'amount')&&(!Number.isFinite(Number(p.amount))||Number(p.amount)<=0))invalid('金額必須大於零');
 if(cfg.table==='projects'&&Object.hasOwn(p,'amount')&&(!Number.isFinite(Number(p.amount))||Number(p.amount)<0))invalid('案件金額不得為負數');
 for(const k of ['date','startDate','dueDate'])if(p[k]&&!isDate(p[k]))invalid('日期格式錯誤');
 if(cfg.table==='costs'&&Object.hasOwn(p,'category')&&!['材料','人工','外包','設備','其他'].includes(p.category))invalid('未知成本類別');
 if(cfg.table==='projects'&&action==='update'&&Object.hasOwn(p,'customerId')){
  const existing=conn.prepare('SELECT customer_id AS customerId FROM projects WHERE id=?').get(p.id);
  if(existing&&existing.customerId!==p.customerId&&conn.prepare('SELECT 1 FROM quotes WHERE project_id=? LIMIT 1').get(p.id))
   invalid('已有估價單的案件不可更換客戶，避免估價單歸屬錯誤');
 }
 if(cfg.table==='quotes'){
  const current=action==='update'?conn.prepare('SELECT project_id AS projectId,customer_id AS customerId,tax_rate AS taxRate,items FROM quotes WHERE id=?').get(p.id):null;
  if(action==='update'&&!current)invalid('找不到要編輯的估價單');
  const merged={...current,...p};
  if(action==='add'||Object.hasOwn(p,'items')){
   if(!Array.isArray(merged.items)||!merged.items.length||merged.items.length>100)invalid('估價工項數量不合法');
   for(const i of merged.items){
    if(!i||typeof i.name!=='string'||!i.name.trim()||i.name.length>200||typeof i.unit!=='string'||i.unit.length>30||!Number.isFinite(Number(i.qty))||Number(i.qty)<=0||!Number.isFinite(Number(i.price))||Number(i.price)<0)invalid('估價工項內容不合法');
    if(i.materials!==undefined){
     if(!Array.isArray(i.materials)||i.materials.length>80)invalid('估價材料配方格式錯誤');
     const seen=new Set();
     for(const m of i.materials){
      if(!m||typeof m.itemId!=='string'||!/^i-[a-zA-Z0-9-]{2,76}$/.test(m.itemId)||seen.has(m.itemId)||!Number.isFinite(Number(m.qty))||Number(m.qty)<=0||!/^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/.test(String(m.qty)))invalid('估價材料用量不合法');
      seen.add(m.itemId);
     }
    }
   }
  }
  if(!Number.isFinite(Number(merged.taxRate))||Number(merged.taxRate)<0||Number(merged.taxRate)>100)invalid('營業稅率必須為 0–100');
  const match=conn.prepare('SELECT customer_id AS customerId FROM projects WHERE id=?').get(merged.projectId);
  if(!match||match.customerId!==merged.customerId)invalid('估價單的客戶必須與案件客戶相同');
 }

}
function mutate(action,payload){const type=String(payload?.id||'')[0],cfg=configs[type];if(!cfg||!['add','update'].includes(action))invalid('不支援的資料操作');
 const conn=connection();validate(cfg,payload,conn,action);
 const entries=Object.entries(cfg.keys).filter(([k])=>Object.hasOwn(payload,k));
 if(!entries.length)invalid('沒有可儲存的欄位');
 const cols=entries.map(([,c])=>c);
 const vals=entries.map(([k])=>k==='items'?JSON.stringify(payload[k]):(payload[k]===''?null:payload[k]));
 conn.exec('BEGIN IMMEDIATE');
 try{
  if(action==='add')conn.prepare(`INSERT INTO ${cfg.table} (id,${cols.join(',')}) VALUES (?,${cols.map(()=>'?').join(',')})`).run(payload.id,...vals);
  else {
   const previous=cfg.table==='quotes'?conn.prepare('SELECT project_id AS projectId,status,items FROM quotes WHERE id=?').get(payload.id):null;
   const result=conn.prepare(`UPDATE ${cfg.table} SET ${cols.map(c=>c+'=?').join(',')} WHERE id=?`).run(...vals,payload.id);
   if(!result.changes)invalid('找不到要編輯的資料');
   if(previous&&((Object.hasOwn(payload,'projectId')&&previous.projectId!==payload.projectId)||
     (Object.hasOwn(payload,'status')&&previous.status!==payload.status)||
     (Object.hasOwn(payload,'items')&&previous.items!==JSON.stringify(payload.items)))){
    // Any change to accepted quote scope or material recipe invalidates the old cached plan.
    // Demand is re-created only through explicit syncQuote, avoiding stale quantities.
    conn.prepare('DELETE FROM quote_material_plans WHERE quote_id=?').run(payload.id);
   }
  }
  const data=snapshot(conn);conn.exec('COMMIT');return data;
 }catch(err){conn.exec('ROLLBACK');throw err}
}
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!enabled())return res.status(503).json({error:'SQLite 模式未啟用：需要本機 SQLite 路徑及管理密鑰，Vercel 不支援持久 SQLite'});
 if(!authenticated(req))return res.status(401).json({error:'尚未登入'});
 if(!['GET','POST'].includes(req.method))return res.status(405).json({code:'E_API_METHOD',error:'此頁面不支援這個操作'});
 if(req.method==='POST'&&!trustedOrigin(req))return res.status(403).json({code:'E_API_ORIGIN',error:'登入來源不一致，請使用系統顯示的原本網址重新登入'});
 try{
  if(req.method==='GET')return res.status(200).json({data:snapshot()});
  if(JSON.stringify(req.body||{}).length>1024*1024)invalid('請求內容過大');
  const {action,payload}=req.body||{};
  return res.status(200).json({data:mutate(action,payload)});
 }catch(e){console.error('SQLite data operation failed:',e.code||e.name);
  const conflict=String(e.code||'').startsWith('SQLITE_CONSTRAINT_UNIQUE')||String(e.code||'').includes('PRIMARYKEY');
  const sqliteError=String(e.code||'').startsWith('SQLITE_');
  return res.status(conflict?409:sqliteError?400:e.status||400).json({error:conflict?'估價單號或資料編號重複':sqliteError?'資料格式或關聯不合法':e.status?e.message:'資料庫操作失敗'});
 }
};
module.exports._test={validate,mutate};
