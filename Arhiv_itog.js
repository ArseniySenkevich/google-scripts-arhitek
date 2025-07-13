/**********************************************************************
* Telegram Bot — Архивирование и Выгрузка (финальная версия)
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

// ——— Кнопка Архивации ———
function handleArchiveRequest(chatId) {
  const keyboard = {
    inline_keyboard: [
      [
        { text: '✅ Архивировать', callback_data: 'CONFIRM_ARCHIVE' },
        { text: '❌ Отмена', callback_data: 'CANCEL_ARCHIVE' }
      ]
    ]
  };

  sendMessage(chatId,
    '⚠️ Вы уверены, что хотите заархивировать данные?\n\n' +
    'Будет выполнено:\n— Перенос всех строк из рабочих листов:\n' +
    Object.keys(SHEETS_TO_ARCHIVE).map(n => '📌 ' + n).join('\n') +
    '\nв архивные листы с датой (если уже есть — перезапишется).\n— Очистка рабочих листов.\n— Создание Excel-файла.',
    keyboard
  );
}

// ——— Подтверждение Архивации ———
function handleArchiveConfirm(chatId) {
  archiveAndReport();
  const link = createExcelWithTodayArchives();
  sendMessage(chatId, `✅ Архивирование завершено.\n📁 <a href="${link}">Скачать отчёт</a>`, null);
}

// ——— Автоматическое выполнение ночью ———
function nightlyArchiveRun() {
  archiveAndReport();
}

// ——— Основной Архиватор с перезаписью ———
function archiveAndReport() {
  const dateStr = getTodayISO();
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  Object.entries(SHEETS_TO_ARCHIVE).forEach(([sourceName, archiveName]) => {
    const sheet = ss.getSheetByName(sourceName);
    if (!sheet) return;

    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return;

    let archiveSheet = ss.getSheetByName(archiveName);
    if (!archiveSheet) archiveSheet = ss.insertSheet(archiveName);

    const archiveData = archiveSheet.getDataRange().getValues();
    const reportLabel = `Отчёт от ${dateStr}`;

    // Удалим старый блок с этой датой
    let startRow = -1;
    for (let i = 0; i < archiveData.length; i++) {
      if (archiveData[i][0] === reportLabel) {
        startRow = i;
        break;
      }
    }

    if (startRow !== -1) {
      // Найдём конец блока
      let endRow = archiveData.length;
      for (let i = startRow + 1; i < archiveData.length; i++) {
        if (String(archiveData[i][0]).startsWith('Отчёт от')) {
          endRow = i;
          break;
        }
      }
      const numRows = endRow - startRow;
      archiveSheet.deleteRows(startRow + 1, numRows); // +1 потому что index 0-based
    }

    // Вставим новый блок
    const insertRow = archiveSheet.getLastRow() + 2;
    archiveSheet.getRange(insertRow, 1).setValue(reportLabel);
    archiveSheet.getRange(insertRow + 1, 1, data.length, data[0].length).setValues(data);

    archiveSheet.getRange(insertRow + 1, 1, data.length, 1).shiftRowGroupDepth(1);
    archiveSheet.getRowGroup(insertRow + 1, 1).collapse();

    // Очистка рабочих листов (кроме шапки)
    sheet.deleteRows(2, sheet.getLastRow() - 1);
  });

  SpreadsheetApp.flush();
}

// ——— Выгрузка Excel за сегодня ———
function createExcelWithTodayArchives() {
  return createExcelWithDate(getTodayISO());
}

// ——— Выгрузка Excel за любую дату ———
function createExcelWithDate(dateStr) {
  const source = SpreadsheetApp.openById(SPREADSHEET_ID);
  const temp = SpreadsheetApp.create(`Архивы за ${dateStr}`);

  Object.values(SHEETS_TO_ARCHIVE).forEach(archiveName => {
    const sheet = source.getSheetByName(archiveName);
    if (!sheet) return;

    const data = sheet.getDataRange().getValues();
    let startIndex = -1;

    for (let i = 0; i < data.length; i++) {
      if (data[i][0] === `Отчёт от ${dateStr}`) {
        startIndex = i + 1;
        break;
      }
    }

    if (startIndex === -1) return;

    const values = [];
    for (let i = startIndex; i < data.length; i++) {
      if (String(data[i][0]).startsWith('Отчёт от')) break;
      values.push(data[i]);
    }

    if (values.length > 0) {
      const tempSheet = temp.insertSheet(archiveName.replace('Архив_', ''));
      tempSheet.getRange(1, 1, values.length, values[0].length).setValues(values);
    }
  });

  const defaultSheet = temp.getSheetByName('Лист1');
  if (defaultSheet) temp.deleteSheet(defaultSheet);

  const blob = temp.getBlob().getAs('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  const file = DriveApp.createFile(blob).setName(`Архивы за ${dateStr}.xlsx`);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return file.getUrl();
}

function handleReportRequest(chatId, userId, userText) {

  const props = PropertiesService.getScriptProperties();

  // 🛡 Игнорируем команды Telegram
  if (userText.startsWith('/')) return false;
  // если пользователь уже вводит дату
  if (props.getProperty('awaiting_report_date_' + userId) === 'true') {
    props.deleteProperty('awaiting_report_date_' + userId);
    const match = userText.trim().match(/^(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{4})$/);
    if (!match) {
      sendMessage(chatId, '⛔ Неверный формат даты. Пример: 09.07.2025');
      return true;
    }

    const [ , dd, mm, yyyy ] = match;
    const isoDate = `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;

    try {
      const link = createExcelWithDate(isoDate);
      sendMessage(chatId, `✅ Отчёт за ${dd}.${mm}.${yyyy} сформирован:\n📁 <a href="${link}">Скачать Excel</a>`);
    } catch (e) {
      sendMessage(chatId, `❌ Не удалось сформировать выгрузку. Возможно, отчёт за эту дату не найден.`);
    }
    return true;
  }

  // если пользователь только начал выгрузку
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


