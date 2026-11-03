-- 개발용 테스트 계정 3개 (메일 인증 없이 바로 로그인 가능). 마이그레이션이 아니다.
-- 실행: Supabase 대시보드 → SQL Editor에 붙여넣고 Run (처음 한 번만)
-- 로그인: test-mate1@cau.ac.kr / test-mate2@cau.ac.kr / test-mate3@cau.ac.kr, 비밀번호 모두 testpass1
-- 프로필(닉네임 등)은 아직 없다. 앱이나 테스트 스크립트에서 S04 프로필 저장부터 하면 된다.
-- 지우기: Authentication → Users에서 test-mate 계정 삭제 (프로필·공강·게시물도 같이 지워짐)

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select
  '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
  e.email, extensions.crypt('testpass1', extensions.gen_salt('bf')), now(),
  '{"provider": "email", "providers": ["email"]}', '{"password_set": true}', now(), now(),
  '', '', '', ''
from (values ('test-mate1@cau.ac.kr'), ('test-mate2@cau.ac.kr'), ('test-mate3@cau.ac.kr')) as e (email);

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text, jsonb_build_object('sub', u.id::text, 'email', u.email), 'email', now(), now(), now()
from auth.users u
where u.email like 'test-mate_@cau.ac.kr';
