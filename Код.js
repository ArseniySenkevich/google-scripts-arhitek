/**********************************************************************
*      А В Т О Н А З Н А Ч Е Н И Е   М Е Н Е Д Ж Е Р О В              *
*      0-1-2-3 — 1-лид-день (с RetryScan)   •   4 — allow-тройка      *
*      v2025-06-16-FINAL (GAS ≈ VBA GetManager)                       *
**********************************************************************/

/* ----------- листы ----------- */
const SH_DATA  = 'Очередность и передача';
const SH_QUEUE = 'Очередь менеджеров';
const SH_LOG   = 'Логи';
const SH_LOG4  = 'Лог_Вид4';
const SH_ARCH  = 'Архив';

/* -------- колонки формы ------- */
const C_DATE=1, C_REG=2, C_TYPE=4, C_OUT=6, C_NOTE=7;

/* ------- индексы очереди ------ */
const I_NAME=1, I_REG=2, I_TYPES=3, I_STAT=4;

/* --------- бизнес-правила ----- */
const ALLOW_4   = ['Иванык Н.','Мозговой Л.','Павлик К.'];
const BLOCK_012 = ['Иванык Н.','Мозговой Л.','Павлик К.'];
/* лимиты дублируются через счётчик, как в VBA */

/* ===================================================================
   меню (необязательно, но полезно)
=================================================================== */
function onOpen(){
  SpreadsheetApp.getUi().createMenu('Менеджеры')
    .addItem('Начать рабочий день',  'startWorkday')
    .addItem('Завершить рабочий день','finishWorkday')
    .addSeparator()
    .addItem('Выгрузить отчёт',       'exportReport')
    .addToUi();
}

/* ===================================================================
   «Начать рабочий день» : перенос старых дат + очистка + сброс памяти
=================================================================== */
function startWorkday(){
  const ss = SpreadsheetApp.getActive();
  const ws = ss.getSheetByName(SH_DATA);
  const arch = ss.getSheetByName(SH_ARCH) || ss.insertSheet(SH_ARCH);

  const tz  = ss.getSpreadsheetTimeZone();
  const iso = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');

  const rows = ws.getRange(2,1, ws.getLastRow()-1,7).getValues();
  const old  = rows.filter(r=>{
    const d=parseDate(r[0]);
    return d && Utilities.formatDate(d,tz,'yyyy-MM-dd') < iso;
  });
  if(old.length){
    arch.appendRow(['----- '+iso+' (прошлые) -----']);
    arch.getRange(arch.getLastRow()+1,1,old.length,7).setValues(old);
  }
  ws.getRange(2,1, ws.getLastRow()-1,7).clearContent();
  ws.getRange(2,C_DATE).setValue(iso.replace(/-/g,'.'));

  /* очищаем все счётчики и позицию очередей */
  PropertiesService.getDocumentProperties().deleteAllProperties();
}

