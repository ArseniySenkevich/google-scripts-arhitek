/**********************************************************************
* Telegram Bot — Архивирование и Выгрузка (переработано под текстовые команды)
**********************************************************************/

const SHEETS_TO_ARCHIVE = {
  'Очередность и передача': 'Архив_Очередность и передача',
  'Утренние статусы': 'Архив_Утренние статусы',
  'Свод по менеджерам': 'Архив_Свод по менеджерам',
  'Возвраты лидов': 'Архив_Возвраты лидов'
};

const ARCHIVE_ACCESS = {
  420111780: 'Сенкевич Арсений',
  987654322: 'Орфаниди А.'
};

function hasArchiveAccess(userId) {
  return userId in ARCHIVE_ACCESS;
}

function getTodayISO() {
  return Utilities.formatDate(new Date(), 'GMT+3', 'yyyy-MM-dd');
}

function getTodayRU() {
  return Utilities.formatDate(new Date(), 'GMT+3', 'dd.MM.yyyy');
}

function getNow() {
  return Utilities.formatDate(new Date(), 'GMT+3', 'yyyy-MM-dd HH:mm:ss');
}

function handleArchiveCallback(action, chatId, userId) {
  if (!hasArchiveAccess(userId)) {
    sendMessage(chatId, '⛔ У вас нет доступа к архивированию.');
    return;
  }

  const clear = action === 'ARCHIVE_AND_CLEAR';
  try {
    archiveAndReport(clear);  // теперь принимает параметр — очищать или нет
    const link = createExcelWithTodayArchives();
    const text = clear
      ? `✅ Архивирование завершено с очисткой.\n📁 <a href="${link}">Скачать отчёт</a>`
      : `✅ Выгрузка завершена (без очистки).\n📁 <a href="${link}">Скачать отчёт</a>`;
    sendMessage(chatId, text);
  } catch (e) {
    const logSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('ЛогОшибок');
    if (logSheet) {
      logSheet.appendRow([getNow(), 'handleArchiveCallback', `❌ Ошибка при архивации/выгрузке: ${e.message}`, userId]);
    }
    sendMessage(chatId, `⚠️ Произошла ошибка при формировании Excel-файла.\nПричина: ${e.message}`);
  }
}




function archiveAndReport(clearSource = true) {
  const dateRu = getTodayRU();
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const logSheet = ss.getSheetByName('ЛогОшибок');

  Object.entries(SHEETS_TO_ARCHIVE).forEach(([srcName, arcName]) => {
    try {
      const srcSheet = ss.getSheetByName(srcName);
      if (!srcSheet) return;

      const data = srcSheet.getDataRange().getValues();
      if (data.length < 2) return;

      let arcSheet = ss.getSheetByName(arcName);
      if (!arcSheet) arcSheet = ss.insertSheet(arcName);

      const label = `Отчёт от ${dateRu}`;
      const archiveData = arcSheet.getDataRange().getValues();
      const existingLabelRow = archiveData.findIndex(row => String(row[0]).trim() === label);

      if (clearSource) {
        // Удаляем старый блок архива за этот день, если есть
        if (existingLabelRow >= 0) {
          let endRow = existingLabelRow + 1;
          while (endRow < archiveData.length && !String(archiveData[endRow][0]).startsWith('Отчёт от')) {
            endRow++;
          }
          arcSheet.deleteRows(existingLabelRow + 1, endRow - existingLabelRow - 1);
          arcSheet.deleteRow(existingLabelRow + 1); // сам заголовок
          SpreadsheetApp.flush();
        }
      } else {
        // Только выгрузка: если уже выгружали, то не дублируем
        if (existingLabelRow >= 0) {
          logSheet?.appendRow([getNow(), arcName, `⚠️ Пропущен: отчёт за ${dateRu} уже существует`, Session.getActiveUser().getEmail()]);
          return;
        }
      }

      const insertRow = arcSheet.getLastRow() + 2;
      arcSheet.getRange(insertRow, 1).setValue(label);
      arcSheet.getRange(insertRow + 1, 1, data.length, data[0].length).setValues(data);

      try {
        const range = arcSheet.getRange(insertRow + 1, 1, data.length);
        range.shiftRowGroupDepth(1);
        arcSheet.getRowGroup(insertRow + 1, 1)?.collapse();
      } catch (e) {
        logSheet?.appendRow([getNow(), arcName, `⚠️ Ошибка при группировке: ${e.message}`, Session.getActiveUser().getEmail()]);
      }

      // Очищаем рабочие листы, если clearSource = true
      if (clearSource && srcSheet.getLastRow() > 1) {
        const numCols = srcSheet.getLastColumn();
        srcSheet.getRange(2, 1, srcSheet.getLastRow() - 1, numCols).clearContent();
      }

    } catch (e) {
      logSheet?.appendRow([getNow(), arcName, `❌ Ошибка при архивации: ${e.message}`, Session.getActiveUser().getEmail()]);
    }
  });

  SpreadsheetApp.flush();
}



