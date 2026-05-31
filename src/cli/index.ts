#!/usr/bin/env node
import { Command } from "commander";
import { login as doLogin } from "../auth/login.js";
import { getSession, clearSession, isExpired } from "../auth/session.js";
import * as api from "../api/client.js";

function parseUrl(url: string): { bookId?: number; slug?: string } {
  // Match Yuque URL pattern: https://www.yuque.com/{login}/{repo_slug}/{doc_slug}
  // or https://www.yuque.com/{login}/{repo_slug}
  // Contains no book ID from URL, so we use alternative methods
  const match = url.match(
    /https?:\/\/(?:www\.)?yuque\.com\/([^/]+)\/([^/]+)(?:\/([^/?#]+))?/
  );
  if (match) {
    return { slug: match[3] || match[2] };
  }
  // Try to parse as bookId/docSlug
  if (url.includes("/")) {
    const parts = url.split("/");
    return { bookId: parseInt(parts[0]), slug: parts[1] };
  }
  return { bookId: parseInt(url) || undefined };
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
      console.log("未登录，请执行 yuque login");
      return;
    }
    if (isExpired(session)) {
      console.log("会话已过期，请重新执行 yuque login");
      return;
    }
    if (session.user) {
      console.log(`已登录: ${session.user.name} (@${session.user.login})`);
    } else {
      console.log("已登录 (会话有效)");
    }
    console.log(`Cookie 路径: ~/.config/yuque-session/cookies.json`);
    console.log(`有效期至: ${new Date(session.expiresAt).toLocaleString()}`);
  });

program
  .command("ls")
  .argument("[groupId]", "群组/团队 ID（不填则列出个人的）")
  .description("列出知识库")
  .action(async (groupId?: string) => {
    try {
      const session = getSession();
      if (!session) {
        console.error("请先登录: yuque login");
        process.exit(1);
      }

      let books: api.YuqueBook[];

      if (groupId) {
        books = await api.getBooksByGroup(Number(groupId));
      } else if (session.user?.id) {
        // Try groups first, then personal
        books = await api.getBooksByGroup(session.user.id);
        if (books.length === 0) {
          books = await api.getBooksByUser(session.user.id);
        }
      } else {
        console.error("无法确定用户信息，请重新登录");
        process.exit(1);
      }

      if (books.length === 0) {
        console.log("暂无知识库。");
        return;
      }

      for (const b of books) {
        const stackInfo = b.stack_name ? ` [${b.stack_name}]` : "";
        console.log(
          `${b.name}  (id: ${b.id})${stackInfo}`
        );
      }
    } catch (err) {
      console.error("获取知识库列表失败:", (err as Error).message);
      process.exit(1);
    }
  });

program
  .command("list")
  .argument("<bookId>", "知识库 ID")
  .description("列出知识库内文档")
  .action(async (bookId: string) => {
    try {
      const docs = await api.listDocs(Number(bookId));
      if (docs.length === 0) {
        console.log("暂无文档。");
        return;
      }
      for (const d of docs) {
        console.log(`${d.title} (slug: ${d.slug}, id: ${d.id})`);
      }
    } catch (err) {
      console.error("获取文档列表失败:", (err as Error).message);
      process.exit(1);
    }
  });

program
  .command("get")
  .argument("<slug>", "文档 slug")
  .option("-b, --book-id <id>", "知识库 ID", String)
  .description("获取文档内容")
  .action(async (slug: string, options: { bookId?: string }) => {
    try {
      if (!options.bookId) {
        console.error("请指定知识库 ID: --book-id <id>");
        process.exit(1);
      }
      const doc = await api.getDoc(slug, Number(options.bookId));
      console.log(`标题: ${doc.title}`);
      console.log(`更新: ${doc.content_updated_at}`);
      console.log(`字数: ${doc.word_count}`);
      console.log("---");
      // Try to show content - could be lake format or HTML
      const content = doc.content || doc.body_html || "";
      if (content.length > 2000) {
        console.log(content.substring(0, 2000) + "\n... (内容过长，已截断)");
      } else {
        console.log(content);
      }
    } catch (err) {
      console.error("获取文档失败:", (err as Error).message);
      process.exit(1);
    }
  });

program
  .command("export")
  .argument("<slug>", "文档 slug")
  .option("-b, --book-id <id>", "知识库 ID", String)
  .option("-o, --output <path>", "输出文件路径")
  .description("导出文档内容")
  .action(
    async (slug: string, options: { bookId?: string; output?: string }) => {
      try {
        if (!options.bookId) {
          console.error("请指定知识库 ID: --book-id <id>");
          process.exit(1);
        }
        const content = await api.getDocContent(slug, Number(options.bookId));

        let outputPath = options.output;
        if (!outputPath) {
          const { join } = await import("node:path");
          const { existsSync, mkdirSync } = await import("node:fs");
          const dir = join(process.cwd(), "yuque-export");
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
          outputPath = join(dir, `${slug}.html`);
        }

        const { writeFileSync } = await import("node:fs");
        writeFileSync(outputPath, content, "utf-8");
        console.log(`已导出: ${outputPath}`);
      } catch (err) {
        console.error("导出失败:", (err as Error).message);
        process.exit(1);
      }
    }
  );

program
  .command("create")
  .argument("<bookId>", "知识库 ID")
  .argument("<title>", "文档标题")
  .option("-b, --body <body>", "文档内容")
  .option("-f, --file <path>", "从文件读取内容")
  .option("--format <format>", "内容格式 (lake/html/markdown)", "lake")
  .description("新建文档")
  .action(
    async (
      bookId: string,
      title: string,
      options: { body?: string; file?: string; format?: string }
    ) => {
      try {
        let body = options.body || "";
        if (options.file) {
          const { readFileSync } = await import("node:fs");
          body = readFileSync(options.file, "utf-8");
        }
        // Wrap in lake format if plain text
        if (body && !body.startsWith("<") && options.format === "lake") {
          body = `<p>${body}</p>`;
        }
        const doc = await api.createDoc(Number(bookId), {
          title,
          body,
          format: options.format,
        });
        console.log(`文档已创建: ${doc.title} (id: ${doc.id}, slug: ${doc.slug})`);
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
  .option("-b, --body <body>", "新内容")
  .option("-f, --file <path>", "从文件读取内容")
  .option("--format <format>", "内容格式 (lake/html/markdown)")
  .description("更新文档")
  .action(
    async (
      id: string,
      options: { title?: string; body?: string; file?: string; format?: string }
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
        if (options.format) data.format = options.format;
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
