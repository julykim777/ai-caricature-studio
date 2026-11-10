// 스타일 id → 이미지 편집 프롬프트
// 프론트엔드(public/app.js)의 STYLES id 와 동일해야 합니다.
export const STYLE_PROMPTS = {
  'caricature':
    'Transform this photo into a fun hand-drawn caricature. Exaggerate the most distinctive facial features playfully while keeping the person clearly recognizable. Bold ink lines, warm colors, clean background.',
  'anime':
    'Redraw this photo as a high-quality Japanese anime illustration. Clean line art, cel shading, expressive eyes, vibrant colors. Keep the same person, pose, hairstyle and clothing.',
  'movie-poster':
    'Turn this photo into a dramatic cinematic movie poster. Keep the person as the hero, add moody cinematic lighting, rich color grading, an atmospheric background and a bold movie title at the bottom.',
  '3d-cartoon':
    'Transform this photo into a cute stylized 3D animated character render. Soft lighting, smooth shapes, big expressive eyes. Keep the same person, hairstyle and clothing recognizable.',
  'watercolor':
    'Repaint this photo as a delicate watercolor painting. Soft bleeding edges, visible paper texture, light airy colors. Keep the person recognizable.',
  'pop-art':
    'Transform this photo into bold pop art. Strong black outlines, flat saturated primary colors, halftone dot shading, comic-book style. Keep the person recognizable.',
};

export const STYLE_IDS = Object.keys(STYLE_PROMPTS);
