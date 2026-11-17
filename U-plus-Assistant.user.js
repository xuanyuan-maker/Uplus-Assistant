// ==UserScript==
// @name         U+助手
// @namespace    u-plus-assistant
// @version      0.1.10
// @description  用于U+平台的自动答题脚本
// @author       xuanyuan
// @license      MIT
// @match        https://www.eduplus.net/course/workAnswer/*
// @connect      api.deepseek.com
// @connect      api.typesafe.ai
// @connect      openrouter.ai
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        unsafeWindow
// @run-at       document-end
// @noframes
// ==/UserScript==

'use strict';
(() => {
  // src/logger.js
  var logEl;
  function setLogElement(element) {
    logEl = element;
  }
  function log(level, ...args) {
    const msg = args.join(" ");
    const prefix = `[U+助手] `;
    console[level](prefix + msg);
    if (logEl) {
      const line = document.createElement("div");
      line.className = `uplus-log-line uplus-log-${level}`;
      line.textContent = prefix + msg;
      logEl.appendChild(line);
      logEl.scrollTop = logEl.scrollHeight;
    }
  }
  var logger = {
    log: (...a) => log("log", ...a),
    warn: (...a) => log("warn", ...a),
    error: (...a) => log("error", ...a)
  };

  // src/questions.js
  var QUESTION_TYPE_SELECTOR = ".bg-athena-primary.font-bold";
  var QUESTION_CONTENT_SELECTOR = ".ck-content.qst-html, .ck-content.qck-content, .qst-html, .qck-content";
  var QUESTION_OPTIONS_SELECTOR = ".option-select, .flex-row.align-center:has(.ck-content)";
  var QuestionType = Object.freeze({
    SINGLE_CHOICE: 0,
    // 单选题
    MULTI_CHOICE: 1,
    // 多选题
    TRUE_FALSE: 2,
    // 判断题
    FILL_BLANK: 4,
    // 填空题
    SHORT_ANSWER: 5
    // 简答题
  });
  var QUESTION_TYPE_MAP = {
    "单选题": QuestionType.SINGLE_CHOICE,
    "多选题": QuestionType.MULTI_CHOICE,
    "判断题": QuestionType.TRUE_FALSE,
    "填空题": QuestionType.FILL_BLANK,
    "简答题": QuestionType.SHORT_ANSWER
  };
  var QUESTION_LIST_SELECTOR = ".el-scrollbar__view";
  var QUESTION_NUMBER_SELECTOR = ".text-size-20px.font-bold.color-text-primary";
  var NEXT_BUTTON_TEXT = "下一题";
  function detectQuestionList() {
    const view = document.querySelector(QUESTION_LIST_SELECTOR);
    if (!view) {
      logger.warn("未找到题目列表");
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
    logger.log(`题目列表: 共 ${numbers.length} 题, 编号: ${numbers.join(", ")}`);
    return numbers;
  }
  function detectQuestionNumber(quiet = false) {
    const el = document.querySelector(QUESTION_NUMBER_SELECTOR);
    if (!el) {
      if (!quiet) logger.warn("未找到题目序号");
      return null;
    }
    const num = parseInt(el.textContent.trim(), 10);
    if (isNaN(num)) {
      if (!quiet) logger.warn(`题目序号解析失败: ${el.textContent}`);
      return null;
    }
    if (!quiet) logger.log(`当前题目序号: ${num}`);
    return num;
  }
  function detectQuestionTypes() {
    const el = document.querySelector(QUESTION_TYPE_SELECTOR);
    if (!el) {
      logger.warn("没有找到任何题目类型元素");
      return null;
    }
    const raw = el.textContent.trim();
    const type = QUESTION_TYPE_MAP[raw];
    if (type === void 0) {
      logger.warn(`未知的题目类型: ${raw}`);
      return null;
    }
    logger.log(`题目类型: ${raw} (${type})`);
    return type;
  }
  function detectQuestionContent(quiet = false) {
    const el = document.querySelector(QUESTION_CONTENT_SELECTOR);
    if (!el) {
      if (!quiet) logger.warn("没有找到任何题目内容");
      return null;
    }
    const text = el.textContent.trim();
    const images = extractImagesFromElement(el);
    if (!quiet) {
      if (images.length > 0) {
        logger.log(`题目图片: ${images.map((i) => i.filename).join(", ")}`);
      }
      logger.log(`题目内容: ${text || "(纯图片)"}`);
    }
    return { text, images, el };
  }
  function detectOptions() {
    const containers = document.querySelectorAll(QUESTION_OPTIONS_SELECTOR);
    if (containers.length === 0) {
      logger.warn("未找到选项");
      return [];
    }
    const options = [];
    containers.forEach((container) => {
      const input = container.querySelector(".el-radio__original, .el-checkbox__original");
      let letter = input ? input.value : "";
      if (!letter) {
        const textNodes = [];
        for (const node of container.childNodes) {
          if (node.nodeType === Node.TEXT_NODE) {
            const t = node.textContent.trim();
            if (t) textNodes.push(t);
          }
        }
        for (const t of textNodes) {
          const m = t.match(/^([A-Z])[、.\s]*/);
          if (m) {
            letter = m[1];
            break;
          }
        }
      }
      const textEl = container.querySelector(QUESTION_CONTENT_SELECTOR);
      const text = textEl ? textEl.textContent.trim() : "";
      const images = extractImagesFromElement(textEl || container);
      options.push({ letter, text, images });
      if (images.length > 0) {
        logger.log(`${letter}. ${text || "(图片选项)"} [图片: ${images.map((i) => i.filename).join(", ")}]`);
      } else {
        logger.log(`${letter}. ${text}`);
      }
    });
    return options;
  }
  function getFilenameFromUrl(url) {
    try {
      const decoded = decodeURIComponent(url);
      const pathname = new URL(decoded).pathname;
      const segments = pathname.split("/").filter(Boolean);
      return segments[segments.length - 1] || "";
    } catch {
      const parts = url.split("/").filter(Boolean);
      return parts[parts.length - 1] || "";
    }
  }
  function extractImagesFromElement(el) {
    if (!el) return [];
    const imgs = el.querySelectorAll("img");
    return Array.from(imgs).map((img) => ({
      src: img.currentSrc || img.src || img.getAttribute("src") || "",
      alt: img.alt || "",
      filename: getFilenameFromUrl(img.currentSrc || img.src || img.getAttribute("src") || "")
    }));
  }
  function hasImages(content, options) {
    const qHas = content && content.images && content.images.length > 0;
    const oHas = options && options.some((o) => o.images && o.images.length > 0);
    return qHas || oHas;
  }
  var QUESTION_TYPE_LABEL = {
    [QuestionType.SINGLE_CHOICE]: "单选题",
    [QuestionType.MULTI_CHOICE]: "多选题",
    [QuestionType.TRUE_FALSE]: "判断题",
    [QuestionType.FILL_BLANK]: "填空题",
    [QuestionType.SHORT_ANSWER]: "简答题"
  };
  function findNextButton() {
    const buttons = document.querySelectorAll("button.el-button");
    for (const btn of buttons) {
      if (btn.textContent.includes(NEXT_BUTTON_TEXT)) {
        return btn;
      }
    }
    return null;
  }
  async function waitForNextQuestion(prevNum, prevText = "", timeout = 15e3) {
    const start = Date.now();
    let numChangedAt = 0;
    while (Date.now() - start < timeout) {
      const num = detectQuestionNumber(true);
      if (num !== null && num !== prevNum) {
        if (!numChangedAt) numChangedAt = Date.now();
        const content = detectQuestionContent(true);
        const text = content ? content.text : "";
        if (text && text !== prevText) {
          await new Promise((r) => setTimeout(r, 300));
          return true;
        }
        if (Date.now() - numChangedAt > 8e3) return true;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    logger.warn("等待题目切换超时");
    return false;
  }
  async function waitForReady(timeout = 15e3) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const typeEl = document.querySelector(QUESTION_TYPE_SELECTOR);
      const contentEl = document.querySelector(QUESTION_CONTENT_SELECTOR);
      const listEl = document.querySelector(QUESTION_LIST_SELECTOR);
      if (typeEl?.textContent.trim() && contentEl && listEl?.querySelector('[class*="scale-x-80"]')) {
        logger.log("页面就绪");
        return true;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    logger.warn("等待页面就绪超时");
    return false;
  }

  // src/answers.js
  async function waitForNodes(selector, timeout = 3e3) {
    const start = Date.now();
    let nodes = document.querySelectorAll(selector);
    while (nodes.length === 0 && Date.now() - start < timeout) {
      await new Promise((r) => setTimeout(r, 100));
      nodes = document.querySelectorAll(selector);
    }
    return nodes;
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
    const inputSelector = isMulti ? ".el-checkbox__original" : ".el-radio__original";
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const selected = [];
    for (const letter of answers) {
      let input = (await waitForNodes(`${inputSelector}[value="${letter}"]`))[0];
      if (input) {
        input.click();
        selected.push(letter);
        if (isMulti) await delay(50);
        continue;
      }
      const containers = await waitForNodes(".flex-row.align-center:has(.ck-content)");
      let clicked = false;
      for (const container of containers) {
        for (const node of container.childNodes) {
          if (node.nodeType === Node.TEXT_NODE) {
            const m = node.textContent.trim().match(/^([A-Z])[、.\s]*/);
            if (m && m[1] === letter) {
              const hiddenInput = container.querySelector('input[type="radio"], input[type="checkbox"]');
              if (hiddenInput) {
                hiddenInput.click();
              } else {
                container.click();
              }
              selected.push(letter);
              clicked = true;
              break;
            }
          }
        }
        if (clicked) break;
      }
      if (!clicked) {
        logger.warn(`未找到选项: ${letter}`);
        continue;
      }
      if (isMulti) {
        await delay(50);
      }
    }
    if (selected.length !== answers.length || selected.length === 0) {
      throw new Error(`未找到任何选项: ${answers.join(", ")}`);
    }
    logger.log(`已选择: ${selected.join(", ")}`);
    return selected;
  }
  async function fillBlankAnswer(answers) {
    const textareas = await waitForNodes(".el-textarea__inner", 5e3);
    if (textareas.length === 0) {
      throw new Error("未找到填空题输入框");
    }
    if (answers.length !== textareas.length) {
      throw new Error(`填空题答案数量不匹配: ${textareas.length} 个空，收到 ${answers.length} 个答案`);
    }
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value"
    ).set;
    for (let i = 0; i < textareas.length; i++) {
      const text = answers[i] || "";
      nativeSetter.call(textareas[i], text);
      textareas[i].dispatchEvent(new Event("input", { bubbles: true }));
      textareas[i].dispatchEvent(new Event("change", { bubbles: true }));
      logger.log(`已填入答案 ${i + 1}/${textareas.length}: ${text}`);
      if (i < textareas.length - 1) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  }
  async function fillShortAnswer(answers) {
    if (answers.length !== 1 || typeof answers[0] !== "string" || !answers[0].trim()) {
      throw new Error("简答题需要一个非空的完整答案字符串");
    }
    const selector = '.q-ckeditor--document .ck-editor__editable[contenteditable="true"]';
    if ((await waitForNodes(selector, 5e3)).length !== 1) {
      throw new Error("未找到唯一可编辑的简答题输入框");
    }
    const editable = unsafeWindow.document.querySelector(selector);
    const editor = editable?.ckeditorInstance;
    if (!editor?.setData || !editor?.getData || editor.isReadOnly) {
      throw new Error("简答题编辑器尚未就绪或为只读，请稍后重试");
    }
    const text = answers[0];
    const paragraph = document.createElement("p");
    paragraph.textContent = text;
    const html = paragraph.outerHTML.replace(/\r\n|\r|\n/g, "<br>");
    editor.setData(html);
    if (editable.textContent.replace(/\s/g, "") !== text.replace(/\s/g, "")) {
      throw new Error("简答题答案未完整写入编辑器");
    }
    editable.dispatchEvent(new Event("input", { bubbles: true }));
    editable.dispatchEvent(new Event("change", { bubbles: true }));
    editable.blur();
    logger.log("已填入简答题答案");
  }
  async function applyAnswer(questionType, answers) {
    if (questionType === QuestionType.FILL_BLANK) {
      await fillBlankAnswer(answers);
    } else if (questionType === QuestionType.SHORT_ANSWER) {
      await fillShortAnswer(answers);
    } else {
      await selectOptions(answers, questionType);
    }
  }

  // src/api.js
  var DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
  function gmFetch(url, options) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: options.method || "POST",
        url,
        headers: options.headers || {},
        data: options.body || "",
        anonymous: true,
        timeout: 18e4,
        onload: (resp) => {
          resolve({
            ok: resp.status >= 200 && resp.status < 300,
            status: resp.status,
            json: () => JSON.parse(resp.responseText),
            text: () => resp.responseText
          });
        },
        onerror: (err) => reject(new Error(`网络请求失败: ${JSON.stringify(err)}`)),
        ontimeout: () => reject(new Error("请求超时"))
      });
    });
  }
  function buildPrompt(questionType, content, options) {
    const typeLabel = QUESTION_TYPE_LABEL[questionType] || "未知类型";
    const contentText = typeof content === "string" ? content : content?.text || "";
    const optionsText = options.map((o) => `${o.letter}. ${o.text}`).join("\n");
    const systemMessage = '你是一个专业的答题助手。请根据题目内容、图片和选项作答。\n输出规范：\n- 单选题，输出 {"answers": ["A"]}\n- 多选题，输出 {"answers": ["A", "C"]}\n- 判断题，输出 {"answers": ["true"]} 或 {"answers": ["false"]}\n- 填空题，输出 {"answers": ["答案"]}，答案应为题干括号中缺失的内容，只返回答案文本\n- 简答题，输出 {"answers": ["完整答案正文"]}，数组中只放一个字符串，内容准确、条理清楚，可用换行分段，不要返回HTML或Markdown格式\n- 只输出JSON，不要包含任何其他文字、解释或markdown代码块。';
    let userMessage = `题目类型：${typeLabel}
`;
    userMessage += `题目内容：${contentText || "(纯图片题，无文本)"}

`;
    if (options.length > 0) {
      userMessage += `选项：
${optionsText}

`;
    }
    userMessage += "请作答：";
    const parts = [{ type: "text", text: userMessage }];
    const imageGroups = [
      { label: "题干", images: content?.images },
      ...options.map((o) => ({ label: `选项 ${o.letter}`, images: o.images }))
    ];
    for (const group of imageGroups) {
      for (const [index, image] of (group.images || []).entries()) {
        const url = image.src;
        let valid = false;
        try {
          const parsed = new URL(url);
          valid = ["http:", "https:"].includes(parsed.protocol) && url.length <= 8192 || /^data:image\/(?:jpeg|png|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/i.test(url);
        } catch {
        }
        if (!valid) throw new Error(`${group.label}图片 ${index + 1} 地址无效或格式不支持，无法发送给 DeepSeek`);
        parts.push({ type: "text", text: `${group.label}图片 ${index + 1}：` });
        parts.push({ type: "image_url", image_url: { url } });
      }
    }
    logger.log(`提示词已构建，类型: ${typeLabel}`);
    return [
      { role: "system", content: systemMessage },
      { role: "user", content: parts.length > 1 ? parts : userMessage }
    ];
  }
  async function callDeepSeek(apiKey, messages) {
    logger.log("正在调用 DeepSeek API (deepseek-flash high)...");
    const response = await gmFetch(DEEPSEEK_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "deepseek-flash",
        reasoning_effort: "high",
        messages,
        stream: false
      })
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`API 请求失败 (${response.status}): ${errText}`);
    }
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    logger.log(`API 原始回复: ${content}`);
    return data;
  }
  function parseAIResponse(data) {
    let content = data.choices?.[0]?.message?.content?.trim() || "";
    if (!content) {
      throw new Error("AI 返回内容为空");
    }
    let jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    let jsonStr = jsonMatch ? jsonMatch[1].trim() : content;
    jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    jsonStr = jsonMatch ? jsonMatch[0] : jsonStr;
    logger.log(`解析 JSON: ${jsonStr}`);
    const result = JSON.parse(jsonStr);
    if (!result.answers || !Array.isArray(result.answers)) {
      throw new Error(`AI 返回的JSON缺少 answers 字段: ${content}`);
    }
    if (result.answers.length === 0 || result.answers.some((answer) => typeof answer !== "string" || !answer.trim())) {
      throw new Error("AI 返回的 answers 必须包含非空答案字符串");
    }
    logger.log(`AI 答案: [${result.answers.join(", ")}]`);
    return result.answers;
  }

  // src/jev.js
  var JEV_API_URL = "https://api.typesafe.ai/v1/systemone";
  var OPENROUTER_JEV_API_URL = "https://openrouter.ai/api/alpha/decisions";
  var YES_THRESHOLD = 0.7;
  var NO_THRESHOLD = 0.3;
  var JevUncertainError = class extends Error {
  };
  function buildJevRequest(questionType, content, options) {
    if (![QuestionType.SINGLE_CHOICE, QuestionType.MULTI_CHOICE, QuestionType.TRUE_FALSE].includes(questionType)) {
      throw new Error("JeV 仅用于单选、多选和判断题");
    }
    if (hasImages(content, options)) throw new Error("含图片的题目应使用 DeepSeek Flash High");
    if (questionType !== QuestionType.TRUE_FALSE && (options.length < 2 || options.some((option) => !/^[A-Z]$/.test(option.letter)) || new Set(options.map((option) => option.letter)).size !== options.length)) {
      throw new Error("JeV 选择题选项缺失、重复或编号无效");
    }
    const state = {
      question: typeof content === "string" ? content : content?.text || "",
      options: options.map((option) => ({ letter: option.letter, text: option.text }))
    };
    if (!state.question.trim()) throw new Error("JeV 题干文本为空");
    const questions = {};
    if (questionType === QuestionType.SINGLE_CHOICE) {
      questions.answer = {
        type: "choice",
        instructions: "根据 `question` 的题意，从 `options` 中选择唯一应选的答案，注意否定和例外等要求。",
        criteria: Object.fromEntries(options.map((option, index) => [option.letter, `选择选项 ${option.letter}，内容见 \`options[${index}]\`。`]))
      };
    } else if (questionType === QuestionType.TRUE_FALSE) {
      questions.answer = { type: "noul", instructions: "判断题干 `question` 的陈述是否正确。正确为是，错误为否。" };
    } else {
      options.forEach((option, index) => {
        questions[`option_${option.letter.toLowerCase()}`] = {
          type: "noul",
          instructions: `根据 \`question\` 的题意和全部选项，选项 ${option.letter}（\`options[${index}]\`）是否属于应选答案？注意题干中的否定、例外及组合等要求。`
        };
      });
    }
    return { model: "jev-latest", state, questions };
  }
  async function callJev(apiKey, request, provider = "typesafe") {
    if (!["typesafe", "openrouter"].includes(provider)) throw new Error("JeV API 渠道无效");
    const payload = provider === "openrouter" ? { ...request, model: "~typesafe/jev-latest" } : request;
    const body = JSON.stringify(payload);
    if (new TextEncoder().encode(body).length > 32 * 1024 * 1024) throw new Error("JeV 请求超过 32 MiB");
    logger.log(`正在调用 JeV API (${provider}, ${payload.model})...`);
    const response = await gmFetch(provider === "openrouter" ? OPENROUTER_JEV_API_URL : JEV_API_URL, {
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body
    });
    if (!response.ok) throw new Error(`JeV API 请求失败 (${response.status}): ${response.text()}`);
    return response.json();
  }
  function readNoul(answer) {
    const probability = answer?.noul;
    if (answer?.type !== "noul" || !Number.isFinite(probability) || probability < 0 || probability > 1) {
      throw new Error("JeV 返回的判断概率缺失或无效");
    }
    if (probability >= YES_THRESHOLD) return true;
    if (probability <= NO_THRESHOLD) return false;
    throw new JevUncertainError(`JeV 判断不确定 (${probability})`);
  }
  function parseJevResponse(data, questionType, options) {
    let answers;
    if (questionType === QuestionType.SINGLE_CHOICE) {
      const answer = data?.answers?.answer;
      if (answer?.type !== "choice" || !options.some((option) => option.letter === answer.choice) || !Number.isFinite(answer.confidence) || answer.confidence < 0 || answer.confidence > 1) {
        throw new Error("JeV 返回的单选答案或置信度无效");
      }
      if (answer.confidence < YES_THRESHOLD) throw new JevUncertainError(`JeV 单选置信度不足 (${answer.confidence})`);
      answers = [answer.choice];
    } else if (questionType === QuestionType.TRUE_FALSE) {
      answers = [readNoul(data?.answers?.answer) ? "true" : "false"];
    } else if (questionType === QuestionType.MULTI_CHOICE) {
      answers = options.filter((option) => readNoul(data?.answers?.[`option_${option.letter.toLowerCase()}`])).map((option) => option.letter);
      if (answers.length < 2) throw new JevUncertainError("JeV 未返回至少两个可靠的多选答案");
    } else {
      throw new Error("JeV 不支持此题型");
    }
    logger.log(`JeV 答案: [${answers.join(", ")}]`);
    return answers;
  }

  // src/ui.js
  var apiInput;
  var jevApiInput;
  var jevOpenRouterApiInput;
  var jevProviderSelect;
  var questionGrid;
  var autoSubmitCheckbox;
  var useJevCheckbox;
  var answeredSet = /* @__PURE__ */ new Set();
  function getApiKey() {
    return apiInput?.value ?? "";
  }
  function getAutoSubmit() {
    return autoSubmitCheckbox?.checked === true;
  }
  function getJevApiKey() {
    return (getJevProvider() === "openrouter" ? jevOpenRouterApiInput : jevApiInput)?.value ?? "";
  }
  function getJevProvider() {
    return jevProviderSelect?.value || "typesafe";
  }
  function getUseJev() {
    return useJevCheckbox?.checked === true;
  }
  async function createPanel() {
    const panel = document.createElement("div");
    panel.style.cssText = "position:fixed;top:60px;right:16px;z-index:10000;width:360px;max-height:480px;background:#1e1e2e;color:#cdd6f4;border-radius:8px;font-size:13px;box-shadow:0 4px 24px rgba(0,0,0,0.4);display:flex;flex-direction:column;overflow:hidden;";
    const titleBar = document.createElement("div");
    titleBar.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:#313244;cursor:move;user-select:none;border-radius:8px 8px 0 0;flex-shrink:0;";
    titleBar.innerHTML = '<span style="font-weight:bold;">U+助手 控制台</span>';
    const tabNav = document.createElement("div");
    tabNav.style.cssText = "display:flex;border-bottom:1px solid #45475a;flex-shrink:0;";
    function makeTab(label2, active) {
      const t = document.createElement("div");
      t.textContent = label2;
      t.style.cssText = "flex:1;text-align:center;padding:8px 0;cursor:pointer;user-select:none;font-size:13px;";
      if (active) {
        t.style.color = "#89b4fa";
        t.style.borderBottom = "2px solid #89b4fa";
      } else {
        t.style.color = "#a6adc8";
      }
      return t;
    }
    const questionTab = makeTab("题目", true);
    const logTab = makeTab("日志", false);
    const settingsTab = makeTab("设置", false);
    tabNav.appendChild(questionTab);
    tabNav.appendChild(logTab);
    tabNav.appendChild(settingsTab);
    const logPage = document.createElement("div");
    logPage.style.cssText = "display:none;flex-direction:column;flex:1;min-height:0;";
    const btnRow = document.createElement("div");
    btnRow.style.cssText = "padding:8px 12px;flex-shrink:0;";
    const startBtn = document.createElement("button");
    startBtn.textContent = "启动";
    startBtn.style.cssText = "width:100%;padding:6px 0;border:none;border-radius:4px;background:#2563eb;color:#fff;font-size:14px;font-weight:bold;cursor:pointer;";
    btnRow.appendChild(startBtn);
    const logEl2 = document.createElement("div");
    setLogElement(logEl2);
    logEl2.style.cssText = "flex:1;overflow-y:auto;padding:8px 12px;font-family:monospace;font-size:12px;line-height:1.5;min-height:120px;max-height:340px;";
    logPage.appendChild(btnRow);
    logPage.appendChild(logEl2);
    const questionPage = document.createElement("div");
    questionPage.style.cssText = "padding:12px;flex:1;overflow-y:auto;";
    questionGrid = document.createElement("div");
    questionGrid.style.cssText = "display:grid;grid-template-columns:repeat(5, 1fr);gap:10px;";
    questionPage.appendChild(questionGrid);
    const settingsPage = document.createElement("div");
    settingsPage.style.cssText = "display:none;padding:12px;flex:1;min-height:0;overflow-y:auto;";
    const label = document.createElement("div");
    label.textContent = "DeepSeek API Key";
    label.style.cssText = "color:#a6adc8;font-size:12px;margin-bottom:4px;";
    apiInput = document.createElement("input");
    apiInput.type = "password";
    apiInput.setAttribute("aria-label", "DeepSeek API Key");
    apiInput.placeholder = "sk-...";
    apiInput.value = await GM_getValue("deepseek_api_key", "");
    apiInput.style.cssText = "width:100%;padding:6px 8px;border:1px solid #45475a;border-radius:4px;background:#313244;color:#cdd6f4;font-size:13px;outline:none;box-sizing:border-box;";
    apiInput.addEventListener("change", () => {
      GM_setValue("deepseek_api_key", apiInput.value);
    });
    apiInput.addEventListener("input", () => {
      GM_setValue("deepseek_api_key", apiInput.value);
    });
    settingsPage.appendChild(label);
    settingsPage.appendChild(apiInput);
    const providerLabel = label.cloneNode(true);
    providerLabel.textContent = "JeV API 渠道";
    providerLabel.style.marginTop = "12px";
    jevProviderSelect = document.createElement("select");
    jevProviderSelect.setAttribute("aria-label", "JeV API 渠道");
    jevProviderSelect.style.cssText = apiInput.style.cssText;
    for (const [value, text] of [["typesafe", "TypeSafe"], ["openrouter", "OpenRouter"]]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = text;
      jevProviderSelect.appendChild(option);
    }
    const savedProvider = await GM_getValue("jev_provider", "typesafe");
    jevProviderSelect.value = ["typesafe", "openrouter"].includes(savedProvider) ? savedProvider : "typesafe";
    settingsPage.appendChild(providerLabel);
    settingsPage.appendChild(jevProviderSelect);
    const jevLabel = label.cloneNode(true);
    jevLabel.textContent = "JeV API Key（TypeSafe）";
    jevLabel.style.marginTop = "12px";
    jevApiInput = apiInput.cloneNode(true);
    jevApiInput.setAttribute("aria-label", "JeV API Key");
    jevApiInput.placeholder = "填写 TypeSafe JeV API Key";
    jevApiInput.value = await GM_getValue("jev_api_key", "");
    for (const event of ["input", "change"]) {
      jevApiInput.addEventListener(event, () => GM_setValue("jev_api_key", jevApiInput.value));
    }
    settingsPage.appendChild(jevLabel);
    settingsPage.appendChild(jevApiInput);
    const openRouterLabel = jevLabel.cloneNode(true);
    openRouterLabel.textContent = "JeV API Key（OpenRouter）";
    jevOpenRouterApiInput = jevApiInput.cloneNode(true);
    jevOpenRouterApiInput.setAttribute("aria-label", "JeV OpenRouter API Key");
    jevOpenRouterApiInput.placeholder = "填写 OpenRouter API Key";
    jevOpenRouterApiInput.value = await GM_getValue("jev_openrouter_api_key", "");
    for (const event of ["input", "change"]) {
      jevOpenRouterApiInput.addEventListener(event, () => GM_setValue("jev_openrouter_api_key", jevOpenRouterApiInput.value));
    }
    settingsPage.appendChild(openRouterLabel);
    settingsPage.appendChild(jevOpenRouterApiInput);
    function updateProvider() {
      const openRouter = getJevProvider() === "openrouter";
      jevLabel.style.display = jevApiInput.style.display = openRouter ? "none" : "";
      openRouterLabel.style.display = jevOpenRouterApiInput.style.display = openRouter ? "" : "none";
    }
    jevProviderSelect.addEventListener("change", () => {
      GM_setValue("jev_provider", getJevProvider());
      updateProvider();
    });
    updateProvider();
    const autoRow = document.createElement("div");
    autoRow.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-top:12px;";
    const autoLabel = document.createElement("span");
    autoLabel.textContent = "自动答题";
    autoLabel.style.cssText = "color:#a6adc8;font-size:12px;";
    const autoToggle = document.createElement("label");
    autoToggle.style.cssText = "position:relative;display:inline-block;width:40px;height:22px;flex-shrink:0;";
    const autoCheckbox = document.createElement("input");
    autoCheckbox.type = "checkbox";
    autoCheckbox.setAttribute("aria-label", "自动答题");
    autoCheckbox.checked = await GM_getValue("auto_answer", false);
    autoCheckbox.style.cssText = "opacity:0;width:0;height:0;";
    const slider = document.createElement("span");
    slider.style.cssText = "position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:#45475a;border-radius:22px;transition:0.2s;";
    const sliderDot = document.createElement("span");
    sliderDot.style.cssText = "position:absolute;height:18px;width:18px;left:2px;bottom:2px;background:#cdd6f4;border-radius:50%;transition:0.2s;";
    slider.appendChild(sliderDot);
    autoCheckbox.addEventListener("change", () => {
      GM_setValue("auto_answer", autoCheckbox.checked);
      if (autoCheckbox.checked) {
        slider.style.background = "#2563eb";
        sliderDot.style.left = "20px";
      } else {
        slider.style.background = "#45475a";
        sliderDot.style.left = "2px";
      }
    });
    if (autoCheckbox.checked) {
      slider.style.background = "#2563eb";
      sliderDot.style.left = "20px";
    }
    autoToggle.appendChild(autoCheckbox);
    autoToggle.appendChild(slider);
    autoRow.appendChild(autoLabel);
    autoRow.appendChild(autoToggle);
    settingsPage.appendChild(autoRow);
    async function addToggle(text, key) {
      const row = autoRow.cloneNode(true);
      row.firstElementChild.textContent = text;
      const checkbox = row.querySelector("input");
      checkbox.setAttribute("aria-label", text);
      checkbox.checked = await GM_getValue(key, false) === true;
      const toggleSlider = checkbox.nextElementSibling;
      function updateToggle() {
        toggleSlider.style.background = checkbox.checked ? "#2563eb" : "#45475a";
        toggleSlider.firstElementChild.style.left = checkbox.checked ? "20px" : "2px";
      }
      checkbox.addEventListener("change", () => {
        GM_setValue(key, checkbox.checked);
        updateToggle();
      });
      updateToggle();
      settingsPage.appendChild(row);
      return checkbox;
    }
    useJevCheckbox = await addToggle("选择题使用 JeV", "use_jev");
    const jevHint = document.createElement("div");
    jevHint.textContent = "纯文本单选、多选、判断优先 JeV；置信度不足、图片题及其他题型使用 DeepSeek Flash High。";
    jevHint.style.cssText = "margin-top:6px;color:#a6adc8;font-size:12px;";
    settingsPage.appendChild(jevHint);
    autoSubmitCheckbox = await addToggle("自动提交", "auto_submit");
    const submitHint = document.createElement("div");
    submitHint.textContent = "开启后，全部题目作答成功将自动提交作业。";
    submitHint.style.cssText = "margin-top:6px;color:#a6adc8;font-size:12px;";
    settingsPage.appendChild(submitHint);
    const contentArea = document.createElement("div");
    contentArea.style.cssText = "display:flex;flex-direction:column;flex:1;min-height:0;";
    contentArea.appendChild(logPage);
    contentArea.appendChild(questionPage);
    contentArea.appendChild(settingsPage);
    const allPages = { log: logPage, question: questionPage, settings: settingsPage };
    const allTabs = { log: logTab, question: questionTab, settings: settingsTab };
    function switchTab(active) {
      Object.values(allTabs).forEach((t) => {
        t.style.color = "#a6adc8";
        t.style.borderBottom = "none";
      });
      Object.values(allPages).forEach((p) => {
        p.style.display = "none";
      });
      allTabs[active].style.color = "#89b4fa";
      allTabs[active].style.borderBottom = "2px solid #89b4fa";
      allPages[active].style.display = "";
    }
    logTab.addEventListener("click", () => switchTab("log"));
    questionTab.addEventListener("click", () => switchTab("question"));
    settingsTab.addEventListener("click", () => switchTab("settings"));
    panel.appendChild(titleBar);
    panel.appendChild(tabNav);
    panel.appendChild(contentArea);
    document.body.appendChild(panel);
    let dragging = false, offX, offY;
    titleBar.addEventListener("mousedown", (e) => {
      dragging = true;
      const rect = panel.getBoundingClientRect();
      offX = e.clientX - rect.left;
      offY = e.clientY - rect.top;
    });
    window.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      panel.style.left = e.clientX - offX + "px";
      panel.style.top = e.clientY - offY + "px";
      panel.style.right = "auto";
    });
    window.addEventListener("mouseup", () => {
      dragging = false;
    });
    return startBtn;
  }
  function buildAnswerSheet(questions) {
    if (!questionGrid) return;
    questionGrid.innerHTML = "";
    questions.forEach((num) => {
      const cell = document.createElement("div");
      cell.style.cssText = "aspect-ratio:1;display:flex;align-items:center;justify-content:center;border:2px solid #89b4fa;border-radius:8px;font-size:14px;font-weight:bold;cursor:default;user-select:none;transition:background 0.2s;";
      cell.textContent = num;
      cell.dataset.question = num;
      if (answeredSet.has(num)) {
        cell.style.background = "#a6e3a1";
        cell.style.color = "#1e1e2e";
      } else {
        cell.style.background = "#ffffff";
        cell.style.color = "#1e1e2e";
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
      cell.style.background = "#a6e3a1";
      cell.style.color = "#1e1e2e";
    }
    logger.log(`题目 ${num} 已作答`);
  }
  function getAnswered() {
    return [...answeredSet].sort((a, b) => a - b);
  }
  function isAnswered(num) {
    return answeredSet.has(num);
  }

  // src/submission.js
  var submitting = false;
  function findButton(root, text) {
    return Array.from(root.querySelectorAll("button")).find((button) => button.textContent.trim() === text && button.getClientRects().length > 0);
  }
  async function submitHomework() {
    if (!getAutoSubmit() || submitting) return;
    submitting = true;
    let clicked = false;
    const start = Date.now();
    try {
      while (Date.now() - start < 15e3) {
        if (!getAutoSubmit()) return;
        if (!clicked) {
          const button = findButton(document, "提交作业");
          if (!button) throw new Error("未找到提交作业按钮，未自动提交");
          if (!button.disabled && !button.classList.contains("is-loading")) {
            button.click();
            clicked = true;
            logger.log("已点击提交作业，等待平台保存答案并确认");
          }
        } else {
          const box = Array.from(document.querySelectorAll(".el-message-box")).find((el) => el.getClientRects().length > 0);
          const message = box?.querySelector(".el-message-box__message")?.textContent.trim();
          if (message && /^还有\d+题未做，是否提交[！!？?]$/.test(message)) {
            findButton(box, "取消")?.click();
            logger.warn("平台提示仍有未做题目，已取消自动提交");
            return;
          }
          if (message && /^作业已经全部做完，是否提交[？?]$/.test(message)) {
            const confirm = findButton(box, "确定");
            if (confirm && !confirm.disabled && !confirm.classList.contains("is-loading")) {
              confirm.click();
              logger.log("已确认提交作业，请查看平台提交结果");
              return;
            }
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error("等待作业提交按钮或确认弹窗超时，未确认提交");
    } catch (error) {
      logger.error(error.message);
    } finally {
      submitting = false;
    }
  }

  // src/main.js
  async function solveQuestion(questionType, content, options) {
    const useJev = getUseJev() && !hasImages(content, options) && [QuestionType.SINGLE_CHOICE, QuestionType.MULTI_CHOICE, QuestionType.TRUE_FALSE].includes(questionType);
    const jevProvider = getJevProvider();
    const apiKey = (useJev ? getJevApiKey() : getApiKey()).trim();
    if (!apiKey) {
      logger.warn(`未设置 ${useJev ? `JeV (${jevProvider})` : "DeepSeek"} API Key，请在设置选项卡中填写`);
      return null;
    }
    const label = QUESTION_TYPE_LABEL[questionType];
    if (!label) {
      logger.warn(`题目类型 ${questionType} 暂不支持 AI 作答`);
      return null;
    }
    try {
      let answers;
      if (useJev) {
        const request = buildJevRequest(questionType, content, options);
        const data = await callJev(apiKey, request, jevProvider);
        try {
          answers = parseJevResponse(data, questionType, options);
        } catch (error) {
          if (!(error instanceof JevUncertainError)) throw error;
          logger.warn(`${error.message}，改由 DeepSeek Flash High 作答`);
        }
      }
      if (!answers) {
        const deepSeekKey = useJev ? getApiKey().trim() : apiKey;
        if (!deepSeekKey) throw new Error("未设置 DeepSeek API Key，无法接管 JeV 不确定的题目，请在设置中填写");
        const messages = buildPrompt(questionType, content, options);
        const data = await callDeepSeek(deepSeekKey, messages);
        answers = parseAIResponse(data);
      }
      await applyAnswer(questionType, answers);
      logger.log(`答题完成: ${answers.join(", ")}`);
      return answers;
    } catch (err) {
      logger.error(err.message);
      return null;
    }
  }
  async function autoAnswer() {
    const list = detectQuestionList();
    if (list.length === 0) {
      logger.warn("题目列表为空，无法自动作答");
      return;
    }
    buildAnswerSheet(list);
    logger.log(`自动答题开始，共 ${list.length} 题`);
    const completed = /* @__PURE__ */ new Set();
    for (let i = 0; i < list.length; i++) {
      const currentNum = detectQuestionNumber();
      if (currentNum === null) {
        logger.warn("未检测到当前题目序号，停止作答");
        break;
      }
      logger.log(`正在作答第 ${currentNum} 题 (${i + 1}/${list.length})`);
      const type = detectQuestionTypes();
      const content = detectQuestionContent();
      let options = null;
      if (type === null || content === null) {
        logger.warn("题目信息不完整，跳过");
      } else if (type === QuestionType.TRUE_FALSE) {
        options = [
          { letter: "true", text: "正确", images: [] },
          { letter: "false", text: "错误", images: [] }
        ];
      } else if (type === QuestionType.FILL_BLANK || type === QuestionType.SHORT_ANSWER) {
        options = [];
      } else {
        options = detectOptions();
        if (options.length === 0) {
          logger.warn(`第 ${currentNum} 题未找到选项，跳过`);
          options = null;
        }
      }
      if (options) {
        const result = await solveQuestion(type, content, options);
        if (result) {
          markAnswered(currentNum);
          completed.add(currentNum);
        }
      }
      if (i >= list.length - 1) {
        logger.log("所有题目作答完毕");
        break;
      }
      await new Promise((r) => setTimeout(r, 800));
      const nextBtn = findNextButton();
      if (!nextBtn) {
        logger.warn("未找到下一题按钮，停止作答");
        break;
      }
      nextBtn.click();
      if (!await waitForNextQuestion(currentNum, content ? content.text : "")) {
        logger.warn("题目没有切换，停止作答");
        break;
      }
    }
    if (list.every((num) => completed.has(num))) await submitHomework();
  }
  async function detectAll() {
    const list = detectQuestionList();
    const currentNum = detectQuestionNumber();
    if (list.length > 0) {
      buildAnswerSheet(list);
    }
    const type = detectQuestionTypes();
    if (type === null) {
      logger.warn("题目类型未知，无法作答");
      return;
    }
    const content = detectQuestionContent();
    if (content === null) {
      logger.warn("题目内容为空，无法作答");
      return;
    }
    let options;
    if (type === QuestionType.TRUE_FALSE) {
      options = [
        { letter: "true", text: "正确", images: [] },
        { letter: "false", text: "错误", images: [] }
      ];
      logger.log("判断题，使用固定选项: true. 正确, false. 错误");
    } else if (type === QuestionType.FILL_BLANK || type === QuestionType.SHORT_ANSWER) {
      options = [];
    } else {
      options = detectOptions();
      if (options.length === 0) {
        logger.warn("未找到选项，无法作答");
        return;
      }
    }
    const result = await solveQuestion(type, content, options);
    if (result) {
      markAnswered(currentNum);
      if (list.length > 0 && list.every(isAnswered)) await submitHomework();
    }
  }
  async function main() {
    const startBtn = await createPanel();
    startBtn.addEventListener("click", detectAll);
    window.__uplus = {
      selectOptions,
      detectOptions,
      detectQuestionTypes,
      detectQuestionList,
      detectQuestionNumber,
      detectAll,
      buildPrompt,
      callDeepSeek,
      parseAIResponse,
      solveQuestion,
      buildAnswerSheet,
      markAnswered,
      getAnswered,
      isAnswered,
      autoAnswer,
      findNextButton,
      waitForNextQuestion,
      QuestionType,
      logger,
      extractImagesFromElement,
      hasImages,
      get apiKey() {
        return getApiKey();
      }
    };
    if (await GM_getValue("auto_answer", false)) {
      logger.log("自动答题已启用，等待页面就绪...");
      if (await waitForReady()) {
        await autoAnswer();
      }
    }
  }
  main().catch((err) => logger.error(err.message));
})();
