import { QuestionType, hasImages } from './questions.js';
import { gmFetch } from './api.js';
import { logger } from './logger.js';

const JEV_API_URL = 'https://api.typesafe.ai/v1/systemone';
const OPENROUTER_JEV_API_URL = 'https://openrouter.ai/api/alpha/decisions';
// shortcut: 暂用 0.7/0.3 判定阈值，积累带标准答案的实测数据后再校准。
const YES_THRESHOLD = 0.7;
const NO_THRESHOLD = 0.3;

export function buildJevRequest(questionType, content, options) {
  if (![QuestionType.SINGLE_CHOICE, QuestionType.MULTI_CHOICE, QuestionType.TRUE_FALSE].includes(questionType)) {
    throw new Error('JeV 仅用于单选、多选和判断题');
  }
  if (hasImages(content, options)) throw new Error('含图片的题目应使用 DeepSeek Flash High');
  if (questionType !== QuestionType.TRUE_FALSE && (options.length < 2 ||
    options.some(option => !/^[A-Z]$/.test(option.letter)) || new Set(options.map(option => option.letter)).size !== options.length)) {
    throw new Error('JeV 选择题选项缺失、重复或编号无效');
  }
  const state = {
    question: typeof content === 'string' ? content : (content?.text || ''),
    options: options.map(option => ({ letter: option.letter, text: option.text })),
  };
  if (!state.question.trim()) throw new Error('JeV 题干文本为空');

  const questions = {};
  if (questionType === QuestionType.SINGLE_CHOICE) {
    questions.answer = {
      type: 'choice',
      instructions: '根据 `question` 的题意，从 `options` 中选择唯一应选的答案，注意否定和例外等要求。',
      criteria: Object.fromEntries(options.map((option, index) => [option.letter, `选择选项 ${option.letter}，内容见 \`options[${index}]\`。`])),
    };
  } else if (questionType === QuestionType.TRUE_FALSE) {
    questions.answer = { type: 'noul', instructions: '判断题干 `question` 的陈述是否正确。正确为是，错误为否。' };
  } else {
    options.forEach((option, index) => {
      questions[`option_${option.letter.toLowerCase()}`] = {
        type: 'noul',
        instructions: `根据 \`question\` 的题意和全部选项，选项 ${option.letter}（\`options[${index}]\`）是否属于应选答案？注意题干中的否定、例外及组合等要求。`,
      };
    });
  }
  return { model: 'jev-latest', state, questions };
}

export async function callJev(apiKey, request, provider = 'typesafe') {
  if (!['typesafe', 'openrouter'].includes(provider)) throw new Error('JeV API 渠道无效');
  const payload = provider === 'openrouter' ? { ...request, model: '~typesafe/jev-latest' } : request;
  const body = JSON.stringify(payload);
  if (new TextEncoder().encode(body).length > 32 * 1024 * 1024) throw new Error('JeV 请求超过 32 MiB');
  logger.log(`正在调用 JeV API (${provider}, ${payload.model})...`);
  const response = await gmFetch(provider === 'openrouter' ? OPENROUTER_JEV_API_URL : JEV_API_URL, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body,
  });
  if (!response.ok) throw new Error(`JeV API 请求失败 (${response.status}): ${response.text()}`);
  return response.json();
}

function readNoul(answer) {
  const probability = answer?.noul;
  if (answer?.type !== 'noul' || !Number.isFinite(probability) || probability < 0 || probability > 1) {
    throw new Error('JeV 返回的判断概率缺失或无效');
  }
  if (probability >= YES_THRESHOLD) return true;
  if (probability <= NO_THRESHOLD) return false;
  throw new Error(`JeV 判断不确定 (${probability})，本题跳过`);
}

export function parseJevResponse(data, questionType, options) {
  let answers;
  if (questionType === QuestionType.SINGLE_CHOICE) {
    const answer = data?.answers?.answer;
    if (answer?.type !== 'choice' || !options.some(option => option.letter === answer.choice) ||
      !Number.isFinite(answer.confidence) || answer.confidence < 0 || answer.confidence > 1) {
      throw new Error('JeV 返回的单选答案或置信度无效');
    }
    if (answer.confidence < YES_THRESHOLD) throw new Error(`JeV 单选置信度不足 (${answer.confidence})，本题跳过`);
    answers = [answer.choice];
  } else if (questionType === QuestionType.TRUE_FALSE) {
    answers = [readNoul(data?.answers?.answer) ? 'true' : 'false'];
  } else if (questionType === QuestionType.MULTI_CHOICE) {
    answers = options.filter(option => readNoul(data?.answers?.[`option_${option.letter.toLowerCase()}`])).map(option => option.letter);
    if (answers.length < 2) throw new Error('JeV 未返回至少两个可靠的多选答案，本题跳过');
  } else {
    throw new Error('JeV 不支持此题型');
  }
  logger.log(`JeV 答案: [${answers.join(', ')}]`);
  return answers;
}
