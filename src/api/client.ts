import { getSession } from "../auth/session.js";
import type {
  YuqueUser,
  YuqueBook,
  YuqueBookStack,
  YuqueDoc,
  YuqueDocDetail,
} from "../types.js";

const BASE_URL = "https://www.yuque.com";

interface RequestOptions {
  method?: string;
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined>;
}

function getHeaders(method: string): Record<string, string> {
  const session = getSession();
  if (!session) throw new Error("未登录，请先执行 yuque login");

  const h: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "application/json",
  };

  h["Cookie"] = `_yuque_session=${session.session}; yuque_ctoken=${session.ctoken}`;

  if (["POST", "PUT", "DELETE", "PATCH"].includes(method)) {
    h["X-Csrf-Token"] = session.ctoken;
    h["Content-Type"] = "application/json";
  }

  return h;
}

async function request<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const { method = "GET", body, params } = options;

  let url = `${BASE_URL}${path}`;
  if (params) {
    const qs = Object.entries(params)
      .filter(([_, v]) => v !== undefined)
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join("&");
    if (qs) url += `?${qs}`;
  }

  const res = await fetch(url, {
    method,
    headers: getHeaders(method),
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });

  if (res.status >= 400) {
    let msg = `请求失败: ${res.status}`;
    try {
      const err = await res.json();
      msg = err.message || msg;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }

  const text = await res.text();
  try {
    const json = JSON.parse(text);
    if (json && typeof json === "object" && "data" in json) {
      return json.data as T;
    }
    return json as T;
  } catch {
    return text as unknown as T;
  }
}

export async function getMe(): Promise<YuqueUser> {
  const session = getSession();
  if (session?.user) return session.user;
  throw new Error("未获取到用户信息，请重新登录");
}

export async function getBooksByGroup(groupId: number): Promise<YuqueBook[]> {
  const data = await request<YuqueBookStack[]>(
    `/api/groups/${groupId}/bookstacks`
  );
  const books: YuqueBook[] = [];
  for (const stack of data || []) {
    if (stack.books) {
      for (const b of stack.books) {
        books.push({ ...b, stack_name: stack.name });
      }
    }
  }
  return books;
}

export async function getBooksByUser(userId: number): Promise<YuqueBook[]> {
  try {
    const data = await request<{ stack: YuqueBookStack; books: YuqueBook[] }>(
      `/api/users/${userId}/book_stack`
    );
    if (data && "books" in data) return data.books || [];
  } catch {
    // fallback
  }
  return [];
}

export { type YuqueBook, type YuqueBookStack };

export async function getBookOverview(
  bookId: number
): Promise<Record<string, unknown>> {
  return request(`/api/books/${bookId}/overview`);
}

export async function listDocs(bookId: number): Promise<YuqueDoc[]> {
  const result = await request<unknown>(`/api/docs`, {
    params: { book_id: bookId, status: 1 },
  });
  if (Array.isArray(result)) return result;
  if (result && typeof result === "object" && "data" in (result as Record<string, unknown>)) {
    return (result as { data: YuqueDoc[] }).data;
  }
  return [];
}

export async function getDoc(
  slug: string,
  bookId: number
): Promise<YuqueDocDetail> {
  return request<YuqueDocDetail>(`/api/docs/${slug}`, {
    params: {
      book_id: bookId,
      include_contributors: false,
      include_like: false,
      include_hits: false,
      merge_dynamic_data: false,
    },
  });
}

export async function getDocContent(
  slug: string,
  bookId: number
): Promise<string> {
  const doc = await getDoc(slug, bookId);
  return doc.content || doc.body_html || "";
}

export async function createDoc(
  bookId: number,
  data: { title: string; body: string; format?: string }
): Promise<YuqueDoc> {
  return request<YuqueDoc>(`/api/docs`, {
    method: "POST",
    body: {
      title: data.title,
      body: data.body,
      format: data.format || "lake",
      book_id: bookId,
      status: 1,
      public: 0,
    },
  });
}

export async function updateDoc(
  docId: number,
  data: { title?: string; body?: string; format?: string }
): Promise<YuqueDoc> {
  const body: Record<string, unknown> = {};
  if (data.title !== undefined) body.title = data.title;
  if (data.body !== undefined) body.body = data.body;
  if (data.format !== undefined) body.format = data.format;
  return request<YuqueDoc>(`/api/docs/${docId}`, { method: "PUT", body });
}

export async function deleteDoc(docId: number): Promise<void> {
  await request<null>(`/api/docs/${docId}`, { method: "DELETE" });
}
