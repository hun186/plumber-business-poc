'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'owner-history-'));
 for(const dir of ['lib','db','tools','api'])fs.mkdirSync(path.join(root,dir));
 for(const f of ['lib/sqlite.js','lib/backup-manager.js','lib/backup-worker.js','tools/owner-cli.js','db/schema.sqlite.sql','db/inventory.sql','db/catalog.sql','db/backup.sql','api/_auth.js','api/backups.js'])
  fs.copyFileSync(path.join(__dirname,'..',f),path.join(root,f));
 return root;
}
function call(root,script){
 const env={...process.env,OWNER_NO_BROWSER:'1'};
 for(const k of ['VERCEL','SQLITE_PATH','APP_ADMIN_PASSWORD','AUTH_SECRET','PORT'])delete env[k];
 const r=spawnSync(process.execPath,['-e',script],{cwd:root,env,encoding:'utf8',timeout:30000});
 assert.equal(r.status,0,r.stderr||r.stdout);
 return JSON.parse(r.stdout.trim().split(/\r?\n/).at(-1));
}
test('daily default, persisted settings, auto retention and manual backup history',()=>{
 const root=fixture();
 try{
  const result=call(root,`
   const fs=require('node:fs'),path=require('node:path');
   require('./tools/owner-cli').prerequisite(true);
   const db=require('./lib/sqlite').connection(),b=require('./lib/backup-manager');
   db.prepare("INSERT INTO customers(id,name) VALUES('proof','重要客戶')").run();
   const defaults=b.settings(db);
   const manual=b.makeBackup('manual',new Date('2026-10-18T12:00:00Z'),db);
   const first=b.autoOnce(new Date('2026-10-19T00:00:00Z'),db);
   const skipped=b.autoOnce(new Date('2026-10-19T18:00:00Z'),db);
   b.autoOnce(new Date('2026-10-20T00:01:00Z'),db);
   b.saveSettings({intervalDays:2,retentionCount:2},db);
   const third=b.autoOnce(new Date('2026-10-22T00:02:00Z'),db);
   const {DatabaseSync}=require('node:sqlite');
   const x=new DatabaseSync(path.join(process.cwd(),'backups',third.name),{readOnly:true});
   const found=x.prepare("SELECT name FROM customers WHERE id='proof'").get();x.close();
   console.log(JSON.stringify({defaults,manual,first,skipped,found,items:b.items(),settings:b.settings(db)}));
  `);
  assert.equal(result.defaults.intervalDays,1);
  assert.equal(result.defaults.retentionCount,50);
  assert.ok(result.manual.name.endsWith('-manual.sqlite'));
  assert.ok(result.first.name.endsWith('-auto.sqlite'));
  assert.equal(result.skipped,null);
  assert.equal(result.items.filter(x=>x.type==='auto').length,2);
  assert.equal(result.items.filter(x=>x.type==='manual').length,1);
  assert.equal(result.found.name,'重要客戶');
  const next=call(root,"process.env.SQLITE_PATH='./data/plumber.sqlite';const b=require('./lib/backup-manager');console.log(JSON.stringify(b.settings()))");
  assert.equal(next.intervalDays,2);
  assert.equal(next.retentionCount,2);
 }finally{fs.rmSync(root,{recursive:true,force:true,maxRetries:15,retryDelay:200})}
});
test('invalid settings and unsafe paths cannot destroy manually created backups',()=>{
 const root=fixture();
 try{
  const x=call(root,`
   const fs=require('node:fs'),path=require('node:path');
   require('./tools/owner-cli').prerequisite(true);
   const b=require('./lib/backup-manager'),db=require('./lib/sqlite').connection();
   const first=b.makeBackup('manual');
   const errors=[];
   for(const set of [{intervalDays:0,retentionCount:2},{intervalDays:1,retentionCount:0},{intervalDays:0.5,retentionCount:50},{intervalDays:'1',retentionCount:50}])
    try{b.saveSettings(set,db)}catch(e){errors.push(e.code)}
   for(const file of ['../data/plumber.sqlite','/etc/passwd','plumber-backup-20261020-010101-aaaaaa.sqlite/../../bad'])
    try{b.safeFile(file)}catch(e){errors.push(e.code)}
   fs.writeFileSync(path.join(process.cwd(),'backups','ordinary-business-report.txt'),'never delete me');
   b.saveSettings({intervalDays:1,retentionCount:1},db);
   console.log(JSON.stringify({errors,remaining:b.items().map(x=>x.name),text:fs.readFileSync(path.join(process.cwd(),'backups','ordinary-business-report.txt'),'utf8'),first:first.name}));
  `);
  assert.equal(x.errors.length,7);
  assert.ok(x.errors.every(y=>['E_CONFIG','E_BACKUP'].includes(y)));
  assert.deepEqual(x.remaining,[x.first]);
  assert.equal(x.text,'never delete me');
 }finally{fs.rmSync(root,{recursive:true,force:true,maxRetries:15,retryDelay:200})}
});
test('backup API is authenticated, origin-checked and supports listing, configuration and deletion',()=>{
 const root=fixture();
 try{
  const x=call(root,`
   const api=require('./api/backups'),auth=require('./api/_auth');
   require('./tools/owner-cli').prerequisite(true);
   const b=require('./lib/backup-manager'),file=b.makeBackup('manual');
   const response=(method,origin,loggedIn,body)=>{
    const out={code:200,obj:null};
    const req={method,url:'/api/backups',headers:{host:'127.0.0.1:3000',...(origin?{origin}:{}),
     cookie:loggedIn?auth.sessionCookie({headers:{host:'127.0.0.1:3000'},socket:{remoteAddress:'127.0.0.1'}}).split(';')[0]:''},body};
    const res={status(code){out.code=code;return this},setHeader(){},json(value){out.obj=value}};
    api(req,res);return out;
   };
   const anonymous=response('GET',null,false);
   const foreign=response('POST','https://evil.invalid',true,{action:'save',intervalDays:1,retentionCount:2});
   const status=response('GET',null,true);
   const saved=response('POST','http://127.0.0.1:3000',true,{action:'save',intervalDays:7,retentionCount:10});
   const removed=response('POST','http://127.0.0.1:3000',true,{action:'delete',name:file.name});
   console.log(JSON.stringify({anonymous:anonymous.code,foreign:foreign.code,status:status.code,defaults:status.obj.intervalDays,saved:saved.obj.intervalDays,remaining:removed.obj.backups.length}));
  `);
  assert.deepEqual(x,{anonymous:401,foreign:403,status:200,defaults:1,saved:7,remaining:0});
 }finally{fs.rmSync(root,{recursive:true,force:true,maxRetries:15,retryDelay:200})}
});

