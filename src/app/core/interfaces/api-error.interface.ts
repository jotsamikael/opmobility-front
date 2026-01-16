export interface ApiErrorResponse {
  statusCode: number;
  message: string | string[];
  error: string;
  timestamp?: string;
  path?: string;
}

export interface AuthErrorResponse {
  message: string;
  type: 'credentials' | 'network' | 'server' | 'validation' | 'account' | 'unknown';
  details?: string;
  field?: string;
}
