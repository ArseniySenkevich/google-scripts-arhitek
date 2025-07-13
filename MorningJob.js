/**********************************************************************
* Утренняя рассылка (08:55) — отправка кнопок всем сотрудникам       *
**********************************************************************/
function sendMorningStatusRequest() {
  const users = Object.keys(ALLOWED_USERS);
  users.forEach(userId => {
    showStatusButtons(userId);
  });
}