test('backup management page renders full configuration and escapes user-visible history safely',async()=>{
 const vm=require('node:vm'),html=fs.readFileSync(path.join(__dirname,'../backup-ui.js'),'utf8');
 const main={innerHTML:''},sample={intervalDays:1,retentionCount:50,
  lastAutoAt:'2026-10-22T06:20:00.000Z',nextDueAt:'2026-10-23T06:20:00.000Z',
  backups:[{type:'manual',createdAt:'2026-10-22T06:21:00.000Z',
   name:'plumber-backup-20261022-142100-aabbcc-manual.sqlite',size:2048}],lastError:null};
 const ctx={state:{server:true,page:'backups'},
  head:()=>'<h1>備份管理</h1>',
  esc:s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  $:key=>key==='#backup-panel'?main:null,
  $$:()=>[],fetch:async()=>({ok:true,json:async()=>sample}),toast(){},confirm:()=>true,
  location:{href:''}};
 const ui=vm.runInNewContext(html+'\nBackupUI;',ctx);
 assert.match(ui.render(),/備份管理/);
 assert.match(ui.render(),/系統服務執行期間/);
 ui.bind();
 await new Promise(resolve=>setImmediate(resolve));
 assert.match(main.innerHTML,/備份間隔（天）/);
 assert.match(main.innerHTML,/retentionCount/);
 assert.match(main.innerHTML,/value="50"/);
 assert.match(main.innerHTML,/立即建立手動備份/);
 assert.match(main.innerHTML,/歷史備份/);
 assert.match(main.innerHTML,/下載/);
 assert.match(main.innerHTML,/刪除/);
 assert.match(main.innerHTML,/不能直接在運作中的網站覆蓋資料庫/);
 ctx.state.server=false;
 assert.match(ui.render(),/展示模式無法建立可還原的備份/);
});

