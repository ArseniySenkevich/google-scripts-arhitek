function notifyAssignedManager(managerName, leadData) {
  const TELEGRAM_BOT_TOKEN = BOT_TOKEN;; // ← Укажи токен своего Telegram-бота
  const SHEET_NAME = 'Очередь менеджеров';         // ← Название листа с менеджерами
  const MANAGER_COLUMN = 2;                        // Колонка  (Менеджер)
  const TELEGRAM_ID_COLUMN = 5;                    // Колонка  (Telegram ID)

  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();

  let telegramId = null;

  for (let i = 1; i < data.length; i++) {
    if (data[i][MANAGER_COLUMN] === managerName) {
      telegramId = data[i][TELEGRAM_ID_COLUMN];
      break;
    }
  }

  if (!telegramId) {
    Logger.log("❌ Telegram ID не найден для менеджера: " + managerName);
    return;
  }

  const message = `
📥 <b>Вам назначен новый лид!</b>

👤 <b>Клиент:</b> ${leadData.name || '-'}
📞 <b>Телефон:</b> ${leadData.phone || '-'}
📍 <b>Регион:</b> ${leadData.region || '-'}
🏠 <b>Тип объекта:</b> ${leadData.type || '-'}
📝 <b>Комментарий:</b> ${leadData.comment || '-'}

🔗 <a href="https://arkhitek.bitrix24.ru/crm/lead/details/${leadData.bitrixId}/">Открыть в Bitrix24</a>
  `.trim();

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const payload = {
    chat_id: telegramId,
    text: message,
    parse_mode: 'HTML'
  };

  UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload)
  });
}
function fetchLeadInfo(leadId) {
  const BASE_URL = 'https://arkhitek.bitrix24.ru/rest/29613/d4q1d0bb0oitzo21/crm.lead.get.json';
  const url = `${BASE_URL}?id=${leadId}`;

  Logger.log(`🔗 Bitrix API call: ${url}`);

  try {
    const response = UrlFetchApp.fetch(url);
    const text = response.getContentText();
    Logger.log(`📨 Ответ Bitrix: ${text}`);

    const data = JSON.parse(text);
    if (!data || !data.result) return null;

    const lead = data.result;

    const name = [lead.LAST_NAME, lead.NAME, lead.SECOND_NAME].filter(Boolean).join(' ').trim() || lead.TITLE || '';
    const phone = (lead.PHONE && lead.PHONE[0]?.VALUE) || '—';

    // Удаляем BB-коды типа [p]...[/p]
    const commentRaw = lead.COMMENTS || '';
    const comment = commentRaw.replace(/\[\/?p\]/g, '').trim();

    return { name, phone, comment };
  } catch (e) {
    Logger.log(`❌ Ошибка при получении лида #${leadId} из Bitrix: ${e.message}`);
    return null;
  }
}
function notifyAssignedManager(managerName, leadData) {
  const SHEET_NAME = 'Очередь менеджеров';
  const MANAGER_COLUMN = 1; // колонка B
  const TELEGRAM_ID_COLUMN = 4; // колонка E

  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();

  let telegramId = null;

  for (let i = 1; i < data.length; i++) {
    const name = (data[i][MANAGER_COLUMN] || '').toString().trim();
    if (name === managerName) {
      telegramId = data[i][TELEGRAM_ID_COLUMN];
      Logger.log(`📬 Найден Telegram ID: ${telegramId} для ${managerName}`);
      break;
    }
  }

  if (!telegramId) {
    Logger.log(`❌ Telegram ID не найден для менеджера: ${managerName}`);
    return;
  }

  const message = `
📥 <b>Вам назначен новый лид!</b>

👤 <b>Клиент:</b> ${leadData.name || '—'}
📞 <b>Телефон:</b> ${leadData.phone || '—'}
📍 <b>Регион:</b> ${leadData.region || '—'}
🏠 <b>Тип объекта:</b> ${leadData.type || '—'}
📝 <b>Комментарий:</b> ${leadData.comment || '—'}

🔗 <a href="https://arkhitek.bitrix24.ru/crm/lead/details/${leadData.bitrixId}/">Открыть в Bitrix24</a>
`.trim();

  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const payload = {
    chat_id: telegramId,
    text: message,
    parse_mode: 'HTML'
  };

  try {
    const res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload)
    });

    Logger.log(`✅ Уведомление отправлено менеджеру ${managerName}`);
  } catch (e) {
    Logger.log(`❌ Ошибка при отправке уведомления менеджеру ${managerName}: ${e.message}`);
  }
}


