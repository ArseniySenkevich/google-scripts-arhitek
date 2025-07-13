const BOT_TOKEN = '7306430416:AAFftRJ7mZt4ukobJtvutPvlUN6c422DsdU';
const SPREADSHEET_ID = '1gnIHCS_MY3w-rV_GtgJ_izDdYQ0prZV8fy3HroGESho';
const SHEET_NAME = 'Утренние статусы';
const SHEET_ASSIGN = 'Очередность и передача';
const SHEET_ERRORS = 'ЛогОшибок';
const RETURN_STEP_PROPERTY = 'return_lead_step';


const ALLOWED_USERS = {
  123456789: 'Иванык Н.',
  987654321: 'Мозговой Л.',
  420111780: 'Сенкевич Арсений',
  987654322: 'Орфаниди А.',
  7265770045: 'Киричик Ю.',
};

const MANAGERS_ALLOWED_TO_RETURN = [
  123456789, // Иванык Н.
  987654321, // Мозговой Л.
  987654322, // Орфаниди А.
  420111780, //Арсений С.
];

const RESTRICTED_USERS = {
  7265770045: 'Киричик Ю.',
  998877665: 'Другой Менеджер'
};


const REGION_MAP = (() => {
  const list = ["Краснодар", "Анапа", "Туапсе", "Геленджик", "Новороссийск", "побережье Краснодарского края", "Сочи", "Краснодарский край, другие города", "Ростов и Ростовская область", "Ставрополь", "Кисловодск", "Ставропольский край (другие города)", "Москва и Московская область", "Крым", "Курск", "Белгород", "Липецк", "Калуга", "Сергиев Посад", "Самара", "Астрахань", "Казань", "Санкт-Петербург", "Иваново", "Рязань", "Новочеркасск", "Батайск", "Славинск-на-Кубани", "Махачкала", "Дагестан", "Чечня", "Воронеж", "Нижний Новгород", "Саратов", "Брянск", "Тамбов", "Владимир", "Старый Оскол", "ДНР", "ЛНР", "Пермь", "Другие регионы"];
  const map = {};
  list.forEach((r, i) => map[`REG_${i}`] = r);
  return map;
})();

// 👇 Новый хендлер возврата лида
function handleReturnLeadCommand(userId, chatId, messageText) {
  const props = PropertiesService.getScriptProperties();
  const leadId = parseInt(messageText.trim().match(/\d+/)?.[0]);
  const awaitingLeadId = props.getProperty('awaiting_return_reason_' + userId);
  
  if (awaitingLeadId) {
  props.deleteProperty('awaiting_return_reason_' + userId);

  const reason = userText.trim();
  const leadId = parseInt(awaitingLeadId);

  if (!MANAGERS_ALLOWED_TO_RETURN.includes(userId)) {
    sendMessage(chatId, '⛔ У вас нет доступа к возврату лидов.');
    return;
  }

  const success = returnLeadToCallCenter(leadId, userId, reason);
  if (success) {
    sendMessage(chatId, `🔁 Лид #${leadId} возвращён в колл-центр.`);
  } else {
    sendMessage(chatId, `❌ Не удалось вернуть лид #${leadId}. Проверьте ID и права.`);
  }
  showReplyKeyboard(chatId, userId in ALLOWED_ADMINS);
  return;
}

  if (!leadId) {
    sendMessage(chatId, '❌ Укажите корректный ID лида для возврата. Пример: 167037');
    return;
  }

  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_ASSIGN);
  const data = sheet.getDataRange().getValues();
  let foundRow = -1;

  for (let i = 1; i < data.length; i++) {
    const cell = data[i][0];
    const leadUrl = String(data[i][7] || ''); // колонка H: "Ссылка Лида"
    if (leadUrl.includes(`/${leadId}/`)) {
      foundRow = i;
      break;
    }
  }
  
  if (foundRow === -1) {
    logError(`❌ Не найден лид #${leadId} для возврата`, userId);
    sendMessage(chatId, `❌ Не удалось найти лид #${leadId} в листе "${SHEET_ASSIGN}".`);
    return;
  }

  // Удаляем строку
  sheet.deleteRow(foundRow + 1);
  sendMessage(chatId, `🔁 Лид #${leadId} успешно возвращён в колл-центр.`);
}



