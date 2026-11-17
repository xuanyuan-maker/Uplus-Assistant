import { QUESTION_TYPE_LABEL } from './questions.js';
import { logger } from './logger.js';

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';

export function gmFetch(url, options) {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: options.method || 'POST',
      url,
      headers: options.headers || {},
      data: options.body || '',
      anonymous: true,
      timeout: 180000,
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
export function buildPrompt(questionType, content, options) {
  const typeLabel = QUESTION_TYPE_LABEL[questionType] || '未知类型';
  const contentText = typeof content === 'string' ? content : (content?.text || '');
  const optionsText = options.map(o => `${o.letter}. ${o.text}`).join('\n');

  const systemMessage =
    '你是一个专业的答题助手。请根据题目内容、图片和选项作答。\n' +
    '输出规范：\n' +
    '- 单选题，输出 {"answers": ["A"]}\n' +
    '- 多选题，输出 {"answers": ["A", "C"]}\n' +
    '- 判断题，输出 {"answers": ["true"]} 或 {"answers": ["false"]}\n' +
    '- 填空题，输出 {"answers": ["答案"]}，答案应为题干括号中缺失的内容，只返回答案文本\n' +
    '- 简答题，输出 {"answers": ["完整答案正文"]}，数组中只放一个字符串，内容准确、条理清楚，可用换行分段，不要返回HTML或Markdown格式\n' +
    '- 只输出JSON，不要包含任何其他文字、解释或markdown代码块。';

  let userMessage = `题目类型：${typeLabel}\n`;
  userMessage += `题目内容：${contentText || '(纯图片题，无文本)'}\n\n`;
  if (options.length > 0) {
    userMessage += `选项：\n${optionsText}\n\n`;
  }
  userMessage += '请作答：';

  const parts = [{ type: 'text', text: userMessage }];
  const imageGroups = [
    { label: '题干', images: content?.images },
    ...options.map(o => ({ label: `选项 ${o.letter}`, images: o.images })),
  ];
  for (const group of imageGroups) {
    for (const [index, image] of (group.images || []).entries()) {
      const url = image.src;
      let valid = false;
      try {
        const parsed = new URL(url);
        valid = (['http:', 'https:'].includes(parsed.protocol) && url.length <= 8192) ||
          /^data:image\/(?:jpeg|png|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/i.test(url);
      } catch {}
      if (!valid) throw new Error(`${group.label}图片 ${index + 1} 地址无效或格式不支持，无法发送给 DeepSeek`);
      parts.push({ type: 'text', text: `${group.label}图片 ${index + 1}：` });
      parts.push({ type: 'image_url', image_url: { url } });
    }
  }

  logger.log(`提示词已构建，类型: ${typeLabel}`);
  return [
    { role: 'system', content: systemMessage },
    { role: 'user', content: parts.length > 1 ? parts : userMessage },
  ];
}

// 调用 DeepSeek API
export async function callDeepSeek(apiKey, messages) {
  logger.log('正在调用 DeepSeek API (deepseek-flash high)...');

  const response = await gmFetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-flash',
      reasoning_effort: 'high',
      messages,
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
export function parseAIResponse(data) {
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
  if (result.answers.length === 0 || result.answers.some(answer => typeof answer !== 'string' || !answer.trim())) {
    throw new Error('AI 返回的 answers 必须包含非空答案字符串');
  }

  logger.log(`AI 答案: [${result.answers.join(', ')}]`);
  return result.answers;
}
