# U+助手

U+平台自动答题用户脚本，基于 DeepSeek API 实现题目自动作答。

## 版本

v0.1.0

## 功能

- 支持单选题、多选题、判断题的自动作答
- 可配置 [DeepSeek API Key](https://platform.deepseek.com/api_keys)
- 可在「设置」面板中切换自动/手动答题模式
- 题目列表视图，直观查看每题作答状态

## 限制

- 不支持含图片的题目
- 不支持填空题和简答题

## 安装

1. 安装用户脚本管理器（如 [Tampermonkey](https://www.tampermonkey.net/) 或 [Violentmonkey](https://violentmonkey.github.io/)）
2. 安装 `U-plus-Assistant.user.js`
3. 在 [DeepSeek](https://platform.deepseek.com/api_keys) 获取 API Key
4. 打开答题页面，在右侧面板的「设置」页填入 API Key

## 使用

1. 打开 U+ 平台答题页面
2. 页面右侧会出现 U+助手 控制面板
3. 在「设置」页填入 DeepSeek API Key
4. 可选：开启「自动答题」开关，识别题目后自动作答
5. 点击「启动」开始答题

## 许可

MIT License — 详见 [LICENSE](LICENSE)
