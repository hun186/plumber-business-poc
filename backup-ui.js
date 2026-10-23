/* Backup controls are available only in the authenticated SQLite server mode. */
const BackupUI=(()=>{
 const safe=s=>esc(s),iso=date=>{if(!date)return '尚無紀錄';const d=new Date(date);return Number.isNaN(d.getTime())?'未知':d.toLocaleString('zh-TW',{hour12:false})};
 const size=n=>Number(n)>=1048576?(Number(n)/1048576).toFixed(2)+' MB':(Number(n)/1024).toFixed(1)+' KB';
 function render(){
  return head('backup','資料庫備份管理','管理每日自動備份、歷史版本與手動備份。')+
   (!state.server?'<div class="banner">此頁面需要登入本機 SQLite 正式資料庫；公開展示模式無法建立可還原的備份。</div>':
   '<div class="backup-note">自動備份會在系統服務執行期間檢查；若電腦關機或關閉啟動視窗，期間不會執行。下次開啟服務後，逾期會補做一次。</div><div id="backup-panel" class="backup-panel"><section class="panel">正在載入備份設定…</section></div>');
 }
 async function request(action,body={}){
  const result=await fetch('/api/backups',{method:action?'POST':'GET',headers:{'Content-Type':'application/json'},credentials:'same-origin',...(action?{body:JSON.stringify({action,...body})}:{})});
  let data;try{data=await result.json()}catch{throw Error('伺服器沒有回傳可讀取的備份結果')}
  if(!result.ok)throw Error((data.code?data.code+'：':'')+(data.error||'備份操作失敗'));
  return data;
 }
 function content(data){
  const rows=data.backups||[],automated=rows.filter(x=>x.type==='auto').length;
  return '<section class="panel"><h2 class="panel-title">自動備份設定</h2>'+
   '<p class="panel-sub">預設每 1 天備份一次、自動保留最新 50 份；設定會儲存在 SQLite 資料庫中。</p>'+
   '<form id="backup-settings-form" class="backup-settings-grid">'+
   '<label>備份間隔（天）<input name="intervalDays" type="number" min="1" max="365" step="1" required value="'+safe(data.intervalDays)+'"></label>'+
   '<label>自動備份保留份數<input name="retentionCount" type="number" min="1" max="500" step="1" required value="'+safe(data.retentionCount)+'"></label>'+
   '<button class="btn primary" type="submit">儲存備份設定</button></form>'+
   '<p class="small-note">保留份數只清理「自動備份」。手動備份不會被排程自動刪除，需自行管理。</p>'+
   '<div class="backup-meta"><span><b>上次自動備份：</b>'+safe(iso(data.lastAutoAt))+'</span><span><b>下次預計：</b>'+safe(iso(data.nextDueAt))+'</span><span><b>目前自動版本：</b>'+automated+' 份</span></div>'+
   (data.lastError?'<div class="backup-error" role="alert">⚠ 最近一次自動備份錯誤：'+safe(data.lastError)+'</div>':'')+
   '<div class="backup-actions"><button id="backup-create" class="btn primary">立即建立手動備份</button><button id="backup-reload" class="btn">重新整理</button></div></section>'+
   '<section class="panel"><h2 class="panel-title">歷史備份</h2><p class="panel-sub">已建立 '+rows.length+' 個版本。可下載 SQLite 檔案；刪除前會再次確認。<strong>資料還原必須停止系統後由管理人員執行，不能直接在運作中的網站覆蓋資料庫。</strong></p>'+
   (rows.length?'<div class="table-scroll"><table><thead><tr><th>備份時間</th><th>類型</th><th>大小</th><th>檔案名稱</th><th>操作</th></tr></thead><tbody>'+
    rows.map(entry=>'<tr><td>'+safe(iso(entry.createdAt))+'</td><td>'+(entry.type==='auto'?'自動':'手動')+'</td><td>'+safe(size(entry.size))+'</td><td class="backup-filename">'+safe(entry.name)+'</td><td><button class="action-link" data-backup-download="'+safe(entry.name)+'">下載</button> <button class="action-link backup-danger" data-backup-delete="'+safe(entry.name)+'">刪除</button></td></tr>').join('')+'</tbody></table></div>':
    '<p class="small-note">尚無備份。可以先按「立即建立手動備份」。</p>')+'</section>';
 }
 async function load(){
  const root=$('#backup-panel');if(!root)return;
  try{const data=await request();if(state.page!=='backups'||!$('#backup-panel'))return;root.innerHTML=content(data);wire(data)}
  catch(e){if($('#backup-panel'))root.innerHTML='<section class="panel backup-error">無法讀取備份資訊：'+safe(e.message)+' <button class="btn" id="backup-retry">重試</button></section>';$('#backup-retry')?.addEventListener('click',load)}
 }
 function wire(data){
  const form=$('#backup-settings-form');
  if(form)form.onsubmit=async e=>{
   e.preventDefault();const intervalDays=Number(form.elements.intervalDays.value),retentionCount=Number(form.elements.retentionCount.value);
   if(!Number.isInteger(intervalDays)||!Number.isInteger(retentionCount)){toast('設定請輸入整數');return}
   const autoCount=(data.backups||[]).filter(x=>x.type==='auto').length;
   if(retentionCount<autoCount&&!confirm('儲存後將刪除 '+(autoCount-retentionCount)+' 份較舊的自動備份，確定繼續？'))return;
   try{await request('save',{intervalDays,retentionCount});toast('自動備份設定已儲存');await load()}
   catch(err){toast(err.message)}
  };
  $('#backup-create')?.addEventListener('click',async e=>{
   e.currentTarget.disabled=true;try{await request('create');toast('手動備份已完成並驗證');await load()}catch(err){toast(err.message);e.currentTarget.disabled=false}
  });
  $('#backup-reload')?.addEventListener('click',load);
  $$('[data-backup-download]').forEach(btn=>btn.onclick=()=>{location.href='/api/backups?file='+encodeURIComponent(btn.dataset.backupDownload)});
  $$('[data-backup-delete]').forEach(btn=>btn.onclick=async()=>{
   const name=btn.dataset.backupDelete;
   if(!confirm('永久刪除這一份備份？\n'+name+'\n此操作無法復原。'))return;
   try{await request('delete',{name});toast('已刪除指定備份');await load()}catch(err){toast(err.message)}
  });
 }
 function bind(){if(state.page==='backups'&&state.server)load()}
 return {render,bind};
})();
