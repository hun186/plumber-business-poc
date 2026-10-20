/* Work item/package tree editor and quote-to-material-plan integration. */
const CatalogUI=(()=>{
 const list=()=>state.data.workTemplates||[];
 const items=()=>state.data.inventoryItems||[];
 const path=t=>{let n=[t.name],p=t.parentId,visited=new Set([t.id]);while(p&&!visited.has(p)){visited.add(p);const parent=list().find(x=>x.id===p);if(!parent)break;n.unshift(parent.name);p=parent.parentId}return n.join(' / ')};
 const options=()=>list().map(t=>'<option value="'+esc(t.id)+'">'+(t.kind==='package'?'▣ ':'▫ ')+esc(path(t))+'</option>').join('');
 function renderCatalog(){
  const children=new Map();for(const t of list()){const p=t.parentId||'',r=children.get(p)||[];r.push(t);children.set(p,r)}
  let rows=[],seen=new Set();
  function append(t,d){if(seen.has(t.id)||d>12)return;seen.add(t.id);const recipe=(t.materials||[]).map(m=>{const i=items().find(x=>x.id===m.itemId);return (i?.name||'已移除料件')+' × '+m.qty+' '+(i?.unit||'')}).join('、');
   rows.push('<tr><td style="padding-left:'+(12+d*18)+'px"><b>'+(t.kind==='package'?'▣ ':'▫ ')+esc(t.name)+'</b></td><td>'+t.defaultQty+' '+esc(t.unit)+'</td><td>'+(t.kind==='package'?'子工項加總':money(t.unitPrice))+'</td><td>'+esc(recipe||'—')+'</td><td><button class="action-link" data-edit-template="'+esc(t.id)+'">編輯</button> '+(t.kind==='package'?'<button class="action-link" data-child-template="'+esc(t.id)+'">＋ 子項</button>':'')+'</td></tr>');
   for(const c of children.get(t.id)||[])append(c,d+1)
  }
  for(const t of children.get('')||[])append(t,0);for(const t of list())if(!seen.has(t.id))append(t,0);
  return head('catalog','工項／包項與材料組合','建立可重複使用的包項樹，子工項連結耗材，估價單直接套用。','<button class="btn primary" id="new-template">＋ 新增包項／工項</button>')+
   '<div class="banner">例如：辦公室整修 → 配電工程 → 插座安裝 → 電線、插座、線管。母包項不重複計價，材料配方不會立即扣庫。</div><section class="panel">'+table(['名稱／階層','每上層數量','工項單價','每單位工項所需材料','操作'],rows.join(''))+'</section>';
 }
 async function commit(action,p){
  try{
   if(state.server){
    const response=await fetch('/api/catalog',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,payload:p})});
    const result=await response.json();if(!response.ok)throw Error(result.error||'更新失敗');state.data=result.data;
   }else{
    const all=list(),found=all.find(x=>x.id===p.id);
    if(action==='add'&&found)throw Error('工項編號重複');
    if(action==='update'&&!found)throw Error('工項不存在');
    if(!p.name||!p.unit||!(p.defaultQty>0)||p.unitPrice<0)throw Error('工項數量或單價不合法');
    if(p.kind==='package'&&(p.unitPrice!==0||p.materials.length))throw Error('包項不直接設定材料或單價');
    if(p.kind==='task'&&all.some(x=>x.parentId===p.id))throw Error('已有子項的包項不可改為工項');
    if(p.parentId){
     let ancestor=all.find(x=>x.id===p.parentId),seen=new Set([p.id]),depth=0;
     if(!ancestor||ancestor.kind!=='package')throw Error('父項必須為包項');
     while(ancestor){if(seen.has(ancestor.id)||++depth>=12)throw Error('工項層級不可循環');seen.add(ancestor.id);ancestor=all.find(x=>x.id===ancestor.parentId)}
    }
    CatalogKit.ensureHierarchyDepth(all,p);
    const used=new Set();for(const m of p.materials){if(!items().some(x=>x.id===m.itemId)||used.has(m.itemId)||!(m.qty>0)||!/^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/.test(String(m.qty)))throw Error('材料配方重複或數量不合法');used.add(m.itemId)}
    if(action==='add')all.push(p);else Object.assign(found,p);
    saveLocal();
   }
   closeModal();render();toast('工項範本已儲存');
  }catch(e){toast('工項儲存失敗：'+e.message)}
 }
 function edit(t,preselect=''){
  t=t||{};
  const pack=list().filter(x=>x.kind==='package'&&x.id!==t.id);
  const parents='<div class="field"><label>所屬上層包項</label><select name="parentId"><option value="">最上層</option>'+pack.map(x=>'<option value="'+esc(x.id)+'" '+((t.parentId||preselect)===x.id?'selected':'')+'>'+esc(path(x))+'</option>').join('')+'</select></div>';
  const html='<div class="form-grid">'+parents+'<div class="field"><label>類型</label><select name="kind"><option value="package" '+(t.kind==='package'?'selected':'')+'>包項（可包含子項，不直接計價）</option><option value="task" '+(t.kind!=='package'?'selected':'')+'>工項（可指定材料組合）</option></select></div>'+
   field('名稱','name',t.name||'')+field('單位','unit',t.unit||'式')+
   '<div class="field"><label>每上層預設數量</label><input name="defaultQty" type="number" min="0.001" step="0.001" required value="'+esc(t.defaultQty??1)+'"></div>'+
   '<div class="field"><label>每單位未稅報價</label><input name="unitPrice" type="number" min="0" step="0.01" required value="'+esc(t.unitPrice??0)+'"></div>'+
   '<div class="field full"><label>材料配方（每單位工項耗用）</label><div class="table-scroll"><table id="recipe-table" class="item-table"><thead><tr><th>耗材</th><th>用量</th><th></th></tr></thead><tbody></tbody></table></div><button type="button" class="btn small" id="add-recipe">＋ 增加材料</button></div>'+field('備註','note',t.note||'')+'</div>';
  openModal(t.id?'編輯工項／包項':'新增工項／包項',html,f=>{
   const v=Object.fromEntries(f.entries()),kind=v.kind;
   const materials=$$('#recipe-table tbody tr').map(r=>({itemId:$('[name=recipeItem]',r).value,qty:Number($('[name=recipeQty]',r).value)}));
   if(kind==='package'&&(materials.length||Number(v.unitPrice)!==0))return toast('包項不直接設定單價或材料，請改設在子工項');
   commit(t.id?'update':'add',{id:t.id||uid('w'),parentId:v.parentId||null,kind,name:v.name.trim(),unit:v.unit.trim(),defaultQty:Number(v.defaultQty),unitPrice:Number(v.unitPrice),materials:kind==='task'?materials:[],note:v.note||''});
  },true);
  function recipeRow(m={}){
   if(!items().length)return toast('請先到耗材倉儲建立料件');
   const tr=document.createElement('tr');
   tr.innerHTML='<td><select name="recipeItem">'+items().map(i=>'<option value="'+esc(i.id)+'" '+(i.id===m.itemId?'selected':'')+'>'+esc(i.sku+' · '+i.name+'（'+i.unit+'）')+'</option>').join('')+'</select></td><td><input name="recipeQty" type="number" min="0.001" step="0.001" value="'+esc(m.qty??1)+'" required></td><td><button type="button" class="x">×</button></td>';
   $('#recipe-table tbody').append(tr);$('button',tr).onclick=()=>tr.remove();
  }
  $('#add-recipe').onclick=()=>recipeRow();
  for(const m of t.materials||[])recipeRow(m);
 }
 function selectedPreviewHTML(templateId){
  const t=list().find(x=>x.id===templateId);
  if(!t)return '<p class="sub">先選擇一個套裝包項或工項，即可查看內容。</p>';
  let html='<div class="quote-preview-header"><b>'+esc(t.name)+'</b><span>'+(t.kind==='package'?'套裝包項':'單一工項')+'</span></div>';
  try{
   const lines=CatalogKit.flatten(list(),templateId);
   const total=lines.reduce((sum,line)=>sum+Number(line.qty)*Number(line.price),0);
   html+='<div class="quote-preview-meta">包含 '+lines.length+' 個計價工項 · 參考未稅金額 '+money(total)+'</div>';
   html+='<div class="quote-preview-lines">';
   for(const line of lines){
    const recipe=(line.materials||[]).map(m=>{
     const i=items().find(x=>x.id===m.itemId);
     return esc(i?.name||'未知耗材')+' × '+esc(CatalogKit.round3(Number(line.qty)*Number(m.qty)))+' '+esc(i?.unit||'');
    });
    html+='<div class="quote-preview-line"><div class="quote-preview-line-title"><strong>'+esc(line.name)+'</strong><button type="button" class="action-link" data-preview-edit-template="'+esc(line.catalogId)+'" aria-label="編輯 '+esc(line.name)+' 工項範本">編輯</button></div>'+
     '<div class="quote-preview-meta">'+esc(line.qty)+' '+esc(line.unit)+' × '+money(line.price)+' = '+money(Number(line.qty)*Number(line.price))+'</div>'+
     '<div class="quote-preview-material">'+(recipe.length?recipe.join('、'):'尚未設定材料組合')+'</div></div>';
   }
   html+='</div>';
  }catch(error){html+='<p class="quote-preview-error">'+esc(error.message||'範本無法展開')+'</p>'}
  html+='<div class="quote-preview-footer"><button type="button" class="btn small" data-preview-edit-template="'+esc(t.id)+'">編輯此'+(t.kind==='package'?'包項':'工項')+'範本</button><span>修改範本不會追溯改變已儲存的報價。</span></div>';
  return html;
 }
 function quoteLinePreviewHTML(meta,quantity){
  const amount=Number(quantity);
  const recipe=(meta.materials||[]).map(m=>{
   const i=items().find(x=>x.id===m.itemId);
   const qty=Number.isFinite(amount)&&amount>0?CatalogKit.round3(amount*Number(m.qty)):Number(m.qty);
   return '<li>'+esc(i?.name||'未知耗材')+'：'+esc(qty)+' '+esc(i?.unit||'')+'</li>';
  }).join('');
  return '<div class="quote-preview-header"><b>這張估價單的材料配方快照</b></div>'+
   '<p class="quote-preview-meta">'+esc(meta.name)+' · '+esc(Number.isFinite(amount)?amount:'—')+' '+esc(meta.unit)+'</p>'+
   (recipe?'<ul class="quote-preview-recipe">'+recipe+'</ul>':'<p>這個工項沒有設定材料。</p>')+
   '<div class="quote-preview-footer"><button type="button" class="btn small" data-preview-edit-template="'+esc(meta.catalogId)+'">編輯原始工項範本</button><span>範本變更不會更新本次估價快照。</span></div>';
 }
 let floating=null,activeTrigger=null,closingTimer=null,pinned=false;
 function hidePreview(){
  if(closingTimer!==null){clearTimeout(closingTimer);closingTimer=null}
  if(floating)floating.hidden=true;
  if(activeTrigger)activeTrigger.setAttribute('aria-expanded','false');
  activeTrigger=null;pinned=false;
 }
 function dismissPreviewOnEscape(){
  const root=$('#modal-root');
  if(!floating||floating.hidden||!root?.contains(floating))return false;
  const returnFocus=activeTrigger;
  hidePreview();
  returnFocus?.focus?.();
  return true;
 }
 function scheduleHide(){
  if(pinned)return;
  if(closingTimer!==null)clearTimeout(closingTimer);
  closingTimer=setTimeout(()=>{
   closingTimer=null;
   if(!(activeTrigger?.matches?.(':hover')||floating?.matches?.(':hover')||floating?.contains?.(document.activeElement)))hidePreview();
  },180);
 }
 function openTemplateEditor(id){
  const entry=list().find(x=>x.id===id);
  if(!entry)return toast('找不到對應工項範本，可能已經被修改');
  if(!confirm('確定前往編輯「'+entry.name+'」？\n目前尚未儲存的估價單變更將不會保留；原估價單已有的材料配方快照也不會自動改變。'))return;
  hidePreview();closeModal();nav('catalog');edit(entry);
 }
 function showFloating(trigger,content){
  const root=$('#modal-root');
  if(!root||!trigger)return;
  if(!floating||!root.contains(floating)){
   floating=document.createElement('section');
   floating.id='catalog-preview-float';
   floating.className='catalog-preview-float';
   floating.setAttribute('role','dialog');
   floating.setAttribute('aria-label','套裝工項與材料配方預覽');
   floating.setAttribute('aria-modal','false');
   root.appendChild(floating);
   floating.addEventListener('mouseenter',()=>{if(closingTimer!==null){clearTimeout(closingTimer);closingTimer=null}});
   floating.addEventListener('mouseleave',scheduleHide);
   floating.addEventListener('click',event=>{
    const button=event.target.closest('[data-preview-edit-template]');
    if(button)openTemplateEditor(button.dataset.previewEditTemplate);
    if(event.target.closest('[data-dismiss-preview]'))hidePreview();
   });
  }
  if(activeTrigger&&activeTrigger!==trigger)activeTrigger.setAttribute('aria-expanded','false');
  activeTrigger=trigger;trigger.setAttribute('aria-expanded','true');
  floating.innerHTML='<div class="quote-preview-control"><b>套裝／材料內容預覽</b><button type="button" class="quote-preview-close" data-dismiss-preview aria-label="關閉預覽">×</button></div>'+content;
  floating.hidden=false;
  const rect=trigger.getBoundingClientRect();
  const width=Math.min(470,window.innerWidth-24);
  floating.style.width=width+'px';
  floating.style.left=Math.max(12,Math.min(rect.left,window.innerWidth-width-12))+'px';
  const height=floating.offsetHeight||330;
  const below=rect.bottom+8,above=rect.top-height-8;
  floating.style.top=Math.max(12,Math.min(below+height<=window.innerHeight-12?below:above>12?above:below,window.innerHeight-Math.min(height,window.innerHeight-24)-12))+'px';
 }
 function bindQuoteLinePreview(tr){
  const button=tr.querySelector('.quote-line-inspect');
  if(!button||!tr._catalogMeta)return;
  const show=()=>showFloating(button,quoteLinePreviewHTML(tr._catalogMeta,tr.querySelector('[name=qty]')?.value));
  button.addEventListener('mouseenter',()=>{pinned=false;show()});
  button.addEventListener('focus',show);
  button.addEventListener('mouseleave',scheduleHide);
  button.addEventListener('click',()=>{if(pinned&&activeTrigger===button)hidePreview();else{pinned=true;show()}});
 }
 function quotePicker(addRow){
  const button=$('#quote-template-add'),selector=$('#quote-template'),feedback=$('#quote-template-feedback');
  if(!button||!selector)return;
  function notify(message,failed=false){
   if(feedback){feedback.textContent=message;feedback.className='quote-template-feedback '+(failed?'is-error':'is-success')}
   toast(message);
  }
  const inspect=$('#quote-template-inspect');
  if(inspect){
   const show=()=>showFloating(inspect,selectedPreviewHTML(selector.value));
   inspect.addEventListener('mouseenter',()=>{pinned=false;show()});
   inspect.addEventListener('focus',show);
   inspect.addEventListener('mouseleave',scheduleHide);
   inspect.onclick=()=>{if(pinned&&activeTrigger===inspect)hidePreview();else{pinned=true;show()}};
   selector.addEventListener('change',()=>{if(floating&&!floating.hidden&&activeTrigger===inspect)show()});
  }
  button.onclick=()=>{
   if(!selector.value)return notify('請先選擇包項或工項',true);
   try{
    const lines=CatalogKit.flatten(list(),selector.value);
    if(!lines.length)throw new Error('這個包項沒有可加入的計價工項');
    const old=$$('#items-table tbody tr');
    const blank=old.length===1&&!$('[name=itemName]',old[0]).value.trim();
    const current=old.length-(blank?1:0);
    if(current+lines.length>100)throw new Error('估價單最多 100 個工項：目前 '+current+' 項，套裝會再加入 '+lines.length+' 項');
    if(blank)old[0].remove();
    for(const line of lines)addRow(line);
    const latest=$$('#items-table tbody tr').at(-1);
    if(latest&&typeof latest.scrollIntoView==='function')latest.scrollIntoView({block:'nearest',behavior:'smooth'});
    notify('✓ 已新增 '+lines.length+' 個工項，估價明細已更新（材料配方會隨估價單保存）');
   }catch(e){notify('無法加入工項：'+(e?.message||'請檢查工項範本及子工項設定'),true)}
  };
 }
 async function syncQuote(id){
  const quote=state.data.quotes.find(q=>q.id===id);
  if(!quote||quote.status!=='已接受')return toast('僅已接受的估價單能同步材料需求');
  if(!confirm('從此估價單同步材料到工程需求？\n會取代該工程先前報價來源的需求，手動需求保留且優先。不會扣庫存。'))return;
  try{
   if(state.server){
    const response=await fetch('/api/catalog',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'syncQuote',payload:{quoteId:id}})});
    const result=await response.json();if(!response.ok)throw Error(result.error||'同步失敗');state.data=result.data;
   }else{
    const rows=CatalogKit.quoteMaterials(quote);
    if(!rows.length)throw Error('估價單沒有配置材料配方');
    for(const row of rows)if(!items().some(i=>i.id===row.itemId))throw Error('估價單有不存在的耗材');
    CatalogKit.clearQuotePlans(state.data,id,quote.projectId);
    state.data.quoteMaterialPlans.push(...rows.map(x=>({...x,projectId:quote.projectId,quoteId:id})));
    const existing=new Set(state.data.materialRequirements.filter(x=>x.projectId===quote.projectId).map(x=>x.itemId));
    for(const row of rows)if(!existing.has(row.itemId))state.data.materialRequirements.push({id:'bq-'+quote.projectId+'-'+row.itemId,projectId:quote.projectId,itemId:row.itemId,plannedQty:row.plannedQty,note:'已接受估價單同步',source:'quote',sourceQuoteId:id});
    saveLocal();
   }
   render();toast('已同步工程備料，不會直接扣庫存');
  }catch(e){toast('同步失敗：'+e.message)}
 }
 function bind(){
  const b=$('#new-template');if(b)b.onclick=()=>edit();
  $$('[data-edit-template]').forEach(b=>b.onclick=()=>edit(list().find(t=>t.id===b.dataset.editTemplate)));
  $$('[data-child-template]').forEach(b=>b.onclick=()=>edit(null,b.dataset.childTemplate));
  $$('[data-sync-quote]').forEach(b=>b.onclick=()=>syncQuote(b.dataset.syncQuote));
 }
 return {renderCatalog,edit,options,quotePicker,syncQuote,bind,selectedPreviewHTML,quoteLinePreviewHTML,bindQuoteLinePreview,dismissPreviewOnEscape};
})();
