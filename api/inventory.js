'use strict';
const {enabled,authenticated,trustedOrigin}=require('./_auth');
const {connection,snapshot}=require('../lib/sqlite');
const {processInventory}=require('../lib/inventory');
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!enabled())return res.status(503).json({error:'僅固定主機 SQLite 模式可持久保存庫存；Vercel 只能使用示範資料'});
 if(!authenticated(req))return res.status(401).json({error:'尚未登入'});
 if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'方法不支援'});
 if(req.method==='POST'&&!trustedOrigin(req))return res.status(403).json({error:'來源驗證失敗'});
 try{
  if(req.method==='GET')return res.status(200).json({data:snapshot()});
  if(JSON.stringify(req.body||{}).length>262144)return res.status(413).json({error:'內容過大'});
  processInventory(req.body?.action,req.body?.payload,connection());
  return res.status(200).json({data:snapshot()});
 }catch(e){
  const conflict=String(e.code||'').startsWith('SQLITE_CONSTRAINT_UNIQUE')||String(e.code||'').includes('PRIMARYKEY');
  console.error('Inventory operation failed',e.code||e.name);
  return res.status(conflict?409:e.status||400).json({error:conflict?'料號、需求或異動編號重複':e.status?e.message:'庫存資料格式或關聯錯誤'});
 }
};
