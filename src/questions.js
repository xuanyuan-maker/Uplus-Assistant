import { logger } from './logger.js';

const QUESTION_TYPE_SELECTOR = '.bg-athena-primary.font-bold';
// 旧版题干是 .ck-content.qst-html；2026-10 改版后只读预览为 .ck-content.qck-content
const QUESTION_CONTENT_SELECTOR = '.ck-content.qst-html, .ck-content.qck-content, .qst-html, .qck-content';
const QUESTION_OPTIONS_SELECTOR = '.option-select, .flex-row.align-center:has(.ck-content)';

export const QuestionType = Object.freeze({
  SINGLE_CHOICE: 0,   // 单选题
  MULTI_CHOICE: 1,   // 多选题
  TRUE_FALSE: 2,   // 判断题
  FILL_BLANK: 4,   // 填空题
  SHORT_ANSWER: 5,   // 简答题
});

const QUESTION_TYPE_MAP = {
  '单选题': QuestionType.SINGLE_CHOICE,
  '多选题': QuestionType.MULTI_CHOICE,
  '判断题': QuestionType.TRUE_FALSE,
  '填空题': QuestionType.FILL_BLANK,
  '简答题': QuestionType.SHORT_ANSWER,
};

const QUESTION_LIST_SELECTOR = '.el-scrollbar__view';
const QUESTION_NUMBER_SELECTOR = '.text-size-20px.font-bold.color-text-primary';
const NEXT_BUTTON_TEXT = '下一题';

// ---- 题目列表 ----
export function detectQuestionList() {
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
export function detectQuestionNumber(quiet = false) {
  const el = document.querySelector(QUESTION_NUMBER_SELECTOR);
  if (!el) {
    if (!quiet) logger.warn('未找到题目序号');
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

// ---- 题目检测 ----
export function detectQuestionTypes() {
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

export function detectQuestionContent(quiet = false) {
  const el = document.querySelector(QUESTION_CONTENT_SELECTOR);
  if (!el) {
    if (!quiet) logger.warn('没有找到任何题目内容');
    return null;
  }

  const text = el.textContent.trim();
  const images = extractImagesFromElement(el);
  if (!quiet) {
    if (images.length > 0) {
      logger.log(`题目图片: ${images.map(i => i.filename).join(', ')}`);
    }
    logger.log(`题目内容: ${text || '(纯图片)'}`);
  }
  return { text, images, el };
}

export function detectOptions() {
  const containers = document.querySelectorAll(QUESTION_OPTIONS_SELECTOR);
  if (containers.length === 0) {
    logger.warn('未找到选项');
    return [];
  }

  const options = [];
  containers.forEach((container) => {
    // 优先查找 radio/checkbox input（旧结构：.option-select 内）
    const input = container.querySelector('.el-radio__original, .el-checkbox__original');
    let letter = input ? input.value : '';
    // 如果没有 input，从文本中提取选项字母（新结构：A、B、C、D 等）
    if (!letter) {
      const textNodes = [];
      for (const node of container.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
          const t = node.textContent.trim();
          if (t) textNodes.push(t);
        }
      }
      // 匹配 "A、" "A." "A " 等格式
      for (const t of textNodes) {
        const m = t.match(/^([A-Z])[、.\s]*/);
        if (m) { letter = m[1]; break; }
      }
    }

    const textEl = container.querySelector(QUESTION_CONTENT_SELECTOR);
    const text = textEl ? textEl.textContent.trim() : '';
    const images = extractImagesFromElement(textEl || container);
    options.push({ letter, text, images });
    if (images.length > 0) {
      logger.log(`${letter}. ${text || '(图片选项)'} [图片: ${images.map(i => i.filename).join(', ')}]`);
    } else {
      logger.log(`${letter}. ${text}`);
    }
  });

  return options;
}

// ---- 图片工具 ----
function getFilenameFromUrl(url) {
  try {
    const decoded = decodeURIComponent(url);
    const pathname = new URL(decoded).pathname;
    const segments = pathname.split('/').filter(Boolean);
    return segments[segments.length - 1] || '';
  } catch {
    const parts = url.split('/').filter(Boolean);
    return parts[parts.length - 1] || '';
  }
}

export function extractImagesFromElement(el) {
  if (!el) return [];
  const imgs = el.querySelectorAll('img');
  return Array.from(imgs).map(img => ({
    src: img.currentSrc || img.src || img.getAttribute('src') || '',
    alt: img.alt || '',
    filename: getFilenameFromUrl(img.currentSrc || img.src || img.getAttribute('src') || ''),
  }));
}

export function hasImages(content, options) {
  const qHas = content && content.images && content.images.length > 0;
  const oHas = options && options.some(o => o.images && o.images.length > 0);
  return qHas || oHas;
}

export const QUESTION_TYPE_LABEL = {
  [QuestionType.SINGLE_CHOICE]: '单选题',
  [QuestionType.MULTI_CHOICE]: '多选题',
  [QuestionType.TRUE_FALSE]: '判断题',
  [QuestionType.FILL_BLANK]: '填空题',
  [QuestionType.SHORT_ANSWER]: '简答题',
};

// 查找下一题按钮
export function findNextButton() {
  const buttons = document.querySelectorAll('button.el-button');
  for (const btn of buttons) {
    if (btn.textContent.includes(NEXT_BUTTON_TEXT)) {
      return btn;
    }
  }
  return null;
}

// 等待题目切换：序号会先变，题干/选项是异步渲染的，必须等题干也换了再读
export async function waitForNextQuestion(prevNum, prevText = '', timeout = 15000) {
  const start = Date.now();
  let numChangedAt = 0;
  while (Date.now() - start < timeout) {
    const num = detectQuestionNumber(true);
    if (num !== null && num !== prevNum) {
      if (!numChangedAt) numChangedAt = Date.now();
      const content = detectQuestionContent(true);
      const text = content ? content.text : '';
      if (text && text !== prevText) {
        await new Promise(r => setTimeout(r, 300)); // 等选项/表单一起渲染完
        return true;
      }
      // 极端情况：前后题干完全相同，最多再等 8 秒就继续
      if (Date.now() - numChangedAt > 8000) return true;
    }
    await new Promise(r => setTimeout(r, 200));
  }
  logger.warn('等待题目切换超时');
  return false;
}

// 等待页面就绪
export async function waitForReady(timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const typeEl = document.querySelector(QUESTION_TYPE_SELECTOR);
    const contentEl = document.querySelector(QUESTION_CONTENT_SELECTOR);
    const listEl = document.querySelector(QUESTION_LIST_SELECTOR);
    if (typeEl?.textContent.trim() && contentEl && listEl?.querySelector('[class*="scale-x-80"]')) {
      logger.log('页面就绪');
      return true;
    }
    await new Promise(r => setTimeout(r, 200));
  }
  logger.warn('等待页面就绪超时');
  return false;
}
