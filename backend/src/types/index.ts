export type UserRole = 'admin' | 'manager' | 'member';
export type ProjectMemberRole = 'owner' | 'manager' | 'member' | 'reviewer';

export interface AuthenticatedUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  phone?: string | null;
  avatar?: string | null;
  job_title?: string | null;
  bio?: string | null;
  weekly_capacity_hours?: number;
  is_active?: number | boolean;
  last_login_at?: string | null;
  created_at?: string;
  updated_at?: string;
  [key: string]: any;
}

export interface JwtUserPayload {
  id: number;
  role: string;
  email: string;
  iat?: number;
  exp?: number;
}

export interface PaginationMeta {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

