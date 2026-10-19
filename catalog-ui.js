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
     while(ancestor){if(seen.has(ancestor.id)||++depth>12)throw Error('工項層級不可循環');seen.add(ancestor.id);ancestor=all.find(x=>x.id===ancestor.parentId)}
    }
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
 function quotePicker(addRow){
  const button=$('#quote-template-add'),selector=$('#quote-template');if(!button||!selector)return;
  button.onclick=()=>{
   if(!selector.value)return toast('請選擇包項或工項');
   try{const lines=CatalogKit.flatten(list(),selector.value),old=$$('#items-table tbody tr');
    if(old.length===1&&!$('[name=itemName]',old[0]).value.trim())old[0].remove();
    for(const line of lines)addRow(line);
    toast('已加入 '+lines.length+' 個工項，材料配方作為報價快照保存');
   }catch(e){toast(e.message)}
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
    state.data.quoteMaterialPlans=(state.data.quoteMaterialPlans||[]).filter(x=>x.projectId!==quote.projectId);
    state.data.quoteMaterialPlans.push(...rows.map(x=>({...x,projectId:quote.projectId,quoteId:id})));
    state.data.materialRequirements=(state.data.materialRequirements||[]).filter(x=>!(x.source==='quote'&&x.projectId===quote.projectId));
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
 return {renderCatalog,edit,options,quotePicker,syncQuote,bind};
})();
