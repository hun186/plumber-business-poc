'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const owner=require('../tools/owner-cli');

test('owner config validation and minimum Node.js requirement',()=>{
 assert.equal(owner.versionOk('22.12.9'),false);
 assert.equal(owner.versionOk('22.13.0'),true);
 assert.equal(owner.versionOk('24.1.0'),true);
 const cfg={SQLITE_PATH:'./data/a.sqlite',APP_ADMIN_PASSWORD:'unique-strong-password',AUTH_SECRET:'x'.repeat(48)};
 assert.equal(owner.validateSettings(cfg).port,3000);
 assert.throws(()=>owner.validateSettings({...cfg,APP_ADMIN_PASSWORD:'REPLACE_WITH_PASSWORD'}),/管理密碼/);
 assert.throws(()=>owner.validateSettings({...cfg,AUTH_SECRET:'short'}),/AUTH_SECRET/);
 assert.throws(()=>owner.validateSettings({...cfg,PORT:'99999'}),/PORT/);
 assert.throws(()=>owner.validateSettings({...cfg,SQLITE_PATH:'\\\\server\\share\\db.sqlite'}),/網路磁碟|資料庫/);
});
test('owner config parser rejects duplicate or malformed .env entries',()=>{
 const valid=owner.parseSettings('# header\r\nSQLITE_PATH=./data/db.sqlite\r\nAPP_ADMIN_PASSWORD="a long sample password"\r\nAUTH_SECRET=abcdefghijklmnopqrstuvwxyz012345\r\n');
 assert.equal(valid.APP_ADMIN_PASSWORD,'a long sample password');
 assert.throws(()=>owner.parseSettings('SQLITE_PATH=one\nSQLITE_PATH=two'),/重複/);
 assert.throws(()=>owner.parseSettings('missing equals'),/格式/);
 assert.match(owner.stamp(new Date('2026-10-20T10:20:05Z')),/^\d{8}-\d{6}$/);
});
test('a clean owner folder passes diagnostics and creates a verified VACUUM backup',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'owner-install-'));
 try{
  for(const folder of ['tools','lib','db'])fs.mkdirSync(path.join(root,folder));
  const copy=file=>fs.copyFileSync(path.join(__dirname,'..',file),path.join(root,file));
  for(const file of ['tools/owner-cli.js','lib/sqlite.js','db/schema.sqlite.sql','db/inventory.sql','db/catalog.sql'])copy(file);
  fs.writeFileSync(path.join(root,'.env'),'SQLITE_PATH=./data/business.sqlite\nAPP_ADMIN_PASSWORD=a-test-only-strong-password\nAUTH_SECRET='+'s'.repeat(50)+'\nPORT=33445\n');
  const env={...process.env,OWNER_NO_BROWSER:'1',OWNER_ACL_DEBUG:'1'};delete env.VERCEL;
  const call=cmd=>spawnSync(process.execPath,['tools/owner-cli.js',cmd],{cwd:root,env,encoding:'utf8',timeout:15000});
  const check=call('check');assert.equal(check.status,0,check.stderr||check.stdout);
  assert.match(check.stdout,/完整性檢查正常/);
  assert.doesNotMatch(check.stdout,/a-test-only-strong-password/);
  assert.ok(fs.existsSync(path.join(root,'data','business.sqlite')));
  const backup=call('backup');assert.equal(backup.status,0,backup.stderr||backup.stdout);
  assert.match(backup.stdout,/已建立一致性 SQLite 備份/);
  const copies=fs.readdirSync(path.join(root,'backups')).filter(x=>x.endsWith('.sqlite'));
  assert.equal(copies.length,1);
  if(process.platform==='win32'){
   const {execFileSync}=require('node:child_process');
   for(const secretFile of [path.join(root,'.env'),path.join(root,'backups',copies[0])]){
    const acl=execFileSync('icacls.exe',[secretFile],{encoding:'utf8'});
    assert.match(acl,/\(F\)/,'Windows owner-only secret/database ACL must grant full control');
    assert.doesNotMatch(acl,/\(I\)/,'Secret file should not inherit broad parent-directory permissions');
   }
  }
  const {DatabaseSync}=require('node:sqlite'),saved=new DatabaseSync(path.join(root,'backups',copies[0]),{readOnly:true});
  try{assert.equal(saved.prepare('PRAGMA quick_check').get().quick_check,'ok');
   assert.ok(saved.prepare("SELECT name FROM sqlite_master WHERE name='work_templates'").get())}
  finally{saved.close()}
 }finally{fs.rmSync(root,{recursive:true,force:true,maxRetries:14,retryDelay:200})}
});

