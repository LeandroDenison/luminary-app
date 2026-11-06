import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export interface PdfMetadata {
  title: string;
  author: string;
  totalPages: number;
  coverDataUrl?: string;
}

export async function parsePdfFile(data: ArrayBuffer): Promise<PdfMetadata> {
  // pdf.js transfers (detaches) the buffer to its worker, so always pass a copy
  const loadingTask = pdfjsLib.getDocument({ data: data.slice(0) });
  const pdfDoc = await loadingTask.promise;
  const totalPages = pdfDoc.numPages;

  let title = 'Documento PDF';
  let author = 'Desconhecido';

  try {
    const meta = await pdfDoc.getMetadata();
    if (meta?.info) {
      const info = meta.info as Record<string, any>;
      if (info.Title && typeof info.Title === 'string' && info.Title.trim()) {
        title = info.Title.trim();
      }
      if (info.Author && typeof info.Author === 'string' && info.Author.trim()) {
        author = info.Author.trim();
      }
    }
  } catch (err) {
    console.warn('Erro ao ler metadados do PDF:', err);
  }

  // Generate thumbnail from Page 1
  let coverDataUrl: string | undefined;
  try {
    const page = await pdfDoc.getPage(1);
    const viewport = page.getViewport({ scale: 0.5 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      await page.render({
        canvasContext: ctx,
        viewport: viewport,
        canvas: canvas
      } as any).promise;
      coverDataUrl = canvas.toDataURL('image/jpeg', 0.85);
    }
  } catch (err) {
    console.warn('Erro ao renderizar capa do PDF:', err);
  }

  return {
    title,
    author,
    totalPages,
    coverDataUrl
  };
}

export { pdfjsLib };
