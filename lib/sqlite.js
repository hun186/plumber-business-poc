'use strict';
const path = require('node:path');
const fs = require('node:fs');
const {DatabaseSync} = require('node:sqlite');
let db;
function connection() {
  if (process.env.VERCEL) throw new Error('Vercel Functions 沒有持久性的 SQLite 儲存空間');
  if (!db) {
    const file = path.resolve(process.env.SQLITE_PATH || './data/plumber.sqlite');
    fs.mkdirSync(path.dirname(file), {recursive:true,mode:0o700});
    db = new DatabaseSync(file);
    db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    db.exec(fs.readFileSync(path.join(__dirname,'..','db','schema.sqlite.sql'),'utf8'));
    db.exec(fs.readFileSync(path.join(__dirname,'..','db','inventory.sql'),'utf8'));
  }
  return db;
}
const selects = {
  customers:'SELECT id,name,phone,address,email,note FROM customers ORDER BY created_at DESC',
  projects:'SELECT id,customer_id AS customerId,title,type,status,start_date AS startDate,due_date AS dueDate,amount,note FROM projects ORDER BY created_at DESC',
  quotes:'SELECT id,number,project_id AS projectId,customer_id AS customerId,quote_date AS date,status,tax_rate AS taxRate,note,items FROM quotes ORDER BY created_at DESC',
  payments:'SELECT id,project_id AS projectId,paid_date AS date,amount,note FROM payments ORDER BY paid_date DESC',
  costs:'SELECT id,project_id AS projectId,cost_date AS date,category,amount,note FROM costs ORDER BY cost_date DESC'
};
function snapshot(conn=connection()) {
  const data={};
  for (const [k,sql] of Object.entries(selects)) data[k]=conn.prepare(sql).all();
  for (const q of data.quotes) q.items=JSON.parse(q.items);
  const {inventorySnapshot}=require('./inventory');
  Object.assign(data,inventorySnapshot(conn));
  for(const m of data.inventoryMovements){if(m.kind==='issue'&&m.projectId)data.costs.push({id:'stock-'+m.id,projectId:m.projectId,date:m.date,category:'材料',amount:Math.round(-m.qty*m.unitCost*100)/100,note:'庫存領料 '+(data.inventoryItems.find(x=>x.id===m.itemId)?.name||m.itemId)+(m.note?' · '+m.note:'')})}
  return data;
}
module.exports={connection,snapshot};
