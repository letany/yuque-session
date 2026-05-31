#!/usr/bin/env node
import { Command } from "commander";
import { login as doLogin } from "../auth/login.js";
import { getSession, clearSession, isExpired } from "../auth/session.js";
import * as api from "../api/client.js";

function parseUrl(url: string): { namespace: string; slug?: string } {
  const match = url.match(
    /https?:\/\/(?:www\.)?yuque\.com\/([^/]+\/[^/]+)(?:\/([^/?#]+))?/
  );
  if (match) {
    return { namespace: match[1], slug: match[2] };
  }
  if (url.includes("/")) {
    const parts = url.split("/");
    if (parts.length >= 2) {
      return { namespace: url, slug: undefined };
    }
  }
  return { namespace: url, slug: undefined };
}

const program = new Command();

program.name("yuque").description("语雀 CLI 工具 - 基于 Session Cookie 认证").version("0.1.0");

program
  .command("login")
  .description("浏览器登录语雀，捕获会话 Cookie")
  .action(async () => {
    try {
      await doLogin();
    } catch (err) {
      console.error("登录失败:", (err as Error).message);
      process.exit(1);
    }
  });

program
  .command("logout")
  .description("清除本地会话")
  .action(() => {
    clearSession();
    console.log("已清除本地会话。");
  });

program
  .command("status")
  .description("查看当前登录状态")
  .action(() => {
    const session = getSession();
    if (!session) {
      console.log("未登录。请执行 yuque login");
      return;
    }
    if (isExpired(session)) {
      console.log("会话已过期。请重新执行 yuque login");
      return;
    }
    if (session.user) {
      console.log(`已登录: ${session.user.name} (@${session.user.login})`);
    } else {
      console.log("已登录 (会话有效)");
    }
    console.log(`Cookie 路径: ${process.env.HOME}/.config/yuque-session/cookies.json`);
  });

program
  .command("ls")
  .description("列出所有知识库")
  .action(async () => {
    try {
      const repos = await api.listRepos();
      if (repos.length === 0) {
        console.log("暂无知识库。");
        return;
      }
      for (const r of repos) {
        console.log(`${r.name}  (${r.namespace})  [${r.items_count} 篇]`);
      }
    } catch (err) {
      console.error("获取知识库列表失败:", (err as Error).message);
      process.exit(1);
    }
  });

program
  .command("list")
  .argument("<namespace>", "知识库 namespace，如 login/repo-slug")
  .description("列出知识库内文档")
  .action(async (namespace: string) => {
    try {
      const toc = await api.getToc(namespace);
      function printItems(items: typeof toc, depth = 0) {
        for (const item of items) {
          const prefix = "  ".repeat(depth);
          const icon = item.type === "DOCUMENT" ? "📄" : "📁";
          console.log(`${prefix}${icon} ${item.title} (${item.slug})`);
          if (item.child && item.child.length > 0) {
            printItems(item.child, depth + 1);
          }
        }
      }
      printItems(toc);
    } catch (err) {
      console.error("获取文档列表失败:", (err as Error).message);
      process.exit(1);
    }
  });

program
  .command("get")
  .argument("<url>", "文档 URL 或 namespace/slug")
  .description("获取文档内容")
  .action(async (url: string) => {
    try {
      const { namespace, slug } = parseUrl(url);
      if (!slug) {
        console.error("请提供完整的文档路径: namespace/slug");
        process.exit(1);
      }
      const doc = await api.getDoc(namespace, slug);
      console.log(`标题: ${doc.title}`);
      console.log(`描述: ${doc.description}`);
      console.log(`更新: ${doc.content_updated_at}`);
      console.log("---");
      console.log(doc.body_html || doc.body);
    } catch (err) {
      console.error("获取文档失败:", (err as Error).message);
      process.exit(1);
    }
  });

program
  .command("export")
  .argument("<url>", "文档 URL 或 namespace/slug")
  .description("导出文档为 Markdown")
  .option("-o, --output <path>", "输出文件路径")
  .action(async (url: string, options: { output?: string }) => {
    try {
      const { namespace, slug } = parseUrl(url);
      if (!slug) {
        console.error("请提供完整的文档路径: namespace/slug");
        process.exit(1);
      }

      let outputPath = options.output;
      if (!outputPath) {
        const { writeFileSync, existsSync, mkdirSync } = await import("node:fs");
        const { join } = await import("node:path");
        const dir = join(process.cwd(), "yuque-export");
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        outputPath = join(dir, `${slug}.md`);
      }

      const markdown = await api.getDocRaw(namespace, slug);
      const { writeFileSync } = await import("node:fs");
      writeFileSync(outputPath, markdown, "utf-8");
      console.log(`已导出: ${outputPath}`);
    } catch (err) {
      console.error("导出失败:", (err as Error).message);
      process.exit(1);
    }
  });

program
  .command("create")
  .argument("<namespace>", "知识库 namespace，如 login/repo-slug")
  .argument("<title>", "文档标题")
  .option("-b, --body <body>", "文档内容 (Markdown)")
  .option("-f, --file <path>", "从文件读取内容")
  .description("新建文档")
  .action(
    async (
      namespace: string,
      title: string,
      options: { body?: string; file?: string }
    ) => {
      try {
        let body = options.body || "# 新文档";
        if (options.file) {
          const { readFileSync } = await import("node:fs");
          body = readFileSync(options.file, "utf-8");
        }
        const doc = await api.createDoc(namespace, { title, body });
        console.log(
          `文档已创建: ${doc.title} (id: ${doc.id}, slug: ${doc.slug})`
        );
      } catch (err) {
        console.error("创建文档失败:", (err as Error).message);
        process.exit(1);
      }
    }
  );

program
  .command("update")
  .argument("<id>", "文档 ID")
  .option("-t, --title <title>", "新标题")
  .option("-b, --body <body>", "新内容 (Markdown)")
  .option("-f, --file <path>", "从文件读取内容")
  .description("更新文档")
  .action(
    async (
      id: string,
      options: { title?: string; body?: string; file?: string }
    ) => {
      try {
        let body = options.body;
        if (options.file) {
          const { readFileSync } = await import("node:fs");
          body = readFileSync(options.file, "utf-8");
        }
        const data: { title?: string; body?: string; format?: string } = {};
        if (options.title) data.title = options.title;
        if (body) data.body = body;
        const doc = await api.updateDoc(Number(id), data);
        console.log(`文档已更新: ${doc.title}`);
      } catch (err) {
        console.error("更新文档失败:", (err as Error).message);
        process.exit(1);
      }
    }
  );

program
  .command("delete")
  .argument("<id>", "文档 ID")
  .description("删除文档")
  .action(async (id: string) => {
    try {
      await api.deleteDoc(Number(id));
      console.log(`文档 ${id} 已删除。`);
    } catch (err) {
      console.error("删除文档失败:", (err as Error).message);
      process.exit(1);
    }
  });

program
  .command("mcp")
  .description("启动 MCP 服务器")
  .action(async () => {
    try {
      const { startMcpServer } = await import("../mcp/server.js");
      await startMcpServer();
    } catch (err) {
      console.error("MCP 服务器启动失败:", (err as Error).message);
      process.exit(1);
    }
  });

program.parse(process.argv);
