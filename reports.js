/* Shared pure calculations for dashboard and Excel export. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.BusinessReports=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const n=x=>Number.isFinite(Number(x))?Number(x):0;
 const sum=(xs,fn)=>xs.reduce((a,x)=>a+n(fn(x)),0);
 const text=x=>String(x??'');
 const columns={
  customers:{name:'客戶資料',headers:['客戶編號','客戶名稱','電話','電子郵件','地址','備註'],row:c=>[c.id,c.name,c.phone,c.email,c.address,c.note]},
  projects:{name:'工程案件',headers:['案件編號','客戶編號','客戶','工程名稱','業務類別','案件狀態','開始日期','預定完工','案件金額_未稅','已收款','已登錄成本','估算毛利','估算毛利率','備註']},
  quotes:{name:'估價單',headers:['估價單號','案件編號','客戶','開立日期','狀態','未稅小計','稅額','含稅總計','備註']},
  quoteItems:{name:'估價工項',headers:['估價單號','業務類別','工項名稱','數量','單位','單價','未稅小計']},
  payments:{name:'收款紀錄',headers:['收款編號','案件編號','工程名稱','收款日期','金額','備註']},
  costs:{name:'成本明細',headers:['成本編號','案件編號','工程名稱','成本日期','成本類型','成本金額','備註']},
  byType:{name:'類別毛利統計',headers:['業務類別','案件數','案件金額','登錄成本','估算毛利','估算毛利率','收款金額']},
  byCost:{name:'成本類別統計',headers:['成本類型','筆數','金額','成本占比']},
  profit:{name:'個案毛利分析',headers:['案件編號','工程名稱','業務類別','案件狀態','客戶','案件金額','登錄成本','估算毛利','估算毛利率','收款金額']},
  summary:{name:'營運摘要',headers:['指標','數值']}
 };
 function selected(data,filters={}){
  const from=text(filters.from),to=text(filters.to),type=text(filters.type),status=text(filters.status);
  if(from&&to&&from>to)throw new Error('結束日期不可早於開始日期');
  const projects=(data.projects||[]).filter(p=>p.status!=='已取消'&&(!type||p.type===type)&&(!status||p.status===status)&&(!from||text(p.startDate)>=from)&&(!to||text(p.startDate)<=to));
  const ids=new Set(projects.map(x=>x.id));
  const byId=new Map(projects.map(p=>[p.id,p]));
  // Unfiltered customer export is a master-data export: retain clients without active projects.
  const customers=(!from&&!to&&!type&&!status)?(data.customers||[]):(data.customers||[]).filter(c=>projects.some(p=>p.customerId===c.id));
  const custById=new Map((data.customers||[]).map(c=>[c.id,c]));
  const costs=(data.costs||[]).filter(c=>ids.has(c.projectId));
  const payments=(data.payments||[]).filter(c=>ids.has(c.projectId));
  const quotes=(data.quotes||[]).filter(q=>ids.has(q.projectId));
  return {projects,costs,payments,quotes,customers,byId,custById,filters:{from,to,type,status}};
 }
 function analyze(data,filters={}){
  const s=selected(data,filters);
  const costMap=new Map(),paymentMap=new Map();
  for(const c of s.costs)costMap.set(c.projectId,n(costMap.get(c.projectId))+n(c.amount));
  for(const p of s.payments)paymentMap.set(p.projectId,n(paymentMap.get(p.projectId))+n(p.amount));
  const profitRows=s.projects.map(p=>({id:p.id,title:p.title,type:p.type||'未分類',status:p.status,customer:s.custById.get(p.customerId)?.name||'未連結',revenue:n(p.amount),cost:n(costMap.get(p.id)),profit:n(p.amount)-n(costMap.get(p.id)),margin:n(p.amount)>0?(n(p.amount)-n(costMap.get(p.id)))/n(p.amount):null,collected:n(paymentMap.get(p.id))}));
  const byTypeMap=new Map();
  for(const p of profitRows){let row=byTypeMap.get(p.type);if(!row){row={type:p.type,count:0,revenue:0,cost:0,profit:0,collected:0,margin:null};byTypeMap.set(p.type,row)}row.count++;row.revenue+=p.revenue;row.cost+=p.cost;row.profit+=p.profit;row.collected+=p.collected}
  const byType=[...byTypeMap.values()].map(x=>({...x,margin:x.revenue?x.profit/x.revenue:null})).sort((a,b)=>b.revenue-a.revenue);
  const costTypeMap=new Map();for(const c of s.costs){const k=c.category||'其他';if(!costTypeMap.has(k))costTypeMap.set(k,{category:k,count:0,amount:0,share:0});const x=costTypeMap.get(k);x.count++;x.amount+=n(c.amount)}
  const revenue=sum(profitRows,x=>x.revenue),cost=sum(profitRows,x=>x.cost),collected=sum(profitRows,x=>x.collected);
  const byCost=[...costTypeMap.values()].map(x=>({...x,share:cost?x.amount/cost:null})).sort((a,b)=>b.amount-a.amount);
  return {selection:s,profitRows,byType,byCost,totals:{projects:profitRows.length,revenue,cost,profit:revenue-cost,margin:revenue?(revenue-cost)/revenue:null,collected,uncollected:sum(profitRows,x=>Math.max(0,x.revenue-x.collected))}};
 }
 function quoteTotal(q){const subtotal=sum(q.items||[],i=>n(i.qty)*n(i.price));const tax=Math.round(subtotal*n(q.taxRate)/100);return {subtotal,tax,total:subtotal+tax}}
 function sheets(data,filters={},keys=Object.keys(columns)){
  const a=analyze(data,filters),s=a.selection,projMap=s.byId,customers=s.custById;
  const costByProject=new Map(),paidByProject=new Map();for(const p of a.profitRows){costByProject.set(p.id,p.cost);paidByProject.set(p.id,p.collected)}
  const rows={
   customers:s.customers.map(columns.customers.row),
   projects:s.projects.map(p=>{const pr=a.profitRows.find(x=>x.id===p.id);return [p.id,p.customerId,customers.get(p.customerId)?.name||'',p.title,p.type,p.status,p.startDate,p.dueDate,n(p.amount),paidByProject.get(p.id),costByProject.get(p.id),pr.profit,pr.margin,p.note]}),
   quotes:s.quotes.map(q=>{const x=quoteTotal(q);return [q.number,q.projectId,customers.get(q.customerId)?.name||'',q.date,q.status,x.subtotal,x.tax,x.total,q.note]}),
   quoteItems:s.quotes.flatMap(q=>(q.items||[]).map(i=>[q.number,projMap.get(q.projectId)?.type||'',i.name,n(i.qty),i.unit,n(i.price),n(i.qty)*n(i.price)])),
   payments:s.payments.map(p=>[p.id,p.projectId,projMap.get(p.projectId)?.title||'',p.date,n(p.amount),p.note]),
   costs:s.costs.map(c=>[c.id,c.projectId,projMap.get(c.projectId)?.title||'',c.date,c.category,n(c.amount),c.note]),
   byType:a.byType.map(x=>[x.type,x.count,x.revenue,x.cost,x.profit,x.margin,x.collected]),
   byCost:a.byCost.map(x=>[x.category,x.count,x.amount,x.share]),
   profit:a.profitRows.map(x=>[x.id,x.title,x.type,x.status,x.customer,x.revenue,x.cost,x.profit,x.margin,x.collected]),
   summary:[['報表範圍_開始日',filters.from||'全部'],['報表範圍_結束日',filters.to||'全部'],['業務類別篩選',filters.type||'全部'],['工程狀態篩選',filters.status||'全部'],['有效案件數',a.totals.projects],['案件金額合計_未稅',a.totals.revenue],['已登錄成本',a.totals.cost],['估算毛利',a.totals.profit],['估算毛利率',a.totals.margin??'無法計算'],['已收款',a.totals.collected],['預估未收款',a.totals.uncollected],['統計說明','不含已取消案件；依案件開始日期篩選；已選案件的成本與收款採全期間明細'],['重要提醒','案件金額可能是預估報價；成本可能尚未登齊，毛利與毛利率僅供管理估算，並非會計認列獲利']]
  };
  return [...new Set(keys)].filter(k=>columns[k]).map(k=>({name:columns[k].name,headers:columns[k].headers,rows:rows[k]}));
 }
 return {analyze,selected,sheets,columns,quoteTotal};
});