test('an async SQLite worker lets the HTTP event loop advance before the backup finishes',()=>{
 const root=fixture();
 try{
  const x=call(root,`
   require('./tools/owner-cli').prerequisite(true);
   const manager=require('./lib/backup-manager');
   (async()=>{
    const pending=manager.makeBackupAsync('manual');
    let advanced=false;
    await new Promise(done=>setImmediate(()=>{advanced=true;done()}));
    const result=await pending;
    console.log(JSON.stringify({advanced,name:result.name,count:manager.items().length}));
   })().catch(error=>{console.error(error);process.exitCode=1});
  `);
  assert.equal(x.advanced,true);
  assert.equal(x.count,1);
  assert.match(x.name,/-manual\.sqlite$/);
 }finally{fs.rmSync(root,{recursive:true,force:true,maxRetries:15,retryDelay:200})}
});
test('CLI backup rejects a linked backup directory without writing outside the project',()=>{
 if(process.platform==='win32')return;
 const root=fixture(),other=fs.mkdtempSync(path.join(os.tmpdir(),'owner-outside-'));
 try{
  call(root,"require('./tools/owner-cli').prerequisite(true);console.log(JSON.stringify({ready:true}))");
  fs.symlinkSync(other,path.join(root,'backups'),'dir');
  const env={...process.env};for(const k of ['VERCEL','SQLITE_PATH','APP_ADMIN_PASSWORD','AUTH_SECRET'])delete env[k];
  const result=spawnSync(process.execPath,['tools/owner-cli.js','backup'],{cwd:root,env,encoding:'utf8',timeout:12000});
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/E_BACKUP/);
  assert.equal(fs.readdirSync(other).length,0);
 }finally{fs.rmSync(root,{recursive:true,force:true,maxRetries:15,retryDelay:200});fs.rmSync(other,{recursive:true,force:true})}
});
test('colliding backup names never delete a previously verified database',()=>{
 const root=fixture();
 try{
  const x=call(root,`
   require('./tools/owner-cli').prerequisite(true);
   const path=require('node:path'),fs=require('node:fs'),crypto=require('node:crypto');
   const backups=require('./lib/backup-manager');
   const now=new Date('2026-10-22T12:22:30Z');
   const initial=crypto.randomBytes;
   crypto.randomBytes=(n,...args)=>n===3?Buffer.from('001122','hex'):initial(n,...args);
   const first=backups.makeBackup('manual',now);
   const saved=fs.readFileSync(path.join(process.cwd(),'backups',first.name));
   let error='';
   try{backups.makeBackup('manual',now)}catch(e){error=e.code}
   const intact=fs.readFileSync(path.join(process.cwd(),'backups',first.name)).equals(saved);
   console.log(JSON.stringify({error,intact,count:backups.items().length,locks:fs.readdirSync('backups').filter(x=>x.endsWith('.lock')).length}));
  `);
  assert.equal(x.error,'E_BACKUP');
  assert.equal(x.intact,true);
  assert.equal(x.count,1);
  assert.equal(x.locks,0);
 }finally{fs.rmSync(root,{recursive:true,force:true,maxRetries:15,retryDelay:200})}
});

