// Run with playwright-cli run-code --filename tests/ui-i18n.browser.cjs.
// All API traffic is mocked; no real accounts or content are modified.
async (page) => {
  await page.unroute('**/api/**');
  const user = { id: 'i18n-test', fullName: '測試同學', email: 'i18n@example.test', role: 'student', createdAt: '2026-01-01', quota: { monthlyLimit: 100, used: 2, remaining: 98 } };
  const bot = { id: 'i18n-bot', name: '天空藍', subject: '數學', interactions: 3, hasPendingQuiz: true, knowledgeBase: '用戶教材保持中文', openingMessage: '用戶開場白保持中文', avatarUrl: '/avatars/avatar-1.svg', background: '/avatars/avatar-2.svg', voiceId: 'test-voice', videoIdle: '/test-idle.mp4', videoThinking: '/test-thinking.mp4', videoTalking: '/test-talking.mp4', securityPrompt: '用戶安全設定' };
  await page.route('**/api/**', async route => {
    const url = { pathname: route.request().url().replace(/^https?:\/\/[^/]+/, '').split('?')[0] };
    let body = {};
    if (url.pathname === '/api/health') body = { ok: true };
    else if (url.pathname === '/api/auth/me') body = { user };
    else if (url.pathname.includes('features')) body = { features: [{ key: 'bot_publish', label: '創建角色', limit: 10, used: 1, remaining: 9, locked: false, countUnit: '次' }, { key: 'chat_messages', label: '對話次數', limit: 100, used: 2, remaining: 98, locked: false, countUnit: '次' }] };
    else if (url.pathname === '/api/bots/shared/with-me' || url.pathname === '/api/bots') body = [bot];
    else if (url.pathname === '/api/student/tasks') body = { pending: [{ taskKey: 'test-task', type: 'quiz', teacherName: '測試老師', botId: bot.id, botName: bot.name, subject: bot.subject, quizTitle: '測試題目原名', sharedAt: new Date().toISOString() }], recentShares: [] };
    else if (url.pathname === '/api/bots/i18n-bot') body = bot;
    else if (url.pathname.endsWith('/topics')) body = { topics: [] };
    else if (url.pathname.includes('voices')) body = { voices: [{ voice_id: 'test-voice', voice_name: '專業男主持' }, { voice_id: 'test-voice-2', voice_name: 'warm female' }] };
    else if (url.pathname.includes('quizzes') || url.pathname.includes('drafts') || url.pathname.includes('banks')) body = [];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto('http://localhost:3000/auth');
  await page.evaluate(user => {
    localStorage.setItem('chopreality_ui_lang', 'en');
    localStorage.setItem('chopreality_auth_token', 'mock-i18n-token');
    localStorage.setItem('chopreality_auth_user', JSON.stringify(user));
  }, user);
  const results = [];
  async function audit(label) {
    await page.waitForTimeout(250);
    const text = await page.locator('body').innerText() + '\n' + await page.locator('[placeholder], [title], [aria-label], img[alt]').evaluateAll(elements => elements.filter(el => el.getClientRects().length).flatMap(el => ['placeholder','title','aria-label','alt'].map(attr => el.getAttribute(attr) || '')).join('\n'));
    const unexpected = text.split('\n').filter(line => /[\u3400-\u9fff]/.test(line.replaceAll('測試同學','').replaceAll('測試老師','').replaceAll('天空藍','').replaceAll('測試題目原名','').replaceAll('用戶教材保持中文','').replaceAll('用戶開場白保持中文','')));
    results.push({ page: label, unexpected });
    console.log(JSON.stringify(results[results.length - 1]));
  }
  for (const path of ['/', '/tasks', '/achievements', '/account', '/help', '/bot/i18n-bot']) {
    await page.goto('http://localhost:3000' + path);
    await page.waitForLoadState('networkidle');
    await audit('student ' + path);
    if (path === '/') {
      if (!(await page.getByRole('heading', { name: bot.name, exact: true }).count())) throw new Error('Bot name was translated');
      await page.getByRole('button', { name: 'ZH', exact: true }).click();
      await page.getByText('選擇一位學習夥伴', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'EN', exact: true }).click();
      await page.getByText('Choose a study buddy', { exact: true }).waitFor();
      await audit('student live switch');
    }
  }
  user.role = 'teacher';
  await page.evaluate(user => localStorage.setItem('chopreality_auth_user', JSON.stringify(user)), user);
  for (const path of ['/', '/settings', '/pro', '/help', '/school-avatar-request']) {
    await page.goto('http://localhost:3000' + path);
    await page.waitForLoadState('networkidle');
    await audit('teacher ' + path);
    if (path === '/') {
      await page.getByRole('link', { name: 'AI Workshop', exact: true }).click();
      await audit('teacher workshop');
      await page.getByRole('button', { name: /Create New Bot/i }).click();
      await audit('teacher creation');
      await page.getByRole('button', { name: 'Back to my bot library', exact: true }).click();
      await page.getByRole('button', { name: 'Edit →', exact: true }).click();
      for (const step of ['Appearance & Personality', 'Voice & Animation', 'Knowledge Base', 'Safety & Permissions']) {
        await page.getByRole('button', { name: new RegExp(step) }).click();
        await audit('teacher editor ' + step);
      }
    }
  }
  await page.goto('http://localhost:3000/');
  await page.getByRole('link', { name: 'Smart Assessment', exact: true }).click();
  await audit('teacher assessment');
  await page.getByRole('button', { name: 'Create Quiz', exact: true }).click();
  await audit('teacher assessment wizard');
  await page.goto('http://localhost:3000/');
  await page.getByRole('link', { name: 'Students and Sharing', exact: true }).click();
  await audit('teacher sharing');
  await page.evaluate(() => {
    localStorage.removeItem('chopreality_auth_token');
    localStorage.removeItem('chopreality_auth_user');
  });
  await page.goto('http://localhost:3000/auth');
  await audit('sign in');
  await page.screenshot({ path: 'output/playwright/i18n-auth.png', fullPage: true });
  console.log(JSON.stringify(results, null, 2));
  return { passed: results.every(result => result.unexpected.length === 0), results };
}
