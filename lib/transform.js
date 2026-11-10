import OpenAI, { toFile } from 'openai';
import { STYLE_PROMPTS } from './styles.js';

// 공식 문서: gpt-image-2.5-sunburst 는 /v1/images/edits (이미지 편집)를 지원합니다.
// https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst
const MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2.5-sunburst';
// low | medium | high | xhigh | max | auto  (높을수록 느리고 비쌉니다)
const QUALITY = process.env.OPENAI_IMAGE_QUALITY || 'medium';

let client;
function getClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new TransformError(500, '서버에 OpenAI API 키가 설정되지 않았어요. 관리자에게 문의해 주세요.');
  }
  // API 키는 서버(.env / Vercel 환경변수)에서만 읽고, 프론트엔드로 절대 보내지 않습니다.
  client ??= new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 180 * 1000, // 이미지 편집은 수십 초 이상 걸릴 수 있습니다.
    maxRetries: 1,
  });
  return client;
}

/**
 * 업로드된 이미지를 선택한 스타일로 변환합니다.
 *
 * @param {object} params
 * @param {Buffer} params.buffer   이미지 바이너리
 * @param {string} params.mimetype 예: 'image/jpeg'
 * @param {string} params.style    스타일 id (lib/styles.js)
 * @returns {Promise<{ image: string, mock: boolean }>}  image 는 data URL
 */
export async function transformImage({ buffer, mimetype, style }) {
  // 비용 없이 화면 흐름만 확인하고 싶을 때: .env 에 MOCK_TRANSFORM=true
  if (process.env.MOCK_TRANSFORM === 'true') {
    await new Promise((r) => setTimeout(r, 800));
    return { image: `data:${mimetype};base64,${buffer.toString('base64')}`, mock: true };
  }

  const prompt = STYLE_PROMPTS[style];
  const ext = { 'image/png': 'png', 'image/webp': 'webp' }[mimetype] || 'jpg';

  try {
    const result = await getClient().images.edit({
      model: MODEL,
      image: await toFile(buffer, `upload.${ext}`, { type: mimetype }),
      prompt,
      size: 'auto',          // 원본 비율에 맞춰 모델이 결정
      quality: QUALITY,
      output_format: 'jpeg', // PNG보다 훨씬 가벼워 Vercel 응답 한도(4.5MB) 안에 들어옵니다.
      output_compression: 90,
      n: 1,
    });

    const b64 = result.data?.[0]?.b64_json;
    if (!b64) throw new TransformError(502, 'AI가 이미지를 생성하지 못했어요. 다시 시도해 주세요.');
    return { image: `data:image/jpeg;base64,${b64}`, mock: false };
  } catch (err) {
    throw toFriendlyError(err);
  }
}

/** OpenAI 오류를 사용자에게 보여줄 한국어 메시지로 변환합니다. */
function toFriendlyError(err) {
  if (err instanceof TransformError) return err;

  // 서버 로그에는 원인을 남깁니다. (API 키는 포함되지 않음)
  console.error('[OpenAI]', err.status ?? '', err.code ?? '', err.message);

  if (err instanceof OpenAI.APIConnectionTimeoutError) {
    return new TransformError(504, '변환 시간이 너무 오래 걸려요. 잠시 후 다시 시도해 주세요.');
  }
  if (err instanceof OpenAI.APIConnectionError) {
    return new TransformError(502, 'AI 서버에 연결할 수 없어요. 인터넷 연결을 확인해 주세요.');
  }

  const code = err.code || err.error?.code;
  if (code === 'moderation_blocked' || code === 'content_policy_violation') {
    return new TransformError(400, '이 사진은 안전 정책에 따라 변환할 수 없어요. 다른 사진으로 시도해 주세요.');
  }
  if (code === 'insufficient_quota') {
    return new TransformError(503, 'API 사용 한도를 초과했어요. OpenAI 결제/사용량 설정을 확인해 주세요.');
  }

  switch (err.status) {
    case 400: return new TransformError(400, '이미지를 처리할 수 없어요. 다른 사진으로 시도해 주세요.');
    case 401: return new TransformError(500, 'OpenAI API 키가 올바르지 않아요. 서버 설정을 확인해 주세요.');
    case 403: return new TransformError(500, '이 API 키로는 해당 모델을 사용할 권한이 없어요. (조직 인증 필요 여부 확인)');
    case 404: return new TransformError(500, `모델(${MODEL})을 찾을 수 없어요. 모델 이름을 확인해 주세요.`);
    case 429: return new TransformError(429, '요청이 너무 많아요. 1분 정도 후에 다시 시도해 주세요.');
    default:  return new TransformError(502, 'AI 변환 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.');
  }
}

export class TransformError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.expose = true; // 사용자에게 그대로 보여줘도 되는 메시지
  }
}
