import React, { useState, useRef, useEffect } from 'react';
import { X, Share2, Download, Copy, Check, Sparkles, AlignJustify, AlignLeft, Type, Eye, Image as ImageIcon } from 'lucide-react';
import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';

interface QuoteCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookTitle: string;
  bookAuthor: string;
  bookCoverUrl?: string;
  initialQuote?: string;
}

type CardTheme = 'obsidian' | 'sepia' | 'sunset' | 'clean';
type CardRatio = 'stories' | 'square' | 'auto';

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  if (typeof (ctx as any).roundRect === 'function') {
    (ctx as any).roundRect(x, y, w, h, r);
  } else {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }
}

export const QuoteCardModal: React.FC<QuoteCardModalProps> = ({
  isOpen,
  onClose,
  bookTitle,
  bookAuthor,
  bookCoverUrl,
  initialQuote = ''
}) => {
  const [quote, setQuote] = useState(initialQuote);
  const [chapterNote, setChapterNote] = useState('');
  const [theme, setTheme] = useState<CardTheme>('obsidian');
  const [ratio, setRatio] = useState<CardRatio>('stories');
  const [quoteFontSize, setQuoteFontSize] = useState<number>(20);
  const [isJustified, setIsJustified] = useState<boolean>(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [copiedImage, setCopiedImage] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [renderedImageUrl, setRenderedImageUrl] = useState<string | null>(null);
  const [showImagePreviewModal, setShowImagePreviewModal] = useState(false);
  const cardPreviewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      if (initialQuote) {
        setQuote(initialQuote);
      } else if (!quote) {
        setQuote('A leitura é para a mente o que o exercício é para o corpo.');
      }
      setRenderedImageUrl(null);
      setShowImagePreviewModal(false);
    }
  }, [isOpen, initialQuote]);

  if (!isOpen) return null;

  const themes: { id: CardTheme; label: string; bgClass: string; textClass: string; quoteColor: string; bgCanvas: string[] }[] = [
    {
      id: 'obsidian',
      label: 'Obsidian',
      bgClass: 'bg-gradient-to-br from-slate-950 via-slate-900 to-amber-950/40 text-amber-50 border-amber-500/20',
      textClass: 'text-amber-100/90',
      quoteColor: 'rgba(245, 158, 11, 0.35)',
      bgCanvas: ['#090d16', '#111827', '#20150b']
    },
    {
      id: 'sepia',
      label: 'Sépia',
      bgClass: 'bg-gradient-to-br from-[#f8f1df] to-[#eeddc0] text-[#3c2a1a] border-[#d8c29d]',
      textClass: 'text-[#4a3525]',
      quoteColor: 'rgba(180, 130, 80, 0.35)',
      bgCanvas: ['#f8f1df', '#eeddc0', '#e4cfad']
    },
    {
      id: 'sunset',
      label: 'Sunset',
      bgClass: 'bg-gradient-to-br from-indigo-950 via-purple-950 to-pink-950/60 text-pink-50 border-purple-500/30',
      textClass: 'text-pink-100',
      quoteColor: 'rgba(236, 72, 153, 0.35)',
      bgCanvas: ['#1e1035', '#2e1065', '#4a044e']
    },
    {
      id: 'clean',
      label: 'Minimal',
      bgClass: 'bg-white text-slate-900 border-slate-200',
      textClass: 'text-slate-800',
      quoteColor: 'rgba(100, 116, 139, 0.25)',
      bgCanvas: ['#ffffff', '#f8fafc', '#f1f5f9']
    }
  ];

  const currentTheme = themes.find((t) => t.id === theme) || themes[0];

  /** Render high-res canvas for downloading or sharing */
  const generateCanvas = async (): Promise<HTMLCanvasElement> => {
    const width = 1080;
    const canvasFontSize = Math.round(quoteFontSize * 2.6);
    const lineHeight = canvasFontSize * 1.55;
    const maxTextWidth = width - 240;

    // Helper to calculate text height in advance
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = 100;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) throw new Error('2D context failed');
    tempCtx.font = `italic ${canvasFontSize}px "Literata", "Merriweather", "Georgia", serif`;

    const words = quote.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let currentLine = '';

    for (let n = 0; n < words.length; n++) {
      const testLine = currentLine ? `${currentLine} ${words[n]}` : words[n];
      const metrics = tempCtx.measureText(testLine);
      if (metrics.width > maxTextWidth && currentLine) {
        lines.push(currentLine);
        currentLine = words[n];
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);

    const totalTextHeight = lines.length * lineHeight;

    let height = 1920;
    if (ratio === 'square') {
      height = 1080;
    } else if (ratio === 'auto') {
      height = Math.max(800, totalTextHeight + 580);
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context not available');

    // 1. Draw gradient background
    const grad = ctx.createLinearGradient(0, 0, width, height);
    if (currentTheme.id === 'clean') {
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(1, '#f1f5f9');
    } else if (currentTheme.id === 'sepia') {
      grad.addColorStop(0, '#f9f3e3');
      grad.addColorStop(0.5, '#f0e0c3');
      grad.addColorStop(1, '#e5d2ae');
    } else if (currentTheme.id === 'sunset') {
      grad.addColorStop(0, '#190a30');
      grad.addColorStop(0.5, '#2e1065');
      grad.addColorStop(1, '#500724');
    } else {
      // obsidian
      grad.addColorStop(0, '#090d16');
      grad.addColorStop(0.6, '#111827');
      grad.addColorStop(1, '#28170c');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Decorative frame/border
    ctx.save();
    ctx.lineWidth = 14;
    ctx.strokeStyle = currentTheme.id === 'clean' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)';
    ctx.strokeRect(50, 50, width - 100, height - 100);
    ctx.restore();

    // 2. Giant decorative quotation mark in background
    ctx.save();
    ctx.font = 'bold 360px Georgia, serif';
    ctx.fillStyle = currentTheme.quoteColor;
    ctx.fillText('“', 100, ratio === 'stories' ? 440 : 340);
    ctx.restore();

    // 3. Render Quote text (com suporte a justificado)
    ctx.save();
    const isDark = currentTheme.id !== 'clean' && currentTheme.id !== 'sepia';
    ctx.fillStyle = isDark ? '#f8fafc' : (currentTheme.id === 'sepia' ? '#3c2a1a' : '#0f172a');
    ctx.font = `italic ${canvasFontSize}px "Literata", "Merriweather", "Georgia", serif`;

    let startY = (height / 2) - (totalTextHeight / 2) - 30;
    if (startY < 340) startY = 340;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const isLastLine = i === lines.length - 1;
      const y = startY + (i * lineHeight);

      if (isJustified && !isLastLine) {
        const lineWords = line.split(' ');
        if (lineWords.length > 1) {
          const totalWordsWidth = lineWords.reduce((sum, w) => sum + ctx.measureText(w).width, 0);
          const totalSpace = maxTextWidth - totalWordsWidth;
          const spacePerGap = Math.max(0, totalSpace / (lineWords.length - 1));
          let curX = 120;
          for (let j = 0; j < lineWords.length; j++) {
            ctx.fillText(lineWords[j], curX, y);
            curX += ctx.measureText(lineWords[j]).width + spacePerGap;
          }
          continue;
        }
      }
      ctx.fillText(line, 120, y);
    }
    ctx.restore();

    // 4. Chapter / Context note if provided
    if (chapterNote) {
      ctx.save();
      ctx.font = '500 28px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = isDark ? 'rgba(251, 191, 36, 0.85)' : '#b45309';
      ctx.fillText(chapterNote.toUpperCase(), 120, startY + totalTextHeight + 40);
      ctx.restore();
    }

    // 5. Footer: Book details & Luminary branding
    const footerY = height - 160;

    // Divider line
    ctx.save();
    ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.12)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(120, footerY - 50);
    ctx.lineTo(width - 120, footerY - 50);
    ctx.stroke();
    ctx.restore();

    // Safe book cover drawing (prevents canvas tainting)
    let coverLoaded = false;
    if (bookCoverUrl && (bookCoverUrl.startsWith('data:') || bookCoverUrl.startsWith('blob:'))) {
      try {
        const img = new Image();
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = bookCoverUrl;
        });
        ctx.save();
        const cX = 120;
        const cY = footerY - 20;
        const cW = 70;
        const cH = 100;
        drawRoundedRect(ctx, cX, cY, cW, cH, 10);
        ctx.clip();
        ctx.drawImage(img, cX, cY, cW, cH);
        ctx.restore();
        coverLoaded = true;
      } catch (_) {}
    }

    if (!coverLoaded) {
      // Draw elegant book badge
      ctx.save();
      const cX = 120;
      const cY = footerY - 15;
      const cW = 60;
      const cH = 85;
      ctx.fillStyle = isDark ? 'rgba(251, 191, 36, 0.15)' : 'rgba(180, 130, 80, 0.2)';
      ctx.strokeStyle = isDark ? 'rgba(251, 191, 36, 0.4)' : 'rgba(180, 130, 80, 0.5)';
      ctx.lineWidth = 2;
      drawRoundedRect(ctx, cX, cY, cW, cH, 8);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = isDark ? '#fbbf24' : '#b45309';
      ctx.font = 'bold 30px serif';
      ctx.textAlign = 'center';
      ctx.fillText('📖', cX + cW / 2, cY + 54);
      ctx.restore();
    }

    const textOffsetLeft = 205;

    // Title
    ctx.save();
    ctx.font = 'bold 36px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = isDark ? '#ffffff' : (currentTheme.id === 'sepia' ? '#291e13' : '#0f172a');
    let titleStr = bookTitle;
    if (titleStr.length > 40) titleStr = titleStr.substring(0, 38) + '...';
    ctx.fillText(titleStr, textOffsetLeft, footerY + 22);

    // Author
    ctx.font = '30px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = isDark ? '#94a3b8' : (currentTheme.id === 'sepia' ? '#6b5138' : '#64748b');
    ctx.fillText(bookAuthor, textOffsetLeft, footerY + 65);
    ctx.restore();

    // Luminary Brand Tag in bottom right
    ctx.save();
    ctx.font = '600 24px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = isDark ? 'rgba(251, 191, 36, 0.8)' : '#b45309';
    ctx.textAlign = 'right';
    ctx.fillText('LUMINARY LEITOR', width - 120, footerY + 45);
    ctx.restore();

    return canvas;
  };

  /** Share image using Native Capacitor Share, Web Share API, or fallback to visual preview */
  const handleShare = async () => {
    setIsGenerating(true);
    try {
      const canvas = await generateCanvas();
      const dataUrl = canvas.toDataURL('image/png');
      setRenderedImageUrl(dataUrl);

      // Level 1: Try Native Capacitor Filesystem + Share if plugins are active
      if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Filesystem') && Capacitor.isPluginAvailable('Share')) {
        try {
          const base64Data = dataUrl.split(',')[1];
          const fileName = `luminary_citacao_${Date.now()}.png`;
          const saved = await Filesystem.writeFile({
            path: fileName,
            data: base64Data,
            directory: Directory.Cache
          });
          await Share.share({
            title: `Citação: ${bookTitle}`,
            url: saved.uri,
            dialogTitle: 'Compartilhar Citação'
          });
          return;
        } catch (nativeErr: any) {
          if (nativeErr.name === 'AbortError') return;
          console.warn('Native share threw, falling back to Web Share:', nativeErr);
        }
      }

      // Level 2: Try Web Share API with File
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (blob && navigator.canShare) {
        const file = new File([blob], `citacao-${bookTitle.slice(0, 15).replace(/\s+/g, '_')}.png`, { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              files: [file],
              title: `Citação de ${bookTitle}`,
              text: `"${quote}" — ${bookTitle}, por ${bookAuthor}`
            });
            return;
          } catch (shareErr: any) {
            if (shareErr.name === 'AbortError') return;
            console.warn('Web Share files failed:', shareErr);
          }
        }
      }

      // Level 3: Fallback - Open full preview sheet with touch-and-hold instructions
      setShowImagePreviewModal(true);
    } catch (err: any) {
      console.error('Erro ao gerar card:', err);
      // Even if canvas had an issue, show image preview modal
      setShowImagePreviewModal(true);
    } finally {
      setIsGenerating(false);
    }
  };

  /** Download image / Save to device */
  const handleDownload = async () => {
    setIsGenerating(true);
    try {
      const canvas = await generateCanvas();
      const dataUrl = canvas.toDataURL('image/png');
      setRenderedImageUrl(dataUrl);

      // Level 1: Native Capacitor
      if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Filesystem') && Capacitor.isPluginAvailable('Share')) {
        try {
          const base64Data = dataUrl.split(',')[1];
          const fileName = `luminary_citacao_${Date.now()}.png`;
          const saved = await Filesystem.writeFile({
            path: fileName,
            data: base64Data,
            directory: Directory.Cache
          });
          await Share.share({
            title: `Salvar Citação de ${bookTitle}`,
            url: saved.uri,
            dialogTitle: 'Salvar imagem na Galeria ou Arquivos'
          });
          setDownloadSuccess(true);
          setTimeout(() => setDownloadSuccess(false), 2500);
          return;
        } catch (nativeErr: any) {
          if (nativeErr.name === 'AbortError') return;
          console.warn('Native download threw, falling back:', nativeErr);
        }
      }

      // Level 2: Browser download
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (blob) {
        downloadBlob(blob);
        setDownloadSuccess(true);
        setTimeout(() => setDownloadSuccess(false), 2500);
      } else {
        setShowImagePreviewModal(true);
      }
    } catch (e: any) {
      console.warn('Download error:', e);
      setShowImagePreviewModal(true);
    } finally {
      setIsGenerating(false);
    }
  };

  /** Copy card as PNG image directly to clipboard */
  const handleCopyCardImage = async () => {
    setIsGenerating(true);
    try {
      const canvas = await generateCanvas();
      const dataUrl = canvas.toDataURL('image/png');
      setRenderedImageUrl(dataUrl);

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) {
        setIsGenerating(false);
        return;
      }

      if (navigator.clipboard && typeof (window as any).ClipboardItem !== 'undefined') {
        try {
          await navigator.clipboard.write([
            new (window as any).ClipboardItem({ 'image/png': blob })
          ]);
          setCopiedImage(true);
          setTimeout(() => setCopiedImage(false), 2500);
          setIsGenerating(false);
          return;
        } catch (clipErr) {
          console.warn('Clipboard write image failed, opening preview instead:', clipErr);
        }
      }

      // Fallback: Show the preview modal
      setShowImagePreviewModal(true);
    } catch (err) {
      console.error(err);
      setShowImagePreviewModal(true);
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadBlob = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `citacao-${bookTitle.slice(0, 15).replace(/\s+/g, '_')}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopyText = async () => {
    try {
      const fullText = `"${quote}"\n\n— ${bookTitle}, por ${bookAuthor}`;
      await navigator.clipboard.writeText(fullText);
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2000);
    } catch (_) {}
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-xs animate-in fade-in duration-150 overflow-y-auto">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-5 shadow-2xl text-slate-100 flex flex-col gap-3.5 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-amber-500/15 text-amber-400">
              <Sparkles size={17} />
            </div>
            <div>
              <h3 className="font-bold text-sm leading-tight">Card de Citação</h3>
              <p className="text-[11px] text-slate-400">Compartilhe no WhatsApp, Stories ou Feed</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Live Card Preview */}
        <div className="flex justify-center items-center py-1">
          <div
            ref={cardPreviewRef}
            className={`w-full max-w-[280px] rounded-2xl p-4 sm:p-5 border shadow-xl flex flex-col justify-between transition-all duration-200 relative overflow-hidden select-text ${
              currentTheme.bgClass
            } ${
              ratio === 'stories'
                ? 'aspect-[9/14]'
                : ratio === 'square'
                ? 'aspect-square'
                : 'min-h-[260px]'
            }`}
          >
            {/* Background quotation mark */}
            <span
              className="absolute top-2 left-3 text-7xl font-serif pointer-events-none select-none opacity-40 leading-none"
              style={{ color: currentTheme.quoteColor }}
            >
              “
            </span>

            {/* Quote body */}
            <div className="relative z-10 pt-4">
              <p
                className={`font-serif italic leading-relaxed ${currentTheme.textClass}`}
                style={{
                  fontSize: `${quoteFontSize}px`,
                  textAlign: isJustified ? 'justify' : 'left',
                  textJustify: 'inter-word'
                }}
              >
                "{quote}"
              </p>
              {chapterNote && (
                <p className="text-[9px] uppercase tracking-wider font-semibold text-amber-400 mt-2">
                  {chapterNote}
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="relative z-10 pt-4 border-t border-white/10 flex items-center justify-between mt-auto">
              <div className="min-w-0 pr-2">
                <p className="font-bold text-[11px] truncate">{bookTitle}</p>
                <p className="text-[10px] opacity-75 truncate">{bookAuthor}</p>
              </div>
              <span className="text-[8px] font-mono tracking-widest uppercase font-semibold text-amber-400 shrink-0">
                LUMINARY
              </span>
            </div>
          </div>
        </div>

        {/* Edit Quote Input */}
        <div className="space-y-1">
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Texto da Citação
          </label>
          <textarea
            value={quote}
            onChange={(e) => setQuote(e.target.value)}
            rows={2}
            placeholder="Digite ou cole aqui a frase do livro..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-hidden focus:border-amber-400 resize-none"
          />
        </div>

        {/* Opções de Tipografia e Formatação do Card */}
        <div className="grid grid-cols-2 gap-2.5 bg-slate-950/60 p-2.5 rounded-2xl border border-slate-800/80">
          {/* Slider Tamanho do Texto */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Type size={12} className="text-amber-400" />
                <span>Tamanho da Letra</span>
              </label>
              <span className="text-[10px] font-mono text-amber-400 font-semibold">{quoteFontSize}px</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-500 font-bold">A</span>
              <input
                type="range"
                min="14"
                max="32"
                step="1"
                value={quoteFontSize}
                onChange={(e) => setQuoteFontSize(Number(e.target.value))}
                className="w-full accent-amber-500 cursor-pointer"
              />
              <span className="text-xs text-slate-300 font-bold">A</span>
            </div>
          </div>

          {/* Botão Liga/Desliga Justificado */}
          <div className="flex flex-col justify-end">
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
              Alinhamento
            </label>
            <button
              onClick={() => setIsJustified(!isJustified)}
              className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                isJustified
                  ? 'border-amber-500 bg-amber-500/20 text-amber-300 ring-1 ring-amber-500'
                  : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
              }`}
            >
              {isJustified ? <AlignJustify size={14} /> : <AlignLeft size={14} />}
              <span>{isJustified ? 'Justificado' : 'À Esquerda'}</span>
            </button>
          </div>
        </div>

        {/* Style & Ratio Pickers */}
        <div className="grid grid-cols-2 gap-3">
          {/* Themes */}
          <div>
            <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider block mb-1.5">
              Tema Visual
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {themes.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTheme(t.id)}
                  className={`py-1.5 px-2 rounded-lg text-xs font-medium border text-center transition-all cursor-pointer ${
                    theme === t.id
                      ? 'border-amber-500 bg-amber-500/15 text-amber-300 ring-1 ring-amber-500'
                      : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Ratio & Ajuste */}
          <div>
            <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider block mb-1.5">
              Proporção / Formato
            </label>
            <div className="grid grid-cols-3 gap-1">
              <button
                onClick={() => setRatio('stories')}
                className={`py-1.5 px-1 rounded-lg text-[11px] font-medium border text-center transition-all cursor-pointer truncate ${
                  ratio === 'stories'
                    ? 'border-amber-500 bg-amber-500/15 text-amber-300 ring-1 ring-amber-500'
                    : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200'
                }`}
                title="Stories 9:16"
              >
                Stories
              </button>
              <button
                onClick={() => setRatio('square')}
                className={`py-1.5 px-1 rounded-lg text-[11px] font-medium border text-center transition-all cursor-pointer truncate ${
                  ratio === 'square'
                    ? 'border-amber-500 bg-amber-500/15 text-amber-300 ring-1 ring-amber-500'
                    : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200'
                }`}
                title="Quadrado 1:1"
              >
                Feed
              </button>
              <button
                onClick={() => setRatio('auto')}
                className={`py-1.5 px-1 rounded-lg text-[11px] font-medium border text-center transition-all cursor-pointer truncate ${
                  ratio === 'auto'
                    ? 'border-amber-500 bg-amber-500/15 text-amber-300 ring-1 ring-amber-500'
                    : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200'
                }`}
                title="Encaixar ao texto"
              >
                Auto
              </button>
            </div>
          </div>
        </div>

        {/* Context / Chapter Note Input */}
        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            Capítulo ou Página (opcional)
          </label>
          <input
            type="text"
            value={chapterNote}
            onChange={(e) => setChapterNote(e.target.value)}
            placeholder="Ex: Capítulo 4 ou Página 85"
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:outline-hidden focus:border-amber-400"
          />
        </div>

        {/* Action Buttons */}
        <div className="space-y-2 pt-2 border-t border-slate-800">
          <div className="flex gap-2">
            {/* Compartilhar */}
            <button
              onClick={handleShare}
              disabled={isGenerating || !quote.trim()}
              className="flex-1 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 disabled:opacity-50 text-slate-950 font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 active:scale-98 transition-all cursor-pointer"
            >
              <Share2 size={16} />
              <span>{isGenerating ? 'Preparando...' : 'Compartilhar'}</span>
            </button>

            {/* Copiar Imagem do Card */}
            <button
              onClick={handleCopyCardImage}
              disabled={isGenerating || !quote.trim()}
              className={`px-3 py-2.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                copiedImage
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
              }`}
              title="Copiar imagem do card para colar no WhatsApp / Instagram"
            >
              {copiedImage ? <Check size={15} className="text-emerald-400" /> : <ImageIcon size={15} />}
              <span>{copiedImage ? 'Card Copiado!' : 'Copiar Card'}</span>
            </button>

            {/* Salvar Imagem */}
            <button
              onClick={handleDownload}
              disabled={isGenerating || !quote.trim()}
              className={`p-2.5 rounded-xl border transition-colors cursor-pointer ${
                downloadSuccess
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
              }`}
              title="Salvar ou baixar imagem PNG"
            >
              {downloadSuccess ? <Check size={16} className="text-emerald-400" /> : <Download size={16} />}
            </button>

            {/* Copiar Texto */}
            <button
              onClick={handleCopyText}
              className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl border border-slate-700 transition-colors cursor-pointer"
              title="Copiar texto da citação"
            >
              {copiedText ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
            </button>
          </div>

          {/* Botão de Ver Imagem em Alta Resolução */}
          <button
            onClick={async () => {
              setIsGenerating(true);
              try {
                const canvas = await generateCanvas();
                setRenderedImageUrl(canvas.toDataURL('image/png'));
                setShowImagePreviewModal(true);
              } catch (e) {
                console.error(e);
              } finally {
                setIsGenerating(false);
              }
            }}
            className="w-full py-2 bg-slate-950/80 hover:bg-slate-800 text-slate-400 hover:text-amber-300 rounded-xl border border-slate-800/80 text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Eye size={13} />
            <span>Visualizar Imagem Gerada (Toque & Segure para Salvar)</span>
          </button>
        </div>
      </div>

      {/* Submodal de Visualização Direta da Imagem (À prova de falhas no Android) */}
      {showImagePreviewModal && renderedImageUrl && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-2xl flex flex-col items-center gap-3 max-h-[92vh] overflow-y-auto">
            <div className="w-full flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-xs font-bold text-amber-300 flex items-center gap-1">
                <Sparkles size={14} /> Imagem Pronta
              </span>
              <button
                onClick={() => setShowImagePreviewModal(false)}
                className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-[11px] text-slate-300 text-center bg-amber-500/10 border border-amber-500/20 rounded-xl p-2.5">
              👇 <strong>Toque e segure o dedo na imagem</strong> para abrir o menu do Android e escolher <em>"Fazer download da imagem"</em> ou <em>"Compartilhar imagem"</em>!
            </p>

            {/* Imagem Real renderizada */}
            <div className="w-full flex justify-center py-2">
              <img
                src={renderedImageUrl}
                alt="Card de Citação"
                className="max-h-[55vh] rounded-2xl shadow-2xl border border-slate-700/60 object-contain select-none"
              />
            </div>

            <div className="w-full flex gap-2 pt-1">
              <button
                onClick={handleCopyCardImage}
                className="flex-1 py-2.5 px-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
              >
                {copiedImage ? <Check size={15} /> : <ImageIcon size={15} />}
                <span>{copiedImage ? 'Card Copiado!' : 'Copiar Imagem'}</span>
              </button>
              <button
                onClick={() => setShowImagePreviewModal(false)}
                className="py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-medium cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
