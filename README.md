# AI 캐리커처 스튜디오

사진을 업로드하고 스타일을 고르면 OpenAI 이미지 편집 API(`gpt-image-2.5-sunburst`)가 캐리커처·애니메이션·영화 포스터 등으로 변환해 주는 웹 앱입니다.

## 주요 기능

- 사진 업로드 (JPG / PNG / WEBP, 클릭 또는 드래그 앤 드롭)
- 스타일 선택: 캐리커처, 애니메이션, 영화 포스터, 3D 캐릭터, 수채화, 팝아트
- AI 이미지 변환 (로딩 상태 · 오류 안내 표시)
- 원본과 결과 비교 (나란히 보기 / 슬라이더)
- 변환된 이미지 다운로드

## 기술 스택

| 구분 | 사용 기술 |
|---|---|
| 프론트엔드 | HTML, CSS, JavaScript (`public/`) |
| 백엔드 | Node.js + Express (`server.js`) |
| 이미지 편집 API | OpenAI `gpt-image-2.5-sunburst` |
| 배포 | Vercel |

## 프로젝트 구조

```
├── server.js          # Express 서버 (API 엔드포인트, Vercel 진입점)
├── lib/
│   ├── styles.js      # 스타일별 변환 프롬프트
│   └── transform.js   # OpenAI 이미지 편집 API 호출
├── public/            # 프론트엔드 (index.html, style.css, app.js)
├── .env.example       # 환경변수 견본
└── package.json
```

## 로컬에서 실행하기

필요 환경: Node.js 20 이상

```bash
# 1. 패키지 설치
npm install

# 2. 환경변수 파일 만들기
cp .env.example .env
#   .env 를 열어 OPENAI_API_KEY 에 본인의 API 키 입력

# 3. 서버 실행
npm start          # → http://localhost:3000
```

개발 중에는 `npm run dev` 로 실행하면 코드 수정 시 서버가 자동으로 재시작됩니다.

## 환경변수

| 이름 | 필수 | 설명 | 기본값 |
|---|---|---|---|
| `OPENAI_API_KEY` | ✅ | OpenAI API 키 | – |
| `OPENAI_IMAGE_MODEL` | | 이미지 편집 모델 | `gpt-image-2.5-sunburst` |
| `OPENAI_IMAGE_QUALITY` | | `low` / `medium` / `high` / `xhigh` / `max` / `auto` | `medium` |
| `MOCK_TRANSFORM` | | `true` 면 API 호출 없이 원본을 돌려줌 (비용 없는 테스트) | – |
| `RATE_LIMIT_MAX` | | IP당 변환 허용 횟수 (`0` = 제한 없음) | `5` |
| `RATE_LIMIT_WINDOW_MIN` | | 위 횟수를 세는 시간(분) | `10` |

## API

`POST /api/transform` (multipart/form-data)

| 필드 | 설명 |
|---|---|
| `image` | 이미지 파일 (최대 4MB, 프론트엔드에서 자동 축소) |
| `style` | `caricature` · `anime` · `movie-poster` · `3d-cartoon` · `watercolor` · `pop-art` |

응답: `{ "image": "data:image/jpeg;base64,...", "mock": false }` · 오류 시 `{ "error": "메시지" }`

## Vercel 배포

1. 이 저장소를 Vercel에서 **Add New → Project** 로 Import
2. **Environment Variables** 에 `OPENAI_API_KEY` 등록
3. **Deploy**

`server.js` 가 Express 앱을 export 하고 정적 파일은 `public/` 에 있어, 별도 설정 없이 Vercel이 자동으로 인식합니다.

## 주의사항

- `.env` 파일(API 키)은 GitHub에 올리지 않습니다. (`.gitignore` 에 포함)
- 이미지 변환 1회마다 OpenAI API 사용 요금이 발생합니다.
- 공개 배포 시 무단 사용을 막기 위해 IP별 요청 횟수 제한이 적용되어 있습니다.