test('direct npm start shares strong owner config rules and Windows secrets require explicit ACL',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const server=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
 const source=fs.readFileSync(path.join(__dirname,'../tools/owner-cli.js'),'utf8');
 assert.match(server,/owner\.validateSettings\(values\)/);
 assert.match(server,/process\.env\[key\]!==values\[key\]/);
 assert.match(source,/execFileSync\('powershell\.exe'/);
 assert.match(source,/SetAccessRuleProtection/);
 assert.match(source,/RemoveAccessRuleSpecific/);
 assert.doesNotMatch(source,/icacls\.exe.*\/T/);
 assert.match(source,/execFileSync\('whoami\.exe'/);
 assert.match(source,/restrictWindowsAcl\(envFile\)/);
 assert.match(source,/secureDatabaseStorage\(conf\)/);
 assert.ok(source.indexOf('if(generated)printNewPassword(generated)')<source.indexOf('const conf=validatedConfig()'));
});

test('direct startup rejects the publicly known example credentials before creating any SQLite data',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'owner-direct-invalid-'));
 try{
  for(const folder of ['api','tools'])fs.mkdirSync(path.join(root,folder));
  for(const f of ['server.js','tools/owner-cli.js','api/_auth.js'])fs.copyFileSync(path.join(__dirname,'..',f),path.join(root,f));
  for(const f of ['status','login','data','inventory','catalog'])
   fs.writeFileSync(path.join(root,'api',f+'.js'),'module.exports=(req,res)=>res.status(503).json({error:"stub"});\n');
  fs.copyFileSync(path.join(__dirname,'..','.env.example'),path.join(root,'.env'));
  const env={...process.env};for(const k of ['SQLITE_PATH','APP_ADMIN_PASSWORD','AUTH_SECRET','VERCEL'])delete env[k];
  const run=spawnSync(process.execPath,['--env-file=.env','server.js'],{cwd:root,env,encoding:'utf8',timeout:9000});
  assert.notEqual(run.status,0);
  assert.match(run.stderr,/\[E_CONFIG\]/);
  assert.equal(fs.existsSync(path.join(root,'data','plumber.sqlite')),false);
 }finally{fs.rmSync(root,{force:true,recursive:true})}
});
test('initial generated login password is shown even if SQLite initialization subsequently fails',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'owner-failed-first-'));
 try{
  for(const folder of ['tools','lib'])fs.mkdirSync(path.join(root,folder));
  fs.copyFileSync(path.join(__dirname,'..','tools/owner-cli.js'),path.join(root,'tools','owner-cli.js'));
  fs.writeFileSync(path.join(root,'lib','sqlite.js'),'exports.connection=()=>{throw new Error("simulated disk failure")};\n');
  const env={...process.env,OWNER_NO_BROWSER:'1'};delete env.VERCEL;
  const run=spawnSync(process.execPath,['tools/owner-cli.js','start'],{cwd:root,env,encoding:'utf8',timeout:9000});
  assert.notEqual(run.status,0);
  assert.match(run.stdout,/首次建立管理密碼/);
  assert.match(run.stderr,/\[錯誤 E_DB\]/);
  assert.ok(fs.existsSync(path.join(root,'.env')));
  assert.match(fs.readFileSync(path.join(root,'.env'),'utf8'),/^AUTH_SECRET=/m);
 }finally{fs.rmSync(root,{recursive:true,force:true,maxRetries:14,retryDelay:200})}
});

test('owner config prevents recursive ACL changes outside the dedicated data folder',()=>{
 const config={SQLITE_PATH:'./data/plumber.sqlite',APP_ADMIN_PASSWORD:'another-sufficiently-long-secret',AUTH_SECRET:'z'.repeat(64)};
 assert.equal(owner.validateSettings(config).databasePath,path.join(__dirname,'..','data','plumber.sqlite'));
 for(const danger of ['../other.sqlite','./data/../../outside.sqlite','//server/share/file.sqlite',
  '\\\\server\\share\\file.sqlite','C:\\Users\\Public\\database.sqlite','./backups/backup.sqlite','./data/not-a-db.txt']){
  assert.throws(()=>owner.validateSettings({...config,SQLITE_PATH:danger}),/資料庫|網路磁碟|路徑/);
 }
});
