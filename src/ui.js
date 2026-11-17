import { logger, setLogElement } from './logger.js';

let apiInput, jevApiInput, jevOpenRouterApiInput, jevProviderSelect, questionGrid, autoSubmitCheckbox, useJevCheckbox;
const answeredSet = new Set();

export function getApiKey() {
  return apiInput?.value ?? '';
}

export function getAutoSubmit() {
  return autoSubmitCheckbox?.checked === true;
}

export function getJevApiKey() {
  return (getJevProvider() === 'openrouter' ? jevOpenRouterApiInput : jevApiInput)?.value ?? '';
}

export function getJevProvider() {
  return jevProviderSelect?.value || 'typesafe';
}

export function getUseJev() {
  return useJevCheckbox?.checked === true;
}

export async function createPanel() {
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
  const logEl = document.createElement('div');
  setLogElement(logEl);
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
    'display:none;padding:12px;flex:1;min-height:0;overflow-y:auto;';

  const label = document.createElement('div');
  label.textContent = 'DeepSeek API Key';
  label.style.cssText = 'color:#a6adc8;font-size:12px;margin-bottom:4px;';

  apiInput = document.createElement('input');
  apiInput.type = 'password';
  apiInput.setAttribute('aria-label', 'DeepSeek API Key');
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

  const providerLabel = label.cloneNode(true);
  providerLabel.textContent = 'JeV API 渠道';
  providerLabel.style.marginTop = '12px';
  jevProviderSelect = document.createElement('select');
  jevProviderSelect.setAttribute('aria-label', 'JeV API 渠道');
  jevProviderSelect.style.cssText = apiInput.style.cssText;
  for (const [value, text] of [['typesafe', 'TypeSafe'], ['openrouter', 'OpenRouter']]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = text;
    jevProviderSelect.appendChild(option);
  }
  const savedProvider = await GM_getValue('jev_provider', 'typesafe');
  jevProviderSelect.value = ['typesafe', 'openrouter'].includes(savedProvider) ? savedProvider : 'typesafe';
  settingsPage.appendChild(providerLabel);
  settingsPage.appendChild(jevProviderSelect);

  const jevLabel = label.cloneNode(true);
  jevLabel.textContent = 'JeV API Key（TypeSafe）';
  jevLabel.style.marginTop = '12px';
  jevApiInput = apiInput.cloneNode(true);
  jevApiInput.setAttribute('aria-label', 'JeV API Key');
  jevApiInput.placeholder = '填写 TypeSafe JeV API Key';
  jevApiInput.value = await GM_getValue('jev_api_key', '');
  for (const event of ['input', 'change']) {
    jevApiInput.addEventListener(event, () => GM_setValue('jev_api_key', jevApiInput.value));
  }
  settingsPage.appendChild(jevLabel);
  settingsPage.appendChild(jevApiInput);

  const openRouterLabel = jevLabel.cloneNode(true);
  openRouterLabel.textContent = 'JeV API Key（OpenRouter）';
  jevOpenRouterApiInput = jevApiInput.cloneNode(true);
  jevOpenRouterApiInput.setAttribute('aria-label', 'JeV OpenRouter API Key');
  jevOpenRouterApiInput.placeholder = '填写 OpenRouter API Key';
  jevOpenRouterApiInput.value = await GM_getValue('jev_openrouter_api_key', '');
  for (const event of ['input', 'change']) {
    jevOpenRouterApiInput.addEventListener(event, () => GM_setValue('jev_openrouter_api_key', jevOpenRouterApiInput.value));
  }
  settingsPage.appendChild(openRouterLabel);
  settingsPage.appendChild(jevOpenRouterApiInput);
  function updateProvider() {
    const openRouter = getJevProvider() === 'openrouter';
    jevLabel.style.display = jevApiInput.style.display = openRouter ? 'none' : '';
    openRouterLabel.style.display = jevOpenRouterApiInput.style.display = openRouter ? '' : 'none';
  }
  jevProviderSelect.addEventListener('change', () => {
    GM_setValue('jev_provider', getJevProvider());
    updateProvider();
  });
  updateProvider();

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
  autoCheckbox.setAttribute('aria-label', '自动答题');
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

  async function addToggle(text, key) {
    const row = autoRow.cloneNode(true);
    row.firstElementChild.textContent = text;
    const checkbox = row.querySelector('input');
    checkbox.setAttribute('aria-label', text);
    checkbox.checked = await GM_getValue(key, false) === true;
    const toggleSlider = checkbox.nextElementSibling;
    function updateToggle() {
      toggleSlider.style.background = checkbox.checked ? '#2563eb' : '#45475a';
      toggleSlider.firstElementChild.style.left = checkbox.checked ? '20px' : '2px';
    }
    checkbox.addEventListener('change', () => {
      GM_setValue(key, checkbox.checked);
      updateToggle();
    });
    updateToggle();
    settingsPage.appendChild(row);
    return checkbox;
  }

  useJevCheckbox = await addToggle('选择题使用 JeV', 'use_jev');
  const jevHint = document.createElement('div');
  jevHint.textContent = '仅纯文本单选、多选、判断题使用 JeV；图片题及其他题型使用 DeepSeek Flash High。';
  jevHint.style.cssText = 'margin-top:6px;color:#a6adc8;font-size:12px;';
  settingsPage.appendChild(jevHint);

  autoSubmitCheckbox = await addToggle('自动提交', 'auto_submit');
  const submitHint = document.createElement('div');
  submitHint.textContent = '开启后，全部题目作答成功将自动提交作业。';
  submitHint.style.cssText = 'margin-top:6px;color:#a6adc8;font-size:12px;';
  settingsPage.appendChild(submitHint);

  // 选项卡切换
  const contentArea = document.createElement('div');
  contentArea.style.cssText = 'display:flex;flex-direction:column;flex:1;min-height:0;';
  contentArea.appendChild(logPage);
  contentArea.appendChild(questionPage);
  contentArea.appendChild(settingsPage);

  const allPages = { log: logPage, question: questionPage, settings: settingsPage };
  const allTabs = { log: logTab, question: questionTab, settings: settingsTab };

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

// ---- 答题卡 ----
export function buildAnswerSheet(questions) {
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

export function markAnswered(num) {
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

export function getAnswered() {
  return [...answeredSet].sort((a, b) => a - b);
}

export function isAnswered(num) {
  return answeredSet.has(num);
}
