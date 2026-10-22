'use strict';
/* Windows owner hand-off: native Node only; no installer dependency. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawn,execFileSync}=require('node:child_process');
const projectRoot=path.resolve(__dirname,'..');
process.chdir(projectRoot);
const envFile=path.join(projectRoot,'.env');
const help={
 E_NODE:'請到 https://nodejs.org/en/download 安裝 Node.js LTS（建議 v24，最低 v22.13），完成後重開視窗。',
 E_ENV:'找不到設定檔。請在完整專案資料夾雙擊「啟動水電好管家.bat」。',
 E_CONFIG:'密碼、系統密鑰或埠設定不完整；請勿傳送 .env，將錯誤代碼交給交付人員。',
 E_PATH:'請確認專案位於有權限的本機磁碟，勿放唯讀、網路磁碟或同步中資料夾。',
 E_DB:'資料庫無法讀取或完整性檢查失敗：停止使用並保留 data/backups，交由交付人員判斷。',
 E_PORT:'服務埠被占用。可能已啟動另一份程式；先試開 http://127.0.0.1:3000。',
 E_BACKUP:'備份失敗：檢查可用空間及備份資料夾權限；備份成功前請勿升級。',
 E_VERCEL:'本機固定 SQLite 部署助手不可在 Vercel 使用。',
 E_USAGE:'只支援 start、check、backup。'
};
function fail(code,message){const e=new Error(message||code);e.ownerCode=code;throw e}
function versionOk(v=process.versions.node){const [major,minor]=v.split('.').map(Number);return major>22||(major===22&&minor>=13)}
function parseSettings(raw){
 const obj={};
 for(const line of raw.split(/\r?\n/)){
  const s=line.trim();if(!s||s.startsWith('#'))continue;
  const m=s.match(/^([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);
  if(!m)fail('E_CONFIG','設定檔的某一行格式不正確');
  const k=m[1];if(Object.hasOwn(obj,k))fail('E_CONFIG','設定檔含重複鍵值：'+k);
  let v=m[2].trim();
  if(v.length>=2&&((v[0]==='"'&&v.at(-1)==='"')||(v[0]==="'"&&v.at(-1)==="'")))v=v.slice(1,-1);
  obj[k]=v;
 }
 return obj;
}
function validateSettings(values){
 if(!values.SQLITE_PATH?.trim())fail('E_CONFIG','缺少 SQLITE_PATH');
 if(!values.APP_ADMIN_PASSWORD||values.APP_ADMIN_PASSWORD.length<12||values.APP_ADMIN_PASSWORD.startsWith('REPLACE_'))fail('E_CONFIG','管理密碼至少 12 字元，且不能使用範例字串');
 if(!values.AUTH_SECRET||values.AUTH_SECRET.length<32||values.AUTH_SECRET.startsWith('REPLACE_'))fail('E_CONFIG','AUTH_SECRET 至少 32 個隨機字元');
 for(const k of ['SQLITE_PATH','APP_ADMIN_PASSWORD','AUTH_SECRET'])if(/[\r\n]/.test(values[k]))fail('E_CONFIG','設定欄位不能包含換行');
 if(/^(?:\\|\/\/)/.test(values.SQLITE_PATH.replace(/\\/g,'/'))||path.isAbsolute(values.SQLITE_PATH)||path.win32.isAbsolute(values.SQLITE_PATH))fail('E_PATH','請勿使用網路磁碟或絕對路徑；資料庫只能位於本專案 data 資料夾');
 const databasePath=path.resolve(projectRoot,values.SQLITE_PATH);
 if(path.dirname(databasePath)!==path.join(projectRoot,'data')||!databasePath.toLowerCase().endsWith('.sqlite'))fail('E_PATH','資料庫只能使用 data 資料夾下的 .sqlite 檔案，避免誤改其他目錄權限');
 if(process.env.VERCEL)fail('E_VERCEL');
 const port=values.PORT?Number(values.PORT):3000;
 if(!Number.isInteger(port)||port<1024||port>65535)fail('E_CONFIG','PORT 必須是 1024～65535');
 return {port,databasePath};
}
// Windows NTFS ignores POSIX mode bits. Explicitly restrict secrets and data to
// the current Windows SID, SYSTEM and Administrators. Fail closed on ACL errors.
function restrictWindowsAcl(target){
 if(process.platform!=='win32')return;
 try{
  const who=execFileSync('whoami.exe',['/user','/fo','csv','/nh'],{encoding:'utf8',windowsHide:true});
  const sid=who.match(/S-1-\d+(?:-\d+)+/)?.[0];
  if(!sid)fail('E_PATH','無法讀取 Windows 使用者 SID');
  // Overwrite the entire DACL, not just inherited ACEs. Never recurse into
  // arbitrary user directories, and verify no unapproved ACE survives.
  const script=String.raw`
$ErrorActionPreference = 'Stop'
$target = $env:OWNER_ACL_PATH
$sid = $env:OWNER_ACL_SID
$allowed = @($sid, 'S-1-5-18', 'S-1-5-32-544')
$isFolder = [System.IO.Directory]::Exists($target)
$acl = if ($isFolder) { [System.IO.Directory]::GetAccessControl($target) } else { [System.IO.File]::GetAccessControl($target) }
$acl.SetAccessRuleProtection($true, $false)
foreach ($entry in @($acl.Access)) { [void]$acl.RemoveAccessRuleSpecific($entry) }
$inherit = if ($isFolder) { [System.Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit' } else { [System.Security.AccessControl.InheritanceFlags]::None }
foreach ($who in $allowed) {
  $identity = [System.Security.Principal.SecurityIdentifier]::new($who)
  $rule = [System.Security.AccessControl.FileSystemAccessRule]::new($identity, [System.Security.AccessControl.FileSystemRights]::FullControl, $inherit, [System.Security.AccessControl.PropagationFlags]::None, [System.Security.AccessControl.AccessControlType]::Allow)
  [void]$acl.AddAccessRule($rule)
}
if ($isFolder) { [System.IO.Directory]::SetAccessControl($target,$acl) } else { [System.IO.File]::SetAccessControl($target,$acl) }
$confirmed = if ($isFolder) { [System.IO.Directory]::GetAccessControl($target) } else { [System.IO.File]::GetAccessControl($target) }
if (-not $confirmed.AreAccessRulesProtected) { throw 'NTFS inheritance remains enabled' }
foreach ($entry in $confirmed.Access) {
  $principal = $entry.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value
  if ($allowed -notcontains $principal -or $entry.AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow) { throw 'Unexpected NTFS permission remains' }
}
`;
  execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{
   env:{...process.env,OWNER_ACL_PATH:target,OWNER_ACL_SID:sid},
   encoding:'utf8',windowsHide:true,timeout:30000,stdio:['ignore','pipe','pipe']
  });
 }catch(e){
  if(e.ownerCode)throw e;
  if(process.env.OWNER_ACL_DEBUG==='1'&&e.stderr)
   console.error('[Windows ACL 診斷]',String(e.stderr).slice(-1800));
  fail('E_PATH','Windows ACL 安全檢查未通過（'+(e.code||e.name)+'），為保護密碼及客戶資料，已停止操作');
 }
}
function secureDatabaseStorage(conf){
 const ownDir=path.join(projectRoot,'data');
 if(path.dirname(conf.databasePath)!==ownDir)fail('E_PATH','資料庫必須存放在專用 data 目錄');
 fs.mkdirSync(ownDir,{recursive:true,mode:0o700});
 fs.accessSync(ownDir,fs.constants.R_OK|fs.constants.W_OK);
 restrictWindowsAcl(ownDir);
 // Only application SQLite files are touched. Never traverse a parent folder.
 for(const file of [conf.databasePath,conf.databasePath+'-wal',conf.databasePath+'-shm'])
  if(fs.existsSync(file))restrictWindowsAcl(file);
}
function printNewPassword(pw){
 console.log('\n***** 首次建立管理密碼（只在建立時顯示）*****');
 console.log(pw);
 console.log('請現在抄下密碼妥善保管；勿把畫面或 .env 傳給其他人。');
 console.log('忘記密碼：授權管理員可在 .env 查看 APP_ADMIN_PASSWORD。');
 console.log('*******************************************\n');
}
function createFirstTimeConfig(){
 if(fs.existsSync(envFile))return null;
 const password=crypto.randomBytes(24).toString('base64url');
 const secret=crypto.randomBytes(48).toString('base64url');
 const text='# 首次啟動自動建立。此檔含管理密碼，不可外傳或提交 GitHub。\n'+
  'SQLITE_PATH=./data/plumber.sqlite\nAPP_ADMIN_PASSWORD='+password+'\nAUTH_SECRET='+secret+'\n';
 try{
  fs.writeFileSync(envFile,text,{mode:0o600,flag:'wx',encoding:'utf8'});
  try{restrictWindowsAcl(envFile)}catch(e){try{fs.unlinkSync(envFile)}catch{}throw e}
 }catch(e){if(e.code==='EEXIST')return null;if(e.ownerCode)throw e;fail('E_PATH','無法建立 .env（'+(e.code||'寫入失敗')+'）')}
 return password;
}
function validatedConfig(){
 if(!fs.existsSync(envFile))fail('E_ENV','找不到 .env');
 let values;try{values=parseSettings(fs.readFileSync(envFile,'utf8'))}catch(e){if(e.ownerCode)throw e;fail('E_ENV','無法讀取設定檔')}
 const conf=validateSettings(values);
 for(const k of ['SQLITE_PATH','APP_ADMIN_PASSWORD','AUTH_SECRET'])process.env[k]=values[k];
 if(values.PORT)process.env.PORT=values.PORT;
 return conf;
}
// Never let SQLite auto-create a replacement after a previous installation.
// Only the same process which just created the first .env may bootstrap a new DB.
function assertDatabasePresent(conf,allowFirstInstall=false){
 let info=null;
 try{info=fs.statSync(conf.databasePath)}catch(error){
  if(error.code!=='ENOENT')fail('E_DB','無法檢查既有資料庫：'+(error.code||'存取失敗'));
 }
 if(info){
  if(!info.isFile()||info.size===0)fail('E_DB','資料庫不是有效的資料檔，或檔案已經是 0 位元組；已停止以避免資料遺失');
  return true;
 }
 if(!allowFirstInstall)fail('E_DB','原本設定的 SQLite 資料庫不見了；為避免重建空白資料庫，已停止。請保留 data 和 backups，聯絡交付者協助還原');
 if(fs.existsSync(conf.databasePath+'-wal')||fs.existsSync(conf.databasePath+'-shm'))
  fail('E_DB','尚有舊 SQLite WAL/SHM 資料，拒絕建立空白資料庫；請聯絡交付者');
 return false;
}
// Read-only structural verification must happen before lib/sqlite.connection()
// executes any CREATE TABLE IF NOT EXISTS migrations. Never heal broken business data.
function verifyEstablishedSchema(conf,allowFirstInstall=false){
 const existing=assertDatabasePresent(conf,allowFirstInstall);
 if(!existing)return false;
 let reader;
 try{
  const {DatabaseSync}=require('node:sqlite');
  reader=new DatabaseSync(conf.databasePath,{readOnly:true});
  const integrity=reader.prepare('PRAGMA quick_check').all();
  if(integrity.length!==1||Object.values(integrity[0])[0]!=='ok')fail('E_DB','原始 SQLite 資料完整性檢查未通過，已停止升級');
  const tables=new Set(reader.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name));
  const baseTables=['customers','projects','quotes','payments','costs'];
  for(const table of baseTables)if(!tables.has(table))
   fail('E_DB','既有資料庫缺少核心資料表 '+table+'，可能有資料遺失；拒絕自動補建空表');
  // v0.2 -> v0.3 -> v0.4: additive upgrades are allowed only from
  // complete known prior schemas; half-installed components are rejected.
  const inventory=['inventory_items','inventory_movements','material_requirements'];
  const catalog=['work_templates','quote_material_plans'];
  for(const [label,group] of [['v0.3 倉儲',inventory],['v0.4 工項',catalog]]){
   const count=group.filter(name=>tables.has(name)).length;
   if(count!==0&&count!==group.length)
    fail('E_DB',label+' 的資料表不完整，拒絕建立可能覆蓋原有資料的空表');
  }
  if(catalog.some(t=>tables.has(t))&&!inventory.every(t=>tables.has(t)))
   fail('E_DB','工項資料存在但倉儲基礎資料遺失，已停止升級');
  const required={
   customers:['id','name'],projects:['id','customer_id','title','amount'],
   quotes:['id','number','project_id','customer_id','items'],
   payments:['id','project_id','paid_date','amount'],
   costs:['id','project_id','cost_date','category','amount'],
   inventory_items:['id','sku','name','unit','unit_cost'],
   inventory_movements:['id','item_id','kind','qty','unit_cost'],
   material_requirements:['id','project_id','item_id','planned_qty'],
   work_templates:['id','name','kind','default_qty','unit_price','materials'],
   quote_material_plans:['project_id','item_id','quote_id','planned_qty']
  };
  for(const [table,columns] of Object.entries(required)){
   if(!tables.has(table))continue;
   const actual=new Set(reader.prepare('PRAGMA table_info("'+table+'")').all().map(c=>c.name));
   for(const col of columns)if(!actual.has(col))
    fail('E_DB','既有資料表 '+table+' 缺少必要欄位 '+col+'；不能自動升級');
  }
  const fk=reader.prepare('PRAGMA foreign_key_check').all();
  if(fk.length)fail('E_DB','既有資料庫外鍵關聯檢查失敗（'+fk.length+' 項）');
  return true;
 }catch(error){
  if(error.ownerCode)throw error;
  fail('E_DB','既有 SQLite 資料表檢查失敗（'+(error.code||error.name||'未知')+'），已停止升級');
 }finally{if(reader)reader.close()}
}
function database(){
 try{
  const db=require('../lib/sqlite').connection();
  const r=db.prepare('PRAGMA quick_check').all();
  if(r.length!==1||Object.values(r[0])[0]!=='ok')fail('E_DB','SQLite quick_check 未通過');
  const bad=db.prepare('PRAGMA foreign_key_check').all();
  if(bad.length)fail('E_DB','外鍵關聯有 '+bad.length+' 項異常');
  const tables=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name));
  for(const t of ['customers','projects','quotes','inventory_items','inventory_movements','work_templates'])if(!tables.has(t))fail('E_DB','缺少資料表：'+t);
  return db;
 }catch(e){if(e.ownerCode)throw e;fail('E_DB','SQLite 操作失敗（'+(e.code||e.name||'未知')+'）')}
}
function prerequisite(allowCreate){
 if(!versionOk())fail('E_NODE','偵測到 Node.js '+process.version+'，最低版本為 v22.13');
 if(process.env.VERCEL)fail('E_VERCEL');
 const generated=allowCreate?createFirstTimeConfig():null;
 // Display the first-time password before any fallible database I/O.
 if(generated)printNewPassword(generated);
 const conf=validatedConfig();
 restrictWindowsAcl(envFile);
 try{secureDatabaseStorage(conf)}
 catch(e){if(e.ownerCode)throw e;fail('E_PATH','無法讀寫資料庫目錄（'+(e.code||'權限問題')+'）')}
 verifyEstablishedSchema(conf,Boolean(generated));
 database();
 return {...conf,generated};
}
function stamp(d=new Date()){
 const local=new Date(d.getTime()-d.getTimezoneOffset()*60000);
 return local.toISOString().replace(/[-:]/g,'').replace('T','-').slice(0,15);
}
function backup(){
 const db=database(),dir=path.join(projectRoot,'backups');
 try{fs.mkdirSync(dir,{recursive:true,mode:0o700});restrictWindowsAcl(dir);for(const n of fs.readdirSync(dir)){if(/^plumber-backup-.*\.sqlite$/i.test(n))restrictWindowsAcl(path.join(dir,n))}}catch(e){if(e.ownerCode)throw e;fail('E_BACKUP','無法建立或保護 backups 資料夾')}
 const target=path.join(dir,'plumber-backup-'+stamp()+'-'+crypto.randomBytes(3).toString('hex')+'.sqlite');
 try{
  db.exec("VACUUM INTO '"+target.replace(/'/g,"''")+"'");
  restrictWindowsAcl(target);
  const {DatabaseSync}=require('node:sqlite');
  const check=new DatabaseSync(target,{readOnly:true});
  try{if(check.prepare('PRAGMA quick_check').get().quick_check!=='ok')throw Error('備份驗證失敗')}
  finally{check.close()}
  console.log('[完成] 已建立一致性 SQLite 備份：'+target);
  console.log('[驗證] SQLite quick_check 正常；大小 '+(fs.statSync(target).size/1048576).toFixed(2)+' MB');
  console.log('請另複製一份到受保護的外接硬碟或加密備份位置。');
 }catch(e){try{if(fs.existsSync(target))fs.unlinkSync(target)}catch{}
  fail('E_BACKUP','SQLite VACUUM INTO 或備份驗證失敗（'+(e.code||e.message)+'）')}
}
function launch(url){
 if(process.env.OWNER_NO_BROWSER==='1')return;
 try{
  let bin,args;if(process.platform==='win32'){bin='explorer.exe';args=[url]}
  else if(process.platform==='darwin'){bin='open';args=[url]}
  else return;
  const child=spawn(bin,args,{detached:true,stdio:'ignore',windowsHide:true});
  child.on('error',()=>{});child.unref();
 }catch{}
}
function errorReport(e){
 const k=e.ownerCode||'E_DB';
 console.error('\n[錯誤 '+k+'] '+e.message);
 console.error('[處理方式] '+(help[k]||'保留資料，聯絡交付人員。'));
 console.error('回報時請提供錯誤代碼及畫面截圖，切勿提供管理密碼或 .env。');
}
async function execute(command=process.argv[2]){
 if(!['start','check','backup'].includes(command))fail('E_USAGE','不支援的命令：'+String(command||'未指定'));
 console.log('水電好管家｜業主部署助手');
 const config=prerequisite(command==='start');
 console.log('[通過] Node.js '+process.version);
 console.log('[通過] SQLite 已初始化，資料完整性檢查正常');
 console.log('[資料庫] '+config.databasePath);
 if(command==='check'){console.log('[通過] 部署檢查完成；可雙擊「啟動水電好管家.bat」。');return}
 if(command==='backup'){backup();return}
 const server=require('../server'),url='http://127.0.0.1:'+config.port;
 server.on('error',e=>{errorReport(Object.assign(new Error('無法啟動服務（'+(e.code||e.message)+'）'),{ownerCode:e.code==='EADDRINUSE'?'E_PORT':'E_PATH'}));process.exitCode=1});
 server.listen(config.port,'127.0.0.1',()=>{
  console.log('[啟動成功] '+url);
  console.log('請保持這個視窗開啟；關閉視窗網站會停止。Ctrl+C 可停止。');
  console.log('此網址只能在本機使用；遠端或多人使用須另行部署 HTTPS。');
  launch(url);
 });
}
if(require.main===module)execute().catch(e=>{errorReport(e);process.exitCode=1});
module.exports={versionOk,parseSettings,validateSettings,createFirstTimeConfig,restrictWindowsAcl,secureDatabaseStorage,assertDatabasePresent,verifyEstablishedSchema,prerequisite,stamp,help};
