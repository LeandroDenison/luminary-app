import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { StorageService } from './storage';
import { parsePdfFile } from './pdfHelper';
import type { Book } from '../types';

export async function initializeSampleBooksIfEmpty(): Promise<void> {
  const existing = await StorageService.getAllBooks();
  if (existing.length > 0) return;

  try {
    // 1. Livro: Noites Brancas (Dostoiévski)
    const doc1 = await PDFDocument.create();
    const timesRoman = await doc1.embedFont(StandardFonts.TimesRoman);
    const timesBold = await doc1.embedFont(StandardFonts.TimesRomanBold);
    const timesItalic = await doc1.embedFont(StandardFonts.TimesRomanItalic);

    // Capa Noites Brancas
    let p = doc1.addPage([400, 600]);
    // Fundo azul escuro romântico
    p.drawRectangle({
      x: 0,
      y: 0,
      width: 400,
      height: 600,
      color: rgb(0.08, 0.12, 0.22)
    });
    // Moldura dourada
    p.drawRectangle({
      x: 20,
      y: 20,
      width: 360,
      height: 560,
      borderColor: rgb(0.85, 0.72, 0.45),
      borderWidth: 2
    });
    p.drawText('NOITES BRANCAS', {
      x: 60,
      y: 420,
      size: 28,
      font: timesBold,
      color: rgb(0.95, 0.88, 0.7)
    });
    p.drawText('Um Romance Sentimental', {
      x: 105,
      y: 380,
      size: 15,
      font: timesItalic,
      color: rgb(0.8, 0.75, 0.65)
    });
    p.drawText('FIÓDOR DOSTOIÉVSKI', {
      x: 110,
      y: 180,
      size: 14,
      font: timesBold,
      color: rgb(0.85, 0.72, 0.45)
    });
    p.drawText('Edição Especial para Leitura', {
      x: 120,
      y: 60,
      size: 11,
      font: timesRoman,
      color: rgb(0.6, 0.6, 0.65)
    });

    // Página 1 de Conteúdo
    p = doc1.addPage([400, 600]);
    p.drawText('NOITE PRIMEIRA', {
      x: 140,
      y: 520,
      size: 16,
      font: timesBold,
      color: rgb(0.1, 0.1, 0.1)
    });
    const lines1 = [
      'Era uma noite maravilhosa, daquelas noites que talvez só',
      'possam existir quando somos jovens, meu leitor querido.',
      'O céu estava tão pontilhado de estrelas, tão claro, que,',
      'olhando para ele, involuntariamente nos perguntávamos:',
      'será possível que debaixo de um céu como este possam',
      'viver pessoas zangadas e caprichosas?',
      '',
      'Esta também é uma pergunta jovem, muito jovem, meu',
      'leitor amigo, mas que o Senhor a envie com mais frequência',
      'à sua alma!... Falando de homens caprichosos e mal-humorados,',
      'não pude deixar de me lembrar também do meu próprio dia.',
      'Desde a manhã, uma melancolia inexplicável começou a me',
      'atormentar. Subitamente me pareceu que eu, solitário, estava',
      'sendo abandonado por todos e que todos se afastavam de mim.',
      '',
      'Caminhei pela avenida Nevski, andei pelo cais ao luar.',
      'Petersburgo inteira parecia ter se despovoado para o verão.',
      'E foi então que a vi. Ela estava de pé junto à balaustrada,',
      'apoiada nos cotovelos e olhando fixamente a água escura...'
    ];
    let curY = 470;
    for (const line of lines1) {
      if (line) {
        p.drawText(line, { x: 35, y: curY, size: 12, font: timesRoman, color: rgb(0.15, 0.15, 0.15) });
      }
      curY -= 19;
    }
    p.drawText('— 1 —', { x: 185, y: 30, size: 10, font: timesRoman, color: rgb(0.5, 0.5, 0.5) });

    // Página 2 de Conteúdo
    p = doc1.addPage([400, 600]);
    p.drawText('O ENCONTRO', {
      x: 155,
      y: 520,
      size: 16,
      font: timesBold,
      color: rgb(0.1, 0.1, 0.1)
    });
    const lines2 = [
      'Ela chorava baixinho. Seu corpo estremecia ao leve vento',
      'que soprava do golfo. Aproximei-me com cautela, temendo',
      'assustá-la.',
      '',
      '— Posso ajudá-la? — perguntei timidamente.',
      '',
      'Ela ergueu o rosto, surpresa. Seus olhos brilhavam sob a luz',
      'pálida dos lampiões. Havia neles uma doçura tão profunda',
      'que meu coração deu um salto no peito.',
      '',
      '— O senhor... quem é o senhor? — sussurrou Nastienka.',
      '',
      '— Sou apenas um sonhador — respondi com sinceridade.',
      '— Alguém que conhece cada pedra desta cidade, mas não',
      'tem ninguém no mundo para conversar.',
      '',
      'Um sorriso tênue despontou em seus lábios e o silêncio',
      'da noite se encheu de uma mágica acolhedora...'
    ];
    curY = 470;
    for (const line of lines2) {
      if (line) {
        p.drawText(line, { x: 35, y: curY, size: 12, font: timesRoman, color: rgb(0.15, 0.15, 0.15) });
      }
      curY -= 19;
    }
    p.drawText('— 2 —', { x: 185, y: 30, size: 10, font: timesRoman, color: rgb(0.5, 0.5, 0.5) });

    const pdfBytes1 = await doc1.save();
    const pdfBuffer1 = pdfBytes1.buffer.slice(0) as ArrayBuffer;
    const meta1 = await parsePdfFile(pdfBuffer1);

    const book1: Book = {
      id: 'sample-noites-brancas',
      title: 'Noites Brancas',
      author: 'Fiódor Dostoiévski',
      format: 'pdf',
      coverUrl: meta1.coverDataUrl,
      addedAt: Date.now() - 3600000,
      lastReadAt: Date.now() - 1800000,
      fileSize: pdfBytes1.byteLength,
      totalPages: meta1.totalPages,
      currentPage: 1,
      progress: 33,
      readingMode: 'paginated',
      theme: 'sepia',
      fontSize: 16,
      bookmarks: [],
      description: 'Um romance apaixonante sobre a amizade pura, a solidão e o amor sob o céu prateado de São Petersburgo.'
    };
    await StorageService.saveBook(book1, pdfBuffer1);

    // 2. Livro: Dom Casmurro (Machado de Assis)
    const doc2 = await PDFDocument.create();
    const timesBold2 = await doc2.embedFont(StandardFonts.TimesRomanBold);
    const timesRoman2 = await doc2.embedFont(StandardFonts.TimesRoman);
    const timesItalic2 = await doc2.embedFont(StandardFonts.TimesRomanItalic);

    let p2 = doc2.addPage([400, 600]);
    // Capa Verde Esmeralda / Vinho
    p2.drawRectangle({
      x: 0,
      y: 0,
      width: 400,
      height: 600,
      color: rgb(0.1, 0.22, 0.18)
    });
    p2.drawRectangle({
      x: 20,
      y: 20,
      width: 360,
      height: 560,
      borderColor: rgb(0.8, 0.7, 0.4),
      borderWidth: 2
    });
    p2.drawText('DOM CASMURRO', {
      x: 75,
      y: 410,
      size: 28,
      font: timesBold2,
      color: rgb(0.95, 0.9, 0.75)
    });
    p2.drawText('Os Olhos de Ressaca', {
      x: 130,
      y: 370,
      size: 15,
      font: timesItalic2,
      color: rgb(0.85, 0.8, 0.65)
    });
    p2.drawText('MACHADO DE ASSIS', {
      x: 120,
      y: 180,
      size: 14,
      font: timesBold2,
      color: rgb(0.85, 0.72, 0.45)
    });
    p2.drawText('Literatura Brasileira', {
      x: 140,
      y: 60,
      size: 11,
      font: timesRoman2,
      color: rgb(0.65, 0.75, 0.7)
    });

    // Página 1 de Dom Casmurro
    p2 = doc2.addPage([400, 600]);
    p2.drawText('CAPÍTULO I - DO TÍTULO', {
      x: 100,
      y: 520,
      size: 15,
      font: timesBold2,
      color: rgb(0.1, 0.1, 0.1)
    });
    const linesDom1 = [
      'Uma noite destas, vindo da cidade para o Engenho Novo,',
      'encontrei no trem da Central um rapaz aqui do bairro,',
      'que eu conheço de vista e de chapéu.',
      '',
      'Cumprimentou-me, sentou-se ao pé de mim, falou da lua',
      'e dos ministros, e acabou recitando-me versos. A viagem',
      'era curta, e os versos pode ser que não fossem inteiramente',
      'maus, porém o cansaço fechou-me os olhos...',
      '',
      'No dia seguinte entraram a chamar-me de Dom Casmurro.',
      'Não me zanguei. O título pegou e agora dou-o a este livro.',
      'Meu fim evidente era atar as duas pontas da vida, e',
      'restaurar na velhice a adolescência.',
      '',
      'Pois, leitor amigo, se Capitu me traiu ou não, é segredo',
      'que os olhos de ressaca guardam para sempre.'
    ];
    curY = 470;
    for (const line of linesDom1) {
      if (line) {
        p2.drawText(line, { x: 35, y: curY, size: 12, font: timesRoman2, color: rgb(0.15, 0.15, 0.15) });
      }
      curY -= 19;
    }
    p2.drawText('— 1 —', { x: 185, y: 30, size: 10, font: timesRoman2, color: rgb(0.5, 0.5, 0.5) });

    const pdfBytes2 = await doc2.save();
    const pdfBuffer2 = pdfBytes2.buffer.slice(0) as ArrayBuffer;
    const meta2 = await parsePdfFile(pdfBuffer2);

    const book2: Book = {
      id: 'sample-dom-casmurro',
      title: 'Dom Casmurro',
      author: 'Machado de Assis',
      format: 'pdf',
      coverUrl: meta2.coverDataUrl,
      addedAt: Date.now() - 7200000,
      fileSize: pdfBytes2.byteLength,
      totalPages: meta2.totalPages,
      currentPage: 1,
      progress: 0,
      readingMode: 'scroll',
      theme: 'dark',
      fontSize: 16,
      bookmarks: [],
      description: 'O maior enigma da literatura nacional: a história de amor, ciúme e obsessão entre Bentinho e Capitu.'
    };
    await StorageService.saveBook(book2, pdfBuffer2);

  } catch (err) {
    console.error('Erro ao inicializar livros de exemplo:', err);
  }
}
