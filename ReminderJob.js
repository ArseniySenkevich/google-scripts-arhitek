/**********************************************************************
* Напоминание (09:10) — проверка, кто не ввёл местоположение         *
**********************************************************************/
function sendReminderToNonRespondents() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const users = Object.keys(ALLOWED_USERS);
  users.forEach(userId => {
    const statusKey = 'status_' + userId;
    const status = scriptProperties.getProperty(statusKey);

    if (status !== null) {
      // Статус выбран, но локация не введена
      sendMessage(userId, '⏰ Напоминаем: вы указали статус, но не ввели местоположение. Пожалуйста, завершите.');
    } else {
      // Вообще ничего не ответил
      sendMessage(userId, '❗ Вы ещё не отметили утренний статус. Пожалуйста, выберите сейчас:');
      showStatusButtons(userId);
    }
  });
}
