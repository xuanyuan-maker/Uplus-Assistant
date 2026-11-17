# U+助手

用于脚本猫（ScriptCat）的 U+ 平台答题辅助用户脚本，通过 DeepSeek 或 JeV API 作答，无需本地后端。本项目使用 AI 辅助开发。

## 版本

v0.1.10

## 功能

- 支持单选题、多选题、判断题、填空题、简答题
- 简答题支持当前 U+ 的 CKEditor 富文本编辑器，答案按纯文本写入并保留换行；手动、自动模式均可使用
- 支持题干图片、选项图片及纯图片题，将文字和图片一起发送给 DeepSeek
- 可配置 [DeepSeek API Key](https://platform.deepseek.com/api_keys)
- JeV 支持 [TypeSafe](https://console.typesafe.ai/) 和 [OpenRouter](https://openrouter.ai/keys) 两个 API 渠道，分别保存 Key，默认 TypeSafe。「选择题使用 JeV」默认关闭；开启后纯文本单选、多选、判断题走所选 JeV 渠道，含图片的题目及其他题型继续使用 DeepSeek Flash High
- 支持手动作答当前题目，以及开启自动模式后逐题作答
- 「设置」提供「自动提交」开关，默认关闭并保存设置；开启后整份作业作答成功会自动点击「提交作业」并确认
- 提供题目列表、作答状态和日志面板

## 限制

- DeepSeek 始终使用 Flash High（`model: 'deepseek-flash'`、`reasoning_effort: 'high'`），使用 API 默认输出预算，请求超时为 180 秒；参见 [DeepSeek 思考模式文档](https://api-docs.deepseek.com/guides/thinking_mode/)。图片按题干、选项分组发送，支持 JPEG、PNG、GIF、WebP；参见 [DeepSeek 图片输入文档](https://api-docs.deepseek.com/guides/vision/)。
- DeepSeek 图片题使用原图 URL，必须能公开访问；也支持 Base64 图片。需要登录、防盗链或 `blob:` 图片暂不支持，失败时会记录错误。
- JeV 单选用 Choice，判断用 Noul，多选将每个选项作为 Noul 在一次请求中判断。单选置信度至少 0.7；判断和多选的概率至少 0.7 视为是，至多 0.3 视为否。单选置信度不足、任一判断概率处于中间区间，或多选不足两个可靠答案时，自动将完整题目交给 DeepSeek Flash High 重新作答，不跳过。两个 JeV 渠道均适用，需同时填写 DeepSeek API Key。阈值尚未按本项目题目校准；缺少 Key、接口错误或返回格式无效时仍记录错误，不强行填答。参见 [JeV API 文档](https://docs.typesafe.ai/api/system-one)。
- TypeSafe 使用 `https://api.typesafe.ai/v1/systemone`，模型 `jev-latest`；OpenRouter 使用 `https://openrouter.ai/api/alpha/decisions`，模型 `~typesafe/jev-latest`。两者复用结构化答案解析，Key 只发送到当前选择的渠道，失败时不自动换渠道。参见 [OpenRouter JeV 接入说明](https://openrouter.ai/blog/tutorials/how-to-use-jev/)。
- 无论 JeV 开关是否开启，只要题干或任一选项含图片，整道题（文字和图片）都交给 DeepSeek Flash High，不向 JeV 发送图片。
- 已移除题库服务、题库设置、查询与答案上传

## 安装与使用

1. 安装 [脚本猫](https://scriptcat.org/)。
2. 安装仓库根目录的 `U-plus-Assistant.user.js`，无需安装源码目录中的文件。
3. 打开 U+ 平台答题页面，在右侧「设置」页填入 DeepSeek API Key。
4. 在「日志」页点击「启动」，作答当前题目。
5. 如需连续作答，开启「自动答题」并刷新页面。
6. 如需答完后自动交卷，开启「自动提交」；手动逐题完成整份作业时也生效。题目失败、跳过、切题中断，或平台提示仍有题未做时，不会自动确认提交。
7. 如需纯文本选择题改用 JeV，在「JeV API 渠道」选择 TypeSafe 或 OpenRouter，填写该渠道的 Key，再打开「选择题使用 JeV」。开关和渠道即时生效；图片题始终走 DeepSeek Flash High，关闭开关后所有题目恢复使用 DeepSeek Flash High。

API Key 与开关设置保存在脚本管理器中，沿用旧版本的设置键名；TypeSafe JeV Key 和开关仍保存在 `jev_api_key`、`use_jev`，新增 `jev_provider` 保存渠道、`jev_openrouter_api_key` 保存 OpenRouter Key。

简答题通过 `unsafeWindow` 访问页面的 CKEditor 实例，调用编辑器数据接口写入答案；更新脚本时需保留该授权。「自动提交」关闭时，核对答案后自行提交；开启后将确认平台的「作业已经全部做完」提示，不再等待人工点击。

## 开发

需要 Node.js 22 或更高版本及 npm：

```sh
npm ci
npm run build       # 将源码打包为根目录的用户脚本
npm run dev         # 监听源码变动并自动重新构建
npm test            # 构建并运行 API、解析和产物检查
npm run test:browser # 使用无头 Chromium 运行页面交互回归检查
```

浏览器测试使用本地页面和模拟 API，不消耗 DeepSeek 额度。默认使用 `chromium`，也可通过 `CHROME_BIN` 指定浏览器可执行文件。

```text
src/
├── main.js             # 初始化、手动/自动答题流程
├── questions.js        # 题目/图片信息提取、页面等待与切题
├── answers.js          # 点击选项、填写答案与触发表单事件
├── submission.js       # 自动提交作业与平台确认弹窗
├── api.js              # DeepSeek 请求、提示词与响应解析
├── jev.js              # JeV 纯文本请求与结构化答案解析
├── ui.js               # 面板、设置与作答状态
├── logger.js           # 控制台与面板日志
└── userscript.meta.js  # 用户脚本元数据与权限
scripts/                # 构建和浏览器测试入口
tests/                  # Node.js 测试及浏览器测试页面
```

只编辑 `src/`，再运行构建并将生成文件重新导入脚本猫。根目录的 `U-plus-Assistant.user.js` 是构建产物，保留原文件路径以便安装和分发；请随源码一起更新，不要手工修改。

## 许可

MIT License — 详见 [LICENSE](LICENSE)