function logError(message, userId) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_ERRORS);
  const now = new Date();
  sheet.appendRow([
    Utilities.formatDate(now, 'GMT+3', 'yyyy-MM-dd HH:mm:ss'),
    userId,
    ALLOWED_USERS[userId] || 'Неизвестный',
    message
  ]);
}
 
function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  const props = PropertiesService.getScriptProperties();
  
  Logger.log('📥 Входящий запрос: ' + JSON.stringify(data));

  if (data.callback_query) {
  const userId = data.callback_query.from.id;
  const chatId = data.callback_query.message.chat.id;
  const action = data.callback_query.data;
  const callbackId = data.callback_query.id;

  answerCallbackQuery(callbackId);

  if (['ARCHIVE_AND_CLEAR', 'ARCHIVE_NO_CLEAR'].includes(action)) {
    handleArchiveCallback(action, chatId, userId);
    return;
  }
  if (action === 'ARCHIVE_CONFIRM_CLEAR') {
  const keyboard = {
    inline_keyboard: [
      [{ text: '✅ Подтвердить очистку и завершить день', callback_data: 'ARCHIVE_AND_CLEAR' }],
      [{ text: '❌ Отмена', callback_data: 'ARCHIVE_CANCEL' }]
    ]
  };
  sendMessage(chatId, '❗ Подтвердите завершение дня.\nВсе рабочие таблицы будут очищены. Убедитесь, что данные больше не нужны.', keyboard);
  return;
}

if (action === 'ARCHIVE_CANCEL') {
  sendMessage(chatId, '❎ Завершение дня отменено.');
  return;
}

  const statusMap = {
  STATUS_OFFICE: "В офисе",
  STATUS_SITE: "На объекте",
  STATUS_CLIENT: "У клиента",
  STATUS_VACATION: "Отпуск / Больничный / Отгул"
};

if (action === 'ARCHIVE_ACCESS') {
    if (hasArchiveAccess(userId)) {
      handleArchiveConfirm(chatId);
    } else {
      sendMessage(chatId, '⛔ У вас нет прав для архивирования.');
    }
    return;
  }

  if (action === 'ARCHIVE_ACCESS') {
    sendMessage(chatId, '❎ Архивирование отменено.');
    return;
  }

if (action === 'RETURN_STEP') {
  props.setProperty(RETURN_STEP_PROPERTY, 'true');
  sendMessage(chatId, '🔁 Введите ID лида, которого нужно вернуть в колл-центр:\nПример: 167047');
  return;
}

if (statusMap[action]) {
  const status = statusMap[action];
  props.setProperty('status_' + userId, status);
  updateManagerStatusInQueue(userId, status);

  if (status === "В офисе") {
    const fullName = ALLOWED_USERS[userId] || 'Неизвестный';
    const now = new Date();
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
    sheet.appendRow([
      Utilities.formatDate(now, 'GMT+3', 'yyyy-MM-dd'),
      Utilities.formatDate(now, 'GMT+3', 'HH:mm:ss'),
      fullName, status, '', '', userId
    ]);
    props.deleteProperty('status_' + userId);
    sendMessage(chatId, '✅ Статус "В офисе" записан.');
    showReplyKeyboard(chatId, userId in ALLOWED_ADMINS);
    return;
  }

  if (["На объекте", "У клиента"].includes(status)) {
    sendMessage(chatId, '📍 Укажите место (город, адрес, объект):');
    props.setProperty('awaiting_location_' + userId, 'true');
    return;
  }

  if (status === "Отпуск / Больничный / Отгул") {
    sendMessage(chatId, '📋 Укажите причину:');
    props.setProperty('awaiting_comment_only_' + userId, 'true');
    return;
  }
}


  if (action.startsWith('REG_PAGE_')) {
  const page = parseInt(action.replace('REG_PAGE_', ''), 10);
  showRegionKeyboard(chatId, page);
  return;
}

  if (action === 'CONFIRM_ARCHIVE') {
    if (userId in ARCHIVE_ACCESS) {
      handleArchiveConfirm(chatId);
    } else {
      sendMessage(chatId, '⛔ У вас нет прав для архивирования.');
    }
    return;
  }

  if (action === 'ARCHIVE_ACCESS') {
    sendMessage(chatId, '❎ Архивирование отменено.');
    return;
  }

  if (action.startsWith('REG_')) {
  const region = REGION_MAP[action] || 'Неизвестный регион';
  props.setProperty('assign_region', region);
  props.setProperty('assign_step', 'city');
  sendMessage(chatId, `✅ Регион выбран: <b>${region}</b>\n🏙 Укажите город / населённый пункт:`);
  return;
}

   answerCallbackQuery(callbackId);
}

  if (data.message && data.message.text && data.message.from) {
    const userId = data.message.from.id;
    const userText = data.message.text.trim();
    const chatId = data.message.chat.id;
    const assignStep = props.getProperty('assign_step');
    Logger.log('📩 userText: ' + userText);


  if (handleReportRequest(chatId, userId, userText)) return;

  if (userText.startsWith('/start')) {
  Logger.log(`🆔 /start от ${userId} (${ALLOWED_USERS[userId] || 'неизвестный'})`);

  if (userId in ALLOWED_USERS) {
    const name = ALLOWED_USERS[userId];
    const welcomeText =
      `👋 Привет, ${name}!\n\n` +
      `Этот бот — ваш рабочий инструмент для управления лидами:\n` +
      `📍 Указывайте утренний статус\n📤 Передавайте заявки менеджерам\n🔁 Возвращайте лиды в колл-центр\n🗂 Делайте архивы и выгрузки (если есть доступ)\n\n` +
      `Нажмите нужную кнопку ниже 👇`;

    sendMessage(chatId, welcomeText);
    showReplyKeyboard(chatId, userId in ALLOWED_USERS);
  } else {
    const contactId = 420111780; // 👈 сюда ваш Telegram ID
    const keyboard = {
      inline_keyboard: [
        [{ text: '📩 Запросить доступ', url: `https://t.me/${contactId}?start=access_request_${userId}` }]
      ]
    };

    sendMessage(chatId,
      `⛔ У вас пока нет доступа к боту.\n` +
      `Нажмите кнопку ниже, чтобы отправить запрос администратору.`,
      keyboard
    );
  }

  return;
}

  if (userText.toLowerCase().startsWith('/return')) {
  if (!MANAGERS_ALLOWED_TO_RETURN.includes(userId)) {
    sendMessage(chatId, '⛔ У вас нет доступа к возврату лидов.');
    return;
  }
  const leadId = parseInt(userText.trim().match(/\d+/)?.[0]);
const success = returnLeadToCallCenter(leadId, userId, 'Возврат через команду /return');


if (success) {
  sendMessage(chatId, `🔁 Лид #${leadId} возвращён в колл-центр.`);
} else {
  sendMessage(chatId, `❌ Не удалось вернуть лид #${leadId}. Проверьте ID и права.`);
}
  return;
}

// Не выполняем возврат, если мы на шаге передачи лида!
const currentStep = props.getProperty('assign_step');
if (/^\d+$/.test(userText.trim()) && MANAGERS_ALLOWED_TO_RETURN.includes(userId) && !currentStep) {
  const leadId = parseInt(userText.trim());
  props.setProperty('awaiting_return_reason_' + userId, leadId);
  sendMessage(chatId, '✏️ Укажите причину возврата лида:');
  return;
}

if (props.getProperty('awaiting_return_reason_' + userId)) {
  const leadId = parseInt(props.getProperty('awaiting_return_reason_' + userId));
  props.deleteProperty('awaiting_return_reason_' + userId);

  const reason = userText;

  const success = returnLeadToCallCenter(leadId, userId, reason);
  if (success) {
    sendMessage(chatId, `🔁 Лид #${leadId} возвращён исходному менеджеру.\n📋 Причина: ${reason}`);
  } else {
    sendMessage(chatId, `❌ Не удалось вернуть лид #${leadId}. Проверьте ID и права.`);
  }

  showReplyKeyboard(chatId, userId in ALLOWED_ADMINS);
  return;
}



    if (props.getProperty(RETURN_STEP_PROPERTY) === 'true') {
      const leadId = parseInt(userText.trim().match(/\d+/)?.[0]);
      props.deleteProperty(RETURN_STEP_PROPERTY);

      if (!MANAGERS_ALLOWED_TO_RETURN.includes(userId)) {
        sendMessage(chatId, '⛔ У вас нет доступа к возврату лидов.');
        return;
      }

      const success = handleReturnLeadById(leadId, userId);
      if (!success) {
        sendMessage(chatId, `❌ Не удалось найти лид #${leadId} в листе "Очередность и передача".`);
      }
      showReplyKeyboard(chatId, userId in ALLOWED_ADMINS);
      return;
    }


    // 👇 Обрабатываем место для "На объекте / У клиента"
if (props.getProperty('awaiting_location_' + userId)) {
  const fullName = ALLOWED_USERS[userId] || 'Неизвестный';
  const status = props.getProperty('status_' + userId);
  const now = new Date();
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
  sheet.appendRow([
    Utilities.formatDate(now, 'GMT+3', 'yyyy-MM-dd'),
    Utilities.formatDate(now, 'GMT+3', 'HH:mm:ss'),
    fullName, status, userText, '', userId
  ]);
  props.deleteProperty('status_' + userId);
  props.deleteProperty('awaiting_location_' + userId);
  sendMessage(chatId, `✅ Статус "${status}" записан.`);
  showReplyKeyboard(chatId, userId in ALLOWED_ADMINS);
  return;
}

// 👇 Обрабатываем причину отпуска
if (props.getProperty('awaiting_comment_only_' + userId)) {
  const fullName = ALLOWED_USERS[userId] || 'Неизвестный';
  const status = props.getProperty('status_' + userId);
  const now = new Date();
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
  sheet.appendRow([
    Utilities.formatDate(now, 'GMT+3', 'yyyy-MM-dd'),
    Utilities.formatDate(now, 'GMT+3', 'HH:mm:ss'),
    fullName, status, '', userText, userId
  ]);
  props.deleteProperty('status_' + userId);
  props.deleteProperty('awaiting_comment_only_' + userId);
  sendMessage(chatId, `✅ Статус "${status}" записан.`);
  showReplyKeyboard(chatId, userId in ALLOWED_ADMINS);
  return;
}


    if (!(userId in ALLOWED_USERS)) {
      sendMessage(chatId, '⛔ Доступ запрещен.');
      return;
    }

    const status = props.getProperty('status_' + userId);
    const location = props.getProperty('location_' + userId);
    const awaitingComment = props.getProperty('awaiting_comment_' + userId);
    

    if (userText.includes('Указать утренний статус')) {
      showStatusButtons(chatId);
      return;
    }

    // 📤 Обработка кнопки "Передать лида менеджеру"
if (userText.includes('Передать лида менеджеру')) {
  if (userId in RESTRICTED_USERS) {
    sendMessage(chatId, '⛔ У вас нет доступа к передаче менеджеров.');
    return;
  }

  props.setProperty('assign_step', 'region');
  showRegionKeyboard(chatId);
  return;
}

// 🔁 Обработка кнопки "Вернуть лид в колл-центр"
if (userText.includes('Вернуть лид в колл-центр')) {
  if (!MANAGERS_ALLOWED_TO_RETURN.includes(userId)) {
    sendMessage(chatId, '⛔ У вас нет доступа к возврату лидов.');
    return;
  }
  sendMessage(chatId, '🔙 Введите ID лида, которого нужно вернуть в колл-центр.\nПример: <code>/return 167037</code>');
  return;
}


    if (userText.includes('Мой текущий статус')) {
      const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
      const values = sheet.getDataRange().getValues();
      const rows = values.filter(row => row[6] === userId);
      const last = rows[rows.length - 1] || [];
      const stat = last[3] || 'не установлен';
      const loc = last[4] || 'не указано';
      const com = last[5] ? `💬 Комментарий: ${last[5]}` : '';
      sendMessage(chatId, `ℹ️ Ваш статус: <b>${stat}</b>\n📍 Местоположение: ${loc}\n${com}`);
      return;
    }

    if (userText.includes('Передать менеджера') || userText.toLowerCase().includes('/assign')) {
  if (userId in RESTRICTED_USERS) {
    sendMessage(chatId, '⛔ У вас нет доступа к передаче менеджеров.');
    return;
  }
  props.setProperty('assign_step', 'region');
  showRegionKeyboard(chatId);
  return;
}

    if (userText === '🗂 Архивировать данные' || userText.toLowerCase().includes('архивировать')) {
    if (hasArchiveAccess(userId)) {
    const keyboard = {
      inline_keyboard: [
        [
          { text: '📦 Завершить день (с очисткой)', callback_data: 'ARCHIVE_CONFIRM_CLEAR' },
          { text: '📋 Только выгрузка (без очистки)', callback_data: 'ARCHIVE_NO_CLEAR' }
        ]
      ]
    };
    sendMessage(chatId,
      '⚠️ <b>Внимание!</b>\nЕсли вы выберете "Завершить день", все рабочие листы будут <b>очищены</b> после выгрузки данных!\n' +
      'Это действие <b>необратимо</b>.\n\n📁 Выберите режим архивации:',
      keyboard
    );
  } else {
    sendMessage(chatId, '⛔ У вас нет прав для архивирования.');
  }
  return;
}

if (assignStep === 'city') {
  props.setProperty('assign_city', userText);
  props.setProperty('assign_step', 'type');

  const typeHelp = `
🏗 Укажите вид объекта (0, 1, 2, 3, 4):

<b>0</b> — клиент не предоставляет информацию, хочет встретиться лично или посмотреть образцы.  
<b>1</b> — дом 1 этаж или сумма заказа до 100 000 ₽  
<b>2</b> — дом 2 этажа или сумма заказа до 200 000 ₽  
<b>3</b> — дом 3 этажа или сумма заказа свыше 200 000 ₽  
<b>4</b> — гостиница, отель, административное, общественное или высотное здание.`;

  sendMessage(chatId, typeHelp);
  return;
}


if (assignStep === 'type') {
  const validTypes = ['0', '1', '2', '3', '4'];
  if (!validTypes.includes(userText)) {
    sendMessage(chatId, '⛔ Пожалуйста, укажите только цифру от 0 до 4.\nПример: 2');
    return;
  }

  const typeDescriptions = {
    '0': 'Вид 0 — клиент не предоставляет информацию, хочет встретиться лично или посмотреть образцы. Нет понимания объёма или размера дома.',
    '1': 'Вид 1 — дом 1 этаж или сумма заказа до 100 000 ₽.',
    '2': 'Вид 2 — дом 2 этажа или сумма заказа до 200 000 ₽.',
    '3': 'Вид 3 — дом 3 этажа или сумма заказа свыше 200 000 ₽.',
    '4': 'Вид 4 — гостиница, отель, административное, общественное или высотное здание.'
  };

  props.setProperty('assign_type', userText);
  props.setProperty('assign_step', 'lead_id');
  sendMessage(chatId, `✅ Вид объекта сохранён: <b>${userText}</b>\n${typeDescriptions[userText]}\n\n🔢 Введите ID лида из Bitrix24 (например, 167037):`);
  return;
}

// 👇 Новый шаг — после ввода ID лида
if (assignStep === 'lead_id') {
  const region = props.getProperty('assign_region');
  const city = props.getProperty('assign_city');
  const type = parseInt(props.getProperty('assign_type'), 10);
  const leadId = parseInt(userText.trim().match(/\d+/)?.[0]);

  const result = computeManager(region, type, getTodayISO());
  let managerName = result.manager;

  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_ASSIGN);
  const fullName = resolveManagerNameFromSheet(userId);
  if (fullName === 'Неизвестный') {
  sendMessage(chatId, '⛔ Ошибка: ваш Telegram ID не найден в листе \"Колл-центр сотрудники\".');
  return;
}

    sheet.appendRow([
    getTodayISO(),
    region,
    city,
    type,
    fullName,
    '',        // ← Оставляем пустым: назначение произойдёт через onEdit
    ''         // ← Комментарий тоже пустой, пусть заполнит computeManager внутри onEdit
  ]);


  // 👇 Добавляем это сразу после appendRow
const lastRow = sheet.getLastRow();
const typeCell = sheet.getRange(lastRow, 4); // колонка D = Вид объекта
onEdit({ range: typeCell }); // ручной запуск логики назначения

 if (leadId) {
  Utilities.sleep(3000);

  // Считываем назначенного менеджера
  const updatedManagerName = sheet.getRange(lastRow, 6).getValue().trim();
  if (!updatedManagerName) {
    Logger.log(`❌ Менеджер не найден после onEdit`);
    sendMessage(chatId, `❌ Ошибка: менеджер не назначен.`);
    return;
  }

  // Назначение в Bitrix
  autoAssignManagerToBitrix(leadId, updatedManagerName);

  // Ждём, пока сделка появится
  Utilities.sleep(5000);

  // Пытаемся получить ссылки и данные
  const assignSheet = SpreadsheetApp.getActive().getSheetByName(SHEET_ASSIGN);
  const assignData = assignSheet.getDataRange().getValues();
  let leadLink = '', dealLink = '', assignerName = '';

  for (let i = assignData.length - 1; i >= 1; i--) {
    if (String(assignData[i][7]).includes(`/${leadId}/`)) {
      leadLink = assignData[i][7];
      dealLink = assignData[i][8];
      assignerName = assignData[i][4];
      const comment = assignData[i][6]; // колонка G — комментарий

if (comment.includes('по текущему местоположению')) {
  Logger.log(`📤 Менеджер был назначен по геолокации — отправляем уведомления`);
  notifyAssignedManagerByGeo(leadId, city, region, updatedManagerName);
} else {
  Logger.log(`ℹ️ Менеджер назначен не по гео — уведомления не требуются`);
}
      break;
    }
  }

  if (!leadLink || !dealLink) {
    logErrorIfNeeded(`❌ Не найдены ссылки на лид/сделку`, `Лид #${leadId}`);
  }

  // ✅ Уведомляем чат
  sendMessage(chatId, `✅ Лид #${leadId} передан менеджеру <b>${updatedManagerName}</b> и назначен в Bitrix.`);

  // Получаем данные лида из Bitrix
  const leadInfo = fetchLeadInfo(leadId);

  if (!leadInfo) {
    logErrorIfNeeded(`⚠️ Лид #${leadId} назначен, но не удалось получить из Bitrix`);
    return;
  }

}

  props.deleteAllProperties();
  showReplyKeyboard(chatId, userId in ALLOWED_ADMINS);
  return;
}
    if (status && !location) {
      props.setProperty('location_' + userId, userText);
      props.setProperty('awaiting_comment_' + userId, 'true');
      sendMessage(chatId, '✏ Хотите добавить комментарий?\nЕсли не нужно — отправьте "-"');
      return;
    }

    if (status && location && awaitingComment === 'true') {
      const fullName = ALLOWED_USERS[userId] || 'Неизвестный';
      const comment = userText === '-' ? '' : userText;
      const now = new Date();
      const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
      sheet.appendRow([
        Utilities.formatDate(now, 'GMT+3', 'yyyy-MM-dd'),
        Utilities.formatDate(now, 'GMT+3', 'HH:mm:ss'),
        fullName, status, location, comment, userId
      ]);

      props.deleteProperty('status_' + userId);
      props.deleteProperty('location_' + userId);
      props.deleteProperty('awaiting_comment_' + userId);

      sendMessage(chatId, '✅ Спасибо! Статус и комментарий записаны.');
      showReplyKeyboard(chatId, userId in ALLOWED_ADMINS);;
      return;
    }

    if (!status && !assignStep) {
      sendMessage(chatId, '⚠️ Ничего не выбрано. Нажмите нужную кнопку или отправьте команду.');
      showReplyKeyboard(chatId, userId in ALLOWED_ADMINS);;
    }
  }
}
function showReplyKeyboard(chatId, isAdmin = false) {
  const keyboard = [
    [{ text: "📍 Указать утренний статус" }],
    [{ text: "ℹ️ Мой текущий статус" }]
  ];

  if (!(chatId in RESTRICTED_USERS)) {
    keyboard.push([{ text: "📤 Передать лида менеджеру" }]);
  }

  if (MANAGERS_ALLOWED_TO_RETURN.includes(chatId)) {
    keyboard.push([{ text: "🔁 Вернуть лид в колл-центр" }]);
  }

  if (isAdmin || chatId in ARCHIVE_ACCESS) {
  keyboard.push([{ text: "🗂 Архивировать данные" }]);
}

if (hasArchiveAccess(chatId)) {
  keyboard.push([{ text: "📤 Выгрузка отчёта" }]);
}

  sendMessage(chatId, '📋 Главное меню:', {
    keyboard: keyboard,
    resize_keyboard: true,
    one_time_keyboard: false
  });
}


