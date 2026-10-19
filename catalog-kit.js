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
 function clearQuotePlans(data,quoteId,projectId=null){
  data.quoteMaterialPlans=(data.quoteMaterialPlans||[]).filter(row=>
   row.quoteId!==quoteId&&(projectId===null||row.projectId!==projectId));
  data.materialRequirements=(data.materialRequirements||[]).filter(row=>
   !(row.source==='quote'&&(row.sourceQuoteId===quoteId||(projectId!==null&&row.projectId===projectId))));
 }

 function ensureHierarchyDepth(templates,changed,max=12){
  const nodes=new Map(templates.map(t=>[t.id,{...t}]));
  nodes.set(changed.id,{...(nodes.get(changed.id)||{}),...changed});
  let cursor=changed.parentId||null,ancestors=0;
  const seenAncestors=new Set([changed.id]);
  while(cursor){
   if(seenAncestors.has(cursor))throw new Error('工項不可放在自身或後代底下');
   seenAncestors.add(cursor);
   const parent=nodes.get(cursor);
   if(!parent)throw new Error('找不到父層包項');
   if(parent.kind&&parent.kind!=='package')throw new Error('父層必須為包項');
   ancestors++;
   if(ancestors>=max)throw new Error('工項最多 '+max+' 層');
   cursor=parent.parentId||null;
  }
  const children=new Map();
  for(const node of nodes.values()){
   if(!node.parentId)continue;
   const arr=children.get(node.parentId)||[];
   arr.push(node.id);
   children.set(node.parentId,arr);
  }
  const visited=new Set(),stack=[{id:changed.id,depth:1}];
  while(stack.length){
   const {id,depth}=stack.pop();
   if(visited.has(id))throw new Error('工項層級出現循環');
   visited.add(id);
   if(ancestors+depth>max)throw new Error('工項含子工項的總層級不可超過 '+max+' 層');
   for(const childId of children.get(id)||[])stack.push({id:childId,depth:depth+1});
  }
  return true;
 }
 return {flatten,quoteMaterials,clearQuotePlans,ensureHierarchyDepth,round3};
});
