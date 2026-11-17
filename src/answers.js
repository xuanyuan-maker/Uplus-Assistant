import { QuestionType } from './questions.js';
import { logger } from './logger.js';

// 页面保存/刷新时会短暂卸载表单，点击/填框前先等元素出现
async function waitForNodes(selector, timeout = 3000) {
  const start = Date.now();
  let nodes = document.querySelectorAll(selector);
  while (nodes.length === 0 && Date.now() - start < timeout) {
    await new Promise(r => setTimeout(r, 100));
    nodes = document.querySelectorAll(selector);
  }
  return nodes;
}

export async function selectOptions(answers, questionType) {
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
    // 方法 1: 通过 radio/checkbox input value 查找（旧结构）
    let input = (await waitForNodes(`${inputSelector}[value="${letter}"]`))[0];
    if (input) {
      input.click();
      selected.push(letter);
      if (isMulti) await delay(50);
      continue;
    }

    // 方法 2: 在新结构 .flex-row.align-center 中按字母匹配并点击
    const containers = await waitForNodes('.flex-row.align-center:has(.ck-content)');
    let clicked = false;
    for (const container of containers) {
      // 从文本节点提取字母
      for (const node of container.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
          const m = node.textContent.trim().match(/^([A-Z])[、.\s]*/);
          if (m && m[1] === letter) {
            // 优先点击可能存在的隐藏 input，否则点击整个容器
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
    throw new Error(`未找到任何选项: ${answers.join(', ')}`);
  }

  logger.log(`已选择: ${selected.join(', ')}`);
  return selected;
}

export async function fillBlankAnswer(answers) {
  const textareas = await waitForNodes('.el-textarea__inner', 5000);
  if (textareas.length === 0) {
    throw new Error('未找到填空题输入框');
  }
  if (answers.length !== textareas.length) {
    throw new Error(`填空题答案数量不匹配: ${textareas.length} 个空，收到 ${answers.length} 个答案`);
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

export async function fillShortAnswer(answers) {
  if (answers.length !== 1 || typeof answers[0] !== 'string' || !answers[0].trim()) {
    throw new Error('简答题需要一个非空的完整答案字符串');
  }

  const selector = '.q-ckeditor--document .ck-editor__editable[contenteditable="true"]';
  if ((await waitForNodes(selector, 5000)).length !== 1) {
    throw new Error('未找到唯一可编辑的简答题输入框');
  }
  // CKEditor 的数据模型属于页面，通过页面实例写入才能触发平台保存。
  const editable = unsafeWindow.document.querySelector(selector);
  const editor = editable?.ckeditorInstance;
  if (!editor?.setData || !editor?.getData || editor.isReadOnly) {
    throw new Error('简答题编辑器尚未就绪或为只读，请稍后重试');
  }

  const text = answers[0];
  const paragraph = document.createElement('p');
  paragraph.textContent = text;
  const html = paragraph.outerHTML.replace(/\r\n|\r|\n/g, '<br>');
  editor.setData(html);
  if (editable.textContent.replace(/\s/g, '') !== text.replace(/\s/g, '')) {
    throw new Error('简答题答案未完整写入编辑器');
  }
  editable.dispatchEvent(new Event('input', { bubbles: true }));
  editable.dispatchEvent(new Event('change', { bubbles: true }));
  editable.blur();
  logger.log('已填入简答题答案');
}

export async function applyAnswer(questionType, answers) {
  if (questionType === QuestionType.FILL_BLANK) {
    await fillBlankAnswer(answers);
  } else if (questionType === QuestionType.SHORT_ANSWER) {
    await fillShortAnswer(answers);
  } else {
    await selectOptions(answers, questionType);
  }
}