function showStatusButtons(chatId) {
  const keyboard = {
    inline_keyboard: [
      [{ text: "🟢 В офисе", callback_data: "STATUS_OFFICE" }],
      [{ text: "🔵 На объекте", callback_data: "STATUS_SITE" }],
      [{ text: "⚪ У клиента", callback_data: "STATUS_CLIENT" }],
      [{ text: "🔴 Отпуск / Больничный / Отгул", callback_data: "STATUS_VACATION" }]
    ]
  };
  sendMessage(chatId, '👋 Укажите ваш статус:', keyboard);
}

function showRegionKeyboard(chatId, page = 0) {
  const keys = Object.keys(REGION_MAP);
  const pageSize = 16; // 16 кнопок = 8 строк по 2 в ряд

  const start = page * pageSize;
  const end = start + pageSize;
  const inlineKeyboard = [];

  for (let i = start; i < Math.min(end, keys.length); i += 2) {
    inlineKeyboard.push([
      { text: REGION_MAP[keys[i]], callback_data: keys[i] },
      keys[i + 1] ? { text: REGION_MAP[keys[i + 1]], callback_data: keys[i + 1] } : null
    ].filter(Boolean));
  }

  // Кнопка "Далее" если есть ещё регионы
  if (end < keys.length) {
    inlineKeyboard.push([{ text: '📄 Далее', callback_data: `REG_PAGE_${page + 1}` }]);
  }

  sendMessage(chatId, '📍 Выберите регион из списка:', { inline_keyboard: inlineKeyboard });
}

