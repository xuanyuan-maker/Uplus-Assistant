(async () => {
  const result = document.querySelector('#result');
  let checks = 0;
  function check(condition, message) {
    if (!condition) throw new Error(message);
    checks++;
  }
  function question(number, type, form, text = '测试题干') {
    document.querySelector('#fixture').innerHTML = `
      <div class="el-scrollbar__view"><span class="scale-x-80">${number}</span></div>
      <div class="text-size-20px font-bold color-text-primary">${number}</div>
      <div class="bg-athena-primary font-bold">${type}</div>
      <div class="ck-content qst-html">${text}</div>${form}`;
  }
  function choices(inputType, letters) {
    return letters.map(letter => `<label class="option-select"><input type="${inputType}"
      class="el-${inputType}__original" name="answer" value="${letter}">
      <span class="ck-content qst-html">选项${letter}</span></label>`).join('');
  }
  function shortQuestion(number, text = '测试简答题干') {
    question(number, '简答题', `
      <div class="q-ckeditor q-ckeditor--document">
        <div class="ck ck-content ck-editor__editable ck-editor__editable_inline" contenteditable="true" role="textbox"></div>
      </div><textarea placeholder="学业助手">不要修改聊天框</textarea>`, text);
    const editable = document.querySelector('#fixture .ck-editor__editable');
    let savedData = '<p>已有答案</p>';
    editable.innerHTML = savedData;
    editable.ckeditorInstance = {
      isReadOnly: false,
      setData(html) { savedData = html; editable.innerHTML = html; },
      getData() { return savedData; },
    };
    return editable;
  }
  function submissionControls(message = '作业已经全部做完，是否提交?', onOpen = () => {}) {
    const state = { opened: 0, confirmed: 0, cancelled: 0 };
    const button = document.createElement('button');
    button.className = 'el-button';
    button.textContent = '提交作业';
    state.button = button;
    button.addEventListener('click', () => {
      state.opened++;
      onOpen();
      // 平台先保存答案并刷新题目状态，再展示确认弹窗。
      setTimeout(() => {
        const box = document.createElement('div');
        box.className = 'el-message-box';
        const content = document.createElement('div');
        content.className = 'el-message-box__message';
        content.textContent = message;
        box.appendChild(content);
        for (const text of ['取消', '确定']) {
          const action = document.createElement('button');
          action.textContent = text;
          action.addEventListener('click', () => {
            if (text === '确定') {
              state.confirmed++;
              button.textContent = '撤回作业';
            } else state.cancelled++;
            box.remove();
          });
          box.appendChild(action);
        }
        document.querySelector('#fixture').appendChild(box);
      }, 200);
    });
    document.querySelector('#fixture').appendChild(button);
    return state;
  }
  try {
    // Initialization reads userscript storage asynchronously.
    for (let i = 0; i < 100 && !window.__uplus; i++) await new Promise(resolve => setTimeout(resolve, 10));
    const app = window.__uplus;
    check(app, 'userscript did not initialize');
    const panel = [...document.body.children].find(el => el.firstElementChild?.textContent === 'U+助手 控制台');
    const tabs = [...panel.children[1].children];
    check(tabs.map(tab => tab.textContent).join(',') === '题目,日志,设置', 'unexpected tabs');
    check(!Object.keys(app).some(key => /bank/i.test(key)), 'backend debug API remains');
    check(requests.length === 0, 'startup sent a request');
    check(storageReads.every(key => ['deepseek_api_key', 'jev_api_key', 'jev_openrouter_api_key', 'jev_provider', 'use_jev', 'auto_answer', 'auto_submit'].includes(key)), 'read a removed setting');
    tabs[2].click();
    check(panel.children[2].children[2].style.display !== 'none', 'settings tab did not open');
    const keyInput = panel.querySelector('input[type="password"]');
    check(keyInput.value === 'test-key', 'stored API key not restored');
    keyInput.value = 'changed-key';
    keyInput.dispatchEvent(new Event('input'));
    check(storage.get('deepseek_api_key') === 'changed-key', 'API key not saved');
    const jevKeyInput = panel.querySelector('input[aria-label="JeV API Key"]');
    const openRouterKeyInput = panel.querySelector('input[aria-label="JeV OpenRouter API Key"]');
    const providerInput = panel.querySelector('select[aria-label="JeV API 渠道"]');
    const jevInput = panel.querySelector('input[aria-label="选择题使用 JeV"]');
    check(jevKeyInput.value === 'stored-jev-key', 'JeV API key not restored');
    check(openRouterKeyInput.value === 'stored-openrouter-key', 'OpenRouter API key not restored');
    check(providerInput.value === (location.hash === '#openrouter-on' ? 'openrouter' : 'typesafe'), 'JeV channel did not default to TypeSafe or restore its setting');
    check(openRouterKeyInput.style.display === (location.hash === '#openrouter-on' ? '' : 'none'), 'wrong channel key field is shown');
    providerInput.value = 'typesafe';
    providerInput.dispatchEvent(new Event('change'));
    check(storage.get('jev_provider') === 'typesafe' && jevKeyInput.style.display !== 'none', 'TypeSafe selection was not saved or displayed');
    check(jevInput && jevInput.checked === ['#use-jev-on', '#openrouter-on'].includes(location.hash), 'JeV switch did not default off or restore its setting');
    jevKeyInput.value = 'changed-jev-key';
    jevKeyInput.dispatchEvent(new Event('input'));
    check(storage.get('jev_api_key') === 'changed-jev-key', 'JeV API key not saved');
    jevInput.checked = false;
    jevInput.dispatchEvent(new Event('change'));
    check(storage.get('use_jev') === false, 'JeV switch off was not saved');
    const autoInput = panel.querySelector('input[type="checkbox"]');
    autoInput.checked = true;
    autoInput.dispatchEvent(new Event('change'));
    check(storage.get('auto_answer') === true, 'auto-answer setting not saved');
    const submitInput = panel.querySelector('input[aria-label="自动提交"]');
    check(submitInput && submitInput.checked === (location.hash === '#auto-submit-on'),
      'auto-submit did not default to off or restore the saved setting');
    submitInput.checked = true;
    submitInput.dispatchEvent(new Event('change'));
    check(storage.get('auto_submit') === true && submitInput.nextElementSibling.firstElementChild.style.left === '20px',
      'auto-submit enable was not saved or displayed');
    submitInput.checked = false;
    submitInput.dispatchEvent(new Event('change'));
    check(storage.get('auto_submit') === false && submitInput.nextElementSibling.firstElementChild.style.left === '2px',
      'auto-submit disable was not saved or displayed');

    question(1, '单选题', choices('radio', ['A', 'B']));
    const disabledSubmit = submissionControls();
    await app.detectAll();
    check(document.querySelector('input[value="A"]').checked && app.isAnswered(1), 'single choice failed');
    check(requests.length === 1, 'single choice did not use exactly one DeepSeek request');
    check(requests[0].headers.Authorization === 'Bearer changed-key', 'request used a stale API key');
    check(disabledSubmit.opened === 0, 'disabled auto-submit clicked submit');

    apiAnswers = ['A', 'C'];
    question(2, '多选题', choices('checkbox', ['A', 'B', 'C']));
    await app.detectAll();
    check(document.querySelector('input[value="A"]').checked && document.querySelector('input[value="C"]').checked,
      'multiple choice failed');
    check(!document.querySelector('input[value="B"]').checked && app.isAnswered(2), 'wrong option selected');

    apiAnswers = ['true'];
    question(3, '判断题', choices('radio', ['true', 'false']));
    await app.detectAll();
    check(document.querySelector('input[value="true"]').checked && app.isAnswered(3), 'true/false failed');

    apiAnswers = ['第一空', '第二空'];
    question(4, '填空题', '<textarea class="el-textarea__inner"></textarea><textarea class="el-textarea__inner"></textarea>');
    let inputs = 0;
    let changes = 0;
    document.querySelector('#fixture').addEventListener('input', () => inputs++, { once: false });
    document.querySelector('#fixture').addEventListener('change', () => changes++, { once: false });
    await app.detectAll();
    check([...document.querySelectorAll('textarea')].map(el => el.value).join(',') === '第一空,第二空', 'fill blanks failed');
    check(inputs === 2 && changes === 2 && app.isAnswered(4), 'form events or answered status missing');

    apiAnswers = ['B'];
    question(5, '单选题', '<div class="flex-row align-center">B、<span class="ck-content qck-content">新版选项</span></div>');
    let clicked = false;
    document.querySelector('.flex-row').addEventListener('click', () => { clicked = true; });
    await app.detectAll();
    check(clicked && app.isAnswered(5), 'new option layout failed');

    const shortText = '第一点：<script>这只是答案文本</script> & 内容\n第二点：保留分段';
    apiAnswers = [shortText];
    const shortEditor = shortQuestion(13);
    document.querySelector('#fixture .qst-html').className = 'ck-content qck-content';
    await app.detectAll();
    check(app.isAnswered(13) && shortEditor.textContent.includes('第一点：'), 'manual short answer failed');
    check(shortEditor.ckeditorInstance.getData().includes('<br>'), 'short answer paragraphs missing');
    check(!shortEditor.querySelector('script') && shortEditor.textContent.includes('<script>'), 'short answer interpreted as HTML');
    check(document.querySelector('#fixture textarea').value === '不要修改聊天框', 'short answer overwrote the chat box');
    check(JSON.parse(requests.at(-1).data).messages[1].content.includes('测试简答题干'), 'short answer used editor contents as question');

    for (const invalid of [[], [''], [42], ['第一部分', '第二部分']]) {
      apiAnswers = invalid;
      const editable = shortQuestion(14);
      await app.detectAll();
      check(!app.isAnswered(14) && editable.ckeditorInstance.getData() === '<p>已有答案</p>',
        'invalid short answer overwrote existing content');
    }
    apiAnswers = ['测试答案'];
    const readonlyEditor = shortQuestion(15);
    readonlyEditor.ckeditorInstance.isReadOnly = true;
    await app.detectAll();
    check(!app.isAnswered(15) && readonlyEditor.textContent === '已有答案', 'read-only editor was overwritten');
    const unreadyEditor = shortQuestion(16);
    delete unreadyEditor.ckeditorInstance;
    await app.detectAll();
    check(!app.isAnswered(16) && unreadyEditor.textContent === '已有答案', 'unready editor was marked answered');

    apiAnswers = ['A'];
    apiStatus = 401;
    question(6, '单选题', choices('radio', ['A', 'B']));
    await app.detectAll();
    check(!document.querySelector('#fixture input:checked') && !app.isAnswered(6), 'API failure marked question answered');
    apiStatus = 200;
    const imageSrc = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    apiAnswers = ['A'];
    question(7, '单选题', choices('radio', ['A']), '<img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7">');
    await app.detectAll();
    check(document.querySelector('input[value="A"]').checked && app.isAnswered(7), 'image-only question failed');
    let imageRequest = JSON.parse(requests.at(-1).data);
    check(imageRequest.model === 'deepseek-flash', 'image-only question used a text model');
    check(imageRequest.messages[1].content.some(part => part.type === 'image_url' && part.image_url.url === imageSrc),
      'question image missing from request');

    question(11, '单选题', choices('radio', ['A', 'B']), `参照下图作答<img src="${imageSrc}">`);
    document.querySelector('#fixture .qst-html').className = 'ck-content qck-content qck-content-image-preview qck-content-trim-margin';
    document.querySelector('.option-select .ck-content').innerHTML = `选项A<img src="${imageSrc}">`;
    await app.detectAll();
    imageRequest = JSON.parse(requests.at(-1).data);
    check(app.isAnswered(11), 'mixed text/image question failed');
    check(imageRequest.messages[1].content[0].text.includes('参照下图作答'), 'image question text missing');
    check(imageRequest.messages[1].content.filter(part => part.type === 'image_url').length === 2,
      'question or option image missing');
    check(imageRequest.messages[1].content.some(part => part.type === 'text' && part.text === '选项 A图片 1：'),
      'option image not labeled');

    const beforeSkip = requests.length;
    question(12, '单选题', choices('radio', ['A']), '题干<img src="blob:https://example.com/unavailable">');
    await app.detectAll();
    check(requests.length === beforeSkip && !app.isAnswered(12), 'unsupported image answered without an image');
    keyInput.value = '';
    question(8, '单选题', choices('radio', ['A']));
    await app.detectAll();
    check(requests.length === beforeSkip && !app.isAnswered(8), 'missing API key was not skipped');
    keyInput.value = 'changed-key';

    apiAnswers = ['A'];
    let queueSubmit;
    function renderQueue(number) {
      apiAnswers = number === 10 ? ['自动简答第一段\n自动简答第二段'] : ['A'];
      if (number === 10) shortQuestion(number, `队列题目 ${number}`);
      else question(number, '单选题', choices('radio', ['A', 'B']), `队列题目 ${number}`);
      const list = document.querySelector('.el-scrollbar__view');
      list.innerHTML = '<span class="scale-x-80">9</span><span class="scale-x-80">10</span>';
      const next = document.createElement('button');
      next.className = 'el-button';
      next.textContent = '下一题';
      next.addEventListener('click', () => renderQueue(10));
      document.querySelector('#fixture').appendChild(next);
      queueSubmit = submissionControls();
    }
    renderQueue(9);
    await app.autoAnswer();
    check(app.isAnswered(9) && app.isAnswered(10), 'automatic question navigation failed');
    check(document.querySelector('#fixture .ck-editor__editable').textContent.includes('自动简答第二段'),
      'automatic mode skipped the short answer');
    check(requests.length === beforeSkip + 2, 'automatic mode sent extra requests');
    check(queueSubmit.opened === 0, 'automatic mode submitted with the switch off');

    submitInput.checked = true;
    submitInput.dispatchEvent(new Event('change'));
    renderQueue(9);
    await app.autoAnswer();
    check(queueSubmit.opened === 1 && queueSubmit.confirmed === 1, 'automatic mode did not confirm submission once');

    apiStatus = 401;
    renderQueue(9);
    await app.autoAnswer();
    check(queueSubmit.opened === 0, 'failed answers submitted using stale answered state');
    apiStatus = 200;

    apiAnswers = ['A'];
    question(20, '单选题', choices('radio', ['A']));
    document.querySelector('.el-scrollbar__view').innerHTML = '<span class="scale-x-80">20</span><span class="scale-x-80">21</span>';
    const partialSubmit = submissionControls();
    await app.detectAll();
    check(partialSubmit.opened === 0, 'manual mode submitted an incomplete assignment');
    question(21, '单选题', choices('radio', ['A']));
    document.querySelector('.el-scrollbar__view').innerHTML = '<span class="scale-x-80">20</span><span class="scale-x-80">21</span>';
    const manualSubmit = submissionControls();
    manualSubmit.button.disabled = true;
    setTimeout(() => { manualSubmit.button.disabled = false; }, 250);
    await app.detectAll();
    check(manualSubmit.confirmed === 1, 'manual mode failed to wait for the submit button and confirm');

    question(22, '单选题', choices('radio', ['A']));
    const missingAnswersSubmit = submissionControls('还有1题未做，是否提交！');
    await app.detectAll();
    check(missingAnswersSubmit.confirmed === 0 && missingAnswersSubmit.cancelled === 1,
      'platform missing-answer warning was confirmed');

    question(23, '单选题', choices('radio', ['A']));
    const toggledOffSubmit = submissionControls('作业已经全部做完，是否提交?', () => {
      submitInput.checked = false;
      submitInput.dispatchEvent(new Event('change'));
    });
    await app.detectAll();
    await new Promise(resolve => setTimeout(resolve, 250));
    check(toggledOffSubmit.opened === 1 && toggledOffSubmit.confirmed === 0, 'switch off did not stop confirmation');

    submitInput.checked = true;
    submitInput.dispatchEvent(new Event('change'));
    question(24, '单选题', choices('radio', ['A']));
    const unrelatedSubmit = submissionControls('是否删除其他内容？', () => {
      setTimeout(() => {
        submitInput.checked = false;
        submitInput.dispatchEvent(new Event('change'));
      }, 400);
    });
    await app.detectAll();
    check(unrelatedSubmit.confirmed === 0 && unrelatedSubmit.cancelled === 0, 'unrelated confirmation was clicked');

    submitInput.checked = true;
    submitInput.dispatchEvent(new Event('change'));
    question(25, '单选题', choices('radio', ['A']));
    document.querySelector('.el-scrollbar__view').innerHTML = '<span class="scale-x-80">25</span><span class="scale-x-80">26</span>';
    const stoppedSubmit = submissionControls();
    await app.autoAnswer();
    check(stoppedSubmit.opened === 0, 'navigation failure submitted the assignment');

    apiAnswers = ['A', 'Z'];
    question(27, '多选题', choices('checkbox', ['A', 'B']));
    const invalidChoiceSubmit = submissionControls();
    await app.detectAll();
    check(!app.isAnswered(27) && invalidChoiceSubmit.opened === 0, 'partially applied choices triggered submission');
    apiAnswers = ['第一空'];
    question(28, '填空题', '<textarea class="el-textarea__inner">保留第一空</textarea><textarea class="el-textarea__inner">保留第二空</textarea>');
    const invalidBlankSubmit = submissionControls();
    await app.detectAll();
    check(!app.isAnswered(28) && invalidBlankSubmit.opened === 0 &&
      document.querySelector('.el-textarea__inner').value === '保留第一空', 'missing blank answer overwrote content or triggered submission');
    submitInput.checked = false;
    submitInput.dispatchEvent(new Event('change'));
    check(requests.every(request => request.url === 'https://api.deepseek.com/chat/completions'), 'backend requested');
    check(requests.every(request => {
      const body = JSON.parse(request.data);
      return body.model === 'deepseek-flash' && body.reasoning_effort === 'high' && !body.thinking && !('max_tokens' in body);
    }), 'text or image request did not use Flash High with the default output budget');

    jevInput.checked = true;
    jevInput.dispatchEvent(new Event('change'));
    check(storage.get('use_jev') === true && jevInput.nextElementSibling.firstElementChild.style.left === '20px',
      'JeV switch enable was not saved or displayed');
    keyInput.value = '';
    apiAnswers = ['B'];
    question(29, '单选题', choices('radio', ['A', 'B']));
    const beforeJev = requests.length;
    await app.detectAll();
    check(app.isAnswered(29) && document.querySelector('input[value="B"]').checked, 'JeV single choice failed without a DeepSeek key');
    check(requests.length === beforeJev + 1 && requests.at(-1).url === 'https://api.typesafe.ai/v1/systemone', 'single choice did not route to JeV');
    check(requests.at(-1).headers.Authorization === 'Bearer changed-jev-key', 'JeV request used the wrong API key');

    apiAnswers = ['A', 'C'];
    question(30, '多选题', choices('checkbox', ['A', 'B', 'C', 'D']));
    const beforeMulti = requests.length;
    await app.detectAll();
    check(app.isAnswered(30) && document.querySelector('input[value="A"]').checked && document.querySelector('input[value="C"]').checked,
      'JeV multiple choice failed');
    check(!document.querySelector('input[value="B"]').checked && !document.querySelector('input[value="D"]').checked,
      'JeV selected rejected options');
    const multiRequest = JSON.parse(requests.at(-1).data);
    check(requests.length === beforeMulti + 1 && Object.keys(multiRequest.questions).length === 4 &&
      Object.values(multiRequest.questions).every(question => question.type === 'noul'), 'JeV multi-choice was not batched');

    apiAnswers = ['false'];
    question(31, '判断题', choices('radio', ['true', 'false']));
    await app.detectAll();
    check(app.isAnswered(31) && document.querySelector('input[value="false"]').checked &&
      requests.at(-1).url === 'https://api.typesafe.ai/v1/systemone', 'JeV false judgment failed');
    apiAnswers = ['true'];
    question(32, '判断题', choices('radio', ['true', 'false']));
    await app.detectAll();
    check(app.isAnswered(32) && document.querySelector('input[value="true"]').checked, 'JeV true judgment failed');

    keyInput.value = 'changed-key';
    apiAnswers = ['填空答案'];
    question(33, '填空题', '<textarea class="el-textarea__inner"></textarea>');
    await app.detectAll();
    check(app.isAnswered(33) && requests.at(-1).url === 'https://api.deepseek.com/chat/completions', 'fill blank did not stay on DeepSeek');
    apiAnswers = ['简答题正文'];
    shortQuestion(34);
    await app.detectAll();
    check(app.isAnswered(34) && requests.at(-1).url === 'https://api.deepseek.com/chat/completions', 'short answer did not stay on DeepSeek');

    // 即使 JeV Key 缺失，含图片的三种题型也必须独立走 DeepSeek。
    jevKeyInput.value = '';
    for (const [number, type, form, answers] of [
      [35, '单选题', choices('radio', ['A', 'B']), ['A']],
      [36, '多选题', choices('checkbox', ['A', 'B', 'C']), ['A', 'C']],
      [37, '判断题', choices('radio', ['true', 'false']), ['true']],
    ]) {
      apiAnswers = answers;
      question(number, type, form, `图片题干<img src="${imageSrc}">`);
      const previous = requests.length;
      await app.detectAll();
      const request = requests.at(-1);
      const body = JSON.parse(request.data);
      check(app.isAnswered(number) && requests.length === previous + 1 && request.url === 'https://api.deepseek.com/chat/completions' &&
        request.headers.Authorization === 'Bearer changed-key' && body.model === 'deepseek-flash' && body.reasoning_effort === 'high' &&
        body.messages[1].content.some(part => part.type === 'image_url'), `${type} with a question image did not route intact to DeepSeek`);
    }
    apiAnswers = ['B'];
    question(38, '单选题', choices('radio', ['A', 'B']));
    document.querySelector('.option-select .ck-content').innerHTML = `<img src="${imageSrc}">`;
    await app.detectAll();
    check(app.isAnswered(38) && requests.at(-1).url === 'https://api.deepseek.com/chat/completions' &&
      JSON.parse(requests.at(-1).data).messages[1].content.some(part => part.type === 'image_url'), 'option-only image was sent to JeV or dropped');
    apiAnswers = ['A'];
    question(39, '单选题', choices('radio', ['A', 'B']), `<img src="${imageSrc}">`);
    await app.detectAll();
    check(app.isAnswered(39) && requests.at(-1).url === 'https://api.deepseek.com/chat/completions', 'image-only question was sent to JeV');

    jevKeyInput.value = 'changed-jev-key';
    keyInput.value = '';
    question(40, '单选题', choices('radio', ['A', 'B']), `<img src="${imageSrc}">`);
    const noDeepSeekKey = requests.length;
    await app.detectAll();
    check(requests.length === noDeepSeekKey && !app.isAnswered(40), 'image question fell back to JeV without a DeepSeek key');
    keyInput.value = 'changed-key';

    apiStatus = 429;
    question(41, '单选题', choices('radio', ['A', 'B']));
    submitInput.checked = true;
    submitInput.dispatchEvent(new Event('change'));
    const failedJevSubmit = submissionControls();
    const failedJevStart = requests.length;
    await app.detectAll();
    check(requests.length === failedJevStart + 1 && requests.at(-1).url === 'https://api.typesafe.ai/v1/systemone' &&
      !app.isAnswered(41) && failedJevSubmit.opened === 0, 'JeV failure fell back to DeepSeek or submitted');
    apiStatus = 200;
    jevUncertain = true;
    apiAnswers = ['A', 'C'];
    question(42, '多选题', choices('checkbox', ['A', 'B', 'C']));
    const uncertainSubmit = submissionControls();
    const uncertainStart = requests.length;
    await app.detectAll();
    check(app.isAnswered(42) && document.querySelector('input[value="A"]').checked && document.querySelector('input[value="C"]').checked &&
      uncertainSubmit.confirmed === 1, 'DeepSeek fallback did not complete or submit the uncertain JeV question');
    check(requests.length === uncertainStart + 2 && requests[uncertainStart].url === 'https://api.typesafe.ai/v1/systemone' &&
      requests.at(-1).url === 'https://api.deepseek.com/chat/completions', 'uncertain JeV response did not fall back exactly once');
    jevUncertain = false;
    jevKeyInput.value = '';
    question(43, '单选题', choices('radio', ['A', 'B']));
    const noJevKey = requests.length;
    await app.detectAll();
    check(requests.length === noJevKey && !app.isAnswered(43), 'missing JeV key used DeepSeek');
    jevKeyInput.value = 'changed-jev-key';
    submitInput.checked = false;
    submitInput.dispatchEvent(new Event('change'));

    const mixedQueueStart = requests.length;
    renderQueue(9);
    await app.autoAnswer();
    check(requests.length === mixedQueueStart + 2 && requests[mixedQueueStart].url === 'https://api.typesafe.ai/v1/systemone' &&
      requests[mixedQueueStart + 1].url === 'https://api.deepseek.com/chat/completions', 'automatic mode did not route mixed question types');

    jevInput.checked = false;
    jevInput.dispatchEvent(new Event('change'));
    apiAnswers = ['A'];
    question(44, '单选题', choices('radio', ['A', 'B']));
    await app.detectAll();
    check(app.isAnswered(44) && requests.at(-1).url === 'https://api.deepseek.com/chat/completions', 'turning JeV off did not restore DeepSeek');

    providerInput.value = 'openrouter';
    providerInput.dispatchEvent(new Event('change'));
    check(storage.get('jev_provider') === 'openrouter' && openRouterKeyInput.style.display !== 'none' && jevKeyInput.style.display === 'none',
      'OpenRouter selection was not saved or displayed');
    openRouterKeyInput.value = 'changed-openrouter-key';
    openRouterKeyInput.dispatchEvent(new Event('input'));
    check(storage.get('jev_openrouter_api_key') === 'changed-openrouter-key' && storage.get('jev_api_key') === 'changed-jev-key',
      'channel API keys were mixed when saving');
    jevInput.checked = true;
    jevInput.dispatchEvent(new Event('change'));
    jevKeyInput.value = '';
    for (const [number, type, form, answers] of [
      [45, '单选题', choices('radio', ['A', 'B']), ['B']],
      [46, '多选题', choices('checkbox', ['A', 'B', 'C']), ['A', 'C']],
      [47, '判断题', choices('radio', ['true', 'false']), ['false']],
    ]) {
      apiAnswers = answers;
      question(number, type, form);
      const before = requests.length;
      await app.detectAll();
      const request = requests.at(-1);
      check(app.isAnswered(number) && requests.length === before + 1 && request.url === 'https://openrouter.ai/api/alpha/decisions' &&
        request.headers.Authorization === 'Bearer changed-openrouter-key' && JSON.parse(request.data).model === '~typesafe/jev-latest',
      `${type} did not use OpenRouter with its own key and model`);
      check(answers.every(letter => document.querySelector(`input[value="${letter}"]`).checked), `${type} OpenRouter answer was not applied`);
    }

    apiAnswers = ['A'];
    question(48, '单选题', choices('radio', ['A', 'B']), `<img src="${imageSrc}">`);
    await app.detectAll();
    check(app.isAnswered(48) && requests.at(-1).url === 'https://api.deepseek.com/chat/completions' &&
      requests.at(-1).headers.Authorization === 'Bearer changed-key', 'OpenRouter channel took over an image question');
    const openRouterQueueStart = requests.length;
    renderQueue(9);
    await app.autoAnswer();
    check(requests.length === openRouterQueueStart + 2 && requests[openRouterQueueStart].url === 'https://openrouter.ai/api/alpha/decisions' &&
      requests[openRouterQueueStart + 1].url === 'https://api.deepseek.com/chat/completions', 'OpenRouter automatic mode did not preserve question routing');

    jevKeyInput.value = 'changed-jev-key';
    apiAnswers = ['A'];
    apiStatus = 429;
    question(49, '单选题', choices('radio', ['A', 'B']));
    submitInput.checked = true;
    submitInput.dispatchEvent(new Event('change'));
    const openRouterFailedSubmit = submissionControls();
    const failedStart = requests.length;
    await app.detectAll();
    check(requests.length === failedStart + 1 && requests.at(-1).url === 'https://openrouter.ai/api/alpha/decisions' &&
      !app.isAnswered(49) && openRouterFailedSubmit.opened === 0, 'OpenRouter failure switched channels or submitted');
    apiStatus = 200;
    openRouterKeyInput.value = '';
    question(50, '单选题', choices('radio', ['A', 'B']));
    const missingOpenRouterKey = requests.length;
    await app.detectAll();
    check(requests.length === missingOpenRouterKey && !app.isAnswered(50), 'missing OpenRouter key reused TypeSafe credentials');
    openRouterKeyInput.value = 'changed-openrouter-key';
    submitInput.checked = false;
    submitInput.dispatchEvent(new Event('change'));
    providerInput.value = 'typesafe';
    providerInput.dispatchEvent(new Event('change'));
    question(51, '单选题', choices('radio', ['A', 'B']));
    await app.detectAll();
    check(app.isAnswered(51) && requests.at(-1).url === 'https://api.typesafe.ai/v1/systemone' &&
      requests.at(-1).headers.Authorization === 'Bearer changed-jev-key', 'switching back lost the TypeSafe key or used the wrong channel');

    let fallbackNumber = 52;
    for (const provider of ['typesafe', 'openrouter']) {
      providerInput.value = provider;
      providerInput.dispatchEvent(new Event('change'));
      const endpoint = provider === 'typesafe' ? 'https://api.typesafe.ai/v1/systemone' : 'https://openrouter.ai/api/alpha/decisions';
      const providerKey = provider === 'typesafe' ? 'changed-jev-key' : 'changed-openrouter-key';
      jevUncertain = true;
      jevAnswers = ['A'];
      for (const [type, form, answers] of [
        ['单选题', choices('radio', ['A', 'B']), ['B']],
        ['多选题', choices('checkbox', ['A', 'B', 'C']), ['A', 'C']],
        ['判断题', choices('radio', ['true', 'false']), ['false']],
      ]) {
        const number = fallbackNumber++;
        apiAnswers = answers;
        question(number, type, form);
        const before = requests.length;
        await app.detectAll();
        check(app.isAnswered(number) && answers.every(letter => document.querySelector(`input[value="${letter}"]`).checked),
          `${provider} uncertain ${type} was skipped instead of using DeepSeek`);
        check(requests.length === before + 2 && requests[before].url === endpoint && requests[before].headers.Authorization === `Bearer ${providerKey}` &&
          requests.at(-1).url === 'https://api.deepseek.com/chat/completions' && requests.at(-1).headers.Authorization === 'Bearer changed-key',
          `${provider} fallback used the wrong endpoint, credentials or request count`);
        const body = JSON.parse(requests.at(-1).data);
        check(body.model === 'deepseek-flash' && body.reasoning_effort === 'high' && body.messages[1].content.includes('测试题干'),
          'fallback lost the question text or Flash High settings');
        check(deepSeekSelections.at(-1).length === 0, 'uncertain JeV answers were applied before DeepSeek replied');
      }
      jevUncertain = false;
      apiAnswers = ['A', 'C'];
      const number = fallbackNumber++;
      question(number, '多选题', choices('checkbox', ['A', 'B', 'C']));
      const incompleteStart = requests.length;
      await app.detectAll();
      check(app.isAnswered(number) && requests.length === incompleteStart + 2 && requests.at(-1).url === 'https://api.deepseek.com/chat/completions',
        `${provider} multi-choice with too few reliable answers was skipped`);
    }
    jevUncertain = true;
    jevAnswers = null;
    apiAnswers = ['B'];
    question(60, '单选题', choices('radio', ['A', 'B']));
    submitInput.checked = true;
    submitInput.dispatchEvent(new Event('change'));
    const failedFallbackSubmit = submissionControls();
    deepSeekStatus = 503;
    const failedFallbackStart = requests.length;
    await app.detectAll();
    check(requests.length === failedFallbackStart + 2 && !app.isAnswered(60) && !document.querySelector('#fixture input:checked') &&
      failedFallbackSubmit.opened === 0, 'failed DeepSeek fallback applied an answer or submitted');
    deepSeekStatus = null;
    keyInput.value = '';
    question(61, '单选题', choices('radio', ['A', 'B']));
    const missingFallbackKey = requests.length;
    const missingFallbackSubmit = submissionControls();
    await app.detectAll();
    check(requests.length === missingFallbackKey + 1 && !app.isAnswered(61) && missingFallbackSubmit.opened === 0,
      'fallback without a DeepSeek key sent wrong credentials or submitted');
    check([...document.querySelectorAll('.uplus-log-error')].some(line => line.textContent.includes('未设置 DeepSeek API Key，无法接管')),
      'missing fallback key did not explain how to finish the question');
    keyInput.value = 'changed-key';

    const fallbackQueueStart = requests.length;
    renderQueue(9);
    await app.autoAnswer();
    check(requests.length === fallbackQueueStart + 3 && requests[fallbackQueueStart].url === 'https://openrouter.ai/api/alpha/decisions' &&
      requests[fallbackQueueStart + 1].url === 'https://api.deepseek.com/chat/completions' && requests.at(-1).url === 'https://api.deepseek.com/chat/completions' &&
      queueSubmit.confirmed === 1, 'automatic mode skipped or failed to submit after a successful fallback');
    jevUncertain = false;
    submitInput.checked = false;
    submitInput.dispatchEvent(new Event('change'));
    jevInput.checked = false;
    jevInput.dispatchEvent(new Event('change'));
    check(requests.every(request => ['https://api.deepseek.com/chat/completions', 'https://api.typesafe.ai/v1/systemone', 'https://openrouter.ai/api/alpha/decisions'].includes(request.url)),
      'unexpected endpoint requested');
    check(requests.filter(request => request.url !== 'https://api.deepseek.com/chat/completions').every(request =>
      !('assets' in JSON.parse(request.data)) && !request.headers['TypeSafe-Danger-Zone-Images']), 'JeV received images or a vision header');
    result.textContent = `PASS: ${checks} browser checks`;
    result.dataset.status = 'passed';
    tabs[2].click();
  } catch (error) {
    result.textContent = `FAIL: ${error.stack}`;
    result.dataset.status = 'failed';
  }
})();
