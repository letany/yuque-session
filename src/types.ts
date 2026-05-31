export interface SessionData {
  session: string;
  ctoken: string;
  user: YuqueUser | null;
  expiresAt: number;
  createdAt: number;
}

export interface YuqueUser {
  id: number;
  name: string;
  login: string;
  avatar_url: string;
}

export interface YuqueBook {
  id: number;
  type: string;
  slug: string;
  name: string;
  user_id: number;
  description?: string;
  items_count?: number;
  namespace?: string;
  stack_name?: string;
  [key: string]: unknown;
}

export interface YuqueBookStack {
  id: number;
  name: string;
  books?: YuqueBook[];
  [key: string]: unknown;
}

export interface YuqueDoc {
  id: number;
  slug: string;
  title: string;
  description: string;
  book_id: number;
  user_id: number;
  format: string;
  status: number;
  content_updated_at: string;
  created_at: string;
  updated_at: string;
  published_at: string;
  word_count: number;
  [key: string]: unknown;
}

export interface YuqueDocDetail extends YuqueDoc {
  content?: string;
  body_html?: string;
  body_lake?: string;
}

export interface ApiResponse<T> {
  data: T;
}
