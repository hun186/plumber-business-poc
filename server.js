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
    let raw='';for await(const part of req){raw+=part;if(raw.length>1024*1024){res.writeHead(413);res.end();return}}
    try{req.body=JSON.parse(raw)}catch{res.writeHead(400);res.end('Invalid JSON');return}
   }
   await endpoints[url.pathname](req,response(res));
  }catch(err){console.error('Unhandled request:',err);if(!res.headersSent){res.writeHead(500);res.end('Internal Server Error')}}
  return;
 }
 if(req.method!=='GET'||!Object.hasOwn(files,url.pathname)){res.writeHead(404);res.end('Not Found');return}
 const pathname=path.join(base,files[url.pathname]);
 res.setHeader('Content-Type',types[path.extname(pathname)]||'application/octet-stream');
 res.setHeader('X-Content-Type-Options','nosniff');
 fs.createReadStream(pathname).on('error',()=>{res.statusCode=404;res.end()}).pipe(res);
});
if(require.main===module){const port=Number(process.env.PORT||3000);handler.listen(port,'127.0.0.1',()=>console.log(`SQLite PoC: http://127.0.0.1:${port}`))}
module.exports=handler;
