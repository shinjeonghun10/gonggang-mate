/** 가짜 인증 (api/auth.ts의 USE_MOCK_API 모드). Supabase 연결 후 지운다. */
import { ApiError, type Me } from '@/api/types';
import { copy, db, delay, ME_ID, newId, nowIso } from '@/api/mock/store';
import { PASSWORD_MIN_LENGTH } from '@/constants/config';
import { isAllowedEmail } from '@/lib/email';

/** S01: 저장된 로그인 세션 확인. 있으면 내 정보, 없으면 null */
export async function getSession(): Promise<Me | null> {
  await delay(200);
  const user = db.users.find((u) => u.id === db.session.userId);
  return user ? copy(stripPassword(user)) : null;
}

/** S03: '인증' 버튼 — 학교 이메일로 인증 코드 발송 (가짜: 코드는 항상 123456) */
export async function sendEmailCode(email: string): Promise<void> {
  await delay();
  if (!isAllowedEmail(email)) throw new ApiError('학교 이메일만 가입할 수 있어요', 'invalid_input');
  if (db.users.some((u) => u.email === email.trim().toLowerCase())) throw new ApiError('이미 가입된 이메일이에요', 'already_exists');
  db.pendingEmailCodes.set(email.trim().toLowerCase(), '123456');
}

/** S03: 인증 코드 확인. 성공하면 '가입 완료' 버튼 활성 */
export async function verifyEmailCode(email: string, code: string): Promise<void> {
  await delay();
  const key = email.trim().toLowerCase();
  if (db.pendingEmailCodes.get(key) !== code.trim()) throw new ApiError('인증 코드가 맞지 않아요', 'invalid_input');
  db.verifiedEmails.add(key);
}

/** S03: 가입 완료 → 자동 로그인. 다음 화면은 S04(신규 프로필 설정) */
export async function signUp(email: string, password: string): Promise<Me> {
  await delay();
  const key = email.trim().toLowerCase();
  if (!db.verifiedEmails.has(key)) throw new ApiError('이메일 인증을 먼저 해 주세요', 'invalid_input');
  if (password.length < PASSWORD_MIN_LENGTH) throw new ApiError(`비밀번호는 ${PASSWORD_MIN_LENGTH}자 이상이어야 해요`, 'invalid_input');
  const user = {
    id: newId('u'),
    school_id: 'cau',
    email: key,
    password,
    nickname: '',
    gender: 'female' as const,
    bio: null,
    photo_url: null,
    heart_count: 0,
    created_at: nowIso(),
  };
  db.users.push(user);
  db.session.userId = user.id;
  return copy(stripPassword(user));
}

/** S02: 로그인. 실패 시 어느 쪽이 틀렸는지 구분하지 않는다 */
export async function logIn(email: string, password: string): Promise<Me> {
  await delay();
  const user = db.users.find((u) => u.email === email.trim().toLowerCase() && u.password === password);
  if (!user) throw new ApiError('이메일 또는 비밀번호를 확인해 주세요', 'invalid_input');
  db.session.userId = user.id;
  return copy(stripPassword(user));
}

export async function logOut(): Promise<void> {
  await delay(100);
  db.session.userId = null;
}

/** 가짜 데이터 전용: 테스트 계정으로 바로 로그인 */
export function mockLoginAsMe() {
  db.session.userId = ME_ID;
}

function stripPassword<T extends { password?: string }>(u: T): Omit<T, 'password'> {
  const { password: _password, ...rest } = u;
  return rest;
}