test('automatic retention failure remains visible while preserving verified new and old backups',()=>{
 const root=fixture();
 try{
  const x=call(root,`
   require('./tools/owner-cli').prerequisite(true);
   const fs=require('node:fs'),manager=require('./lib/backup-manager'),db=require('./lib/sqlite').connection();
   manager.saveSettings({intervalDays:1,retentionCount:1},db);
   const first=manager.makeBackup('auto',new Date('2026-10-19T12:00:00Z'),db);
   const original=fs.unlinkSync;
   fs.unlinkSync=function(file,...rest){
    if(String(file).endsWith(first.name))throw Object.assign(new Error('simulated locked old file'),{code:'EPERM'});
    return original.call(this,file,...rest);
   };
   const second=manager.makeBackup('auto',new Date('2026-10-20T12:01:00Z'),db);
   fs.unlinkSync=original;
   const status=manager.status(db);
   console.log(JSON.stringify({second:second.name,first:first.name,remaining:status.backups.map(x=>x.name),lastError:status.lastError}));
  `);
  assert.ok(x.remaining.includes(x.first));
  assert.ok(x.remaining.includes(x.second));
  assert.match(x.lastError,/清理失敗/);
  assert.match(x.lastError,/EPERM/);
 }finally{fs.rmSync(root,{recursive:true,force:true,maxRetries:15,retryDelay:200})}
});

test('backup Worker cannot recreate a deployed database missing after initial boot',()=>{
 const root=fixture();
 try{
  call(root,"require('./tools/owner-cli').prerequisite(true);console.log(JSON.stringify({installed:true}))");
  const output=call(root,`
   const fs=require('node:fs'),path=require('node:path');
   const file=path.join(process.cwd(),'data','plumber.sqlite');
   fs.renameSync(file,file+'.saved');
   const backup=require('./lib/backup-manager');
   backup.makeBackupAsync('manual').then(()=>{
    console.log(JSON.stringify({unexpected:true}));
   }).catch(e=>{
    console.log(JSON.stringify({code:e.code,exists:fs.existsSync(file),files:fs.existsSync('backups')?fs.readdirSync('backups'):[]}));
   });
  `);
  assert.equal(output.code,'E_DB');
  assert.equal(output.exists,false);
  assert.deepEqual(output.files,[]);
 }finally{fs.rmSync(root,{recursive:true,force:true,maxRetries:15,retryDelay:200})}
});

test('unverified .partial SQLite is invisible to backup history and download lookup',()=>{
 const root=fixture();
 try{
  const result=call(root,`
   require('./tools/owner-cli').prerequisite(true);
   const fs=require('node:fs'),path=require('node:path'),manager=require('./lib/backup-manager');
   fs.mkdirSync('backups',{recursive:true});
   const pending='plumber-backup-20261022-213000-abcdef-auto.sqlite';
   fs.writeFileSync(path.join('backups',pending+'.partial'),'incomplete data');
   let error='';
   try{manager.safeFile(pending)}catch(e){error=e.code}
   console.log(JSON.stringify({listed:manager.items().map(e=>e.name),error,present:fs.existsSync(path.join('backups',pending+'.partial'))}));
  `);
  assert.deepEqual(result.listed,[]);
  assert.equal(result.error,'E_BACKUP');
  assert.equal(result.present,true);
 }finally{fs.rmSync(root,{recursive:true,force:true,maxRetries:15,retryDelay:200})}
});
test('editing retention reports persisted setting and cleanup error if old backups are locked',()=>{
 const root=fixture();
 try{
  const result=call(root,`
   require('./tools/owner-cli').prerequisite(true);
   const fs=require('node:fs'),manager=require('./lib/backup-manager'),db=require('./lib/sqlite').connection();
   manager.saveSettings({intervalDays:1,retentionCount:2},db);
   const first=manager.makeBackup('auto',new Date('2026-10-19T12:00:00Z'),db);
   manager.makeBackup('auto',new Date('2026-10-20T12:00:00Z'),db);
   const original=fs.unlinkSync;
   fs.unlinkSync=function(file,...rest){
    if(String(file).endsWith(first.name))throw Object.assign(new Error('simulated lock'),{code:'EPERM'});
    return original.call(this,file,...rest);
   };
   const saved=manager.saveSettings({intervalDays:4,retentionCount:1},db);
   fs.unlinkSync=original;
   console.log(JSON.stringify({intervalDays:saved.intervalDays,retentionCount:saved.retentionCount,lastError:saved.lastError,backupCount:saved.backups.length}));
  `);
  assert.equal(result.intervalDays,4);
  assert.equal(result.retentionCount,1);
  assert.equal(result.backupCount,2);
  assert.match(result.lastError,/清理舊版失敗/);
  assert.match(result.lastError,/EPERM/);
 }finally{fs.rmSync(root,{recursive:true,force:true,maxRetries:15,retryDelay:200})}
});
test('managed backup files have Windows explicit broad access removed before listing',()=>{
 if(process.platform!=='win32')return;
 const root=fixture();
 try{
  const result=call(root,`
   require('./tools/owner-cli').prerequisite(true);
   const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),b=require('./lib/backup-manager');
   const file=b.makeBackup('manual');
   const full=path.join('backups',file.name);
   cp.execFileSync('icacls.exe',[full,'/grant','*S-1-1-0:(R)'],{windowsHide:true});
   const before=cp.execFileSync('icacls.exe',[full],{encoding:'utf8'});
   b.items();
   const after=cp.execFileSync('icacls.exe',[full],{encoding:'utf8'});
   console.log(JSON.stringify({exposed:/S-1-1-0|Everyone|所有人/i.test(before),clean:!/S-1-1-0|Everyone|所有人/i.test(after)}));
  `);
  assert.equal(result.exposed,true);
  assert.equal(result.clean,true);
 }finally{fs.rmSync(root,{recursive:true,force:true,maxRetries:15,retryDelay:200})}
});

