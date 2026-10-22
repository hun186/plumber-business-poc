'use strict';
const fs=require('node:fs');
const {enabled,authenticated,trustedOrigin}=require('./_auth');
const backups=require('../lib/backup-manager');
function fail(res,e){
 const status=e.code==='E_BACKUP_BUSY'?409:e.code==='E_CONFIG'?400:e.code==='E_BACKUP'?404:500;
 console.error('[backup-api]',e.code||'UNKNOWN');
 return res.status(status).json({code:e.code||'E_BACKUP',error:e.code==='E_BACKUP_BUSY'?e.message:e.code==='E_CONFIG'?e.message:'無法完成備份操作，請記下錯誤代碼並執行部署檢查'});
}
module.exports=(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!enabled())return res.status(503).json({code:'E_CONFIG',error:'備份僅適用正式 SQLite 模式，示範網站不會保存真實備份'});
 if(!authenticated(req))return res.status(401).json({code:'E_LOGIN',error:'請先登入資料庫模式'});
 if(!['GET','POST'].includes(req.method))return res.status(405).json({code:'E_API_METHOD',error:'不支援此操作'});
 if(req.method==='POST'&&!trustedOrigin(req))return res.status(403).json({code:'E_API_ORIGIN',error:'請從原本網址重新登入'});
 try{
  if(req.method==='GET'){
   const pathname=new URL(req.url,'http://localhost');
   if(pathname.searchParams.has('file')){
    const value=pathname.searchParams.get('file'),info=backups.safeFile(value);
    const raw=res.raw;raw.statusCode=200;
    raw.setHeader('Content-Type','application/vnd.sqlite3');
    raw.setHeader('Content-Length',info.size);
    raw.setHeader('X-Content-Type-Options','nosniff');
    raw.setHeader('Content-Disposition','attachment; filename="'+value+'"');
    return fs.createReadStream(info.path).on('error',()=>raw.destroy()).pipe(raw);
   }
   return res.status(200).json(backups.status());
  }
  const {action,intervalDays,retentionCount,name}=req.body||{};
  if(action==='save')return res.status(200).json(backups.saveSettings({intervalDays,retentionCount}));
  if(action==='create'){backups.makeBackup('manual');return res.status(200).json(backups.status())}
  if(action==='delete'){backups.deleteBackup(name);return res.status(200).json(backups.status())}
  return res.status(400).json({code:'E_CONFIG',error:'不支援的備份管理操作'});
 }catch(e){return fail(res,e)}
};