function resolveManagerNameFromSheet(telegramId) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Колл-центр сотрудники');
  const data = sheet.getDataRange().getValues();

  const inputId = String(telegramId).trim();
  Logger.log('🔍 Ищем Telegram ID: ' + inputId);

  for (let i = 1; i < data.length; i++) {
    const rowId = String(data[i][1]).trim();
    Logger.log(`➡️ Сравнение: rowId = "${rowId}", inputId = "${inputId}"`);
    if (rowId === inputId) {
      Logger.log('✅ Совпадение найдено: ' + data[i][2]);
      return data[i][2];
    }
  }

  Logger.log('⛔ Нет совпадений для ID: ' + inputId);
  return 'Неизвестный';
}

function sendMessage(chatId, text, keyboard = null) {
  const url = 'https://api.telegram.org/bot' + BOT_TOKEN + '/sendMessage';
  const payload = {
    chat_id: chatId,
    text: text,
    parse_mode: 'HTML'
  };
  if (keyboard) payload.reply_markup = JSON.stringify(keyboard);
  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload)
  };
  UrlFetchApp.fetch(url, options);
}

function answerCallbackQuery(callbackId) {
  const url = 'https://api.telegram.org/bot' + BOT_TOKEN + '/answerCallbackQuery';
  const payload = { callback_query_id: callbackId };
  UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload)
  });
}


