# 팅커벨 첫 업로드 안내 — GitHub 1개, Vercel 프로젝트 3개

이 패키지는 소비자 웹·사업자 웹·관리자 대시보드를 **하나의 GitHub 저장소**에 넣는 모노레포입니다. Vercel에서는 같은 저장소를 연결해 각 웹을 별도 프로젝트로 배포합니다. ZIP을 풀면 파일이 바로 저장소 루트에 놓이며, 앱마다 폴더와 설정이 분리되어 있습니다.

## 세 웹의 위치와 Vercel 설정

| 웹              | 저장소 안의 소스 위치                         | Vercel Root Directory | Install Command                               | Build Command           | Output Directory |
| --------------- | --------------------------------------------- | --------------------- | --------------------------------------------- | ----------------------- | ---------------- |
| 관리자 대시보드 | `client/`, 루트 `vite.config.ts`              | `.`                   | `pnpm install --frozen-lockfile --prod=false` | `pnpm exec vite build`  | `dist/public`    |
| 소비자 웹       | `consumer/client/`, `consumer/vite.config.ts` | `consumer`            | `pnpm install --frozen-lockfile --prod=false` | `pnpm exec vite build`  | `dist/public`    |
| 사업자 웹       | `merchant/client/`, `merchant/vite.config.ts` | `merchant`            | `pnpm install --frozen-lockfile --prod=false` | `pnpm run build:static` | `dist/public`    |

관리자용 Vercel 설정은 저장소 루트의 `vercel.json`, 소비자 설정은 `consumer/vercel.json`, 사업자 설정은 `merchant/vercel.json`에 있습니다. `packages/`, `shared/`, `server/`는 앱들이 함께 사용하는 저장소 공용 코드입니다. 소비자·사업자 Vercel 프로젝트에서는 **Include source files outside of the Root Directory in the Build Step** 옵션을 켜 공용 패키지까지 빌드에 포함합니다.

소비자와 사업자 앱은 각각의 `pnpm-workspace.yaml` 및 `pnpm-lock.yaml`로 앱별 설치를 고정합니다. 이 파일들은 각각 `consumer/`와 `merchant/` 폴더 안에 둡니다. 세 앱은 `pnpm`을 사용하며, 이 업로드 패키지는 해당 pnpm lockfile만 사용하도록 구성했습니다.

## 1. GitHub 저장소 준비 및 파일 올리기

저장소 파일만 비워 두었다면 그 저장소를 사용합니다. 저장소 자체를 삭제했다면 GitHub에서 **저장소 하나만** 새로 만듭니다. 세 웹마다 GitHub 저장소를 따로 만들 필요는 없습니다.

1. GitHub Desktop에서 빈 저장소를 복제합니다.
2. 이 ZIP을 컴퓨터에서 압축 해제합니다.
3. 압축을 푼 폴더 자체가 아니라 **그 안의 모든 파일과 폴더**를 GitHub Desktop 저장소 폴더의 최상위로 복사합니다. 이미 있는 숨김 `.git` 폴더는 유지합니다.
4. 저장소 최상위에 `client/`, `consumer/`, `merchant/`, `packages/`, `shared/`, `server/`, `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `vercel.json`이 보이고, 앱 폴더에 각각 `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `vercel.json`이 있는지 확인합니다.
5. GitHub Desktop에서 변경사항을 커밋하고 `Push origin`을 누릅니다.

ZIP 파일 자체를 GitHub에 올리지 말고, 압축을 푼 내용만 올립니다. 실제 `.env` 파일·API 키·비밀값, `node_modules/`, `dist/` 폴더도 올리지 않습니다. `.env.example`처럼 `.example`로 끝나는 안전한 템플릿은 유지합니다. 전체 소스 업로드에는 GitHub Desktop을 이용하는 편이 편리합니다. [GitHub 파일 추가 공식 안내](https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository)

## 2. Vercel 프로젝트 세 개 만들기

Vercel에서 GitHub 저장소를 연결한 뒤, 같은 GitHub 저장소를 각각 선택하여 아래 세 프로젝트를 만듭니다.

1. `tinkerbell-admin` — Root Directory `.`
2. `tinkerbell-consumer` — Root Directory `consumer`
3. `tinkerbell-merchant` — Root Directory `merchant`

각 프로젝트의 Production Branch는 GitHub에 올린 `main`으로 지정합니다. 위 표의 Install/Build/Output 값을 해당 프로젝트에 설정하고, 소비자·사업자 프로젝트에는 저장소 Root Directory 밖의 `packages/` 등 공용 코드 포함 옵션을 켭니다. Vercel 대시보드의 별도 빌드 설정이 `vercel.json`과 다르면 표의 앱별 값으로 맞춥니다.

## 도메인과 데이터 연결 범위

기본 도메인 `tkb.ai.kr`은 사용자가 지정한 주소입니다. 소비자·사업자·관리자별 도메인 연결과 DNS 설정은 별도로 정해야 합니다. 세 Vercel 설정의 API 목적지 `api.tkb.ai.kr`은 연결 주소 예시이며 API 서버가 배포되었다는 뜻이 아닙니다.

이 Vercel 설정은 세 웹의 **정적 프런트엔드**를 빌드합니다. 실제 회원·쿠폰·승인 데이터 연동을 위해서는 세 웹이 사용할 영속 API 서버와 데이터베이스, 인증·CORS 설정, DNS가 별도로 준비되어야 합니다. 현재 Mock 서버는 메모리 데이터이므로 운영 데이터 저장소로 간주하면 안 됩니다.


## Supabase 사업자 DB 스키마 파일

`merchant/supabase/merchant-schema.sql`은 비어 있는 Supabase `public` 스키마에 한 번 실행하는 PostgreSQL DDL입니다. Supabase 대시보드의 SQL Editor에서 파일 내용을 실행하면 테이블과 제약조건을 생성합니다. 실제 회원·쿠폰 데이터, 테스트 행, API 키는 포함하지 않습니다.

이 파일은 **스키마 생성용일 뿐** 기존 사업자 API를 Supabase로 연결하거나 Vercel의 502 오류를 해결하지 않습니다. 현재 사업자 서버는 MySQL2/tRPC 구조이므로, 실제 Supabase 사용 전에는 서버 드라이버·쿼리·인증/RLS 정책을 별도로 이관하고 API 서버를 배포해야 합니다. RLS는 모든 테이블에 켜져 있으며 클라이언트 정책은 아직 없어 기본적으로 클라이언트 접근이 거부됩니다. 비밀 키를 브라우저 코드나 `VITE_` 변수에 넣지 마세요.
