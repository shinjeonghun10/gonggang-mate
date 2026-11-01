/**
 * Supabase로 바꾼 api 함수들이 같이 쓰는 도우미
 */
import type { User } from '@supabase/supabase-js';

import { ApiError } from '@/api/types';
import { getSupabase } from '@/lib/supabase';

/**
 * 가짜 데이터 모드. .env에 EXPO_PUBLIC_USE_MOCK_API=false를 넣어야 실제 Supabase를 쓴다.
 * 모든 api 파일을 Supabase로 바꾸고 mock/ 폴더를 지울 때 이 값도 지운다.
 */
export const USE_MOCK_API = process.env.EXPO_PUBLIC_USE_MOCK_API !== 'false';

export const sb = getSupabase;

/** 로그인한 사용자. 없으면 ApiError('not_logged_in') */
export async function requireAuthUser(): Promise<User> {
  const { data } = await sb().auth.getSession();
  const user = data.session?.user;
  if (!user) throw new ApiError('로그인이 필요해요', 'not_logged_in');
  return user;
}

type SupabaseErrorLike = { code?: string; message?: string; name?: string };

/** Supabase 에러를 화면에 보여 줄 수 있는 ApiError로 바꾼다. 따로 처리하지 않은 에러는 fallback 문장 */
export function toApiError(error: SupabaseErrorLike, fallback: string): ApiError {
  if (__DEV__) console.warn('[supabase]', error.code, error.message);

  if (error.name === 'AuthRetryableFetchError' || /network request failed|failed to fetch/i.test(error.message ?? '')) {
    return new ApiError('인터넷 연결을 확인해 주세요', 'network');
  }
  switch (error.code) {
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return new ApiError('요청이 너무 많아요. 잠시 후 다시 시도해 주세요', 'not_allowed');
    case 'email_address_not_authorized':
      return new ApiError('지금은 이 주소로 인증 메일을 보낼 수 없어요', 'not_allowed');
    default:
      return new ApiError(fallback, 'invalid_input');
  }
}