function updateManagerStatusInQueue(userId, status) {
  const name = (ALLOWED_USERS[userId] || '').trim();
  if (!name) {
    Logger.log(`⛔ Не найдено имя для userId: ${userId}`);
    return;
  }

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName("Очередь менеджеров");
  const data = sheet.getDataRange().getValues();

  let found = false;
  for (let i = 1; i < data.length; i++) {
    const rowName = (data[i][1] || '').toString().trim(); // колонка B
    if (rowName === name) {
      const newStatus = (status === "В офисе") ? "активен" : "не активен";
      sheet.getRange(i + 1, 5).setValue(newStatus); // колонка E
      Logger.log(`✅ Статус обновлён для ${name}: ${newStatus}`);
      found = true;
      break;
    }
  }

  if (!found) {
    Logger.log(`⚠️ Имя "${name}" не найдено в колонке B листа "Очередь менеджеров"`);
  }

  // Отправляем предупреждение
  if (status !== "В офисе") {
    sendMessage(userId, '⚠️ Пока вы не находитесь в офисе, лиды вам не будут передаваться.\nЧтобы снова получать лиды — установите статус "В офисе".');
  }
}
function logErrorIfNeeded(message, context = '') {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_ERRORS || 'ЛогОшибок');
  const now = new Date();
  sheet.appendRow([
    Utilities.formatDate(now, 'GMT+3', 'yyyy-MM-dd HH:mm:ss'),
    '-', '-',  // userId и name необязательны тут
    `${message}${context ? ' — ' + context : ''}`
  ]);
}

