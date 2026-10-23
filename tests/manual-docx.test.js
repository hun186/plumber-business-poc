'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),docx=path.join(root,'docs','水電好管家_業主部署與故障排除操作手冊_v0.4.docx');
const markdown=path.join(root,'docs','業主部署操作手冊.md');
function zipEntries(buffer){
 let pos=0,parts=new Map();
 while(pos+30<=buffer.length&&buffer.readUInt32LE(pos)===0x04034b50){
  const method=buffer.readUInt16LE(pos+8),len=buffer.readUInt32LE(pos+18),nl=buffer.readUInt16LE(pos+26),extra=buffer.readUInt16LE(pos+28);
  const name=buffer.subarray(pos+30,pos+30+nl).toString('utf8'),start=pos+30+nl+extra;
  assert.equal(method,0,'Owner Word ZIP uses lossless STORED entries');
  assert.ok(start+len<=buffer.length,'Archive member cannot extend past the file');
  parts.set(name,buffer.subarray(start,start+len).toString('utf8'));
  pos=start+len;
 }
 assert.equal(buffer.readUInt32LE(pos),0x02014b50,'DOCX must contain a ZIP central directory');
 assert.ok(buffer.includes(Buffer.from('PK\u0005\u0006','binary')),'DOCX must contain a ZIP end-of-central-directory record');
 return parts;
}
test('GitHub handoff contains both a valid Word archive and the source Markdown guide',()=>{
 assert.ok(fs.existsSync(markdown),'Source Markdown must be checked in');
 assert.ok(fs.existsSync(docx),'Formatted Word copy must be checked in');
 const md=fs.readFileSync(markdown,'utf8'),z=zipEntries(fs.readFileSync(docx));
 for(const f of ['[Content_Types].xml','_rels/.rels','word/document.xml','word/styles.xml'])
  assert.ok(z.has(f),'Missing required Word part '+f);
 const xml=z.get('word/document.xml');
 for(const phrase of ['業主部署與故障排除操作手冊','第一次安裝六步驟','故障排除 SOP','備份、還原與換電腦','E_BACKUP'])
  assert.ok(md.includes(phrase)&&xml.includes(phrase),'Both guides should cover: '+phrase);
 for(const phrase of ['最新有效自動備份','沒有業務資料異動','上次自動檢查']){
  assert.ok(md.includes(phrase),'Markdown manual must explain unchanged auto backup behavior: '+phrase);
  assert.ok(xml.includes(phrase),'Downloadable Word manual must explain unchanged auto backup behavior: '+phrase);
 }
 assert.doesNotMatch(xml,/預設每 1 天自動備份一次|逾期，會補做一份/,'Word manual must not promise a new backup when nothing changed');
 assert.match(xml,/<w:tbl>/,'SOP error matrix should be an editable Word table');
 assert.ok(xml.includes('127.0.0.1:3000'),'The owner manual includes the localhost address');
 const readme=fs.readFileSync(path.join(root,'README.md'),'utf8');
 assert.match(readme,/已過期會補做\*\*一次自動備份檢查\*\*/,'README must not promise a physical backup after an overdue restart');
 assert.doesNotMatch(readme,/已過期會補做\*\*一份\*\*自動備份/,'README must not retain the outdated guarantee');
  assert.ok(md.includes('plumber.sqlite-wal')&&md.includes('plumber.sqlite-shm'),'Markdown restore SOP must preserve and remove stale SQLite WAL/SHM as a set');
});
