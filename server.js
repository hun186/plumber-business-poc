'use strict';
// Local single-host web server with persistent SQLite. Binds to loopback only.
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const base=__dirname;
const endpoints={'/api/status':require('./api/status'),'/api/login':require('./api/login'),'/api/data':require('./api/data'),'/api/inventory':require('./api/inventory'),'/api/catalog':require('./api/catalog')};
const files={'/':'index.html','/index.html':'index.html','/styles.css':'styles.css','/app.js':'app.js','/inventory-ui.js':'inventory-ui.js','/catalog-ui.js':'catalog-ui.js','/catalog-kit.js':'catalog-kit.js','/reports.js':'reports.js','/xlsx-lite.js':'xlsx-lite.js'};
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};
function response(res){return {status(code){res.statusCode=code;return this},setHeader:(...args)=>res.setHeader(...args),json(obj){res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(obj))}}}
const handler=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(endpoints[url.pathname]){
  try{
   if(['POST','PUT','PATCH'].includes(req.method)){
    let raw='';for await(const part of req){raw+=part;if(raw.length>1024*1024){res.writeHead(413,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({code:'E_API_SIZE',error:'傳送資料過大，請減少輸入後再試'}));return}}
    try{req.body=JSON.parse(raw)}catch{res.writeHead(400,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({code:'E_API_JSON',error:'資料格式不正確，請重新整理頁面後再試'}));return}
   }
   await endpoints[url.pathname](req,response(res));
  }catch(err){console.error('Unhandled request:',err?.code||err?.name||'unknown');if(!res.headersSent){res.writeHead(500,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({code:'E_API_INTERNAL',error:'系統暫時無法完成操作。請記下錯誤代碼和操作時間，交由管理人員處理'}))}}
  return;
 }
 if(req.method!=='GET'||!Object.hasOwn(files,url.pathname)){res.writeHead(404);res.end('Not Found');return}
 const pathname=path.join(base,files[url.pathname]);
 res.setHeader('Content-Type',types[path.extname(pathname)]||'application/octet-stream');
 res.setHeader('X-Content-Type-Options','nosniff');
 fs.createReadStream(pathname).on('error',()=>{res.statusCode=404;res.end()}).pipe(res);
});
if(require.main===module){
 // 直接 npm start 時也必須明確檢查，避免沒有持久資料庫卻落入 Demo 模式。
 const {enabled}=require('./api/_auth');
 if(!enabled()){
  console.error('[E_CONFIG] 缺少有效 SQLite_PATH、APP_ADMIN_PASSWORD 或 AUTH_SECRET，不能啟動正式服務。');
  console.error('請先執行「啟動水電好管家.bat」或 node tools/owner-cli.js start 完成設定。');
  process.exitCode=1;
 }else{
  const port=Number(process.env.PORT||3000);
  if(!Number.isInteger(port)||port<1024||port>65535){
   console.error('[E_CONFIG] PORT 必須是 1024～65535 的整數。');process.exitCode=1;
  }else{
   try{
    const check=require('./lib/sqlite').connection().prepare('PRAGMA quick_check').get();
    if(Object.values(check)[0]!=='ok')throw Error('SQLite integrity check failed');
   }catch(err){console.error('[E_DB] SQLite 無法初始化或資料庫可能受損（'+(err.code||err.name)+'）。停止操作並聯絡交付人員。');process.exitCode=1}
   if(!process.exitCode){
    handler.on('error',err=>{console.error(err.code==='EADDRINUSE'?'[E_PORT] 服務埠被占用，請檢查是否已開啟另一份程式。':'[E_PATH] 啟動失敗：'+(err.code||err.name));process.exitCode=1});
    handler.listen(port,'127.0.0.1',()=>console.log('水電好管家 SQLite 本機服務：http://127.0.0.1:'+port));
   }
  }
 }
}
module.exports=handler;
