'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const kit=require('../catalog-kit');
const appScript=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const pickerScript=fs.readFileSync(path.join(__dirname,'../catalog-ui.js'),'utf8');

test('first visit paints overview before a pending status API call settles',()=>{
 const elements=new Map();
 const node=key=>{if(!elements.has(key))elements.set(key,{textContent:'',innerHTML:'',style:{},classList:{add(){},remove(){},toggle(){}},closest(){return null},addEventListener(){}});return elements.get(key)};
 const fakeDocument={
  querySelector:node,
  querySelectorAll:()=>[],
  addEventListener(){}
 };
 const sandbox={
  document:fakeDocument,location:{hash:''},
  localStorage:{getItem(){return null},setItem(){},removeItem(){}},
  fetch:()=>new Promise(()=>{}), // deliberately never resolves
  CatalogUI:{renderCatalog:()=>'',bind(){}},
  InventoryUI:{renderInventory:()=>'',renderRequirements:()=>'',alerts:()=>[],bind(){}},
  BusinessReports:{}
 };
 vm.runInNewContext(appScript,sandbox,{filename:'app.js'});
 const html=node('#main').innerHTML;
 assert.ok(html.length>300,'Overview must be painted synchronously even when /api/status hangs');
 assert.match(html,/掌握每一筆工程/);
 assert.match(html,/近期工程案件/);
 assert.equal(node('#crumb-name').textContent,'總覽儀表板');
});

test('quote template add button inserts nested task rows and immediately acknowledges the result',()=>{
 const data={workTemplates:[
  {id:'w-office',kind:'package',name:'辦公室整修',defaultQty:1},
  {id:'w-electrical',kind:'package',name:'配電',defaultQty:2,parentId:'w-office'},
  {id:'w-outlet',kind:'task',name:'插座安裝',parentId:'w-electrical',defaultQty:3,unit:'處',unitPrice:900,materials:[{itemId:'i-wire',qty:2}]},
  {id:'w-empty',kind:'package',name:'空包項',defaultQty:1}
 ]};
 const button={},selector={value:'w-office'},feedback={textContent:'',className:''},notifications=[],rows=[];
 let scrolled=0;
 const stub={
  state:{data},
  CatalogKit:kit,
  $:key=>({
    '#quote-template-add':button,
    '#quote-template':selector,
    '#quote-template-feedback':feedback
  })[key]||null,
  $$:q=>q==='#items-table tbody tr'?rows:[],
  toast:message=>notifications.push(message)
 };
 const ui=vm.runInNewContext(pickerScript+'\nCatalogUI;',stub,{filename:'catalog-ui.js'});
 ui.quotePicker(item=>{rows.push({item,scrollIntoView:()=>scrolled++})});
 assert.equal(typeof button.onclick,'function','Insertion button must have an event handler');
 button.onclick();
 assert.equal(rows.length,1);
 assert.equal(rows[0].item.qty,6,'Nested package quantities must multiply');
 assert.equal(rows[0].item.price,900);
 assert.equal(rows[0].item.materials[0].qty,2);
 assert.equal(scrolled,1,'Inserted rows must become visible');
 assert.match(feedback.textContent,/已新增 1 個工項/);
 assert.match(feedback.className,/is-success/);
 selector.value='w-empty';
 button.onclick();
 assert.equal(rows.length,1);
 assert.match(feedback.textContent,/無法加入工項/);
 assert.match(feedback.className,/is-error/);
 assert.ok(notifications.length>=2);
});

test('quote dialog includes visible insertion feedback and starts with valid main page routing',()=>{
 assert.match(appScript,/id="quote-template-feedback"/);
 assert.match(appScript,/CatalogUI\.quotePicker\(addRow\)/);
 assert.match(appScript,/state\.page=pageNames\[hash\]\?hash:'dashboard';render\(\);try\{const r=await fetch\('\/api\/status'\)/);
});
