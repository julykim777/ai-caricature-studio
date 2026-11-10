import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import multer from 'multer';
import { STYLE_IDS } from './lib/styles.js';
import { transformImage } from './lib/transform.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Vercel 서버리스 함수의 요청 본문 한도(4.5MB)를 넘지 않도록 4MB로 제한합니다.
// 프론트엔드에서 업로드 전에 이미지를 자동으로 줄여서 보냅니다.
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

// 파일을 디스크에 저장하지 않고 메모리에서만 처리합니다. (Vercel 환경에 적합)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    if (ACCEPTED_TYPES.includes(file.mimetype)) return cb(null, true);
    cb(new HttpError(400, 'JPG, PNG, WEBP 형식의 이미지만 업로드할 수 있어요.'));
  },
});

// 로컬에서는 Express가 public/ 을 서빙합니다. (Vercel에서는 public/ 을 CDN이 자동 서빙)
app.use(express.static(path.join(__dirname, 'public')));

// 서버 상태 확인용 (API 키 값은 절대 응답에 포함하지 않습니다)
app.get('/api/health', (req, res) => {
  res.json({ ok: true, hasApiKey: Boolean(process.env.OPENAI_API_KEY) });
});

// 요청 횟수 제한: 공개 배포 시 내 API 키로 무제한 호출되는 것을 막습니다.
// 기본값: IP당 10분에 5회. (.env / Vercel 환경변수로 조절, 0이면 제한 없음)
// ※ 서버 메모리에 기록하므로 Vercel 인스턴스가 여러 개면 인스턴스별로 계산됩니다(최소한의 보호).
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX ?? 5);
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MIN ?? 10) * 60 * 1000;
const hits = new Map(); // ip → [요청 시각들]

function rateLimit(req, res, next) {
  if (!RATE_LIMIT_MAX) return next();
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) {
    const waitMin = Math.ceil((RATE_LIMIT_WINDOW_MS - (now - recent[0])) / 60000);
    return res.status(429).json({ error: `변환은 ${RATE_LIMIT_WINDOW_MS / 60000}분에 ${RATE_LIMIT_MAX}번까지 가능해요. 약 ${waitMin}분 후에 다시 시도해 주세요.` });
  }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear(); // 메모리 보호
  next();
}

// 이미지 변환 요청
//   POST /api/transform  (multipart/form-data: image, style)
//   → { image: "data:image/...;base64,...", mock: boolean }
app.post('/api/transform', rateLimit, upload.single('image'), async (req, res, next) => {
  try {
    const { style } = req.body;

    if (!req.file) throw new HttpError(400, '이미지 파일이 없어요. 사진을 먼저 업로드해 주세요.');
    if (!STYLE_IDS.includes(style)) throw new HttpError(400, '지원하지 않는 스타일이에요.');

    const started = Date.now();
    try {
      const result = await transformImage({
        buffer: req.file.buffer,
        mimetype: req.file.mimetype,
        style,
      });
      console.log(`[변환 성공] ${style} · ${((Date.now() - started) / 1000).toFixed(1)}초${result.mock ? ' · 모의' : ''}`);
      res.json(result);
    } catch (err) {
      console.log(`[변환 실패] ${style} · ${((Date.now() - started) / 1000).toFixed(1)}초 · ${err.message}`);
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

// 존재하지 않는 API 경로
app.use('/api', (req, res) => res.status(404).json({ error: '요청한 API를 찾을 수 없어요.' }));

// 공통 오류 처리: 항상 { error } JSON 으로 응답합니다.
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const msg = err.code === 'LIMIT_FILE_SIZE'
      ? '파일이 너무 커요. 4MB 이하의 이미지를 올려 주세요.'
      : '파일 업로드 중 문제가 발생했어요.';
    return res.status(400).json({ error: msg });
  }
  const status = err.status || 500;
  const safe = err.expose || status < 500; // 의도적으로 만든 오류 메시지만 노출
  if (!safe) console.error(err);
  res.status(status).json({ error: safe ? err.message : '서버에서 오류가 발생했어요. 잠시 후 다시 시도해 주세요.' });
});

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// 로컬 실행 시에만 포트를 엽니다. Vercel은 export 된 app 을 직접 실행합니다.
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`✅ 서버 실행 중: http://localhost:${PORT}`);
    if (!process.env.OPENAI_API_KEY) console.warn('⚠️  .env 에 OPENAI_API_KEY 가 없습니다.');
  });
}

export default app;
