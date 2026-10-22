'use strict';
const {parentPort,workerData}=require('node:worker_threads');
const manager=require('./backup-manager');
try{
 // A worker creates a fresh SQLite connection. Verify the installed DB
 // before opening it, otherwise SQLite could silently replace a missing DB.
 const fs=require('node:fs'),path=require('node:path');
 const owner=require('../tools/owner-cli');
 owner.assertPrivateConfigFile();
 const stored=owner.parseSettings(fs.readFileSync(path.join(__dirname,'..','.env'),'utf8'));
 const config=owner.validateSettings(stored);
 // This worker inherits the running server's configuration. Never verify a
 // different .env path and then connect to an old, possibly missing path.
 for(const key of ['SQLITE_PATH','APP_ADMIN_PASSWORD','AUTH_SECRET'])
  if(process.env[key]!==stored[key]){
   const mismatch=new Error('網站執行中的設定和磁碟 .env 不一致，請停止服務並重新啟動');
   mismatch.ownerCode='E_CONFIG';throw mismatch;
  }
 owner.secureDatabaseStorage(config);
 owner.verifyEstablishedSchema(config);
 const item=manager.makeBackup(workerData.type);
 parentPort.postMessage({ok:true,value:item});
}catch(error){
 parentPort.postMessage({ok:false,code:error.ownerCode||error.code||'E_BACKUP'});
}