function notifyAssignedManagerByGeo(leadId, city, region, updatedManagerName) {
  const sheet = SpreadsheetApp.getActive().getSheetByName('Очередность и передача');
  const data = sheet.getDataRange().getValues();

  let leadLink = '', dealLink = '', managerName = '', ccName = '', comment = '';

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (String(row[7]).includes(`/${leadId}/`)) {
      managerName = row[5];     // Назначен менеджер
      ccName = row[4];          // Менеджер Колл-центр
      comment = String(row[6]); // Комментарий
      leadLink = row[7];        // Ссылка на лид
      dealLink = row[8];        // Ссылка на сделку
      break;
    }
  }

  if (!comment.toLowerCase().includes('по текущему местоположению')) {
    Logger.log(`ℹ️ Лид #${leadId} назначен не по гео. Уведомления не требуются.`);
    return;
  }

  logErrorIfNeeded(`🚀 Вызван notifyAssignedManagerByGeo`, `Лид #${leadId}`);

  const leadInfo = fetchLeadInfo(leadId);
  if (!leadInfo) {
    logErrorIfNeeded(`⚠️ Лид #${leadId} назначен, но не удалось получить из Bitrix`);
    return;
  }

  // Получение Telegram ID менеджера
  const queueSheet = SpreadsheetApp.getActive().getSheetByName("Очередь менеджеров");
  const ccSheet = SpreadsheetApp.getActive().getSheetByName("Колл-центр сотрудники");
  const queueRows = queueSheet.getDataRange().getValues().slice(1);
  const ccRows = ccSheet.getDataRange().getValues().slice(1);
  const managerRow = queueRows.find(r => isNameMatch(r[1], updatedManagerName));
  const managerTelegramId = managerRow ? managerRow[5] : null;  // F = Telegram ID
  const ccRow = ccRows.find(r => isNameMatch(r[2], ccName));
  const ccTelegramId = ccRow ? ccRow[1] : null; // 1 = Telegram ID


