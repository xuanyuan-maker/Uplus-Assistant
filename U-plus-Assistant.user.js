// ==UserScript==
// @name         U+助手
// @namespace    u-plus-assistant
// @version      0.1.0
// @description  用于U+平台的自动答题脚本
// @author       xuanyuan
// @license      MIT
// @match        https://www.eduplus.net/course/workAnswer/*
// @match        https://*.uplus.cn/*
// @connect      api.deepseek.com
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-end
// @noframes
// ==/UserScript==

(async function() {
  'use strict';

  const QUESTION_TYPE_SELECTOR = '.bg-athena-primary.font-bold';
  const QUESTION_CONTENT_SELETOR = '.ck-content.qst-html';
  const QUESTION_OPTIONS_SELETOR = '.option-select';

  const QuestionType = Object.freeze({
    SINGLE_CHOICE: 0,   // 单选题
    MULTI_CHOICE:  1,   // 多选题
    TRUE_FALSE:    2,   // 判断题
    FILL_BLANK:    4,   // 填空题
    SHORT_ANSWER:  5,   // 简答题
  });

  const QUESTION_TYPE_MAP = {
    '单选题': QuestionType.SINGLE_CHOICE,
    '多选题': QuestionType.MULTI_CHOICE,
    '判断题': QuestionType.TRUE_FALSE,
    '填空题': QuestionType.FILL_BLANK,
    '简答题': QuestionType.SHORT_ANSWER,
  };

  // ---- 日志面板 ----
  let logEl, apiInput, questionGrid;
  const answeredSet = new Set();

  function log(level, ...args) {
    const msg = args.join(' ');
    const prefix = `[U+助手] `;
    console[level](prefix + msg);
    if (logEl) {
      const line = document.createElement('div');
      line.className = `uplus-log-line uplus-log-${level}`;
      line.textContent = prefix + msg;
      logEl.appendChild(line);
      logEl.scrollTop = logEl.scrollHeight;
    }
  }

  const logger = {
    log: (...a) => log('log', ...a),
    warn: (...a) => log('warn', ...a),
    error: (...a) => log('error', ...a),
  };

  async function createPanel() {
    const panel = document.createElement('div');
    panel.style.cssText =
      'position:fixed;top:60px;right:16px;z-index:10000;' +
      'width:360px;max-height:480px;' +
      'background:#1e1e2e;color:#cdd6f4;' +
      'border-radius:8px;font-size:13px;' +
      'box-shadow:0 4px 24px rgba(0,0,0,0.4);' +
      'display:flex;flex-direction:column;overflow:hidden;';

    // 标题栏（拖拽把手）
    const titleBar = document.createElement('div');
    titleBar.style.cssText =
      'display:flex;align-items:center;justify-content:space-between;' +
      'padding:8px 12px;background:#313244;cursor:move;user-select:none;' +
      'border-radius:8px 8px 0 0;flex-shrink:0;';
    titleBar.innerHTML = '<span style="font-weight:bold;">U+助手 控制台</span>';

    // 选项卡导航
    const tabNav = document.createElement('div');
    tabNav.style.cssText =
      'display:flex;border-bottom:1px solid #45475a;flex-shrink:0;';

    function makeTab(label, active) {
      const t = document.createElement('div');
      t.textContent = label;
      t.style.cssText =
        'flex:1;text-align:center;padding:8px 0;cursor:pointer;user-select:none;' +
        'font-size:13px;';
      if (active) {
        t.style.color = '#89b4fa';
        t.style.borderBottom = '2px solid #89b4fa';
      } else {
        t.style.color = '#a6adc8';
      }
      return t;
    }

    const questionTab = makeTab('题目', true);
    const logTab = makeTab('日志', false);
    const settingsTab = makeTab('设置', false);

    tabNav.appendChild(questionTab);
    tabNav.appendChild(logTab);
    tabNav.appendChild(settingsTab);

    // ---- 日志页面 ----
    const logPage = document.createElement('div');
    logPage.style.cssText = 'display:none;flex-direction:column;flex:1;min-height:0;';

    // 启动按钮
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'padding:8px 12px;flex-shrink:0;';
    const startBtn = document.createElement('button');
    startBtn.textContent = '启动';
    startBtn.style.cssText =
      'width:100%;padding:6px 0;border:none;border-radius:4px;' +
      'background:#2563eb;color:#fff;font-size:14px;font-weight:bold;cursor:pointer;';
    btnRow.appendChild(startBtn);

    // 日志区域
    logEl = document.createElement('div');
    logEl.style.cssText =
      'flex:1;overflow-y:auto;padding:8px 12px;' +
      'font-family:monospace;font-size:12px;line-height:1.5;' +
      'min-height:120px;max-height:340px;';

    logPage.appendChild(btnRow);
    logPage.appendChild(logEl);

    // ---- 题目页面 ----
    const questionPage = document.createElement('div');
    questionPage.style.cssText =
      'padding:12px;flex:1;overflow-y:auto;';

    questionGrid = document.createElement('div');
    questionGrid.style.cssText =
      'display:grid;grid-template-columns:repeat(5, 1fr);gap:10px;';
    questionPage.appendChild(questionGrid);

    // ---- 设置页面 ----
    const settingsPage = document.createElement('div');
    settingsPage.style.cssText =
      'display:none;padding:12px;flex:1;';

    const label = document.createElement('div');
    label.textContent = 'DeepSeek API Key';
    label.style.cssText = 'color:#a6adc8;font-size:12px;margin-bottom:4px;';

    apiInput = document.createElement('input');
    apiInput.type = 'password';
    apiInput.placeholder = 'sk-...';
    apiInput.value = await GM_getValue('deepseek_api_key', '');
    apiInput.style.cssText =
      'width:100%;padding:6px 8px;border:1px solid #45475a;border-radius:4px;' +
      'background:#313244;color:#cdd6f4;font-size:13px;outline:none;' +
      'box-sizing:border-box;';
    apiInput.addEventListener('change', () => {
      GM_setValue('deepseek_api_key', apiInput.value);
    });
    apiInput.addEventListener('input', () => {
      GM_setValue('deepseek_api_key', apiInput.value);
    });

    settingsPage.appendChild(label);
    settingsPage.appendChild(apiInput);

    // 自动答题开关
    const autoRow = document.createElement('div');
    autoRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-top:12px;';

    const autoLabel = document.createElement('span');
    autoLabel.textContent = '自动答题';
    autoLabel.style.cssText = 'color:#a6adc8;font-size:12px;';

    const autoToggle = document.createElement('label');
    autoToggle.style.cssText =
      'position:relative;display:inline-block;width:40px;height:22px;flex-shrink:0;';

    const autoCheckbox = document.createElement('input');
    autoCheckbox.type = 'checkbox';
    autoCheckbox.checked = await GM_getValue('auto_answer', false);
    autoCheckbox.style.cssText = 'opacity:0;width:0;height:0;';

    const slider = document.createElement('span');
    slider.style.cssText =
      'position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;' +
      'background:#45475a;border-radius:22px;transition:0.2s;';
    const sliderDot = document.createElement('span');
    sliderDot.style.cssText =
      'position:absolute;height:18px;width:18px;left:2px;bottom:2px;' +
      'background:#cdd6f4;border-radius:50%;transition:0.2s;';
    slider.appendChild(sliderDot);

    autoCheckbox.addEventListener('change', () => {
      GM_setValue('auto_answer', autoCheckbox.checked);
      if (autoCheckbox.checked) {
        slider.style.background = '#2563eb';
        sliderDot.style.left = '20px';
      } else {
        slider.style.background = '#45475a';
        sliderDot.style.left = '2px';
      }
    });

    // 初始状态
    if (autoCheckbox.checked) {
      slider.style.background = '#2563eb';
      sliderDot.style.left = '20px';
    }

    autoToggle.appendChild(autoCheckbox);
    autoToggle.appendChild(slider);
    autoRow.appendChild(autoLabel);
    autoRow.appendChild(autoToggle);
    settingsPage.appendChild(autoRow);

    // 选项卡切换
    const contentArea = document.createElement('div');
    contentArea.style.cssText = 'display:flex;flex-direction:column;flex:1;min-height:0;';
    contentArea.appendChild(logPage);
    contentArea.appendChild(questionPage);
    contentArea.appendChild(settingsPage);

    const allPages = { log: logPage, question: questionPage, settings: settingsPage };
    const allTabs  = { log: logTab, question: questionTab, settings: settingsTab };

    function switchTab(active) {
      Object.values(allTabs).forEach(t => {
        t.style.color = '#a6adc8';
        t.style.borderBottom = 'none';
      });
      Object.values(allPages).forEach(p => { p.style.display = 'none'; });
      allTabs[active].style.color = '#89b4fa';
      allTabs[active].style.borderBottom = '2px solid #89b4fa';
      allPages[active].style.display = '';
    }

    logTab.addEventListener('click', () => switchTab('log'));
    questionTab.addEventListener('click', () => switchTab('question'));
    settingsTab.addEventListener('click', () => switchTab('settings'));

    panel.appendChild(titleBar);
    panel.appendChild(tabNav);
    panel.appendChild(contentArea);
    document.body.appendChild(panel);

    // 拖拽
    let dragging = false, offX, offY;
    titleBar.addEventListener('mousedown', (e) => {
      dragging = true;
      const rect = panel.getBoundingClientRect();
      offX = e.clientX - rect.left;
      offY = e.clientY - rect.top;
    });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      panel.style.left = (e.clientX - offX) + 'px';
      panel.style.top = (e.clientY - offY) + 'px';
      panel.style.right = 'auto';
    });
    window.addEventListener('mouseup', () => { dragging = false; });

    return startBtn;
  }

  const QUESTION_LIST_SELECTOR = '.el-scrollbar__view';
  const QUESTION_NUMBER_SELECTOR = '.text-size-20px.font-bold.color-text-primary';
  const NEXT_BUTTON_TEXT = '下一题';

  // ---- 题目列表 ----
  function detectQuestionList() {
    const view = document.querySelector(QUESTION_LIST_SELECTOR);
    if (!view) {
      logger.warn('未找到题目列表');
      return [];
    }

    const items = view.querySelectorAll('[class*="scale-x-80"]');
    const numbers = [];
    items.forEach((span) => {
      const num = parseInt(span.textContent.trim(), 10);
      if (!isNaN(num)) {
        numbers.push(num);
      }
    });

    numbers.sort((a, b) => a - b);
    logger.log(`题目列表: 共 ${numbers.length} 题, 编号: ${numbers.join(', ')}`);
    return numbers;
  }

  // ---- 题目序号 ----
  function detectQuestionNumber() {
    const el = document.querySelector(QUESTION_NUMBER_SELECTOR);
    if (!el) {
      logger.warn('未找到题目序号');
      return null;
    }
    const num = parseInt(el.textContent.trim(), 10);
    if (isNaN(num)) {
      logger.warn(`题目序号解析失败: ${el.textContent}`);
      return null;
    }
    logger.log(`当前题目序号: ${num}`);
    return num;
  }

  // ---- 答题卡 ----
  function buildAnswerSheet(questions) {
    if (!questionGrid) return;
    questionGrid.innerHTML = '';

    questions.forEach((num) => {
      const cell = document.createElement('div');
      cell.style.cssText =
        'aspect-ratio:1;display:flex;align-items:center;justify-content:center;' +
        'border:2px solid #89b4fa;border-radius:8px;font-size:14px;font-weight:bold;' +
        'cursor:default;user-select:none;transition:background 0.2s;';
      cell.textContent = num;
      cell.dataset.question = num;

      if (answeredSet.has(num)) {
        cell.style.background = '#a6e3a1';
        cell.style.color = '#1e1e2e';
      } else {
        cell.style.background = '#ffffff';
        cell.style.color = '#1e1e2e';
      }

      questionGrid.appendChild(cell);
    });

    logger.log(`答题卡已生成: ${questions.length} 题`);
  }

  function markAnswered(num) {
    if (!num) return;
    answeredSet.add(num);

    if (!questionGrid) return;
    const cell = questionGrid.querySelector(`[data-question="${num}"]`);
    if (cell) {
      cell.style.background = '#a6e3a1';
      cell.style.color = '#1e1e2e';
    }
    logger.log(`题目 ${num} 已作答`);
  }

  function getAnswered() {
    return [...answeredSet].sort((a, b) => a - b);
  }

  function isAnswered(num) {
    return answeredSet.has(num);
  }

  // ---- 题目检测 ----
  function detectQuestionTypes() {
    const el = document.querySelector(QUESTION_TYPE_SELECTOR);
    if (!el) {
      logger.warn('没有找到任何题目类型元素');
      return null;
    }

    const raw = el.textContent.trim();
    const type = QUESTION_TYPE_MAP[raw];
    if (type === undefined) {
      logger.warn(`未知的题目类型: ${raw}`);
      return null;
    }
    logger.log(`题目类型: ${raw} (${type})`);
    return type;
  }

  function detectQuestionContent() {
    const el = document.querySelector(QUESTION_CONTENT_SELETOR);
    if (!el) {
      logger.warn('没有找到任何题目内容');
      return null;
    }

    const content = el.textContent.trim();
    logger.log(`题目内容: ${content}`);
    return content;
  }

  function detectOptions() {
    const labels = document.querySelectorAll(QUESTION_OPTIONS_SELETOR);
    if (labels.length === 0) {
      logger.warn('未找到选项');
      return [];
    }

    const options = [];
    labels.forEach((label) => {
      const input = label.querySelector('.el-radio__original, .el-checkbox__original');
      const letter = input ? input.value : '';
      const textEl = label.querySelector('.ck-content.qst-html');
      const text = textEl ? textEl.textContent.trim() : '';
      options.push({ letter, text });
      logger.log(`${letter}. ${text}`);
    });

    return options;
  }

  async function selectOptions(answers, questionType) {
    if (questionType === QuestionType.SINGLE_CHOICE || questionType === QuestionType.TRUE_FALSE) {
      if (answers.length > 1) {
        throw new Error(`选项过多: 单选/判断题期望 1 个选项，实际传入 ${answers.length} 个`);
      }
    } else if (questionType === QuestionType.MULTI_CHOICE) {
      if (answers.length <= 1) {
        throw new Error(`选项过少: 多选题期望至少 2 个选项，实际传入 ${answers.length} 个`);
      }
    }

    const isMulti = questionType === QuestionType.MULTI_CHOICE;
    const inputSelector = isMulti ? '.el-checkbox__original' : '.el-radio__original';
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const selected = [];

    for (const letter of answers) {
      const input = document.querySelector(`${inputSelector}[value="${letter}"]`);
      if (!input) {
        logger.warn(`未找到选项: ${letter}`);
        continue;
      }
      input.click();
      selected.push(letter);
      if (isMulti) {
        await delay(50);
      }
    }

    logger.log(`已选择: ${selected.join(', ')}`);
    return selected;
  }

  async function fillBlankAnswer(answers) {
    const textareas = document.querySelectorAll('.el-textarea__inner');
    if (textareas.length === 0) {
      throw new Error('未找到填空题输入框');
    }

    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype, 'value'
    ).set;

    for (let i = 0; i < textareas.length; i++) {
      const text = answers[i] || '';
      nativeSetter.call(textareas[i], text);
      textareas[i].dispatchEvent(new Event('input', { bubbles: true }));
      textareas[i].dispatchEvent(new Event('change', { bubbles: true }));
      logger.log(`已填入答案 ${i + 1}/${textareas.length}: ${text}`);
      if (i < textareas.length - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    }
  }

  const QUESTION_TYPE_LABEL = {
    [QuestionType.SINGLE_CHOICE]: '单选题',
    [QuestionType.MULTI_CHOICE]: '多选题',
    [QuestionType.TRUE_FALSE]: '判断题',
    [QuestionType.FILL_BLANK]: '填空题',
    [QuestionType.SHORT_ANSWER]: '简答题',
  };

  const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';

  function gmFetch(url, options) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: options.method || 'POST',
        url,
        headers: options.headers || {},
        data: options.body || '',
        timeout: 30000,
        onload: (resp) => {
          resolve({
            ok: resp.status >= 200 && resp.status < 300,
            status: resp.status,
            json: () => JSON.parse(resp.responseText),
            text: () => resp.responseText,
          });
        },
        onerror: (err) => reject(new Error(`网络请求失败: ${JSON.stringify(err)}`)),
        ontimeout: () => reject(new Error('请求超时')),
      });
    });
  }

  // 构建发送给 AI 的提示词
  function buildPrompt(questionType, content, options) {
    const typeLabel = QUESTION_TYPE_LABEL[questionType] || '未知类型';
    const optionsText = options.map(o => `${o.letter}. ${o.text}`).join('\n');

    const systemMessage =
      '你是一个专业的答题助手。请根据题目内容和选项，选出所有正确答案。\n' +
      '输出规范：\n' +
      '- 单选题，输出 {"answers": ["A"]}\n' +
      '- 多选题，输出 {"answers": ["A", "C"]}\n' +
      '- 判断题，输出 {"answers": ["true"]} 或 {"answers": ["false"]}\n' +
      '- 填空题，输出 {"answers": ["答案"]}，答案应为题干括号中缺失的内容，只返回答案文本\n' +
      '- 只输出JSON，不要包含任何其他文字、解释或markdown代码块。';

    let userMessage = `题目类型：${typeLabel}\n题目内容：${content}\n\n`;
    if (options.length > 0) {
      userMessage += `选项：\n${optionsText}\n\n`;
    }
    userMessage += '请作答：';

    logger.log(`提示词已构建，类型: ${typeLabel}`);
    return [
      { role: 'system', content: systemMessage },
      { role: 'user', content: userMessage },
    ];
  }

  // 调用 DeepSeek API
  async function callDeepSeek(apiKey, messages) {
    logger.log('正在调用 DeepSeek API...');

    const response = await gmFetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages,
        temperature: 0,
        max_tokens: 256,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`API 请求失败 (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    logger.log(`API 原始回复: ${content}`);
    return data;
  }

  // 解析 AI 返回的 JSON
  function parseAIResponse(data) {
    let content = data.choices?.[0]?.message?.content?.trim() || '';
    if (!content) {
      throw new Error('AI 返回内容为空');
    }

    // 去掉可能的 markdown 代码块包裹
    let jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    let jsonStr = jsonMatch ? jsonMatch[1].trim() : content;

    // 提取第一个 JSON 对象
    jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    jsonStr = jsonMatch ? jsonMatch[0] : jsonStr;

    logger.log(`解析 JSON: ${jsonStr}`);

    const result = JSON.parse(jsonStr);
    if (!result.answers || !Array.isArray(result.answers)) {
      throw new Error(`AI 返回的JSON缺少 answers 字段: ${content}`);
    }

    logger.log(`AI 答案: [${result.answers.join(', ')}]`);
    return result.answers;
  }

  // 解题入口：获取题目 → 调 AI → 选选项
  async function solveQuestion(questionType, content, options) {
    const apiKey = apiInput?.value?.trim();
    if (!apiKey) {
      logger.warn('未设置 DeepSeek API Key，请在设置选项卡中填写');
      return null;
    }

    const label = QUESTION_TYPE_LABEL[questionType];
    if (!label) {
      logger.warn(`题目类型 ${questionType} 暂不支持 AI 作答`);
      return null;
    }

    try {
      const messages = buildPrompt(questionType, content, options);
      const data = await callDeepSeek(apiKey, messages);
      const answers = parseAIResponse(data);

      if (questionType === QuestionType.FILL_BLANK) {
        await fillBlankAnswer(answers);
      } else {
        await selectOptions(answers, questionType);
      }
      logger.log(`答题完成: ${answers.join(', ')}`);
      return answers;
    } catch (err) {
      logger.error(err.message);
      return null;
    }
  }

  // 查找下一题按钮
  function findNextButton() {
    const buttons = document.querySelectorAll('button.el-button');
    for (const btn of buttons) {
      if (btn.textContent.includes(NEXT_BUTTON_TEXT)) {
        return btn;
      }
    }
    return null;
  }

  // 等待题目切换
  async function waitForNextQuestion(prevNum, timeout = 15000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const num = detectQuestionNumber();
      if (num !== null && num !== prevNum) return true;
      await new Promise(r => setTimeout(r, 200));
    }
    logger.warn('等待题目切换超时');
    return false;
  }

  // 自动答题：按队列逐题作答
  async function autoAnswer() {
    const list = detectQuestionList();
    if (list.length === 0) {
      logger.warn('题目列表为空，无法自动作答');
      return;
    }

    buildAnswerSheet(list);
    logger.log(`自动答题开始，共 ${list.length} 题`);

    for (let i = 0; i < list.length; i++) {
      const currentNum = detectQuestionNumber();
      if (currentNum === null) {
        logger.warn('未检测到当前题目序号，停止作答');
        break;
      }

      logger.log(`正在作答第 ${currentNum} 题 (${i + 1}/${list.length})`);

      const type = detectQuestionTypes();
      const content = detectQuestionContent();
      if (type === null || content === null) {
        logger.warn('题目信息不完整，跳过');
        continue;
      }

      let options;
      if (type === QuestionType.TRUE_FALSE) {
        options = [
          { letter: 'true', text: '正确' },
          { letter: 'false', text: '错误' },
        ];
      } else if (type === QuestionType.FILL_BLANK) {
        options = [];
      } else {
        options = detectOptions();
        if (options.length === 0) {
          logger.warn(`第 ${currentNum} 题未找到选项，跳过`);
          continue;
        }
      }

      const result = await solveQuestion(type, content, options);
      if (result) {
        markAnswered(currentNum);
      }

      // 最后一题
      if (i >= list.length - 1) {
        logger.log('所有题目作答完毕');
        break;
      }

      // 等待 500ms 后点击下一题
      await new Promise(r => setTimeout(r, 500));
      const nextBtn = findNextButton();
      if (!nextBtn) {
        logger.warn('未找到下一题按钮，停止作答');
        break;
      }
      nextBtn.click();
      await waitForNextQuestion(currentNum);
    }
  }

  async function detectAll() {
    const list = detectQuestionList();
    const currentNum = detectQuestionNumber();

    if (list.length > 0) {
      buildAnswerSheet(list);
    }

    const type = detectQuestionTypes();
    if (type === null) {
      logger.warn('题目类型未知，无法作答');
      return;
    }

    const content = detectQuestionContent();
    if (content === null) {
      logger.warn('题目内容为空，无法作答');
      return;
    }

    let options;
    if (type === QuestionType.TRUE_FALSE) {
      options = [
        { letter: 'true', text: '正确' },
        { letter: 'false', text: '错误' },
      ];
      logger.log('判断题，使用固定选项: true. 正确, false. 错误');
    } else if (type === QuestionType.FILL_BLANK) {
      options = [];
    } else {
      options = detectOptions();
      if (options.length === 0) {
        logger.warn('未找到选项，无法作答');
        return;
      }
    }

    const result = await solveQuestion(type, content, options);
    if (result) {
      markAnswered(currentNum);
    }
  }

  // ---- 初始化 ----
  const startBtn = await createPanel();
  startBtn.addEventListener('click', detectAll);

  // 等待页面就绪
  async function waitForReady(timeout = 15000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const typeEl = document.querySelector(QUESTION_TYPE_SELECTOR);
      const listEl = document.querySelector(QUESTION_LIST_SELECTOR);
      if (typeEl?.textContent.trim() && listEl?.querySelector('[class*="scale-x-80"]')) {
        logger.log('页面就绪');
        return true;
      }
      await new Promise(r => setTimeout(r, 200));
    }
    logger.warn('等待页面就绪超时');
    return false;
  }

  // 自动答题
  if (await GM_getValue('auto_answer', false)) {
    logger.log('自动答题已启用，等待页面就绪...');
    const ready = await waitForReady();
    if (ready) {
      await autoAnswer();
    }
  }

  window.__uplus = {
    selectOptions, detectOptions, detectQuestionTypes, detectQuestionList, detectQuestionNumber, detectAll,
    buildPrompt, callDeepSeek, parseAIResponse, solveQuestion,
    buildAnswerSheet, markAnswered, getAnswered, isAnswered,
    autoAnswer, findNextButton, waitForNextQuestion,
    QuestionType, logger,
    get apiKey() { return apiInput?.value ?? ''; },
  };
})();
