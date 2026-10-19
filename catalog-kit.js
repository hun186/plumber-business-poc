/* Shared work-package tree, quote snapshot and BOM planning calculations. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CatalogKit=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const round3=v=>Math.round((Number(v)+Number.EPSILON)*1000)/1000;
 function flatten(templates,selectedId){
  const byId=new Map(templates.map(t=>[t.id,t]));
  const root=byId.get(selectedId);if(!root)throw new Error('找不到工項範本');
  const children=new Map();for(const t of templates){if(!t.parentId)continue;const siblings=children.get(t.parentId)||[];siblings.push(t);children.set(t.parentId,siblings)}
  const items=[];
  function walk(t,mult,path,visited){
   if(visited.has(t.id)||visited.size>=12)throw new Error('工項層級形成循環或超過 12 層');
   const qty=Number(t.defaultQty),nextQty=round3(mult*qty);if(!Number.isFinite(qty)||qty<=0||nextQty<=0||nextQty>1e7)throw new Error('工項數量不合法');
   const names=[...path,t.name],next=new Set(visited);next.add(t.id);
   if(t.kind==='package'){
    const sub=children.get(t.id)||[];
    if(!sub.length)throw new Error('包項「'+t.name+'」尚未設定子工項');
    for(const child of sub)walk(child,nextQty,names,next);
   }else{
    if(children.has(t.id))throw new Error('一般工項不能包含子工項');
    items.push({name:names.join(' / '),qty:nextQty,unit:t.unit||'式',price:Number(t.unitPrice)||0,
     catalogId:t.id,materials:(t.materials||[]).map(m=>({itemId:m.itemId,qty:round3(Number(m.qty))}))});
   }
  }
  walk(root,1,[],new Set());
  if(items.length>100)throw new Error('展開後超過單張估價單 100 個工項上限');
  return items;
 }
 function quoteMaterials(quote){
  const totals=new Map();
  for(const line of quote?.items||[]){
   const multiplier=Number(line.qty);
   if(!Number.isFinite(multiplier)||multiplier<=0)throw new Error('估價數量不合法');
   for(const m of line.materials||[]){
    if(!m.itemId||!Number.isFinite(Number(m.qty))||Number(m.qty)<=0)throw new Error('估價材料配方不合法');
    const next=round3((totals.get(m.itemId)||0)+multiplier*Number(m.qty));
    if(next<=0||next>1e9)throw new Error('估價材料數量超出範圍');
    totals.set(m.itemId,next);
   }
  }
  return [...totals].map(([itemId,plannedQty])=>({itemId,plannedQty}));
 }
 return {flatten,quoteMaterials,round3};
});
