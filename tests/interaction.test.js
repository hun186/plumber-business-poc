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

test('package inspector previews nested priced tasks, each material, and edit actions safely',()=>{
 const workTemplates=[
  {id:'w-head',kind:'package',name:'整修方案',defaultQty:1},
  {id:'w-group',kind:'package',name:'電力',parentId:'w-head',defaultQty:2},
  {id:'w-socket',kind:'task',name:'插座 <script>alert(1)</script>',parentId:'w-group',defaultQty:3,unit:'處',unitPrice:950,materials:[{itemId:'i-wire',qty:1.5},{itemId:'i-box',qty:1}]}
 ];
 const stock=[{id:'i-wire',name:'電線',unit:'米'},{id:'i-box',name:'底盒',unit:'個'}];
 const sandbox={state:{data:{workTemplates,inventoryItems:stock}},CatalogKit:kit,money:n=>'NT$ '+n,
  esc:s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))};
 const ui=vm.runInNewContext(pickerScript+'\nCatalogUI;',sandbox,{filename:'catalog-ui.js'});
 const html=ui.selectedPreviewHTML('w-head');
 assert.match(html,/整修方案 \/ 電力 \/ 插座/);
 assert.match(html,/包含 1 個計價工項/);
 assert.match(html,/NT\$ 5700/);
 assert.match(html,/電線 × 9 米/);
 assert.match(html,/底盒 × 6 個/);
 assert.match(html,/data-preview-edit-template="w-head"/);
 assert.match(html,/data-preview-edit-template="w-socket"/);
 assert.doesNotMatch(html,/<script>/);
 const snapshot=ui.quoteLinePreviewHTML({catalogId:'w-socket',name:'過去報價',unit:'處',materials:[{itemId:'i-wire',qty:1.5}]},4);
 assert.match(snapshot,/電線：6 米/);
 assert.match(snapshot,/快照/);
 assert.match(snapshot,/編輯原始工項範本/);
});

test('floating quote-template preview offers direct edit with unsaved-quote confirmation',()=>{
 const chosen={id:'w-plan',kind:'package',name:'辦公室套裝',defaultQty:1,unit:'式',unitPrice:0,materials:[],note:''};
 const child={id:'w-task',kind:'task',name:'配線施工',parentId:'w-plan',defaultQty:2,unit:'處',unitPrice:300,materials:[]};
 const button={},selector={value:'w-plan',addEventListener(type,fn){this[type]=fn}},
  feedback={textContent:'',className:''},events={},navigator=[],savedModals=[];
 const previewTrigger={setAttribute(k,v){this[k]=v},getBoundingClientRect(){return {left:180,top:120,bottom:144}},addEventListener(k,v){events[k]=v},matches(){return false}};
 let floating,approve=false;
 const root={contains(element){return element===floating},appendChild(element){floating=element}};
 const node=()=>({
  style:{},hidden:true,offsetHeight:280,
  events:{},setAttribute(k,v){this[k]=v},
  addEventListener(k,v){this.events[k]=v},contains(){return false},matches(){return false}
 });
 const itemsById={'#quote-template-add':button,'#quote-template':selector,'#quote-template-feedback':feedback,
  '#quote-template-inspect':previewTrigger,'#modal-root':root,'#add-recipe':{}};
 const sandbox={
  state:{data:{workTemplates:[chosen,child],inventoryItems:[]}},CatalogKit:kit,
  $:q=>itemsById[q]||null,$$:()=>[],
  document:{createElement:()=>node(),activeElement:null},
  window:{innerWidth:1024,innerHeight:768},
  money:n=>'NT$ '+n,esc:s=>String(s??''),
  toast(){},confirm(){return approve},
  closeModal(){navigator.push('closed')},nav(page){navigator.push(page)},
  openModal(name,html){savedModals.push({name,html})},
  field:(...args)=>'<span>'+args[1]+'</span>'
 };
 const ui=vm.runInNewContext(pickerScript+'\nCatalogUI;',sandbox,{filename:'catalog-ui.js'});
 ui.quotePicker(()=>{});
 assert.equal(typeof events.mouseenter,'function');
 events.mouseenter();
 assert.equal(floating.hidden,false);
 assert.match(floating.innerHTML,/辦公室套裝/);
 assert.match(floating.innerHTML,/配線施工/);
 assert.match(floating.innerHTML,/data-preview-edit-template="w-plan"/);
 assert.equal(previewTrigger['aria-expanded'],'true');
 const event={target:{closest:selector=>selector==='[data-preview-edit-template]'?{dataset:{previewEditTemplate:'w-task'}}:null}};
 floating.events.click(event);
 assert.deepEqual(navigator,[],'Declining confirmation must preserve the open quote');
 approve=true;
 floating.events.click(event);
 assert.deepEqual(navigator,['closed','catalog']);
 assert.equal(savedModals.length,1);
 assert.match(savedModals[0].name,/編輯工項/);
 assert.equal(previewTrigger['aria-expanded'],'false');
});