/* ===================================================================
   onEdit : только по изменению колонки «Вид объекта»
=================================================================== */
function onEdit(e){
  if(!e || !e.range) return;

  const sheet = e.range.getSheet();
  const col   = e.range.getColumn();
  const row   = e.range.getRow();
  const lock  = LockService.getDocumentLock();
  const ss    = SpreadsheetApp.getActive();

  // Проверяем нужный лист и нужную колонку
  if(sheet.getName() !== SH_DATA) return;
  if(col !== C_TYPE) return;

  lock.waitLock(10000);

  try {
    const region  = (sheet.getRange(row, C_REG).getValue() || '').toString().trim();
    const objType = String(e.range.getValue()).trim();
    const dtCell  = sheet.getRange(row, C_DATE).getValue();
    const city = (sheet.getRange(row, 3).getValue() || '').toString().trim(); // если колонка "город" — это 3

    if (!region || !objType || !dtCell) {
      const msg = `❌ Пустые данные в строке ${row}: region=[${region}], type=[${objType}], date=[${dtCell}]`;
      logEditError(msg);
      return;
    }

    const iso = Utilities.formatDate(parseDate(dtCell), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
    const {manager, note} = computeManager(region, objType, iso, city);

    sheet.getRange(row, C_OUT ).setValue(manager);
    sheet.getRange(row, C_NOTE).setValue(note);


  } catch (err) {
    logEditError('❌ ИСКЛЮЧЕНИЕ: ' + err.message);
  } finally {
    lock.releaseLock();
  }
}

/* ===================================================================
   главный алгоритм  (точная логика VBA)
=================================================================== */
function computeManager(region, objType, iso, city = ''){
  const ss = SpreadsheetApp.getActive();
  const queue = ss.getSheetByName(SH_QUEUE).getDataRange().getValues().slice(1);
  const prop  = PropertiesService.getDocumentProperties();

  /* ---------- day-счётчики ---------- */
  const cntKey = 'CNT_'+iso;                // все виды (0-3)
  const v4Key  = 'V4_'+iso;                 // отдельный счётчик вида-4
  const dayCnt  = JSON.parse(prop.getProperty(cntKey)||'{}');
  const dayVid4 = JSON.parse(prop.getProperty(v4Key)||'{}');

  const is4 = (objType==='4');

  // 🔍 Проверка, есть ли менеджер на объекте в этом городе (вне очереди)
  const availableHere = getManagersOnLocation(region, city);
  debugLog(`🧩 Найдено менеджеров на месте: ${availableHere.join(', ')}`);

  for (const name of availableHere) {
  // назначаем по геолокации вне зависимости от активности в очереди
  logManager(region, objType, name);

  const note = '🛠️ Назначен по текущему местоположению';

  return { manager: name, note };
}


  /* сколько allow-менеджеров реально ведут этот регион +4 */
  let allowWithReg = 0;
  if(is4){
    queue.forEach(r=>{
      const n=r[I_NAME].toString().trim();
      if(!ALLOW_4.includes(n)) return;
      if(!inRegion(r[I_REG]||'',region)) return;
      if(!list(r[I_TYPES]).includes('4')) return;
      allowWithReg++;
    });
  }

  /* ------------- сбор кандидатов ------------- */
  const candidates = (ignoreLimits) => {
  const ok = [];

  queue.forEach(r => {
    const name  = r[I_NAME].toString().trim();
    const types = list(r[I_TYPES]);
    const st    = (r[I_STAT]||'').toString().trim().toLowerCase();
    if (st !== 'активен') return;

    const hasReg = inRegion(r[I_REG]||'', region);

      // Для вида 4 разрешаем менеджеров даже без региона, если они в allow-списке
      if (!hasReg && !(is4 && ALLOW_4.includes(name))) return;


    const excl = isRegionExclusive(queue, name, region);
    if (excl) {
      ok.push(name);
      return;
    }

    // ---- ВИД 4 ----
    if (is4) {
      if (!ALLOW_4.includes(name)) return;
      if (!types.includes('4')) return;
      if (!ignoreLimits && dayVid4[name]) return; // ❗ только 1 лид-4 в день
      ok.push(name);
      return;
    }

    // ---- ВИД 0-1-2-3 ----
    if (!types.includes(objType)) return;
    if (['0','1','2'].includes(objType) && BLOCK_012.includes(name)) return;
    if (!ignoreLimits && dayCnt[name]) return; // ❗ только 1 обычный лид в день
    ok.push(name);
  });

  return ok;
};

  /* первый проход (с лимитами) */
  let valid = candidates(false);

  // ✅ ВСТАВКА: эксклюзив вне очереди и без лимитов
  if (valid.length === 1 && isRegionExclusive(queue, valid[0], region)) {
    const exclusiveManager = valid[0];
    logManager(region, objType, exclusiveManager);
    return {
      manager: exclusiveManager,
      note: 'Эксклюзивный регион'
    };
  }

  /* RetryScan: если пусто, обнуляем счётчики и пробуем снова */
  if(!valid.length){
    for(const k in dayCnt)  delete dayCnt[k];
    for(const k in dayVid4) delete dayVid4[k];
    valid = candidates(true);
  }
    
  if(!valid.length) {
  // 📌 fallback-поиск хотя бы по региону
  const fallback = queue.filter(r => {
    const name = r[I_NAME].toString().trim();
    const st = (r[I_STAT]||'').toString().trim().toLowerCase();
    if (st !== 'активен') return false;
    if (!inRegion(r[I_REG]||'', region)) return false;
    return true;
  }).map(r => r[I_NAME].toString().trim());

  if (fallback.length) {
    const key = 'fallback_' + region.toLowerCase();
    const last = prop.getProperty(key)||'';
    const next = fallback[(fallback.indexOf(last)+1)%fallback.length];
    prop.setProperty(key, next);

    logManager(region, objType, next);
    return {
      manager: next,
      note: 'Назначен по fallback-региону'
    };
  }

  return {manager:'',note:'Нет свободного менеджера на дату '+iso};
}
  /* очередь по ключу (для вида-4 фиксация глобальная) */
  const key = (is4 ? 'vid4_'+region.toLowerCase()
                   : region.toLowerCase());
  const loopKey = 'LOOP_'+key;
  const last = prop.getProperty(loopKey)||'';
  const next = valid[(valid.indexOf(last)+1)%valid.length];
  prop.setProperty(loopKey, next);

  /* фиксируем факт назначения */
  dayCnt[next]=true;  prop.setProperty(cntKey,JSON.stringify(dayCnt));
  if(is4){ dayVid4[next]=true; prop.setProperty(v4Key,JSON.stringify(dayVid4)); }

  logManager(region,objType,next);
  return {
    manager: next,
    note: exclComment(queue,next,region,is4)
  };
}

/* ------------- вспом. функции логики ---------------- */
function isRegionExclusive(tbl,mgr,reg){
  const tag=';'+reg.toLowerCase()+';';
  let owns=0;
  tbl.forEach(r=>{
    if((';'+(r[I_REG]||'').toLowerCase()+';').includes(tag)) owns++;
  });
  return owns===1 &&
         tbl.some(r=>r[I_NAME].toString().trim()===mgr &&
                     (';'+(r[I_REG]||'').toLowerCase()+';').includes(tag));
}
function exclComment(tbl,mgr,reg,is4){
  return isRegionExclusive(tbl,mgr,reg)
         ? 'Эксклюзивный регион'
         : (is4 ? 'Вид-4 (allow-очередь)' : 'Назначен по очереди');
}

/* ===================================================================
   логирование  (Date + анти-дубль 5 с)
=================================================================== */
function logManager(region,objType,manager){
  const ss = SpreadsheetApp.getActive();
  const now = new Date();

  let ws = ss.getSheetByName(SH_LOG)||ss.insertSheet(SH_LOG);
  if(isDup(ws,now,region,objType,manager)) return;
  ws.appendRow([now,region,objType,manager]);
  SpreadsheetApp.flush();

  if(objType==='4'){
    let ws4 = ss.getSheetByName(SH_LOG4)||ss.insertSheet(SH_LOG4);
    if(isDup(ws4,now,region,objType,manager)) return;
    ws4.appendRow([now,region,objType,manager,
                   'Отправить ссылку на объект: 946213@arhitek.su']);
    SpreadsheetApp.flush();
  }
}
function isDup(ws,now,reg,typ,mgr){
  const last=ws.getLastRow();
  if(last<2) return false;
  const from=Math.max(2,last-10);
  const rows=ws.getRange(from,1,last-from+1,4).getValues();
  return rows.some(r=>{
    if(r[3]!==mgr || r[1]!==reg || String(r[2])!==String(typ)) return false;
    const diff=now-r[0];               // оба Date → мс
    return diff>=0 && diff<=5000;      // ≤5 с — дубль
  });
}

/* ===================================================================
   утилиты (как в VBA-аналогах)
=================================================================== */
function list(v){return String(v).replace(/[^\d]+/g,',').replace(/^,|,$/g,'').split(',').filter(Boolean);}
function inRegion(managerRegions, targetRegion){
  const mgrSet = managerRegions.toLowerCase().split(/[,;]/).map(s => s.trim()).filter(Boolean);
  const targetWords = targetRegion.toLowerCase().split(/\s+/).filter(Boolean);
  return targetWords.every(w => mgrSet.some(m => m.includes(w)));
}
function parseDate(v){return v instanceof Date ? v : new Date(v);}

/* ===================================================================
   заглушки: дописать при нужде
=================================================================== */
function finishWorkday() {}
function exportReport()  {}
function logEditError(message) {
  const ss = SpreadsheetApp.getActive();
  let ws = ss.getSheetByName('ЛогОшибок');
  if (!ws) ws = ss.insertSheet('ЛогОшибок');

  if (message.includes("эта область защищена")) {
    // Не логируем — иначе будет спам, если кто-то вручную редактирует
    return;
  }

  ws.appendRow([new Date(), message]);
}
function debugLog(message) {
  const sheet = SpreadsheetApp.getActive().getSheetByName('ЛогОшибок');
  if (!sheet) return;
  sheet.appendRow([new Date(), '🪵 DEBUG', message]);
}
function installableEditTrigger(e) {
  try {
    if (!e) return;
    handleEdit(e);
  } catch (err) {
    logEditError("❌ installableEditTrigger: " + err.message);
  }
}

function handleEdit(e) {
  try {
    onEdit(e);
  } catch (err) {
    logEditError("❌ handleEdit: " + err.message);
  }
}
function getManagersOnLocation(region, city) {
  const sheet = SpreadsheetApp.getActive().getSheetByName('Утренние статусы');
  const rows = sheet.getDataRange().getValues().slice(1);
  const results = [];

  debugLog(`🔍 getManagersOnLocation: ищем по ГОРОДУ "${city}"`);

  const normalizedCity = city.toLowerCase().replace(/^г\.\s*/, '').trim();

  for (const row of rows) {
    const name = row[2]?.toString().trim();
    const status = row[3]?.toString().trim().toLowerCase();
    const location = row[4]?.toString().trim().toLowerCase().replace(/^г\.\s*/, '').trim();

    debugLog(`👀 Проверка строки: name=${name}, status=${status}, location=${location}`);

    if (!name || !status || !location) continue;
    if (!['у клиента', 'на объекте'].includes(status)) continue;

    if (location === normalizedCity) {
      debugLog(`✅ Менеджер найден по ГОРОДУ: ${name}`);
      results.push(name);
    }
  }

  return results;
}



