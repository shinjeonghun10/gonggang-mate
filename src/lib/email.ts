import { ALLOWED_EMAIL_DOMAINS } from '@/constants/config';

/** 이메일 앞뒤 공백을 지우고 소문자로 맞춘다 (로그인 아이디 비교용) */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** 학교 이메일인지 검사 (서버도 같은 도메인 목록으로 막는다: schools 테이블) */
export function isAllowedEmail(email: string): boolean {
  const domain = normalizeEmail(email).split('@')[1];
  return !!domain && ALLOWED_EMAIL_DOMAINS.includes(domain);
}
