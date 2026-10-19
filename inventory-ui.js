/* Inventory pages: common API in SQLite mode, browser-only data in public demo mode. */
const InventoryUI=(()=>{
 const list=()=>state.data.inventoryItems||[],plans=()=>state.data.materialRequirements||[],moves=()=>state.data.inventoryMovements||[];
 const n=x=>Number(x)||0,quantity3=x=>Number.isFinite(x)&&/^-?(?:0|[1-9]\d*)(?:\.\d{1,3})?$/.test(String(x)),fmt=x=>n(x).toLocaleString('zh-TW',{maximumFractionDigits:3}),item=id=>list().find(x=>x.id===id)||{name:'未知耗材',unit:'個'};
 const issued=(pid,iid)=>-moves().filter(m=>m.kind==='issue'&&m.projectId===pid&&m.itemId===iid).reduce((s,m)=>s+n(m.qty),0);
 const alerts=()=>list().filter(i=>n(i.stock)<=n(i.alertQty));
 const opts=(rows,value)=>rows.map(([id,title])=>'<option value="'+esc(id)+'" '+(id===value?'selected':'')+'>'+esc(title)+'</option>').join('');
 const field=(title,name,v='',type='text')=>'<div class="field"><label>'+esc(title)+'</label><input name="'+name+'" type="'+type+'" '+(type==='number'?'step="0.001" ':'')+'value="'+esc(v)+'" required></div>';
 const note=v=>'<div class="field full"><label>備註</label><textarea name="note">'+esc(v||'')+'</textarea></div>';
 const select=(title,name,rows,v)=>'<div class="field"><label>'+title+'</label><select name="'+name+'">'+opts(rows,v)+'</select></div>';
 function renderInventory(){
  const filtered=list().filter(i=>(i.name+' '+i.sku+' '+i.note).toLowerCase().includes(state.search.toLowerCase()));
  const rows=filtered.map(i=>'<tr><td><b>'+esc(i.name)+'</b><div class="sub">'+esc(i.sku)+'</div></td><td>'+esc(i.unit)+'</td><td><b>'+fmt(i.stock)+'</b></td><td>'+fmt(i.alertQty)+'</td><td>'+money(i.unitCost)+'</td><td>'+money(n(i.stock)*n(i.unitCost))+'</td><td>'+(n(i.stock)<=n(i.alertQty)?'<span class="stock-warning">⚠ 低庫存</span>':'<span class="stock-ok">正常</span>')+'</td><td><button class="action-link" data-edit-item="'+esc(i.id)+'">編輯</button><button class="action-link" data-move-item="'+esc(i.id)+'">出入庫</button></td></tr>').join('');
  const history=moves().slice(0,40).map(m=>'<tr><td>'+esc(m.date)+'</td><td>'+esc(item(m.itemId).name)+'</td><td>'+esc({receive:'進貨入庫',issue:'工程領料',adjust:'盤點調整'}[m.kind]||m.kind)+'</td><td>'+fmt(m.qty)+'</td><td>'+esc(m.projectId?project(m.projectId).title:'—')+'</td><td>'+esc(m.note||'—')+'</td></tr>').join('');
  return head('inventory','耗材與倉儲管理','庫存由異動帳本計算；低於或等於告警量顯示提醒。','<button class="btn primary" data-create-item>＋ 新增耗材</button>')+
    '<div class="cards"><div class="stat"><div class="label">耗材品項</div><div class="metric">'+list().length+'</div></div><div class="stat"><div class="label">庫存估算價值</div><div class="metric">'+money(list().reduce((s,i)=>s+n(i.stock)*n(i.unitCost),0))+'</div></div><div class="stat '+(alerts().length?'rose':'green')+'"><div class="label">低庫存告警</div><div class="metric">'+alerts().length+' 項</div></div><div class="stat"><div class="label">出入庫紀錄</div><div class="metric">'+moves().length+'</div></div></div>'+
    (alerts().length?'<div class="inventory-alert">⚠ 待補貨：'+alerts().map(i=>esc(i.name)+'（現有 '+fmt(i.stock)+' '+esc(i.unit)+'，警戒 '+fmt(i.alertQty)+'）').join('、')+'</div>':'')+
    '<section class="panel"><div class="table-toolbar">'+searchBox('搜尋料號與品名')+'<button class="btn" data-go="materials">工程用料規劃 →</button></div>'+
    table(['耗材／料號','單位','現存量','警戒量','單位成本','庫存估價','狀態','操作'],rows)+'</section><section class="panel inventory-later"><h2 class="panel-title">庫存異動紀錄</h2>'+table(['日期','耗材','類別','數量變化','歸屬工程','備註'],history)+'</section><div class="banner">異動紀錄不可直接刪除；錯誤數量請以盤點調整修正，工程領料自動計入材料成本。</div>';
 }
 function renderRequirements(){
  const coverage=BusinessReports.materialCoverage(state.data);
  const rows=plans().map(r=>{const i=item(r.itemId),used=issued(r.projectId,r.itemId),left=coverage.remaining.get(r.id)||0,shared=coverage.byItem.get(r.itemId),cancelled=state.data.projects.some(p=>p.id===r.projectId&&p.status==='已取消');
   const readiness=cancelled?'<span class="stock-warning">案件已取消</span>':shared?.shortfall>0?'<span class="stock-warning">整體備料不足（共缺 '+fmt(shared.shortfall)+' '+esc(i.unit)+'）</span>':'<span class="stock-ok">可備料</span>';
   return '<tr><td>'+esc(project(r.projectId).title)+'</td><td>'+esc(i.name)+'</td><td>'+fmt(r.plannedQty)+' '+esc(i.unit)+'</td><td>'+fmt(used)+'</td><td>'+fmt(left)+'</td><td>'+fmt(i.stock)+'</td><td>'+readiness+'</td><td>'+(r.source==='quote'?'<span class="sub">估價單備料</span>':'<button class="action-link" data-edit-plan="'+esc(r.id)+'">編輯</button>')+'<button class="action-link" data-issue-plan="'+esc(r.id)+'">領料</button></td></tr>'}).join('');
  return head('materials','工程用料規劃','預計材料需求、已領用數量與待領數量。','<button class="btn primary" data-create-plan>＋ 登記需求</button>')+
    '<div class="banner">用料計畫不扣庫存；實際「工程領料」才扣庫存並計入該工程材料成本。備料狀態按全部未取消案件的共用庫存需求判斷，未指定工程領料優先順序。</div><section class="panel">'+table(['工程案件','所需耗材','預計數量','已領用','待領用','庫存量','備料狀況','操作'],rows)+'</section>';
 }
 async function apply(action,p){
  try{
   if(state.server){
    const r=await fetch('/api/inventory',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,payload:p})});
    const result=await r.json();if(!r.ok)throw Error(result.error||'儲存失敗');state.data=result.data;
   }else{
    const d=state.data;const current=list().find(x=>x.id===p.itemId);
    const stock=id=>moves().filter(m=>m.itemId===id).reduce((s,m)=>s+n(m.qty),0);
    if(action==='itemAdd'||action==='itemUpdate'){
     if(!p.name||!p.sku||!p.unit||n(p.unitCost)<0||n(p.alertQty)<0)throw Error('料件欄位不完整');
     if(list().some(i=>i.id!==p.id&&i.sku===p.sku))throw Error('料號不可重複');
     if(action==='itemAdd')list().push({...p,stock:0});
     else{const old=item(p.id);if(old.unit!==p.unit&&(moves().some(m=>m.itemId===p.id)||plans().some(r=>r.itemId===p.id)))throw Error('已有出入庫的品項不可修改單位');Object.assign(old,p)}
    }else if(action==='requirementAdd'||action==='requirementUpdate'){
     if(!(n(p.plannedQty)>0)||!quantity3(Number(p.plannedQty)))throw Error('預計用量必須大於零，最多小數三位');
     if(action==='requirementAdd'){
      if(plans().some(r=>r.projectId===p.projectId&&r.itemId===p.itemId))throw Error('同一工程耗材已設定需求');
      plans().push(p);
     }else Object.assign(plans().find(r=>r.id===p.id),p);
    }else{
     if(moves().some(m=>m.id===p.id))throw Error('重複的異動編號');
     if(!current)throw Error('找不到耗材');
     let amount=Number(p.qty);
     if(!Number.isFinite(amount)||!amount||!quantity3(amount)||action!=='adjust'&&amount<0)throw Error('數量格式不合法');
     if(action==='issue'){
      if(!state.data.projects.some(project=>project.id===p.projectId&&project.status!=='已取消'))throw Error('工程不存在或已取消');
      amount=-amount;
     }
     if(stock(p.itemId)+amount< -0.000001)throw Error('庫存不足，無法領料');
     const cost=action==='receive'?Number(p.unitCost):n(current.unitCost);
     if(action==='receive'&&(!Number.isFinite(cost)||cost<0))throw Error('進貨單價不得為負數');
     moves().unshift({id:p.id,itemId:p.itemId,projectId:action==='issue'?p.projectId:null,date:p.date,kind:action,qty:amount,unitCost:cost,note:p.note||''});
     current.stock=Math.round(stock(p.itemId)*1000)/1000;
     if(action==='issue')d.costs.push({id:'stock-'+p.id,projectId:p.projectId,date:p.date,category:'材料',amount:Math.round(-amount*cost*100)/100,note:'庫存領料 '+current.name});
    }
    saveLocal();
   }
   closeModal();render();toast('已儲存庫存資料');
  }catch(e){toast('操作失敗：'+e.message)}
 }
 function itemForm(existing){
  const p=existing||{};
  openModal(existing?'編輯耗材':'建立耗材','<div class="form-grid">'+field('料號','sku',p.sku||'')+field('耗材名稱','name',p.name||'')+field('單位','unit',p.unit||'個')+field('參考單位成本','unitCost',p.unitCost??0,'number')+field('低庫存警戒數量','alertQty',p.alertQty??0,'number')+note(p.note)+'</div>',
   f=>{const v=Object.fromEntries(f.entries());apply(existing?'itemUpdate':'itemAdd',{...v,id:p.id||uid('i'),unitCost:Number(v.unitCost),alertQty:Number(v.alertQty)})});
 }
 function moveForm(itemId,kind='receive',projectId='',suggest=1){
  if(!list().length)return toast('請先建立耗材品項');
  const chosen=list().find(i=>i.id===itemId)||list()[0];
  openModal('進貨／工程領料／盤點調整','<div class="form-grid">'+
   select('異動類型','kind',[['receive','進貨入庫'],['issue','工程領料'],['adjust','盤點調整（正負數）']],kind)+
   select('耗材','itemId',list().map(i=>[i.id,i.name+' '+i.sku]),chosen.id)+
   select('歸屬工程（領料時必填）','projectId',[['','請選擇'],...state.data.projects.filter(p=>p.status!=='已取消').map(p=>[p.id,p.title])],projectId)+
   field('日期','date',today(),'date')+field('數量','qty',suggest,'number')+field('進貨單價（僅入庫用）','unitCost',chosen.unitCost,'number')+note('')+'</div>',
   f=>{const v=Object.fromEntries(f.entries()),action=v.kind;if(action==='issue'&&!v.projectId)return toast('請選擇工程');apply(action,{id:uid('m'),itemId:v.itemId,date:v.date,qty:Number(v.qty),note:v.note,...(action==='issue'?{projectId:v.projectId}:{}),...(action==='receive'?{unitCost:Number(v.unitCost)}:{})})});
 }
 function planForm(existing){
  if(!state.data.projects.length||!list().length)return toast('請先新增工程案件與耗材');
  const p=existing||{};
  const chooser=existing?'<p>工程：'+esc(project(p.projectId).title)+' ／ '+esc(item(p.itemId).name)+'</p>':
    select('工程','projectId',state.data.projects.filter(p=>p.status!=='已取消').map(p=>[p.id,p.title]),p.projectId)+select('耗材','itemId',list().map(i=>[i.id,i.name]),p.itemId);
  openModal(existing?'編輯用料需求':'新增工程用料','<div class="form-grid">'+chooser+field('預計用量','plannedQty',p.plannedQty||1,'number')+note(p.note)+'</div>',
    f=>{const v=Object.fromEntries(f.entries());apply(existing?'requirementUpdate':'requirementAdd',{...v,id:p.id||uid('b'),plannedQty:Number(v.plannedQty)})});
 }
 function bind(){
  const newItem=$('[data-create-item]');if(newItem)newItem.onclick=()=>itemForm();
  $$('[data-edit-item]').forEach(b=>b.onclick=()=>itemForm(item(b.dataset.editItem)));
  $$('[data-move-item]').forEach(b=>b.onclick=()=>moveForm(b.dataset.moveItem));
  const newPlan=$('[data-create-plan]');if(newPlan)newPlan.onclick=()=>planForm();
  $$('[data-edit-plan]').forEach(b=>b.onclick=()=>planForm(plans().find(p=>p.id===b.dataset.editPlan)));
  $$('[data-issue-plan]').forEach(b=>b.onclick=()=>{const p=plans().find(r=>r.id===b.dataset.issuePlan);moveForm(p.itemId,'issue',p.projectId,Math.max(0.001,n(p.plannedQty)-issued(p.projectId,p.itemId)))});
 }
 return {renderInventory,renderRequirements,alerts,bind};
})();