if (managerTelegramId) {
  logErrorIfNeeded(`📨 Уведомление будет отправлено менеджеру (даже если не активен)`, `${updatedManagerName}, ID: ${managerTelegramId}`);
  
  sendMessage(managerTelegramId,
    `📍 <b>Вам передан лид по геолокации!</b>\n\n` +
    `👤 Клиент: <b>${leadInfo.name}</b>\n📞 ${leadInfo.phone}\n` +
    `📍 Город: <b>${city || region}</b>\n📝 Комментарий: ${leadInfo.comment || '—'}\n\n` +
    `🔗 <a href="${leadLink}">Открыть лид</a>\n<a href="${dealLink}">Открыть сделку</a>`);
} else {
  logErrorIfNeeded(`❌ Не найден Telegram ID менеджера (в том числе у неактивных)`, updatedManagerName);
}

  if (ccTelegramId) {
    sendMessage(ccTelegramId,
      `📋 <b>Менеджер назначен по геолокации</b>\n` +
      `👤 Менеджер: <b>${managerName}</b>\n📍 Город: <b>${city || region}</b>\n` +
      `🔗 <a href="${leadLink}">Лид</a> / <a href="${dealLink}">Сделка</a>\n\n` +
      `📲 Пожалуйста, проконтролируйте выполнение.`);
  } else {
    logErrorIfNeeded(`❌ Не найден Telegram ID колл-центра`, ccName);
  }
}

// Добавляет функцию мягкого сравнения isNameMatch имен
function isNameMatch(nameA, nameB) {
  const normalize = (s) => String(s || '')
    .toLowerCase()
    .replace(/[^а-яa-zё\s]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  const partsA = normalize(nameA).split(' ');
  const partsB = normalize(nameB).split(' ');

  if (partsA.length === 0 || partsB.length === 0) return false;

  // 🔹 Фамилия — первое слово в нормализованной строке
  const surnameA = partsA[0];
  const surnameB = partsB[0];

  // 🔸 Если фамилии не совпадают, сразу false
  if (surnameA !== surnameB) return false;

  // ✅ Если фамилии совпадают — проверяем имя/инициалы (гибко)
  const namePartA = partsA.slice(1).join(' ');
  const namePartB = partsB.slice(1).join(' ');

  // Если нет имени — фамилия уже совпала, считаем подходящим
  if (!namePartA || !namePartB) return true;

  // Мягкое сравнение имени
  return namePartA.startsWith(namePartB) || namePartB.startsWith(namePartA);
}



