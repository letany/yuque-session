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
    {
      name: "yuque-session",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "yuque_list_repos",
        description: "列出当前用户的所有知识库",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "yuque_list_docs",
        description: "列出知识库内的文档（目录树）",
        inputSchema: {
          type: "object",
          properties: {
            namespace: {
              type: "string",
              description: "知识库 namespace，格式: login/repo-slug",
            },
          },
          required: ["namespace"],
        },
      },
      {
        name: "yuque_get_doc",
        description: "获取文档内容",
        inputSchema: {
          type: "object",
          properties: {
            namespace: {
              type: "string",
              description: "知识库 namespace，格式: login/repo-slug",
            },
            slug: {
              type: "string",
              description: "文档 slug（URL 中的最后一段）",
            },
          },
          required: ["namespace", "slug"],
        },
      },
      {
        name: "yuque_create_doc",
        description: "在知识库中创建新文档",
        inputSchema: {
          type: "object",
          properties: {
            namespace: {
              type: "string",
              description: "知识库 namespace，格式: login/repo-slug",
            },
            title: {
              type: "string",
              description: "文档标题",
            },
            body: {
              type: "string",
              description: "文档内容 (Markdown 格式)",
            },
          },
          required: ["namespace", "title", "body"],
        },
      },
      {
        name: "yuque_update_doc",
        description: "更新现有文档",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "number",
              description: "文档 ID",
            },
            title: {
              type: "string",
              description: "新标题（可选）",
            },
            body: {
              type: "string",
              description: "新内容 (Markdown，可选)",
            },
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
            id: {
              type: "number",
              description: "文档 ID",
            },
          },
          required: ["id"],
        },
      },
      {
        name: "yuque_export_doc",
        description: "导出文档为 Markdown",
        inputSchema: {
          type: "object",
          properties: {
            namespace: {
              type: "string",
              description: "知识库 namespace，格式: login/repo-slug",
            },
            slug: {
              type: "string",
              description: "文档 slug（URL 中的最后一段）",
            },
          },
          required: ["namespace", "slug"],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case "yuque_list_repos": {
          const repos = await api.listRepos();
          const text = repos
            .map(
              (r) =>
                `${r.name} (${r.namespace}) [${r.items_count} 篇]`
            )
            .join("\n");
          return { content: [{ type: "text", text: text || "暂无知识库" }] };
        }

        case "yuque_list_docs": {
          const { namespace } = args as { namespace: string };
          const toc = await api.getToc(namespace);
          const text = flattenToc(toc);
          return { content: [{ type: "text", text }] };
        }

        case "yuque_get_doc": {
          const { namespace, slug } = args as {
            namespace: string;
            slug: string;
          };
          const doc = await api.getDoc(namespace, slug);
          const text = `# ${doc.title}\n\n${doc.body_html || doc.body || ""}`;
          return { content: [{ type: "text", text }] };
        }

        case "yuque_create_doc": {
          const { namespace, title, body } = args as {
            namespace: string;
            title: string;
            body: string;
          };
          const doc = await api.createDoc(namespace, { title, body });
          return {
            content: [
              {
                type: "text",
                text: `文档已创建: ${doc.title} (id: ${doc.id}, slug: ${doc.slug})`,
              },
            ],
          };
        }

        case "yuque_update_doc": {
          const updateArgs = args as {
            id: number;
            title?: string;
            body?: string;
          };
          const data: { title?: string; body?: string; format?: string } = {};
          if (updateArgs.title) data.title = updateArgs.title;
          if (updateArgs.body) data.body = updateArgs.body;
          const updated = await api.updateDoc(updateArgs.id, data);
          return {
            content: [
              { type: "text", text: `文档已更新: ${updated.title}` },
            ],
          };
        }

        case "yuque_delete_doc": {
          const { id } = args as { id: number };
          await api.deleteDoc(id);
          return {
            content: [{ type: "text", text: `文档 ${id} 已删除` }],
          };
        }

        case "yuque_export_doc": {
          const { namespace, slug } = args as {
            namespace: string;
            slug: string;
          };
          const markdown = await api.getDocRaw(namespace, slug);
          return {
            content: [{ type: "text", text: markdown }],
          };
        }

        default:
          return {
            content: [{ type: "text", text: `未知工具: ${name}` }],
            isError: true,
          };
      }
    } catch (err) {
      return {
        content: [
          { type: "text", text: `错误: ${(err as Error).message}` },
        ],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

function flattenToc(items: import("../types.js").YuqueTocItem[], depth = 0): string {
  let result = "";
  for (const item of items) {
    const prefix = "  ".repeat(depth);
    const icon = item.type === "DOCUMENT" ? "📄" : "📁";
    result += `${prefix}${icon} ${item.title} (${item.slug})\n`;
    if (item.child && item.child.length > 0) {
      result += flattenToc(item.child, depth + 1);
    }
  }
  return result;
}
