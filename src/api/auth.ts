/**
 * 인증 (S01 타이틀, S02 로그인, S03 회원가입) — PRD 6장 S01~S03, 12장 보안
 *
 * Supabase Auth 흐름 (학교 이메일 = 로그인 아이디, 별도 아이디 없음)
 * 1. sendEmailCode: 학교 이메일로 6자리 인증 코드 발송 (signInWithOtp). 학교 도메인이 아니면 서버도 거부
 * 2. verifyEmailCode: 코드 확인 (verifyOtp). 이때 로그인 상태가 된다
 * 3. signUp: 비밀번호를 정하고 가입 완료(password_set 표시). 이미 로그인돼 있으므로 바로 S04로
 * 가입 도중에 그만둔 사람(비밀번호를 안 정함)은 getSession에서 로그아웃시킨다.
 *
 * Supabase 대시보드 설정이 필요하다: Magic Link 메일 템플릿에 {{ .Token }}, 외부 메일(SMTP) 연결
 * TODO(C): 5회 실패 시 잠금은 Supabase 기본 요청 제한(IP 기준)으로 대신하고 있음
 */
import * as mock from '@/api/mock/auth';
import { getMe } from '@/api/users';
import { requireAuthUser, sb, toApiError, USE_MOCK_API } from '@/api/supabaseHelpers';
import { ApiError, type Me } from '@/api/types';
import { PASSWORD_MIN_LENGTH } from '@/constants/config';
import { isAllowedEmail, normalizeEmail } from '@/lib/email';

export { isAllowedEmail };

/** 가짜 데이터 전용: 테스트 계정으로 바로 로그인 */
export const mockLoginAsMe = mock.mockLoginAsMe;

/** S01: 저장된 로그인 세션 확인. 있으면 내 정보, 없으면 null. 내 정보의 nickname이 ''이면 프로필 미작성 → S04 */
export async function getSession(): Promise<Me | null> {
  if (USE_MOCK_API) return mock.getSession();
  const { data } = await sb().auth.getSession();
  const user = data.session?.user;
  if (!user) return null;
  if (!user.user_metadata?.password_set) {
    // 인증 코드만 확인하고 비밀번호를 정하지 않은 채 나간 경우: 가입이 끝나지 않았으므로 로그아웃
    await sb().auth.signOut();
    return null;
  }
  return getMe();
}

/** S03: '인증' 버튼 — 학교 이메일로 6자리 인증 코드 발송 (같은 주소로는 60초에 한 번) */
export async function sendEmailCode(email: string): Promise<void> {
  if (USE_MOCK_API) return mock.sendEmailCode(email);
  const key = normalizeEmail(email);
  if (!isAllowedEmail(key)) throw new ApiError('중앙대 학교 이메일만 가입할 수 있어요', 'invalid_input');

  const registered = await sb().rpc('is_email_registered', { p_email: key });
  if (registered.error) throw toApiError(registered.error, '인증 메일을 보내지 못했어요');
  if (registered.data) throw new ApiError('이미 가입된 이메일이에요', 'already_exists');

  const { error } = await sb().auth.signInWithOtp({ email: key, options: { shouldCreateUser: true } });
  if (error) throw toApiError(error, '인증 메일을 보내지 못했어요');
}

/** S03: 인증 코드 확인. 성공하면 '가입 완료' 버튼 활성 */
export async function verifyEmailCode(email: string, code: string): Promise<void> {
  if (USE_MOCK_API) return mock.verifyEmailCode(email, code);
  const { error } = await sb().auth.verifyOtp({ email: normalizeEmail(email), token: code.trim(), type: 'email' });
  if (error) throw toApiError(error, '인증 코드가 맞지 않거나 시간이 지났어요');
}

/** S03: 가입 완료 → 자동 로그인. 다음 화면은 S04(신규 프로필 설정) */
export async function signUp(email: string, password: string): Promise<Me> {
  if (USE_MOCK_API) return mock.signUp(email, password);
  if (password.length < PASSWORD_MIN_LENGTH) throw new ApiError(`비밀번호는 ${PASSWORD_MIN_LENGTH}자 이상이어야 해요`, 'invalid_input');

  const user = await requireAuthUser().catch(() => null);
  if (!user || user.email !== normalizeEmail(email)) throw new ApiError('이메일 인증을 먼저 해 주세요', 'invalid_input');

  const { error } = await sb().auth.updateUser({ password, data: { password_set: true } });
  if (error) {
    if (error.code === 'weak_password') throw new ApiError('더 안전한 비밀번호를 써 주세요', 'invalid_input');
    throw toApiError(error, '가입하지 못했어요. 다시 시도해 주세요');
  }
  return getMe();
}

/** S02: 로그인. 실패 시 어느 쪽이 틀렸는지 구분하지 않는다 */
export async function logIn(email: string, password: string): Promise<Me> {
  if (USE_MOCK_API) return mock.logIn(email, password);
  const { error } = await sb().auth.signInWithPassword({ email: normalizeEmail(email), password });
  if (error) throw toApiError(error, '이메일 또는 비밀번호를 확인해 주세요');
  return getMe();
}

export async function logOut(): Promise<void> {
  if (USE_MOCK_API) return mock.logOut();
  const { error } = await sb().auth.signOut();
  if (error) throw toApiError(error, '로그아웃하지 못했어요');
}
