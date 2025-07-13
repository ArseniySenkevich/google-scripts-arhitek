const WEBHOOK_URL = 'https://arkhitek.bitrix24.ru/rest/29613/d4q1d0bb0oitzo21/'; // ← замени на свой

const TARGET_STATUS_ID = '8'; // стадия "Готов к конвертации"

function getBitrixIdByManagerName(name) {
  const sheet = SpreadsheetApp.getActive().getSheetByName('Очередь менеджеров');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][1] && data[i][1].trim() === name.trim()) {
      return data[i][0];
    }
  }
  return null;
}

function logError(message) {
  const sheet = SpreadsheetApp.getActive().getSheetByName('ЛогОшибок');
  sheet.appendRow([new Date(), message]);
}

function assignResponsibleInBitrix(leadId, managerBitrixId) {
  const payload = {
    id: leadId,
    fields: { ASSIGNED_BY_ID: managerBitrixId }
  };
  const res = callBitrixMethod('crm.lead.update', payload);
  if (res.error) {
    logError('❌ Ошибка назначения: ' + res.error_description);
    return false;
  }
  return true;
}

function moveLeadToConversionStage(leadId) {
  const payload = {
    id: leadId,
    fields: {
      STATUS_ID: TARGET_STATUS_ID
    }
  };

  const res = callBitrixMethod('crm.lead.update', payload);
  if (res.error) {
    logError('❌ Ошибка перевода лида на стадию 8: ' + res.error_description);
    return false;
  }

  Logger.log(`✅ Лид ${leadId} переведён в стадию 8`);
  return true;
}

function autoAssignManagerToBitrix(leadId, managerName) {
  const managerId = getBitrixIdByManagerName(managerName);
  if (!managerId) {
    logError('❌ Не найден Bitrix ID для менеджера: ' + managerName);
    return;
  }

  logError(`✅ Назначаем ${managerName} (${managerId}) на лид ${leadId}`);

  if (!assignResponsibleInBitrix(leadId, managerId)) return;
  Utilities.sleep(2000);

  if (!moveLeadToConversionStage(leadId)) {
    logError('❌ Не удалось перевести лид на стадию 8. ID лида: ' + leadId);
    return;
  }

  logError('⏳ Ждём 2 секунды, чтобы сделка успела создаться через робота...');
  Utilities.sleep(2000);

  const dealId = findDealByLeadContact(leadId);

  if (dealId) {
    logError(`✅ Сделка найдена: ${dealId}`);
    writeLeadAndDealLinksToSheet(leadId, dealId);
  } else {
    logError(`❌ Сделка не найдена по лиду ${leadId}`);
  }
}

function findDealByLeadContact(leadId) {
  const leadResp = callBitrixMethod('crm.lead.get', { id: leadId });
  if (!leadResp.result || !leadResp.result.CONTACT_ID) {
    logError(`❌ Нет CONTACT_ID у лида ${leadId}: ${JSON.stringify(leadResp)}`);
    return null;
  }

  const contactId = leadResp.result.CONTACT_ID;
  logError(`🔍 Ищем сделки по контакту ${contactId}`);

  const dealsResp = callBitrixMethod('crm.deal.list', {
    filter: { CONTACT_ID: contactId },
    select: ['ID', 'DATE_CREATE'],
    order: { DATE_CREATE: 'DESC' }
  });

  const deals = dealsResp.result || [];
  logError(`📦 Найдено сделок: ${deals.length}`);
  return deals.length > 0 ? deals[0].ID : null;
}


function writeLeadAndDealLinksToSheet(leadId, dealId) {
  const sheet = SpreadsheetApp.getActive().getSheetByName('Очередность и передача');
  const data = sheet.getDataRange().getValues();

  const leadUrl = `https://arkhitek.bitrix24.ru/crm/lead/details/${leadId}/`;
  const dealUrl = `https://arkhitek.bitrix24.ru/crm/deal/details/${dealId}/`;

  for (let i = 1; i < data.length; i++) {
    const row = data[i];

    // Если колонка H (index 7) пустая и колонка I (index 8) тоже пустая — считаем строку свободной
    if (!row[7] && !row[8]) {
      sheet.getRange(i + 1, 8).setValue(leadUrl); // H (8) колонка — ссылка на лид
      sheet.getRange(i + 1, 9).setValue(dealUrl); // I (9) колонка — ссылка на сделку
      Logger.log(`✅ Ссылки записаны в строку ${i + 1}`);
      return;
    }
  }

  logError(`❌ Не удалось найти свободную строку для лида ${leadId}`);
}


function callBitrixMethod(method, payload) {
  const url = `${WEBHOOK_URL}${method}.json`;

  try {
    const response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload)
    });
    return JSON.parse(response.getContentText());
  } catch (error) {
    logError('❌ Ошибка вызова Bitrix API: ' + error.toString());
    return { error: true, error_description: error.toString() };
  }
}
function findOriginalManagerByLeadId(leadId) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheetsToSearch = ["Очередность и передача", "Архив_Очередность и передача"];

  for (let sheetName of sheetsToSearch) {
    const sheet = ss.getSheetByName(sheetName);
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const link = data[i][7] || ''; // колонка H — ссылка на лид
      if (link.includes(`/${leadId}/`)) {
        const managerName = data[i][4]; // колонка E — Менеджер колл-центра
        if (managerName) return managerName.trim();
      }
    }
  }

  return null;
}

