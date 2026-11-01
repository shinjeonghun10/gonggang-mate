-- 회원가입 도우미 (src/api/auth.ts)
-- 실행: Supabase 대시보드 → SQL Editor에 붙여넣고 Run (처음 한 번만)

-- S03 '인증' 버튼: 이미 가입을 마친 이메일인지 (비밀번호까지 정한 계정만 가입 완료로 본다)
-- 로그인 전에 부르므로 anon도 실행할 수 있다. 가입 여부(참/거짓)만 알려 주고 다른 정보는 주지 않는다.
create function public.is_email_registered(p_email text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users u
    where lower(u.email) = lower(trim(p_email))
      and coalesce((u.raw_user_meta_data ->> 'password_set')::boolean, false)
  );
$$;

revoke execute on function public.is_email_registered(text) from public;
grant execute on function public.is_email_registered(text) to anon, authenticated;
