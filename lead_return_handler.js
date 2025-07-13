function returnLeadToCallCenter(leadId, returnerTelegramId, reason) {
  const sheetManagers = SpreadsheetApp.getActive().getSheetByName('Очередь менеджеров');
  let sheetReturns = SpreadsheetApp.getActive().getSheetByName('Возвраты лидов');
  if (!sheetReturns) {
    sheetReturns = SpreadsheetApp.getActive().insertSheet('Возвраты лидов');
    sheetReturns.appendRow(['ID лида', 'Ссылка', 'Ответственный', 'Кто вернул', 'Кому передано', 'Причина', 'Дата']);
  }

  const sheetLog = SpreadsheetApp.getActive().getSheetByName('ЛогОшибок');
  const sheetAssign = SpreadsheetApp.getActive().getSheetByName('Очередность и передача');
  const sheetArchive = SpreadsheetApp.getActive().getSheetByName('Архив_Очередность и передача');
  const sheetStaff = SpreadsheetApp.getActive().getSheetByName('Колл-центр сотрудники');

  function debugLog(msg) {
    sheetLog.appendRow([new Date(), `🟡 DEBUG: ${msg}`]);
  }

  try {
    debugLog(`▶ Старт возврата лида #${leadId}`);

    // 🔹 Кто вернул
    const managers = sheetManagers.getDataRange().getValues();
    let returnerName = null;
    let returnerBitrixId = null;

    for (let i = 1; i < managers.length; i++) {
      if (managers[i][5] == returnerTelegramId) {
        returnerName = managers[i][1];
        returnerBitrixId = managers[i][0];
        break;
      }
    }

    if (!returnerBitrixId) {
      debugLog(`⛔ Не найден Telegram ID в Очередь менеджеров`);
      return false;
    }

    debugLog(`Менеджер-возвратчик: ${returnerName} (Bitrix ID: ${returnerBitrixId})`);

    // 🔹 Получаем лид
    const leadResp = callBitrixMethod('crm.lead.get', { id: leadId });
    debugLog(`📡 Ответ Bitrix (crm.lead.get): ${JSON.stringify(leadResp)}`);

    if (!leadResp || !leadResp.result) {
      debugLog(`⛔ Лид не найден`);
      return false;
    }

    const lead = leadResp.result;
    const assignedId = lead.ASSIGNED_BY_ID;
    debugLog(`👤 Текущий ответственный в Bitrix: ${assignedId}`);

    if (String(assignedId) !== String(returnerBitrixId)) {
      debugLog(`⛔ Вы не являетесь ответственным по лиду`);
      return false;
    }

    // 🔹 Удаляем последнюю сделку
    const contactId = lead.CONTACT_ID;
    if (contactId) {
      const dealsResp = callBitrixMethod('crm.deal.list', {
        filter: { CONTACT_ID: contactId },
        select: ['ID'],
        order: { DATE_CREATE: 'DESC' }
      });
      debugLog(`📡 Ответ Bitrix (crm.deal.list): ${JSON.stringify(dealsResp)}`);

      const dealId = dealsResp?.result?.[0]?.ID;
      if (dealId) {
        const delResp = callBitrixMethod('crm.deal.delete', { id: dealId });
        debugLog(`🗑 Удалена сделка #${dealId}, ответ: ${JSON.stringify(delResp)}`);
      } else {
        debugLog(`ℹ️ Сделка не найдена`);
      }
    }

    // 🔹 Ищем исходного менеджера
    const link = `/${leadId}/`;
    const rowsAssign = sheetAssign.getDataRange().getValues();
    const rowsArchive = sheetArchive ? sheetArchive.getDataRange().getValues() : [];
    const allRows = rowsAssign.concat(rowsArchive);

    let ccManagerName = null;
    for (let i = 1; i < allRows.length; i++) {
      if ((allRows[i][7] || '').includes(link)) {
        ccManagerName = allRows[i][4];
        break;
      }
    }

    if (!ccManagerName) {
      debugLog(`⛔ Исходный менеджер не найден`);
      return false;
    }

    debugLog(`🔎 Исходный менеджер (сокр.): ${ccManagerName}`);

    // 🔹 Ищем Bitrix ID и Telegram ID исходного менеджера
const staff = sheetStaff.getDataRange().getValues();
let ccManagerBitrixId = null;
let ccManagerTelegramId = null;

for (let i = 1; i < staff.length; i++) {
  const fullName = (staff[i][2] || '').trim();
  if (fullName.includes(ccManagerName.trim())) {
    ccManagerBitrixId = staff[i][0]; // A-колонка: Bitrix ID
    ccManagerTelegramId = staff[i][1]; // B-колонка: Telegram ID
    break;
  }
}
if (!ccManagerTelegramId) {
  debugLog(`⛔ Не найден Telegram ID для ${ccManagerName}`);
} else {
  debugLog(`📲 Telegram ID исходного менеджера: ${ccManagerTelegramId}`);
}

    // 🔹 Обновляем лид
    const updateResp = callBitrixMethod('crm.lead.update', {
      id: leadId,
      fields: {
        STATUS_ID: 'NEW',
        ASSIGNED_BY_ID: ccManagerBitrixId
      }
    });
    debugLog(`📡 Ответ Bitrix (crm.lead.update): ${JSON.stringify(updateResp)}`);

    const taskResp = callBitrixMethod('tasks.task.add', {
  fields: {
    TITLE: `Повторно обработать лид #${leadId}`,
    DESCRIPTION: `Лид был возвращён менеджером ${returnerName}. Причина: ${reason}`,
    RESPONSIBLE_ID: ccManagerBitrixId,
    UF_CRM_TASK: [`L_${leadId}`]
  }
});
debugLog(`📝 Задача создана: ${JSON.stringify(taskResp)}`);


    // 🔹 Добавляем комментарий
    const commentResp = callBitrixMethod('crm.timeline.comment.add', {
      fields: {
        ENTITY_ID: leadId,
        ENTITY_TYPE: 'LEAD',
        COMMENT: `Лид возвращён менеджером ${returnerName}. Причина: ${reason}`
      }
    });
    debugLog(`💬 Комментарий добавлен: ${JSON.stringify(commentResp)}`);

    // 🔹 Telegram уведомление
    if (ccManagerTelegramId) {
      const leadLink = `https://arkhitek.bitrix24.ru/crm/lead/details/${leadId}/`;
      const msg = `📩 Вам возвращён лид #${leadId}\n👤 Вернул: ${returnerName}\n📄 Причина: ${reason}\n🔗 ${leadLink}`;
      sendMessage(ccManagerTelegramId, msg);
    } else {
      debugLog(`⚠️ Не найден Telegram ID у ${ccManagerName}`);
    }

    // 🔹 Лог возврата
    sheetReturns.appendRow([
      leadId,
      `https://arkhitek.bitrix24.ru/crm/lead/details/${leadId}/`,
      ccManagerName,
      returnerName,
      ccManagerName,
      reason,
      new Date()
    ]);

    debugLog(`✅ Лид успешно возвращён. Лог добавлен.`);


  } catch (e) {
    sheetLog.appendRow([new Date(), `❌ Ошибка возврата лида ${leadId}: ${e.toString()}`]);
    return false;
  }

  return true;
}
