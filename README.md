# yuque-session

语雀 CLI + MCP 一体化工具。**无需会员 / API Token**，通过浏览器登录捕获 Session Cookie，直调语雀内部 API，支持完整的 CRUD + Markdown 导出。

## 特性

- 免会员：使用手机号+验证码登录，无需语雀超级会员
- CLI 完整：登录、列出、读取、创建、更新、删除、导出
- MCP 集成：支持 Claude / Cursor 等 AI 客户端通过 MCP 协议管理语雀文档
- 一次登录，14天有效：Cookie 持久化到本地，无需频繁登录
- 跨机器可移植：`git clone + npm install + yuque login` 即可在新机器使用

## 安装

```bash
git clone https://github.com/<你的用户名>/yuque-session.git
cd yuque-session
npm install
npm run build
```

## 使用

### 登录

```bash
node dist/cli/index.js login
```

这会自动打开浏览器，在页面中完成登录（手机号+验证码）后，会话 Cookie 会自动保存到 `~/.config/yuque-session/cookies.json`。

### CLI 命令

| 命令 | 说明 |
|------|------|
| `yuque login` | 浏览器登录语雀 |
| `yuque logout` | 清除本地会话 |
| `yuque status` | 查看登录状态 |
| `yuque ls` | 列出所有知识库 |
| `yuque list <namespace>` | 列出知识库内文档 |
| `yuque get <url>` | 获取文档内容 |
| `yuque export <url>` | 导出文档为 Markdown |
| `yuque create <namespace> <title>` | 新建文档 |
| `yuque update <id>` | 更新文档 |
| `yuque delete <id>` | 删除文档 |
| `yuque mcp` | 启动 MCP 服务器 |

### 示例

```bash
# 登录
node dist/cli/index.js login

# 列出知识库
node dist/cli/index.js ls

# 列出知识库文档树
node dist/cli/index.js list my-login/my-repo

# 获取文档内容
node dist/cli/index.js get https://www.yuque.com/my-login/my-repo/doc-slug

# 导出为 Markdown
node dist/cli/index.js export https://www.yuque.com/my-login/my-repo/doc-slug

# 新建文档
node dist/cli/index.js create my-login/my-repo "我的新文档" --body "# Hello World"

# 删除文档
node dist/cli/index.js delete 12345
```

### MCP 配置

启动 MCP 服务器：

```bash
node dist/cli/index.js mcp
```

**Claude Code 配置：**

```bash
claude mcp add --scope user yuque-session -- node /绝对路径/yuque-session/dist/cli/index.js mcp
```

**Claude Desktop 配置 (`claude_desktop_config.json`)：**

```json
{
  "mcpServers": {
    "yuque-session": {
      "command": "node",
      "args": ["/绝对路径/yuque-session/dist/cli/index.js", "mcp"]
    }
  }
}
```

**Cursor 配置 (`~/.cursor/mcp.json`)：**

```json
{
  "mcpServers": {
    "yuque-session": {
      "command": "node",
      "args": ["/绝对路径/yuque-session/dist/cli/index.js", "mcp"]
    }
  }
}
```

MCP 会暴露以下工具给 AI：
- `yuque_list_repos` — 列出所有知识库
- `yuque_list_docs` — 列出文档树
- `yuque_get_doc` — 读取文档内容
- `yuque_create_doc` — 创建文档
- `yuque_update_doc` — 更新文档
- `yuque_delete_doc` — 删除文档
- `yuque_export_doc` — 导出 Markdown

## 工作原理

1. **登录**：Puppeteer 打开语雀登录页，用户手动完成手机号+验证码登录
2. **捕获**：脚本自动检测 `_yuque_session` Cookie，提取会话信息
3. **持久化**：Cookie 保存到 `~/.config/yuque-session/cookies.json`
4. **API 调用**：使用 Cookie 直接访问语雀内部 API（`www.yuque.com/api/*`），无需公开 API Token
5. **CRUD**：内部 API 支持完整的文档增删改查 + Markdown 导出

## 跨机器使用

```bash
# 新机器上
git clone https://github.com/<你的用户名>/yuque-session.git
cd yuque-session
npm install
npm run build
node dist/cli/index.js login  # 只需要重新登录一次
```

## 依赖

- Node.js >= 20
- npm
- Chrome / Chromium（由 Puppeteer 自动管理）
