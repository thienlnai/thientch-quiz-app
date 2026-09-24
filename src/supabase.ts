import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Read Supabase credentials from Vite environment variables
const envUrl = import.meta.env.VITE_SUPABASE_URL;
const envAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Check if credentials are valid and not placeholders
export const isConfigured = Boolean(
  envUrl &&
  envAnonKey &&
  envUrl.startsWith('https://') &&
  !envUrl.includes('placeholder') &&
  !envAnonKey.includes('placeholder')
);

// Fallback credentials to prevent runtime crashes when waiting for user environment configuration
export const supabaseUrl = envUrl || 'https://xyzcompany.supabase.co';
export const supabaseAnonKey = envAnonKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy';

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface SupabaseErrorInfo {
  error: string;
  operationType: OperationType;
  table: string | null;
  timestamp: string;
}

export function handleSupabaseError(error: unknown, operationType: OperationType, table: string | null): void {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
      ? String((error as any).message)
      : String(error);

  const errInfo: SupabaseErrorInfo = {
    error: message,
    operationType,
    table,
    timestamp: new Date().toISOString(),
  };
  console.error('[Supabase Error]:', JSON.stringify(errInfo));
}

// Test connection on boot to verify Supabase connectivity
export async function testConnection(): Promise<boolean> {
  if (!isConfigured) {
    console.warn(
      '[Supabase] VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY chưa được thiết lập hoặc là placeholder. Đang kích hoạt chế độ đồng bộ dữ liệu ngoại tuyến / bộ nhớ đệm an toàn.'
    );
    return false;
  }
  try {
    const { error } = await supabase.from('schools').select('id').limit(1);
    if (error) {
      console.warn('[Supabase] Kết quả kiểm tra kết nối:', error.message);
      // Nếu bảng chưa được tạo (lỗi 42P01 / PGRST204) thì máy chủ Supabase vẫn đã kết nối thành công qua HTTPS
      return !error.message.includes('Failed to fetch') && !error.message.includes('NetworkError');
    }
    console.log('[Supabase] Đã kết nối Supabase thành công.');
    return true;
  } catch (error) {
    console.warn('[Supabase] Không thể kết nối tới Supabase:', error);
    return false;
  }
}
