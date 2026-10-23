'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {Worker}=require('node:worker_threads');
const root=path.resolve(__dirname,'..');
const backupDir=path.join(root,'backups');
const MANAGED=/^plumber-backup-(\d{8}-\d{6})-[0-9a-f]{6}(?:-(auto|manual))?\.sqlite$/;
const STALE_GRACE_MS=60*60*1000; // Creator process is no longer running.
const LEGACY_GRACE_MS=24*60*60*1000; // Claims without a trustworthy PID.
let running=false,timer=null,activeWorker=null;
const secureHistoryCache=new Map();
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
 // Existing/restored Windows directories can retain explicit Everyone/Users
 // permissions even if every individual snapshot is protected. Reapply and
 // verify the directory DACL *before* listing, downloading, or pruning.
 // Do not cache directory ACLs: an external process can change them.
 protect(backupDir);
 return true;
}
// A crash can strand .partial/.lock next to a failed VACUUM INTO.
// Never touch managed published .sqlite snapshots, or other filenames.
// Check process liveness and a grace period before reclaiming a claim.
function backupProcessAlive(pid){
 if(!Number.isSafeInteger(pid)||pid<=0)return true;
 try{process.kill(pid,0);return true}catch(e){return e.code!=='ESRCH'}
}
function reclaimAbandoned(now=Date.now()){
 if(!ensureBackupDirectory())return 0;
 const bases=new Set();
 for(const name of fs.readdirSync(backupDir)){
  for(const suffix of ['.lock','.partial']){
   if(name.endsWith(suffix)&&MANAGED.test(name.slice(0,-suffix.length)))
    bases.add(name.slice(0,-suffix.length));
  }
 }
 let cleaned=0;
 for(const name of bases){
  const published=path.join(backupDir,name);
  const lock=published+'.lock',partial=published+'.partial';
  const found=[];
  for(const file of [lock,partial]){
   let stat;
   try{stat=fs.lstatSync(file)}catch(e){if(e.code==='ENOENT')continue;throw e}
   if(!stat.isFile()||stat.isSymbolicLink())
    fail('E_BACKUP','備份暫存項目不是安全的實體檔案，拒絕清理：'+path.basename(file));
   found.push({file,stat});
  }
  if(!found.length)continue;
  let creator=null;
  if(found.some(x=>x.file===lock)){
   try{
    const value=JSON.parse(fs.readFileSync(lock,'utf8'));
    if(Number.isSafeInteger(value.pid)&&value.pid>0)creator=value.pid;
   }catch{}
  }
  if(creator!==null&&backupProcessAlive(creator))continue;
  const grace=creator===null?LEGACY_GRACE_MS:STALE_GRACE_MS;
  if(found.some(x=>now-x.stat.mtimeMs<grace))continue;
  // A verified backup may exist even if the process crashed before
  // removing its lock. The suffix-only cleanup never unlinks it.
  for(const item of found){fs.unlinkSync(item.file);cleaned++}
 }
 if(cleaned)console.warn('[E_BACKUP] 已清理 '+cleaned+' 個過期且無作業程序的中斷備份暫存檔／鎖定檔');
 return cleaned;
}
function protectExistingHistory(file){
 if(process.platform!=='win32')return;
 const before=fs.lstatSync(file);
 if(!before.isFile()||before.isSymbolicLink())fail('E_BACKUP','既有備份不是安全的實體檔案');
 const marker=String(before.size)+':'+String(before.mtimeMs)+':'+String(before.ctimeMs);
 if(secureHistoryCache.get(file)===marker)return;
 protect(file);
 const after=fs.lstatSync(file);
 secureHistoryCache.set(file,String(after.size)+':'+String(after.mtimeMs)+':'+String(after.ctimeMs));
}
function items(){
 if(!ensureBackupDirectory())return [];
 return fs.readdirSync(backupDir,{withFileTypes:true}).filter(entry=>entry.isFile()&&MANAGED.test(entry.name)).map(entry=>{
  const full=path.join(backupDir,entry.name),stat=fs.lstatSync(full),parts=entry.name.match(MANAGED);
  if(!stat.isFile()||stat.isSymbolicLink())fail('E_BACKUP','備份歷史含不安全的檔案');
  protectExistingHistory(full);
  return {name:entry.name,size:stat.size,createdAt:stat.birthtime.toISOString(),type:parts[2]==='auto'?'auto':'manual'};
 }).sort((a,b)=>b.name.localeCompare(a.name));
}
function isAllowedFilename(name){return typeof name==='string'&&MANAGED.test(name)&&name===path.basename(name)}
function safeFile(name){
 if(!isAllowedFilename(name))fail('E_BACKUP','無效的備份檔案名稱');
 if(!ensureBackupDirectory())fail('E_BACKUP','備份資料夾不存在');
 const full=path.join(backupDir,name);
 let stat;try{stat=fs.lstatSync(full)}catch(e){if(e.code==='ENOENT')fail('E_BACKUP','找不到指定備份檔案');throw e}
 if(!stat.isFile()||stat.isSymbolicLink())fail('E_BACKUP','備份檔案必須是一般檔案');
 protectExistingHistory(full);
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
 if(running||activeWorker)fail('E_BACKUP_BUSY','備份執行中，請稍後儲存設定');
 const valid=validateSetting(next);
 db.prepare("UPDATE backup_settings SET interval_days=?,retention_count=?,updated_at=datetime('now') WHERE id=1").run(valid.intervalDays,valid.retentionCount);
 try{
  prune(db);
  db.prepare('UPDATE backup_settings SET last_error=NULL WHERE id=1').run();
 }catch(e){
  const reason=String(e.code||'E_BACKUP');
  db.prepare('UPDATE backup_settings SET last_error=? WHERE id=1').run('備份保留份數已儲存，但清理舊版失敗（'+reason+'），請確認備份檔案權限');
  console.error('[E_BACKUP] 修改設定後清理舊備份失敗：'+reason);
 }
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
 let target=null,temp=null,owned=false,published=false,claim=null;
 try{
  verifyCurrent(db); // Preflight integrity, not a mutable row-count baseline.
  ensureBackupDirectory(true);
  reclaimAbandoned();
  target=path.join(backupDir,'plumber-backup-'+stamp(now)+'-'+crypto.randomBytes(3).toString('hex')+'-'+type+'.sqlite');
  // Claim the destination exclusively before SQLite writes it. A collision
  // must never delete an already verified older backup.
  claim=fs.openSync(target+'.lock','wx',0o600);
  fs.writeFileSync(claim,JSON.stringify({pid:process.pid,createdAt:Date.now()}));
  if(fs.existsSync(target))fail('E_BACKUP','備份名稱已存在，不會覆寫或刪除原本備份');
  temp=target+'.partial';
  if(fs.existsSync(temp))fail('E_BACKUP','同名備份暫存檔仍存在，已拒絕覆寫');
  owned=true;
  // A partial SQLite must never match MANAGED or appear in history/download.
  db.exec("VACUUM INTO '"+temp.replace(/'/g,"''")+"'");
  protect(temp);
  const saved=new DatabaseSync(temp,{readOnly:true});
  try{
   if(saved.prepare('PRAGMA quick_check').get().quick_check!=='ok')fail('E_BACKUP','備份資料庫完整性驗證失敗');
   // Verify all business tables from the completed snapshot itself.
   // Concurrent business writes can legitimately alter source counts.
   verifyCurrent(saved);
  }finally{saved.close()}
  if(fs.existsSync(target))fail('E_BACKUP','正式備份名稱已存在，禁止覆寫');
  fs.renameSync(temp,target); // atomic within the same backups directory
  published=true;
  temp=null;
  if(type==='auto'){
   db.prepare("UPDATE backup_settings SET last_auto_at=?,last_error=NULL WHERE id=1").run(now.toISOString());
  }
  // A fully verified new backup must survive even if old file cleanup fails.
  try{prune(db)}catch(e){
   const code=String(e.code||'E_BACKUP');
   console.error('[E_BACKUP] 舊備份清理失敗，已保留新備份：'+code);
   try{db.prepare('UPDATE backup_settings SET last_error=? WHERE id=1').run('自動備份清理失敗（'+code+'），部分舊版尚未刪除，請檢查磁碟權限')}catch{}
  }

  const entry=items().find(x=>x.name===path.basename(target));
  return entry||{name:path.basename(target),type,size:fs.statSync(target).size,createdAt:now.toISOString()};
 }catch(error){
  // Never remove a published snapshot or someone else's prior backup.
  if(owned&&!published&&temp&&fs.existsSync(temp)){try{fs.unlinkSync(temp)}catch{}}
  if(type==='auto'){try{db.prepare('UPDATE backup_settings SET last_error=? WHERE id=1').run('自動備份失敗（'+String(error.code||'E_BACKUP')+'）')}catch{}}
  throw error;
 }finally{
  if(claim!==null){try{fs.closeSync(claim)}catch{};try{fs.unlinkSync(target+'.lock')}catch{}}
  running=false;
 }
}
function dueAt(s){
 const last=s.lastAutoAt?Date.parse(s.lastAutoAt):NaN;
 return Number.isFinite(last)?new Date(last+s.intervalDays*86400000).toISOString():null;
}
function status(db=conn()){
 const s=settings(db);return {...s,nextDueAt:dueAt(s),serverOnly:true,running:running||Boolean(activeWorker),backups:items()};
}
function autoOnce(now=new Date(),db=conn()){
 const s=settings(db),due=dueAt(s);
 if(running||due&&Date.parse(due)>now.getTime())return null;
 return makeBackup('auto',now,db);
}

function makeBackupAsync(type='manual'){
 if(!['manual','auto'].includes(type))return Promise.reject(Object.assign(new Error('不支援的備份類型'),{code:'E_CONFIG'}));
 if(running||activeWorker)return Promise.reject(Object.assign(new Error('備份正在執行，請稍後再試'),{code:'E_BACKUP_BUSY'}));
 return new Promise((resolve,reject)=>{
  let settled=false;
  const worker=new Worker(path.join(__dirname,'backup-worker.js'),{workerData:{type}});
  activeWorker=worker;
  function finish(error,value){
   if(settled)return;
   settled=true;
   activeWorker=null;
   if(error&&type==='auto'){
    try{conn().prepare('UPDATE backup_settings SET last_error=? WHERE id=1').run('排程備份背景程序失敗（'+String(error.code||'E_BACKUP')+'）')}catch{}
   }
   if(error)reject(error);else resolve(value);
  }
  worker.on('message',message=>{
   if(message?.ok)finish(null,message.value);
   else{const e=new Error('備份背景程序執行失敗');e.code=message?.code||'E_BACKUP';finish(e)}
  });
  worker.on('error',error=>{const e=new Error('備份背景程序無法啟動');e.code=error.code||'E_BACKUP';finish(e)});
  worker.on('exit',code=>{if(!settled){const e=new Error('備份背景程序結束（'+code+'）');e.code='E_BACKUP';finish(e)}});
 });
}
function autoOnceAsync(now=new Date(),db=conn()){
 const s=settings(db),due=dueAt(s);
 if(running||activeWorker||due&&Date.parse(due)>now.getTime())return Promise.resolve(null);
 return makeBackupAsync('auto');
}
function startScheduler(){
 if(timer||process.env.VERCEL)return;
 const run=()=>{
  if(!activeWorker&&!running){
   try{reclaimAbandoned()}catch(e){console.error('[E_BACKUP] 清理中斷備份暫存檔失敗：'+String(e.code||e.name))}
  }
  autoOnceAsync().catch(e=>console.error('[E_BACKUP] 排程備份失敗：'+String(e.code||e.name)))
 };
 setImmediate(run);
 timer=setInterval(run,60*1000);
 timer.unref?.();
}
function stopScheduler(){if(timer){clearInterval(timer);timer=null}}
function deleteBackup(name){
 if(running||activeWorker)fail('E_BACKUP_BUSY','目前正在備份，請稍後再刪除');
 fs.unlinkSync(safeFile(name).path);
 return status();
}
module.exports={settings,validateSetting,saveSettings,items,isAllowedFilename,safeFile,verifyCurrent,makeBackup,makeBackupAsync,prune,dueAt,status,autoOnce,autoOnceAsync,startScheduler,stopScheduler,deleteBackup,stamp,reclaimAbandoned};
