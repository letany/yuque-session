import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { getSession, isExpired } from "../auth/session.js";
import * as api from "../api/client.js";

export async function startMcpServer(): Promise<void> {
  const session = getSession();
  if (!session || isExpired(session)) {
    console.error("未登录或会话已过期，请先执行 yuque login");
    process.exit(1);
  }

  const server = new Server(
    { name: "yuque-session", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "yuque_list_repos",
        description: "列出知识库。参数 groupId 可选，不填则从用户信息推断。",
        inputSchema: {
          type: "object",
          properties: {
            groupId: {
              type: "number",
              description: "团队/群组 ID（可选）",
            },
          },
        },
      },
      {
        name: "yuque_list_docs",
        description: "列出知识库内的文档",
        inputSchema: {
          type: "object",
          properties: {
            bookId: {
              type: "number",
              description: "知识库 ID",
            },
          },
          required: ["bookId"],
        },
      },
      {
        name: "yuque_get_doc",
        description: "获取文档内容（含 Lake/HTML 格式正文）",
        inputSchema: {
          type: "object",
          properties: {
            slug: { type: "string", description: "文档 slug" },
            bookId: { type: "number", description: "知识库 ID" },
          },
          required: ["slug", "bookId"],
        },
      },
      {
        name: "yuque_create_doc",
        description: "在知识库中创建新文档",
        inputSchema: {
          type: "object",
          properties: {
            bookId: { type: "number", description: "知识库 ID" },
            title: { type: "string", description: "文档标题" },
            body: { type: "string", description: "文档内容（Lake 格式）" },
            format: {
              type: "string",
              description: "内容格式: lake / html / markdown",
              default: "lake",
            },
          },
          required: ["bookId", "title"],
        },
      },
      {
        name: "yuque_update_doc",
        description: "更新现有文档",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "number", description: "文档 ID" },
            title: { type: "string", description: "新标题（可选）" },
            body: { type: "string", description: "新内容（可选）" },
            format: { type: "string", description: "内容格式（可选）" },
          },
          required: ["id"],
        },
      },
      {
        name: "yuque_delete_doc",
        description: "删除文档",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "number", description: "文档 ID" },
          },
          required: ["id"],
        },
      },
      {
        name: "yuque_export_doc",
        description: "导出文档内容（返回原始正文）",
        inputSchema: {
          type: "object",
          properties: {
            slug: { type: "string", description: "文档 slug" },
            bookId: { type: "number", description: "知识库 ID" },
          },
          required: ["slug", "bookId"],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case "yuque_list_repos": {
          const { groupId } = (args || {}) as { groupId?: number };
          let books: api.YuqueBook[];
          if (groupId) {
            books = await api.getBooksByGroup(groupId);
          } else if (session.user?.id) {
            books = await api.getBooksByGroup(session.user.id);
            if (books.length === 0) {
              books = await api.getBooksByUser(session.user.id);
            }
          } else {
            return { content: [{ type: "text", text: "无法获取用户信息" }] };
          }
          const text = books
            .map((b) => `${b.name} (id: ${b.id})${b.stack_name ? ` [${b.stack_name}]` : ""}`)
            .join("\n");
          return { content: [{ type: "text", text: text || "暂无知识库" }] };
        }

        case "yuque_list_docs": {
          const { bookId } = args as { bookId: number };
          const docs = await api.listDocs(bookId);
          const text = docs
            .map((d) => `${d.title} (slug: ${d.slug}, id: ${d.id})`)
            .join("\n");
          return { content: [{ type: "text", text: text || "暂无文档" }] };
        }

        case "yuque_get_doc": {
          const { slug, bookId } = args as { slug: string; bookId: number };
          const doc = await api.getDoc(slug, bookId);
          const content = doc.content || doc.body_html || "";
          const text = `# ${doc.title}\n\n${content}`;
          return {
            content: [
              { type: "text", text: `标题: ${doc.title}\n字数: ${doc.word_count}\n---\n${content.substring(0, 50000)}` },
            ],
          };
        }

        case "yuque_create_doc": {
          const createArgs = args as { bookId: number; title: string; body?: string; format?: string };
          const doc = await api.createDoc(createArgs.bookId, {
            title: createArgs.title,
            body: createArgs.body || "",
            format: createArgs.format || "lake",
          });
          return {
            content: [{ type: "text", text: `文档已创建: ${doc.title} (id: ${doc.id}, slug: ${doc.slug})` }],
          };
        }

        case "yuque_update_doc": {
          const updateArgs = args as { id: number; title?: string; body?: string; format?: string };
          const data: { title?: string; body?: string; format?: string } = {};
          if (updateArgs.title) data.title = updateArgs.title;
          if (updateArgs.body) data.body = updateArgs.body;
          if (updateArgs.format) data.format = updateArgs.format;
          const updated = await api.updateDoc(updateArgs.id, data);
          return { content: [{ type: "text", text: `文档已更新: ${updated.title}` }] };
        }

        case "yuque_delete_doc": {
          const { id } = args as { id: number };
          await api.deleteDoc(id);
          return { content: [{ type: "text", text: `文档 ${id} 已删除` }] };
        }

        case "yuque_export_doc": {
          const { slug, bookId } = args as { slug: string; bookId: number };
          const content = await api.getDocContent(slug, bookId);
          return { content: [{ type: "text", text: content }] };
        }

        default:
          return { content: [{ type: "text", text: `未知工具: ${name}` }], isError: true };
      }
    } catch (err) {
      return {
        content: [{ type: "text", text: `错误: ${(err as Error).message}` }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
