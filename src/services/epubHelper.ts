// @ts-ignore - epubjs default export
import ePub from 'epubjs';

export interface EpubMetadata {
  title: string;
  author: string;
  coverDataUrl?: string;
  description?: string;
}

// Convert a blob or url into a persistent base64 data URL
async function urlToBase64(url: string): Promise<string> {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Generate a fallback book cover with title and author
export function generateCoverDataUrl(title: string, author: string, gradientColor = '#1e293b'): string {
  const canvas = document.createElement('canvas');
  canvas.width = 300;
  canvas.height = 450;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Background
  const gradient = ctx.createLinearGradient(0, 0, 300, 450);
  gradient.addColorStop(0, gradientColor);
  gradient.addColorStop(1, '#0f172a');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 300, 450);

  // Border decoration
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 3;
  ctx.strokeRect(15, 15, 270, 420);

  // Spine line
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.fillRect(0, 0, 25, 450);

  // Title
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.textAlign = 'center';

  // Simple multi-line text wrap
  const words = title.split(' ');
  let line = '';
  let y = 140;
  for (const word of words) {
    const testLine = line + word + ' ';
    const metrics = ctx.measureText(testLine);
    if (metrics.width > 230 && line !== '') {
      ctx.fillText(line.trim(), 150, y);
      line = word + ' ';
      y += 28;
      if (y > 260) break;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line.trim(), 150, y);

  // Divider
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(80, y + 25);
  ctx.lineTo(220, y + 25);
  ctx.stroke();

  // Author
  ctx.fillStyle = '#94a3b8';
  ctx.font = 'italic 16px system-ui, sans-serif';
  ctx.fillText(author || 'Autor Desconhecido', 150, y + 55);

  return canvas.toDataURL('image/jpeg', 0.85);
}

export async function parseEpubFile(data: ArrayBuffer): Promise<EpubMetadata> {
  let title = 'Livro EPUB';
  let author = 'Autor Desconhecido';
  let description: string | undefined;
  let coverDataUrl: string | undefined;

  try {
    const book = ePub(data);
    await book.ready;

    const metadata = await book.loaded.metadata;
    if (metadata.title) title = metadata.title.trim();
    if (metadata.creator) author = metadata.creator.trim();
    if (metadata.description) description = metadata.description;

    try {
      const rawCoverUrl = await book.coverUrl();
      if (rawCoverUrl) {
        // Convert blob: url to persistent base64 data url
        coverDataUrl = await urlToBase64(rawCoverUrl);
      }
    } catch (coverErr) {
      console.warn('Capa não encontrada ou inacessível no EPUB:', coverErr);
    }
  } catch (err) {
    console.warn('Erro ao processar EPUB:', err);
  }

  // If no cover was extracted, generate a typographic cover
  if (!coverDataUrl) {
    coverDataUrl = generateCoverDataUrl(title, author);
  }

  return {
    title,
    author,
    description,
    coverDataUrl
  };
}

export { ePub };
