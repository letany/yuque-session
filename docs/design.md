# yuque-session: CLI + MCP 一体化语雀工具

## 背景

语雀公开 API 需要会员 Token。本工具通过浏览器登录捕获 Session Cookie，直调内部 API，实现免会员的完整 CRUD + 导出。

## 架构

```
CLI (commander) ──→ API Client (cookie auth) ──→ Yuque Internal API
                        ↑
Auth (Puppeteer) ──→ Session Store (~/.config/yuque-session/cookies.json)
                        ↑
MCP Server (@modelcontextprotocol/sdk)
```

## 模块

### Auth
- Puppeteer 以非无头模式打开语雀登录页
- 用户手动完成登录（手机号+验证码 / 扫码）
- 脚本轮询检测 `_yuque_session` Cookie
- 捕获后提取 `_yuque_session` + `yuque_ctoken`
- 持久化到 `~/.config/yuque-session/cookies.json`

### Session Store
- 文件路径: `~/.config/yuque-session/cookies.json`
- 存储 session / ctoken / 过期时间 / 用户信息
- 提供 `get()`, `set()`, `clear()`, `isExpired()`

### API Client
- 基础 URL: `https://www.yuque.com`
- 自动附加 Cookie 和 `X-Csrf-Token` 头
- 接口: `GET|POST|PUT|DELETE /api/v2/...`

### CLI (commander)
| 命令 | 功能 |
|------|------|
| `yuque login` | 浏览器登录捕获 Cookie |
| `yuque logout` | 清除本地 Cookie |
| `yuque status` | 查看登录态 |
| `yuque ls` | 列出知识库 |
| `yuque list <repo>` | 列出文档 |
| `yuque get <url>` | 获取文档内容 |
| `yuque export <url>` | 导出 Markdown |
| `yuque create <repo> <title>` | 新建文档 |
| `yuque update <url>` | 更新文档 |
| `yuque delete <url>` | 删除文档 |
| `yuque mcp` | 启动 MCP 服务器 |

### MCP Server (stdio transport)
| 工具 | 功能 |
|------|------|
| `yuque_list_repos` | 列出所有知识库 |
| `yuque_list_docs` | 列出文档树 |
| `yuque_get_doc` | 读取文档内容 |
| `yuque_create_doc` | 创建文档 |
| `yuque_update_doc` | 更新文档 |
| `yuque_delete_doc` | 删除文档 |
| `yuque_export_doc` | 导出 Markdown |

## 技术栈
- TypeScript + Node.js ≥ 20
- Puppeteer
- Commander
- @modelcontextprotocol/sdk
- 文件系统做 Session 持久化

## 可移植性
- `package.json` 管理依赖，`npm install` 即用
- Cookie 存 `~/.config/yuque-session/`，不绑定机器
- 代码推 GitHub，新机器 `git clone + npm install + yuque login`
