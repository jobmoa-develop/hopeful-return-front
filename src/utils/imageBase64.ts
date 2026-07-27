// MMS 첨부 이미지: File → base64 변환 + 클라이언트 검증
// 백엔드/SENS 제약(계약 §4): jpg/jpeg, 파일당 ≤300KB, 해상도 ≤1500×1440.
// 발송 요청에는 접두어(data:image/...;base64,)를 제거한 순수 base64 를 담는다.

export const MMS_MAX_BYTES = 300 * 1024; // 300KB
export const MMS_MAX_WIDTH = 1500;
export const MMS_MAX_HEIGHT = 1440;

const JPEG_MIME = ['image/jpeg', 'image/jpg'];
const JPEG_EXT = /\.(jpe?g)$/i;

export type PreparedMmsImage = {
  // 발송용 순수 base64 (접두어 제거)
  base64: string;
  // 미리보기용 data URL
  dataUrl: string;
  fileName: string;
};

// File 을 data URL 로 읽는다.
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('이미지를 읽지 못했습니다.'));
    reader.readAsDataURL(file);
  });
}

// data URL 로 해상도를 확인한다.
function loadImageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('이미지 형식을 확인하지 못했습니다.'));
    img.src = dataUrl;
  });
}

// 접두어(data:image/...;base64,) 제거
export function stripBase64Prefix(dataUrl: string): string {
  const commaIndex = dataUrl.indexOf(',');
  return commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
}

// File 을 검증하고 발송용 base64 로 변환한다. 위반 시 사용자 메시지와 함께 throw.
export async function prepareMmsImage(file: File): Promise<PreparedMmsImage> {
  const isJpeg = JPEG_MIME.includes(file.type) || JPEG_EXT.test(file.name);
  if (!isJpeg) {
    throw new Error(`jpg/jpeg 이미지만 첨부할 수 있습니다. (${file.name})`);
  }
  if (file.size > MMS_MAX_BYTES) {
    const kb = Math.round(file.size / 1024);
    throw new Error(`이미지 용량은 300KB 이하만 가능합니다. (${file.name}, ${kb}KB)`);
  }

  const dataUrl = await readAsDataUrl(file);
  const { width, height } = await loadImageSize(dataUrl);
  if (width > MMS_MAX_WIDTH || height > MMS_MAX_HEIGHT) {
    throw new Error(
      `이미지 해상도는 ${MMS_MAX_WIDTH}×${MMS_MAX_HEIGHT} 이하만 가능합니다. (${file.name}, ${width}×${height})`,
    );
  }

  return { base64: stripBase64Prefix(dataUrl), dataUrl, fileName: file.name };
}
