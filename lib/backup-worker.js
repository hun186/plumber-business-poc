'use strict';
const {parentPort,workerData}=require('node:worker_threads');
const manager=require('./backup-manager');
try{
 const item=manager.makeBackup(workerData.type);
 parentPort.postMessage({ok:true,value:item});
}catch(error){
 parentPort.postMessage({ok:false,code:error.code||'E_BACKUP'});
}
