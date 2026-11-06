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

/**
 * Tenta extrair a capa real do EPUB através de múltiplas estratégias exaustivas.
 * Resolve casos onde book.coverUrl() falha (ex: Stephen King da Suma/LeYa, capas em SVG, capa na página 1).
 */
export async function extractCoverFromEpub(book: any): Promise<string | undefined> {
  // 1. Tenta o coverUrl nativo do epubjs
  try {
    const rawCoverUrl = await book.coverUrl();
    if (rawCoverUrl) {
      const b64 = await urlToBase64(rawCoverUrl);
      if (b64 && b64.length > 500 && !b64.includes('undefined')) return b64;
    }
  } catch {}

  // 2. Busca no package.manifest (EPUB 3 properties="cover-image" ou id com "cover"/"capa")
  try {
    const manifest = book.package?.manifest || {};
    const items = Object.values(manifest) as Array<any>;

    // 2a. Procura por item com properties="cover-image" (EPUB 3 standard)
    let coverItem = items.find((i) => i.properties && i.properties.includes('cover-image'));

    // 2b. Procura por ID contendo 'cover' ou 'capa'
    if (!coverItem) {
      coverItem = items.find(
        (i) => i.id && /cover|capa/i.test(i.id) && i.type && i.type.startsWith('image/')
      );
    }

    // 2c. Procura por href contendo 'cover' ou 'capa'
    if (!coverItem) {
      coverItem = items.find(
        (i) => i.href && /cover|capa/i.test(i.href) && /\.(jpe?g|png|webp)$/i.test(i.href)
      );
    }

    if (coverItem?.href && book.archive) {
      try {
        const url = await book.archive.createUrl(coverItem.href, { base64: true });
        if (url && url.length > 500) return url;
      } catch {}
    }
  } catch {}

  // 3. Inspeciona a primeira seção do spine (onde fica a página 1 da capa em livros como Stephen King)
  try {
    if (book.spine && book.spine.spineItems && book.spine.spineItems.length > 0) {
      const firstSection = book.spine.get(0);
      if (firstSection) {
        const contents = await firstSection.load(book.load.bind(book));
        let htmlContent = '';
        if (typeof contents === 'string') {
          htmlContent = contents;
        } else if (contents && (contents as any).documentElement) {
          htmlContent = (contents as any).documentElement.innerHTML || '';
        }

        // Procura por tag <img src="..."> ou <image xlink:href="..."> / <image href="...">
        const match =
          htmlContent.match(/<img[^>]+src=["']([^"']+)["']/i) ||
          htmlContent.match(/<image[^>]+(?:xlink:href|href)=["']([^"']+)["']/i);

        if (match && match[1]) {
          const imgSrc = match[1];
          const cleanSrc = imgSrc.replace(/^\.\.\//, '').replace(/^\.\//, '');
          const candidates = [
            imgSrc,
            cleanSrc,
            `OEBPS/${cleanSrc}`,
            `EPUB/${cleanSrc}`,
            `OPS/${cleanSrc}`
          ];

          for (const cand of candidates) {
            try {
              if (book.archive?.zip?.file(cand)) {
                const fileInZip = book.archive.zip.file(cand);
                const b64 = await fileInZip.async('base64');
                const ext = cand.split('.').pop()?.toLowerCase() || 'jpeg';
                const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
                return `data:${mime};base64,${b64}`;
              }
              const url = await book.archive?.createUrl(cand, { base64: true });
              if (url && url.length > 500) return url;
            } catch {}
          }
        }
      }
    }
  } catch {}

  // 4. Varre diretamente todos os arquivos no ZIP do EPUB
  try {
    const zipFiles = book.archive?.zip?.files;
    if (zipFiles) {
      const imageKeys = Object.keys(zipFiles).filter((k) =>
        /\.(jpe?g|png|webp)$/i.test(k)
      );

      // Prioridade 1: nome tem cover ou capa
      let bestKey = imageKeys.find((k) => /(?:^|\/|_|-)(?:cover|capa)(?:_|-|\.|$)/i.test(k));
      if (!bestKey) {
        bestKey = imageKeys.find((k) => /cover|capa/i.test(k));
      }
      // Prioridade 2: primeira imagem do zip (se o EPUB tiver apenas 1 imagem grande no início)
      if (!bestKey && imageKeys.length > 0) {
        bestKey = imageKeys[0];
      }

      if (bestKey) {
        const fileInZip = zipFiles[bestKey];
        const b64 = await fileInZip.async('base64');
        const ext = bestKey.split('.').pop()?.toLowerCase() || 'jpeg';
        const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
        return `data:${mime};base64,${b64}`;
      }
    }
  } catch {}

  return undefined;
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

    // Extrai a capa usando a busca exaustiva
    coverDataUrl = await extractCoverFromEpub(book);
  } catch (err) {
    console.warn('Erro ao processar EPUB:', err);
  }

  // Se nenhuma capa foi extraída do arquivo, gera a capa tipográfica
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
