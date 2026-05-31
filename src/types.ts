export interface SessionData {
  session: string;
  ctoken: string;
  user: {
    id: number;
    name: string;
    login: string;
    avatar_url: string;
  } | null;
  expiresAt: number;
  createdAt: number;
}

export interface YuqueUser {
  id: number;
  name: string;
  login: string;
  avatar_url: string;
}

export interface YuqueRepo {
  id: number;
  type: string;
  slug: string;
  name: string;
  namespace: string;
  user_id: number;
  description: string;
  toc_yml: string;
  items_count: number;
  content_updated_at: string;
}

export interface YuqueTocItem {
  uuid: string;
  type: string;
  title: string;
  slug: string;
  url: string;
  depth: number;
  id: number;
  repo_id: number;
  parent_uuid: string | null;
  child?: YuqueTocItem[];
}

export interface YuqueDoc {
  id: number;
  slug: string;
  title: string;
  description: string;
  body: string;
  body_html: string;
  body_lake: string;
  format: string;
  public: number;
  status: number;
  likes_count: number;
  comments_count: number;
  content_updated_at: string;
  created_at: string;
  updated_at: string;
}

export interface ApiResponse<T> {
  data: T;
  abilities?: Record<string, boolean>;
}

export interface ApiError {
  message: string;
  code?: number;
}