test('backup validates the completed snapshot despite a committed write before VACUUM',()=>{
 const root=fixture();
 try{
  const result=call(root,`
   require('./tools/owner-cli').prerequisite(true);
   const db=require('./lib/sqlite').connection(),backups=require('./lib/backup-manager');
   const original=db.exec.bind(db);
   let changed=false;
   db.exec=function(sql,...args){
    if(!changed&&String(sql).startsWith('VACUUM INTO ')){
     changed=true;
     db.prepare("INSERT INTO customers(id,name) VALUES('late-write','備份期間新增')").run();
    }
    return original(sql,...args);
   };
   const item=backups.makeBackup('manual',new Date('2026-10-22T18:00:00Z'),db);
   const {DatabaseSync}=require('node:sqlite'),path=require('node:path');
   const output=new DatabaseSync(path.join('backups',item.name),{readOnly:true});
   const found=output.prepare("SELECT name FROM customers WHERE id='late-write'").get();
   output.close();
   console.log(JSON.stringify({changed,found:found?.name,count:backups.items().length}));
  `);
  assert.equal(result.changed,true);
  assert.equal(result.found,'備份期間新增');
  assert.equal(result.count,1);
 }finally{fs.rmSync(root,{recursive:true,force:true,maxRetries:15,retryDelay:200})}
});
test('backup Worker refuses changed .env SQLite path instead of opening another database',()=>{
 const root=fixture();
 try{
  const result=call(root,`
   require('./tools/owner-cli').prerequisite(true);
   const fs=require('node:fs');
   const before=fs.readFileSync('.env','utf8');
   fs.writeFileSync('.env',before.replace('SQLITE_PATH=./data/plumber.sqlite','SQLITE_PATH=./data/unrelated.sqlite'));
   require('./lib/backup-manager').makeBackupAsync('manual')
    .then(()=>console.log(JSON.stringify({unexpected:true})))
    .catch(e=>console.log(JSON.stringify({code:e.code,hasOther:fs.existsSync('data/unrelated.sqlite')})));
  `);
  assert.equal(result.code,'E_CONFIG');
  assert.equal(result.hasOther,false);
 }finally{fs.rmSync(root,{recursive:true,force:true,maxRetries:15,retryDelay:200})}
});
