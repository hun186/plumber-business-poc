'use strict';
const {enabled,authenticated,trustedOrigin}=require('./_auth');
const {connection,snapshot}=require('../lib/sqlite');
const {upsertCatalog}=require('../lib/catalog');
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!enabled())return res.status(503).json({error:'Vercel 僅提供本機示範資料，不能持久保存工項範本'});
 if(!authenticated(req))return res.status(401).json({error:'尚未登入'});
 if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'方法不支援'});
 if(req.method==='POST'&&!trustedOrigin(req))return res.status(403).json({error:'來源驗證失敗'});
 try{
  if(req.method==='GET')return res.status(200).json({data:snapshot()});
  if(JSON.stringify(req.body||{}).length>262144)return res.status(413).json({error:'內容過大'});
  const {action,payload}=req.body||{};
  upsertCatalog(action,payload,connection());
  return res.status(200).json({data:snapshot()});
 }catch(e){
  const conflict=[1555,2067].includes(Number(e.errcode))||/UNIQUE constraint failed|PRIMARY KEY constraint failed/i.test(String(e.message||''));
  console.error('Work catalog operation failed',e.code||e.name);
  return res.status(conflict?409:e.status||400).json({error:conflict?'工項重複':e.status?e.message:'工項或材料關聯不合法'});
 }
};
