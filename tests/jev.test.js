import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { buildJevRequest, callJev, parseJevResponse } from '../src/jev.js';
import { QuestionType } from '../src/questions.js';
import { logger } from '../src/logger.js';

globalThis.GM_xmlhttpRequest = () => {};
const options = ['A', 'B', 'C', 'D'].map(letter => ({ letter, text: `测试选项${letter}`, images: [] }));
const noul = probability => ({ type: 'noul', noul: probability });
const multiReply = () => ({ answers: { option_a: noul(0.99), option_b: noul(0.01), option_c: noul(0.9), option_d: noul(0.1) } });

beforeEach(t => {
  for (const level of ['log', 'warn', 'error']) t.mock.method(logger, level, () => {});
});

test('builds a single Choice with state shared by all options', async () => {
  const request = await buildJevRequest(QuestionType.SINGLE_CHOICE, { text: '请选择不正确的一项', images: [] }, options);
  assert.equal(request.model, 'jev-latest');
  assert.equal(request.state.question, '请选择不正确的一项');
  assert.deepEqual(request.state.options, options.map(({ letter, text }) => ({ letter, text })));
  assert.equal(request.questions.answer.type, 'choice');
  assert.deepEqual(Object.keys(request.questions.answer.criteria), ['A', 'B', 'C', 'D']);
  assert.match(request.questions.answer.instructions, /否定/);
  assert.equal('assets' in request, false);
});

test('batches all multi-choice option judgments into one request', async () => {
  const request = await buildJevRequest(QuestionType.MULTI_CHOICE, '以下哪些选项不符合要求', options);
  assert.equal(request.state.question, '以下哪些选项不符合要求');
  assert.deepEqual(Object.keys(request.questions), ['option_a', 'option_b', 'option_c', 'option_d']);
  for (const [index, question] of Object.values(request.questions).entries()) {
    assert.equal(question.type, 'noul');
    assert.ok(question.instructions.includes(`options[${index}]`));
    assert.match(question.instructions, /应选答案.*否定/);
  }
});

test('builds a Noul for true/false questions', async () => {
  const request = await buildJevRequest(QuestionType.TRUE_FALSE, { text: '测试陈述', images: [] }, []);
  assert.equal(request.questions.answer.type, 'noul');
  assert.equal(request.state.question, '测试陈述');
});

test('rejects unsupported types, empty questions and unusable option mappings before sending', () => {
  for (const type of [QuestionType.FILL_BLANK, QuestionType.SHORT_ANSWER, null]) {
    assert.throws(() => buildJevRequest(type, '题目', options), /仅用于/);
  }
  for (const invalidOptions of [[], [options[0]], [options[0], options[0]], [{ letter: 'wrong' }, options[1]]]) {
    assert.throws(() => buildJevRequest(0, '题目', invalidOptions), /选项/);
  }
  assert.throws(() => buildJevRequest(0, { text: '  ', images: [] }, options), /题干文本为空/);
});

test('rejects question and option images instead of silently sending text-only questions to JeV', t => {
  const request = t.mock.fn();
  t.mock.method(globalThis, 'GM_xmlhttpRequest', request);
  for (const type of [0, 1, 2]) {
    assert.throws(() => buildJevRequest(type, { text: '题目', images: [{ src: 'https://example.com/image.png' }] }, options), /含图片.*DeepSeek/);
    assert.throws(() => buildJevRequest(type, { text: '题目', images: [] }, [
      { ...options[0], images: [{ src: 'https://example.com/option.png' }] }, options[1],
    ]), /含图片.*DeepSeek/);
  }
  assert.equal(request.mock.calls.length, 0);
});

test('parses Choice only when the letter and confidence are valid', () => {
  for (const confidence of [0.7, 0.99, 1]) {
    assert.deepEqual(parseJevResponse({ answers: { answer: { type: 'choice', choice: 'C', confidence } } }, 0, options), ['C']);
  }
  for (const answer of [undefined, { type: 'noul', noul: 0.9 }, { type: 'choice', choice: 'Z', confidence: 1 },
    ...[undefined, NaN, Infinity, -1, 1.1, '0.99', 0.5].map(confidence => ({ type: 'choice', choice: 'A', confidence }))]) {
    assert.throws(() => parseJevResponse({ answers: { answer } }, 0, options), /JeV/);
  }
});

test('maps Noul probabilities to true/false without coercing or guessing', () => {
  for (const probability of [0.7, 1]) assert.deepEqual(parseJevResponse({ answers: { answer: noul(probability) } }, 2, []), ['true']);
  for (const probability of [0, 0.3]) assert.deepEqual(parseJevResponse({ answers: { answer: noul(probability) } }, 2, []), ['false']);
  for (const probability of [undefined, NaN, Infinity, -1, 1.1, '0.99', 0.5]) {
    assert.throws(() => parseJevResponse({ answers: { answer: noul(probability) } }, 2, []), /JeV/);
  }
  assert.throws(() => parseJevResponse({}, 2, []), /JeV/);
});

