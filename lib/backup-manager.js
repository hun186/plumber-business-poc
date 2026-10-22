'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const root=path.resolve(__dirname,'..');
const backupDir=path.join(root,'backups');
const MANAGED=/^plumber-backup-(\d{8}-\d{6})-[0-9a-f]{6}(?:-(auto|manual))?\.sqlite$/;
let running=false,timer=null;
function fail(code,message){const e=new Error(message);e.code=code;throw e}
function conn(){return require('./sqlite').connection()}
function settings(db=conn()){
 const value=db.prepare('SELECT interval_days AS intervalDays,retention_count AS retentionCount,last_auto_at AS lastAutoAt,last_error AS lastError,updated_at AS updatedAt FROM backup_settings WHERE id=1').get();
 if(!value)fail('E_BACKUP','備份設定遺失，請執行部署檢查');
 return value;
}
function validateSetting(data){
 if(!data||typeof data!=='object'||Array.isArray(data))fail('E_CONFIG','備份設定內容不正確');
 if(!Number.isInteger(data.intervalDays)||data.intervalDays<1||data.intervalDays>365)fail('E_CONFIG','自動備份間隔請輸入 1～365 天');
 if(!Number.isInteger(data.retentionCount)||data.retentionCount<1||data.retentionCount>500)fail('E_CONFIG','自動備份保留份數請輸入 1～500');
 return {intervalDays:data.intervalDays,retentionCount:data.retentionCount};
}
function protect(file){
 if(process.platform!=='win32')return;
 require('../tools/owner-cli').restrictWindowsAcl(file);
}
function ensureBackupDirectory(create=false){
 if(create)fs.mkdirSync(backupDir,{recursive:true,mode:0o700});
 let info;
 try{info=fs.lstatSync(backupDir)}catch(e){if(!create&&e.code==='ENOENT')return false;throw e}
 if(!info.isDirectory()||info.isSymbolicLink())fail('E_BACKUP','備份資料夾不是安全的實體目錄，已拒絕存取');
 return true;
}
function items(){
 if(!ensureBackupDirectory())return [];
 return fs.readdirSync(backupDir,{withFileTypes:true}).filter(entry=>entry.isFile()&&MANAGED.test(entry.name)).map(entry=>{
  const full=path.join(backupDir,entry.name),stat=fs.lstatSync(full),parts=entry.name.match(MANAGED);
  return {name:entry.name,size:stat.size,createdAt:stat.birthtime.toISOString(),type:parts[2]==='auto'?'auto':'manual'};
 }).sort((a,b)=>b.name.localeCompare(a.name));
}
function isAllowedFilename(name){return typeof name==='string'&&MANAGED.test(name)&&name===path.basename(name)}
function safeFile(name){
 if(!isAllowedFilename(name))fail('E_BACKUP','無效的備份檔案名稱');
 const full=path.join(backupDir,name);
 let stat;try{stat=fs.lstatSync(full)}catch(e){if(e.code==='ENOENT')fail('E_BACKUP','找不到指定備份檔案');throw e}
 if(!stat.isFile()||stat.isSymbolicLink())fail('E_BACKUP','備份檔案必須是一般檔案');
 return {path:full,size:stat.size};
}
function verifyCurrent(db){
 const ok=db.prepare('PRAGMA quick_check').all();
 if(ok.length!==1||Object.values(ok[0])[0]!=='ok')fail('E_DB','原始資料庫完整性檢查失敗，禁止備份');
 if(db.prepare('PRAGMA foreign_key_check').all().length)fail('E_DB','原始資料庫外鍵關聯有錯，禁止備份');
 const counts={};
 for(const table of ['customers','projects','quotes','payments','costs','inventory_items','inventory_movements','material_requirements','work_templates','quote_material_plans'])
  counts[table]=db.prepare('SELECT COUNT(*) AS n FROM "'+table+'"').get().n;
 return counts;
}
function saveSettings(next,db=conn()){
 const valid=validateSetting(next);
 db.prepare("UPDATE backup_settings SET interval_days=?,retention_count=?,updated_at=datetime('now') WHERE id=1").run(valid.intervalDays,valid.retentionCount);
 prune(db);
 return status(db);
}
function prune(db=conn()){
 const limit=settings(db).retentionCount;
 const automated=items().filter(it=>it.type==='auto');
 for(const old of automated.slice(limit))fs.unlinkSync(safeFile(old.name).path);
}
function stamp(now){
 const local=new Date(now.getTime()-now.getTimezoneOffset()*60000);
 return local.toISOString().slice(0,19).replace(/[-:]/g,'').replace('T','-');
}
function makeBackup(type='manual',now=new Date(),db=conn()){
 if(!['manual','auto'].includes(type))fail('E_CONFIG','備份類型不支援');
 if(running)fail('E_BACKUP_BUSY','備份正在執行，請稍後再試');
 running=true;
 let target=null;
 try{
  const baseline=verifyCurrent(db);
  ensureBackupDirectory(true);protect(backupDir);
  target=path.join(backupDir,'plumber-backup-'+stamp(now)+'-'+crypto.randomBytes(3).toString('hex')+'-'+type+'.sqlite');
  db.exec("VACUUM INTO '"+target.replace(/'/g,"''")+"'");
  protect(target);
  const saved=new DatabaseSync(target,{readOnly:true});
  try{
   if(saved.prepare('PRAGMA quick_check').get().quick_check!=='ok')fail('E_BACKUP','備份資料庫完整性驗證失敗');
   for(const [table,n] of Object.entries(baseline)){
    if(saved.prepare('SELECT COUNT(*) AS n FROM "'+table+'"').get().n!==n)
     fail('E_BACKUP','備份資料表筆數不一致（'+table+'）');
   }
   if(saved.prepare('PRAGMA foreign_key_check').all().length)fail('E_BACKUP','備份資料庫關聯驗證失敗');
  }finally{saved.close()}
  if(type==='auto'){
   db.prepare("UPDATE backup_settings SET last_auto_at=?,last_error=NULL WHERE id=1").run(now.toISOString());
  }
  // A fully verified new backup must survive even if old file cleanup fails.
  try{prune(db)}catch(e){console.error('[E_BACKUP] 舊備份清理失敗，已保留新備份：'+String(e.code||e.name))}

  const entry=items().find(x=>x.name===path.basename(target));
  return entry||{name:path.basename(target),type,size:fs.statSync(target).size,createdAt:now.toISOString()};
 }catch(error){
  if(target&&fs.existsSync(target)){try{fs.unlinkSync(target)}catch{}}
  if(type==='auto'){try{db.prepare('UPDATE backup_settings SET last_error=? WHERE id=1').run('自動備份失敗（'+String(error.code||'E_BACKUP')+'）')}catch{}}
  throw error;
 }finally{running=false}
}
function dueAt(s){
 const last=s.lastAutoAt?Date.parse(s.lastAutoAt):NaN;
 return Number.isFinite(last)?new Date(last+s.intervalDays*86400000).toISOString():null;
}
function status(db=conn()){
 const s=settings(db);return {...s,nextDueAt:dueAt(s),serverOnly:true,running,backups:items()};
}
function autoOnce(now=new Date(),db=conn()){
 const s=settings(db),due=dueAt(s);
 if(running||due&&Date.parse(due)>now.getTime())return null;
 return makeBackup('auto',now,db);
}
function startScheduler(){
 if(timer||process.env.VERCEL)return;
 const run=()=>{try{autoOnce()}catch(e){console.error('[E_BACKUP] 排程備份失敗：'+String(e.code||e.name))}};
 setImmediate(run);
 timer=setInterval(run,60*1000);
 timer.unref?.();
}
function stopScheduler(){if(timer){clearInterval(timer);timer=null}}
function deleteBackup(name){
 if(running)fail('E_BACKUP_BUSY','目前正在備份，請稍後再刪除');
 fs.unlinkSync(safeFile(name).path);
 return status();
}
module.exports={settings,validateSetting,saveSettings,items,isAllowedFilename,safeFile,verifyCurrent,makeBackup,prune,dueAt,status,autoOnce,startScheduler,stopScheduler,deleteBackup,stamp};