test('quote editor exposes template inspector and per-line BOM snapshot buttons',()=>{
 assert.match(appScript,/id="quote-template-inspect"/);
 assert.match(appScript,/class="quote-line-inspect"/);
 assert.match(appScript,/CatalogUI\.bindQuoteLinePreview\(tr\)/);
});

test('template import rejects combined quotes larger than one hundred items without altering existing rows',()=>{
 const rows=Array.from({length:99},(_,i)=>({i}));
 const data={workTemplates:[
  {id:'w-over',kind:'package',name:'組合',defaultQty:1},
  {id:'w-first',kind:'task',name:'A',kind:'task',parentId:'w-over',defaultQty:1,unit:'式',unitPrice:100,materials:[]},
  {id:'w-second',kind:'task',name:'B',parentId:'w-over',defaultQty:1,unit:'式',unitPrice:100,materials:[]}
 ]};
 const button={},picker={value:'w-over'},feedback={textContent:'',className:''};
 const sandbox={
  state:{data},CatalogKit:kit,
  $:s=>({'#quote-template-add':button,'#quote-template':picker,'#quote-template-feedback':feedback})[s]||null,
  $$:q=>q==='#items-table tbody tr'?rows:[],
  toast(){}
 };
 const ui=vm.runInNewContext(pickerScript+'\nCatalogUI;',sandbox);
 ui.quotePicker(line=>rows.push({line}));
 button.onclick();
 assert.equal(rows.length,99);
 assert.match(feedback.textContent,/最多 100 個工項/);
 assert.match(feedback.className,/is-error/);
});
test('manual quote line addition is guarded by the same row limit',()=>{
 assert.match(appScript,/if\(\$\$\('#items-table tbody tr'\)\.length>=100\)return toast/);
 assert.match(appScript,/if\(rows\.length>100\)return toast/);
});

test('Escape first dismisses floating quote preview without discarding unsaved quote, second closes modal',()=>{
 const selected={id:'w-plan',kind:'task',name:'電力配線',unit:'式',defaultQty:1,unitPrice:200,materials:[]};
 const triggerEvents={};let floating,focusCount=0,modalCloses=0,prevented=0,stopped=0;
 const trigger={setAttribute(k,v){this[k]=v},focus(){focusCount++},
  getBoundingClientRect(){return {left:100,top:110,bottom:145}},
  addEventListener(kind,handler){triggerEvents[kind]=handler},
  matches(){return false}};
 const node=()=>({hidden:true,offsetHeight:180,style:{},
  setAttribute(){},addEventListener(){},contains(){return false},matches(){return false}});
 const root={contains:el=>el===floating,appendChild:el=>{floating=el}};
 const picker={value:'w-plan',addEventListener(){}},button={};
 const catalog=vm.runInNewContext(pickerScript+'\nCatalogUI;',{
  state:{data:{workTemplates:[selected],inventoryItems:[]}},
  CatalogKit:kit,
  document:{createElement:node,activeElement:null},
  window:{innerWidth:960,innerHeight:640},
  $:q=>({'#quote-template-add':button,'#quote-template':picker,
   '#quote-template-inspect':trigger,'#modal-root':root})[q]||null,
  $$:()=>[],esc:x=>String(x??''),money:x=>String(x),toast(){},
  setTimeout(){},clearTimeout(){}
 });
 catalog.quotePicker(()=>{});
 triggerEvents.mouseenter();
 assert.equal(floating.hidden,false);
 assert.equal(catalog.dismissPreviewOnEscape instanceof Function,true);
 let documentKey;
 const keyHandler=appScript.match(/document\.addEventListener\('keydown',e=>\{[^;\n]*\}\);start\(\);/);
 assert.ok(keyHandler,'Global Escape handler should be available');
 vm.runInNewContext(keyHandler[0].replace(/;start\(\);$/, ';'),{
  document:{addEventListener(type,fn){if(type==='keydown')documentKey=fn}},
  CatalogUI:catalog,closeModal(){modalCloses++}
 });
 const event=()=>({key:'Escape',preventDefault(){prevented++},stopPropagation(){stopped++}});
 documentKey(event());
 assert.equal(floating.hidden,true,'Only the preview must be dismissed');
 assert.equal(modalCloses,0,'Unsaved quote modal must stay open');
 assert.equal(prevented,1);
 assert.equal(stopped,1);
 assert.equal(focusCount,1);
 assert.equal(trigger['aria-expanded'],'false');
 documentKey(event());
 assert.equal(modalCloses,1,'Second Escape closes quote modal normally');
});

test('Escape from a stale detached preview must not intercept the quote editor',()=>{
 const ui=vm.runInNewContext(pickerScript+'\nCatalogUI;',{
  state:{data:{workTemplates:[],inventoryItems:[]}},CatalogKit:kit,
  $:()=>({contains(){return false}}),$$:()=>[],toast(){}
 });
 assert.equal(ui.dismissPreviewOnEscape(),false);
});
