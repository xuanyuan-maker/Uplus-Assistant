import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { Script } from 'node:vm';
import { buildPrompt, callDeepSeek, parseAIResponse } from '../src/api.js';
import { QuestionType } from '../src/questions.js';
import { logger } from '../src/logger.js';

// Userscript globals are provided by ScriptCat in production.
globalThis.GM_xmlhttpRequest = () => {};

beforeEach(t => {
  for (const level of ['log', 'warn', 'error']) t.mock.method(logger, level, () => {});
});

const reply = content => ({ choices: [{ message: { content } }] });

test('prompts preserve question types, text and option letters', () => {
  for (const [type, label] of [[0, '单选题'], [1, '多选题'], [2, '判断题'], [4, '填空题'], [5, '简答题']]) {
    const messages = buildPrompt(type, { text: '测试题干', images: [] }, [{ letter: 'A', text: '测试选项' }]);
    assert.equal(messages[0].role, 'system');
    assert.ok(messages[1].content.includes(label));
    assert.ok(messages[1].content.includes('测试题干'));
    assert.ok(messages[1].content.includes('A. 测试选项'));
  }
  assert.equal(QuestionType.FILL_BLANK, 4);
});

test('short-answer prompts request one complete plain-text answer with paragraphs', () => {
  const messages = buildPrompt(QuestionType.SHORT_ANSWER, { text: '请简述设计的优点', images: [] }, []);
  assert.match(messages[0].content, /简答题.*完整答案正文.*一个字符串.*换行分段.*不要返回HTML或Markdown/);
  assert.match(messages[1].content, /题目类型：简答题/);
  assert.doesNotMatch(messages[1].content, /选项：/);
  assert.deepEqual(parseAIResponse(reply(JSON.stringify({ answers: ['第一段\n第二段'] }))), ['第一段\n第二段']);
});

test('sends question and option images with text labels in order', () => {
  const questionImages = ['https://example.com/richtext%2Fquestion.png', 'https://example.com/diagram.jpg'];
  const optionImage = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  const messages = buildPrompt(0, { text: '请根据图示选择', images: questionImages.map(src => ({ src })) }, [
    { letter: 'A', text: '文字选项', images: [] },
    { letter: 'B', text: '', images: [{ src: optionImage }] },
  ]);
  const parts = messages[1].content;
  assert.match(parts[0].text, /请根据图示选择/);
  assert.match(parts[0].text, /A\. 文字选项/);
  assert.deepEqual(parts.slice(1), [
    { type: 'text', text: '题干图片 1：' },
    { type: 'image_url', image_url: { url: questionImages[0] } },
    { type: 'text', text: '题干图片 2：' },
    { type: 'image_url', image_url: { url: questionImages[1] } },
    { type: 'text', text: '选项 B图片 1：' },
    { type: 'image_url', image_url: { url: optionImage } },
  ]);
});

test('rejects unusable image URLs instead of answering without images', () => {
  for (const src of ['', undefined, 'not a URL', 'blob:https://example.com/image',
    'javascript:alert(1)', 'file:///tmp/image.png', 'data:image/svg+xml;base64,PHN2Zz4=',
    `https://example.com/${'x'.repeat(8192)}`]) {
    assert.throws(() => buildPrompt(0, { text: '题目', images: [{ src }] }, []), /题干图片 1.*无法发送/);
  }
});

test('parses plain JSON, markdown fences and surrounding explanation', () => {
  for (const content of ['{"answers":["A","C"]}', '```json\n{"answers":["A","C"]}\n```', '结果：{"answers":["A","C"]}']) {
    assert.deepEqual(parseAIResponse(reply(content)), ['A', 'C']);
  }
  assert.deepEqual(parseAIResponse(reply('{"answers":["第一空","第二空"]}')), ['第一空', '第二空']);
});

test('rejects empty, malformed and missing answer responses', () => {
  assert.throws(() => parseAIResponse({}), /内容为空/);
  assert.throws(() => parseAIResponse(reply('not JSON')), SyntaxError);
  for (const content of ['{}', '{"answers":"A"}', '{"answers":null}']) {
    assert.throws(() => parseAIResponse(reply(content)), /缺少 answers/);
  }
  for (const answers of [[], [''], [' '], [42], ['A', null]]) {
    assert.throws(() => parseAIResponse(reply(JSON.stringify({ answers }))), /非空答案字符串/);
  }
});

test('uses DeepSeek Flash High for text questions with credentials and prompt', async t => {
  const messages = buildPrompt(0, '题目', []);
  const response = reply('{"answers":["A"]}');
  const request = t.mock.fn(options => options.onload({ status: 200, responseText: JSON.stringify(response) }));
  t.mock.method(globalThis, 'GM_xmlhttpRequest', request);
  assert.deepEqual(await callDeepSeek('test-key', messages), response);
  const options = request.mock.calls[0].arguments[0];
  assert.equal(options.url, 'https://api.deepseek.com/chat/completions');
  assert.equal(options.headers.Authorization, 'Bearer test-key');
  assert.equal(options.timeout, 180000);
  assert.deepEqual(JSON.parse(options.data), {
    model: 'deepseek-flash', reasoning_effort: 'high', messages, stream: false,
  });
});

test('uses DeepSeek Flash High for image questions without truncating reasoning at 256 tokens', async t => {
  const messages = buildPrompt(0, '题干', [{ letter: 'A', text: '', images: [{ src: 'https://example.com/a.png' }] }]);
  const request = t.mock.fn(options => options.onload({ status: 200, responseText: JSON.stringify(reply('{"answers":["A"]}')) }));
  t.mock.method(globalThis, 'GM_xmlhttpRequest', request);
  await callDeepSeek('test-key', messages);
  const options = request.mock.calls[0].arguments[0];
  assert.equal(options.url, 'https://api.deepseek.com/chat/completions');
  assert.equal(options.headers.Authorization, 'Bearer test-key');
  assert.equal(options.timeout, 180000);
  assert.deepEqual(JSON.parse(options.data), {
    model: 'deepseek-flash', reasoning_effort: 'high', messages, stream: false,
  });
});

test('propagates HTTP, network, timeout and invalid JSON errors', async t => {
  for (const [respond, message] of [
    [options => options.onload({ status: 401, responseText: 'unauthorized' }), /401/],
    [options => options.onerror({ status: 0 }), /网络请求失败/],
    [options => options.ontimeout(), /请求超时/],
    [options => options.onload({ status: 200, responseText: 'invalid' }), /JSON/],
  ]) {
    t.mock.method(globalThis, 'GM_xmlhttpRequest', respond);
    await assert.rejects(callDeepSeek('test-key', []), message);
  }
});

test('bundle is installable, versioned and has no backend code or permissions', async () => {
  const bundle = await readFile('U-plus-Assistant.user.js', 'utf8');
  const metadata = await readFile('src/userscript.meta.js', 'utf8');
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  assert.ok(bundle.startsWith(metadata));
  assert.ok(metadata.includes(`@version      ${pkg.version}`));
  assert.match(metadata, /@match\s+https:\/\/www\.eduplus\.net\/course\/workAnswer\/\*/);
  assert.match(metadata, /@grant\s+GM_xmlhttpRequest/);
  assert.doesNotMatch(bundle, /bank|题库|localhost|127\.0\.0\.1|X-API-Key|simpleHash|generateImageKey/i);
  assert.deepEqual([...metadata.matchAll(/@connect\s+(\S+)/g)].map(match => match[1]), [
    'api.deepseek.com', 'api.typesafe.ai', 'openrouter.ai',
  ]);
  new Script(bundle);
});
