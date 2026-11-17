import { QuestionType, QUESTION_TYPE_LABEL, detectQuestionList, detectQuestionNumber,
  detectQuestionTypes, detectQuestionContent, detectOptions, extractImagesFromElement,
  hasImages, findNextButton, waitForNextQuestion, waitForReady } from './questions.js';
import { selectOptions, applyAnswer } from './answers.js';
import { buildPrompt, callDeepSeek, parseAIResponse } from './api.js';
import { buildJevRequest, callJev, parseJevResponse, JevUncertainError } from './jev.js';
import { createPanel, getApiKey, getJevApiKey, getJevProvider, getUseJev, buildAnswerSheet, markAnswered, getAnswered, isAnswered } from './ui.js';
import { logger } from './logger.js';
import { submitHomework } from './submission.js';

async function solveQuestion(questionType, content, options) {
  const useJev = getUseJev() && !hasImages(content, options) &&
    [QuestionType.SINGLE_CHOICE, QuestionType.MULTI_CHOICE, QuestionType.TRUE_FALSE].includes(questionType);
  const jevProvider = getJevProvider();
  const apiKey = (useJev ? getJevApiKey() : getApiKey()).trim();
  if (!apiKey) {
    logger.warn(`未设置 ${useJev ? `JeV (${jevProvider})` : 'DeepSeek'} API Key，请在设置选项卡中填写`);
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
      if (!deepSeekKey) throw new Error('未设置 DeepSeek API Key，无法接管 JeV 不确定的题目，请在设置中填写');
      const messages = buildPrompt(questionType, content, options);
      const data = await callDeepSeek(deepSeekKey, messages);
      answers = parseAIResponse(data);
    }

    await applyAnswer(questionType, answers);
    logger.log(`答题完成: ${answers.join(', ')}`);

    return answers;
  } catch (err) {
    logger.error(err.message);
    return null;
  }
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
  const completed = new Set();

  for (let i = 0; i < list.length; i++) {
    const currentNum = detectQuestionNumber();
    if (currentNum === null) {
      logger.warn('未检测到当前题目序号，停止作答');
      break;
    }

    logger.log(`正在作答第 ${currentNum} 题 (${i + 1}/${list.length})`);

    const type = detectQuestionTypes();
    const content = detectQuestionContent();
    let options = null;
    if (type === null || content === null) {
      logger.warn('题目信息不完整，跳过');
    } else if (type === QuestionType.TRUE_FALSE) {
      options = [
        { letter: 'true', text: '正确', images: [] },
        { letter: 'false', text: '错误', images: [] },
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

    // 跳过时 options 为 null，但仍要切下一题，否则会一直重复处理当前题
    if (options) {
      const result = await solveQuestion(type, content, options);
      if (result) {
        markAnswered(currentNum);
        completed.add(currentNum);
      }
    }

    // 最后一题
    if (i >= list.length - 1) {
      logger.log('所有题目作答完毕');
      break;
    }

    // 等页面保存完答案再切题，避免下一题在渲染中途被读到
    await new Promise(r => setTimeout(r, 800));
    const nextBtn = findNextButton();
    if (!nextBtn) {
      logger.warn('未找到下一题按钮，停止作答');
      break;
    }
    nextBtn.click();
    if (!await waitForNextQuestion(currentNum, content ? content.text : '')) {
      logger.warn('题目没有切换，停止作答');
      break;
    }
  }
  if (list.every(num => completed.has(num))) await submitHomework();
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
      { letter: 'true', text: '正确', images: [] },
      { letter: 'false', text: '错误', images: [] },
    ];
    logger.log('判断题，使用固定选项: true. 正确, false. 错误');
  } else if (type === QuestionType.FILL_BLANK || type === QuestionType.SHORT_ANSWER) {
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
    if (list.length > 0 && list.every(isAnswered)) await submitHomework();
  }
}

async function main() {
  const startBtn = await createPanel();
  startBtn.addEventListener('click', detectAll);

  window.__uplus = {
    selectOptions, detectOptions, detectQuestionTypes, detectQuestionList, detectQuestionNumber, detectAll,
    buildPrompt, callDeepSeek, parseAIResponse, solveQuestion,
    buildAnswerSheet, markAnswered, getAnswered, isAnswered,
    autoAnswer, findNextButton, waitForNextQuestion,
    QuestionType, logger, extractImagesFromElement, hasImages,
    get apiKey() { return getApiKey(); },
  };

  if (await GM_getValue('auto_answer', false)) {
    logger.log('自动答题已启用，等待页面就绪...');
    if (await waitForReady()) {
      await autoAnswer();
    }
  }
}

main().catch(err => logger.error(err.message));
