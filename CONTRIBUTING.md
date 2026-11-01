# 협업 방법 (처음부터 차근차근)

우리 팀은 **Fork → Pull Request** 방식으로 일한다.

- **원본 레포** = `JCL-01/gonggang-mate` (팀 공용, 관리자가 관리)
- **내 Fork** = 원본을 내 GitHub 계정으로 복사한 것 (내 작업 공간)
- 내 Fork에서 작업한 뒤, 원본에 "제 코드 합쳐 주세요" 요청을 보내는 것이 **Pull Request(PR)**

---

## 처음 한 번만 하는 준비

### 1. 프로그램 설치
Node.js(LTS), Git, VS Code, 휴대폰에 Expo Go.

처음이라면 Git에 이름과 이메일을 등록한다. (VS Code 터미널: `` Ctrl + ` ``)

```bash
git config --global user.name "내이름"
git config --global user.email "내GitHub이메일"
```

### 2. Fork 하기
1. 브라우저에서 https://github.com/JCL-01/gonggang-mate 접속
2. 오른쪽 위 **Fork** 버튼 → **Create fork**
3. 내 계정에 `내아이디/gonggang-mate`가 생긴다

### 3. 내 Fork를 컴퓨터로 내려받기 (clone)
1. VS Code에서 `Ctrl + Shift + P` → **Git: Clone** 입력
2. **Clone from GitHub** → 로그인 → `내아이디/gonggang-mate` 선택
3. 저장할 폴더 선택 → **열기**

### 4. 원본 레포 등록 (upstream)
나중에 원본의 최신 코드를 받아오기 위해 등록해 둔다. VS Code 터미널에서:

```bash
git remote add upstream https://github.com/JCL-01/gonggang-mate.git
```

### 5. 실행 확인

```bash
npm install
npx expo start
```

휴대폰 Expo Go로 QR을 찍어 화면이 뜨면 준비 끝.

`.env` 파일이 필요해지면: `.env.example`을 복사해서 이름을 `.env`로 바꾸고, 단톡방에서 받은 값을 넣는다.

---

## 작업할 때마다 반복하는 순서

### ① 원본의 최신 코드 받아오기

```bash
git switch master
git pull upstream master
```

### ② 작업용 브랜치 만들기
브랜치 이름은 `feat/화면ID-설명` 형식.

```bash
git switch -c feat/S07-board
```

### ③ 코드 작성
**내가 맡은 화면 파일만** 고친다. 공통 파일은 아래 "규칙" 참고.

### ④ 커밋 (VS Code로)
1. 왼쪽 **소스 제어** 아이콘 (`Ctrl + Shift + G`)
2. 메시지 칸에 `feat(S07): 게시물 목록 화면` 처럼 쓰기
3. **커밋** 버튼 (스테이징 물어보면 "예")

### ⑤ 내 Fork에 올리기
소스 제어 화면에서 **Branch 게시(Publish Branch)** 버튼. (두 번째부터는 **변경 내용 동기화**)

### ⑥ Pull Request 만들기
1. GitHub의 **내 Fork** 페이지로 가면 노란 박스 **Compare & pull request**가 보인다 → 클릭
2. 받는 쪽(base)이 `JCL-01/gonggang-mate`의 `master`인지 확인
3. 템플릿 칸을 채우고(화면 ID, 스크린샷) **Create pull request**

### ⑦ 리뷰 → 합치기
- **관리자가** PR을 확인하고 **Merge** 한다
- 수정 요청이 오면: 같은 브랜치에서 고치고 커밋 → 동기화하면 PR에 자동 반영
- 합쳐진 뒤에는 다시 ①번부터

---

## 규칙

1. **master에 직접 올리지 않는다.** 항상 내 Fork에서 PR로. (관리자만 master에 직접 올릴 수 있다)
2. **PR은 작게.** 화면 하나 또는 기능 하나.
3. **공통 파일**(`src/constants`, `src/types`, `src/components`)을 고칠 때는 단톡방에 먼저 알리고, 화면 작업과 **따로** PR을 올린다.
4. 색상·숫자는 직접 적지 말고 `theme.ts`, `config.ts`에서 가져다 쓴다.
5. 화면 내용은 **PRD**를 따르고, PRD와 다르게 정한 것은 `docs/DECISIONS.md`를 따른다. 화면 파일 맨 위 주석에 요약이 있다.
6. **기능 먼저, 디자인은 나중에.** 디자인은 디자인팀 피그마를 받은 뒤 반영한다. 지금은 `theme.ts` 값과 공통 부품만 써서 나중에 쉽게 바꿀 수 있게 한다.
7. PR 올리기 전에 휴대폰에서 실행해 보고, 아래 검사를 통과시킨다.

```bash
npm run lint
npm run typecheck
```

### 커밋 메시지 형식

| 앞말 | 뜻 | 예 |
|---|---|---|
| `feat` | 새 기능 | `feat(S07): 게시물 카드 목록` |
| `fix` | 버그 수정 | `fix(S12): 메시지 스크롤 오류` |
| `style` | 디자인만 수정 | `style(S05): 카테고리 박스 간격` |
| `docs` | 문서 | `docs: README 담당자 추가` |
| `chore` | 설정·기타 | `chore: 패키지 추가` |

### 패키지(라이브러리)를 추가할 때
`npm install` 대신 아래 명령어를 쓴다. (Expo 버전에 맞는 걸 골라 줌)

```bash
npx expo install 패키지이름
```

---

## 자주 막히는 상황

**PR에 빨간 X가 떴어요** → PR 페이지 아래 **Details**를 눌러 오류를 보고 고친 뒤 다시 커밋·동기화.

**"conflict(충돌)"가 났어요** → 같은 파일을 두 사람이 고친 것. 혼자 해결하기 어려우면 단톡방에 PR 링크를 올리고 같이 본다.

**Expo Go에서 QR을 찍어도 안 열려요** → 컴퓨터와 휴대폰이 같은 와이파이인지 확인. 안 되면 `npx expo start --tunnel`.
