/**
 * Supabase 클라이언트 (Expo 공식 가이드 방식, SDK 58)
 * 화면에서 직접 쓰지 않는다. src/api/ 함수 안에서만 쓴다.
 * 로그인 세션은 expo-sqlite의 localStorage에 저장돼 앱을 다시 켜도 유지된다(자동 로그인).
 *
 * 처음 쓸 때 만든다. 그래서 .env가 없는 팀원도 가짜 데이터 모드(USE_MOCK_API)로는 앱을 실행할 수 있다.
 */
import 'expo-sqlite/localStorage/install';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error('.env에 EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY를 넣어 주세요 (.env.example 참고)');
  }

  client = createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      storage: localStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });

  // 앱이 화면에 떠 있을 때만 로그인 토큰을 자동 갱신한다.
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      client?.auth.startAutoRefresh();
    } else {
      client?.auth.stopAutoRefresh();
    }
  });

  return client;
}