test('collects every reliable multi-choice answer and rejects partial or uncertain results', () => {
  assert.deepEqual(parseJevResponse(multiReply(), 1, options), ['A', 'C']);
  for (const replacement of [undefined, noul(0.5), noul('0.9'), { type: 'choice', choice: 'A' }]) {
    const data = multiReply();
    data.answers.option_d = replacement;
    assert.throws(() => parseJevResponse(data, 1, options), /JeV/);
  }
  const oneAnswer = multiReply();
  oneAnswer.answers.option_c = noul(0.1);
  assert.throws(() => parseJevResponse(oneAnswer, 1, options), /至少两个/);
  assert.throws(() => parseJevResponse({}, 5, []), /不支持/);
});

test('sends JeV credentials and text payload only to the official endpoint without vision headers', async t => {
  const response = multiReply();
  const request = t.mock.fn(options => options.onload({ status: 200, responseText: JSON.stringify(response) }));
  t.mock.method(globalThis, 'GM_xmlhttpRequest', request);
  const textBody = await buildJevRequest(1, '题目', options);
  assert.deepEqual(await callJev('test-jev-key', textBody), response);
  const textRequest = request.mock.calls[0].arguments[0];
  assert.equal(textRequest.url, 'https://api.typesafe.ai/v1/systemone');
  assert.equal(textRequest.method, 'POST');
  assert.equal(textRequest.headers.Authorization, 'Bearer test-jev-key');
  assert.equal(textRequest.headers['TypeSafe-Danger-Zone-Images'], undefined);
  assert.equal(textRequest.anonymous, true);
  assert.deepEqual(JSON.parse(textRequest.data), textBody);
  assert.equal('assets' in JSON.parse(textRequest.data), false);
});

test('uses the OpenRouter Decisions endpoint and alias without mutating the TypeSafe request', async t => {
  const response = { ...multiReply(), model: 'typesafe/jev-1.14', provider: 'TypeSafe', id: 'test-decision' };
  const request = t.mock.fn(options => options.onload({ status: 200, responseText: JSON.stringify(response) }));
  t.mock.method(globalThis, 'GM_xmlhttpRequest', request);
  const body = buildJevRequest(1, '题目', options);
  const data = await callJev('test-openrouter-key', body, 'openrouter');
  const sent = request.mock.calls[0].arguments[0];
  assert.equal(sent.url, 'https://openrouter.ai/api/alpha/decisions');
  assert.equal(sent.headers.Authorization, 'Bearer test-openrouter-key');
  assert.deepEqual(JSON.parse(sent.data), { ...body, model: '~typesafe/jev-latest' });
  assert.equal(body.model, 'jev-latest');
  assert.deepEqual(parseJevResponse(data, 1, options), ['A', 'C']);
});

test('rejects unknown JeV channels before transmitting credentials', async t => {
  const request = t.mock.fn();
  t.mock.method(globalThis, 'GM_xmlhttpRequest', request);
  await assert.rejects(callJev('test-key', {}, 'other'), /渠道无效/);
  assert.equal(request.mock.calls.length, 0);
});

test('does not retry OpenRouter failures through TypeSafe', async t => {
  const request = t.mock.fn(options => options.onload({ status: 429, responseText: 'limited' }));
  t.mock.method(globalThis, 'GM_xmlhttpRequest', request);
  await assert.rejects(callJev('test-openrouter-key', { model: 'jev-latest' }, 'openrouter'), /429/);
  assert.equal(request.mock.calls.length, 1);
  assert.equal(request.mock.calls[0].arguments[0].url, 'https://openrouter.ai/api/alpha/decisions');
});

test('propagates JeV HTTP, network, timeout and invalid JSON failures', async t => {
  for (const [respond, expected] of [
    [options => options.onload({ status: 401, responseText: 'unauthorized' }), /JeV.*401/],
    [options => options.onload({ status: 429, responseText: 'limited' }), /JeV.*429/],
    [options => options.onerror({ status: 0 }), /网络请求失败/],
    [options => options.ontimeout(), /请求超时/],
    [options => options.onload({ status: 200, responseText: 'invalid' }), /JSON/],
  ]) {
    t.mock.method(globalThis, 'GM_xmlhttpRequest', respond);
    await assert.rejects(callJev('test-jev-key', {}), expected);
  }
});

test('rejects oversized payloads before an API request', async t => {
  const request = t.mock.fn();
  t.mock.method(globalThis, 'GM_xmlhttpRequest', request);
  await assert.rejects(callJev('test-jev-key', { state: 'x'.repeat(32 * 1024 * 1024) }), /32 MiB/);
  assert.equal(request.mock.calls.length, 0);
});
