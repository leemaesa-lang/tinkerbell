# 팅커벨 웹 모노레포

소비자 웹, 사업자 웹, 관리자 대시보드의 소스를 한 GitHub 저장소에 담고, Vercel에서 각 웹을 별도 프로젝트로 배포하는 구성입니다.

## 세 앱

| 웹              | 소스 폴더                   | Vercel Root Directory |
| --------------- | --------------------------- | --------------------- |
| 관리자 대시보드 | `client/` 및 루트 Vite 설정 | `.`                   |
| 소비자 웹       | `consumer/client/`          | `consumer`            |
| 사업자 웹       | `merchant/client/`          | `merchant`            |

GitHub 업로드와 Vercel 프로젝트 연결은 [첫 업로드 안내](GITHUB-VERCEL-START-HERE.md)를 따르세요. 필요한 앱별 lockfile, workspace 설정, `vercel.json`, 공용 `packages/` 코드도 저장소에 포함되어 있습니다.

## 서버 및 데이터 범위

이 저장소의 API는 **테스트 전용 인메모리 Mock**입니다. 서버를 재시작하면 샘플 데이터로 초기화되며, 인증·관리자 권한·실결제·송금·영속 DB를 제공하지 않습니다. Vercel의 세 프로젝트 설정은 정적 프런트엔드만 빌드합니다. 실제 운영에 연결하려면 별도의 영속 API 서버와 데이터베이스, 인증·CORS, DNS 및 HTTPS를 먼저 준비해야 합니다. `api.tkb.ai.kr`은 설정의 연결 목적지 예시이며 현재 배포된 백엔드가 아닙니다.
