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
 assert.throws(()=>owner.validateSettings({...cfg,SQLITE_PATH:'\\\\server\\share\\db.sqlite'}),/網路共享/);
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
  const env={...process.env,OWNER_NO_BROWSER:'1'};delete env.VERCEL;
  const call=cmd=>spawnSync(process.execPath,['tools/owner-cli.js',cmd],{cwd:root,env,encoding:'utf8',timeout:15000});
  const check=call('check');assert.equal(check.status,0,check.stderr||check.stdout);
  assert.match(check.stdout,/完整性檢查正常/);
  assert.doesNotMatch(check.stdout,/a-test-only-strong-password/);
  assert.ok(fs.existsSync(path.join(root,'data','business.sqlite')));
  const backup=call('backup');assert.equal(backup.status,0,backup.stderr||backup.stdout);
  assert.match(backup.stdout,/已建立一致性 SQLite 備份/);
  const copies=fs.readdirSync(path.join(root,'backups')).filter(x=>x.endsWith('.sqlite'));
  assert.equal(copies.length,1);
  const {DatabaseSync}=require('node:sqlite'),saved=new DatabaseSync(path.join(root,'backups',copies[0]),{readOnly:true});
  try{assert.equal(saved.prepare('PRAGMA quick_check').get().quick_check,'ok');
   assert.ok(saved.prepare("SELECT name FROM sqlite_master WHERE name='work_templates'").get())}
  finally{saved.close()}
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