function createExcelWithTodayArchives() {
  return createExcelWithDate(getTodayRU());
}

function createExcelWithDate(dateStr) {
  Logger.log(`▶️ createExcelWithDate() с датой: ${dateStr}`);
  const source = SpreadsheetApp.openById(SPREADSHEET_ID);
  const temp = SpreadsheetApp.create(`Архивы за ${dateStr}`);
  const log = source.getSheetByName('ЛогОшибок');
  const isoDate = dateStr.replace(/(\d{2})\.(\d{2})\.(\d{4})/, '$3-$2-$1');
  let sheetCount = 0;

  Object.values(SHEETS_TO_ARCHIVE).forEach(name => {
    const sh = source.getSheetByName(name);
    Logger.log(`🔍 Проверяем лист ${name}...`);
    if (!sh) {
      if (log) log.appendRow([getNow(), name, '⚠️ Лист не найден', Session.getActiveUser().getEmail()]);
      return;
    }
    const values = sh.getDataRange().getValues();
    const headerLine = values.findIndex(r => {
      const c = String(r[0]).trim();
      return c === `Отчёт от ${dateStr}` || c === `Отчёт от ${isoDate}`;
    });
    if (headerLine < 0) {
      if (log) log.appendRow([getNow(), name, '❌ Заголовок не найден', Session.getActiveUser().getEmail()]);
      return;
    }
    const rows = values.slice(headerLine + 1).filter(r => {
      const c = String(r[0]).trim();
      return c && !c.startsWith('Отчёт от');
    });
    Logger.log(`${name}: rows=${rows.length}`);
    if (!rows.length) {
      if (log) log.appendRow([getNow(), name, '⚠️ Нет данных', Session.getActiveUser().getEmail()]);
      return;
    }
    const tmp = temp.insertSheet(name.replace('Архив_', ''));
    tmp.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
    sheetCount++;
  });

  if (sheetCount === 0) {
    if (log) log.appendRow([getNow(), '-', `❌ Ни одного отчёта за ${dateStr}`, Session.getActiveUser().getEmail()]);
    throw new Error('Архив за эту дату не найден');
  }

  // Удаляем лишний лист, если он имеется
  temp.getSheets().forEach(s => {
    if (s.getName() === 'Лист1' || s.getName() === 'Sheet1') temp.deleteSheet(s);
  });

  // 🆕 РН: экспортим книгу целиком через UrlFetch
  const exportUrl = `https://docs.google.com/spreadsheets/d/${temp.getId()}/export?format=xlsx`;
  const blob = UrlFetchApp.fetch(exportUrl, {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }
  }).getBlob().setName(`Архивы за ${dateStr}.xlsx`);
  const file = DriveApp.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getUrl();
}



function handleReportRequest(chatId, userId, userText) {
  const props = PropertiesService.getScriptProperties();
  if (userText.startsWith('/')) return false;

  if (props.getProperty('awaiting_report_date_' + userId) === 'true') {
    props.deleteProperty('awaiting_report_date_' + userId);
    const match = userText.trim().match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/);
    if (!match) {
      sendMessage(chatId, '⛔ Неверный формат даты. Пример: 09.07.2025');
      return true;
    }

    const [ , dd, mm, yyyy ] = match;
    const ruDate = `${String(dd).padStart(2, '0')}.${String(mm).padStart(2, '0')}.${yyyy}`;

    try {
      const link = createExcelWithDate(ruDate);
      sendMessage(chatId, `✅ Отчёт за ${dd}.${mm}.${yyyy} сформирован:\n📁 <a href="${link}">Скачать Excel</a>`);
    } catch (e) {
      const logSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('ЛогОшибок');
      if (logSheet) {
        logSheet.appendRow([getNow(), 'handleReportRequest', `❌ Ошибка при формировании файла: ${e.message}`, userId]);
      }
      sendMessage(chatId, `❌ Не удалось сформировать выгрузку. Возможно, отчёт за эту дату не найден.`);
    }
    return true;
  }

  if (userText.toLowerCase().includes('выгрузка отчёта')) {
    if (!hasArchiveAccess(userId)) {
      sendMessage(chatId, '⛔ У вас нет доступа к выгрузке отчётов.');
      return true;
    }
    props.setProperty('awaiting_report_date_' + userId, 'true');
    sendMessage(chatId, '📅 Введите дату в формате <b>дд.мм.гггг</b> для выгрузки архива:');
    return true;
  }

  return false;
}
