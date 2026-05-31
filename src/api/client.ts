import { getSession } from "../auth/session.js";
import type {
  YuqueUser,
  YuqueRepo,
  YuqueTocItem,
  YuqueDoc,
  ApiResponse,
} from "../types.js";

const BASE_URL = "https://www.yuque.com";

interface Headers {
  [key: string]: string;
}

function buildHeaders(method: string): Headers {
  const session = getSession();
  if (!session) {
    throw new Error("未登录，请先执行 yuque login");
  }

  const h: Headers = {
    Cookie: `_yuque_session=${session.session}; yuque_ctoken=${session.ctoken}`,
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "application/json",
  };

  if (["POST", "PUT", "DELETE"].includes(method)) {
    h["X-Csrf-Token"] = session.ctoken;
  }

  return h;
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const { method = "GET", body } = options;
  const headers = buildHeaders(method);

  if (body) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
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

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const json = (await res.json()) as ApiResponse<T> | T;
    if (json && typeof json === "object" && "data" in json) {
      return (json as ApiResponse<T>).data;
    }
    return json as T;
  }

  return (await res.text()) as unknown as T;
}

export async function getMe(): Promise<YuqueUser> {
  return request<YuqueUser>("/api/users/me");
}

export async function listRepos(): Promise<YuqueRepo[]> {
  const repos = await request<YuqueRepo[]>("/api/mine/repos");
  return repos;
}

export async function getRepo(namespace: string): Promise<YuqueRepo> {
  return request<YuqueRepo>(`/api/repos/${namespace}`);
}

export async function getToc(namespace: string): Promise<YuqueTocItem[]> {
  return request<YuqueTocItem[]>(`/api/repos/${namespace}/toc`);
}

export async function getDoc(
  namespace: string,
  slug: string
): Promise<YuqueDoc> {
  return request<YuqueDoc>(`/api/docs/${namespace}/${slug}`);
}

export async function getDocRaw(
  namespace: string,
  slug: string
): Promise<string> {
  const session = getSession();
  if (!session) throw new Error("未登录");

  const res = await fetch(
    `${BASE_URL}/api/docs/${namespace}/${slug}?raw=1`,
    {
      headers: {
        Cookie: `_yuque_session=${session.session}; yuque_ctoken=${session.ctoken}`,
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
    }
  );

  if (!res.ok) throw new Error(`导出失败: ${res.status}`);
  return res.text();
}

export async function createDoc(
  namespace: string,
  data: { title: string; body: string; format?: string }
): Promise<YuqueDoc> {
  return request<YuqueDoc>(`/api/repos/${namespace}/docs`, {
    method: "POST",
    body: { title: data.title, body: data.body, format: data.format ?? "markdown" },
  });
}

export async function updateDoc(
  id: number,
  data: { title?: string; body?: string; format?: string }
): Promise<YuqueDoc> {
  return request<YuqueDoc>(`/api/docs/${id}`, {
    method: "PUT",
    body: data,
  });
}

export async function deleteDoc(id: number): Promise<void> {
  await request<null>(`/api/docs/${id}`, { method: "DELETE" });
}
