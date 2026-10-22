'use strict';
const {parentPort,workerData}=require('node:worker_threads');
const manager=require('./backup-manager');
try{
 // A worker creates a fresh SQLite connection. Verify the installed DB
 // before opening it, otherwise SQLite could silently replace a missing DB.
 const fs=require('node:fs'),path=require('node:path');
 const owner=require('../tools/owner-cli');
 const config=owner.validateSettings(owner.parseSettings(
  fs.readFileSync(path.join(__dirname,'..','.env'),'utf8')));
 owner.secureDatabaseStorage(config);
 owner.verifyEstablishedSchema(config);
 const item=manager.makeBackup(workerData.type);
 parentPort.postMessage({ok:true,value:item});
}catch(error){
 parentPort.postMessage({ok:false,code:error.ownerCode||error.code||'E_BACKUP'});
}
