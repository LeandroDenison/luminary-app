import React, { useState, useEffect } from 'react';
import { BookOpen } from 'lucide-react';

interface BookCoverProps {
  coverUrl?: string;
  title: string;
  author: string;
  className?: string;
}

export const BookCover: React.FC<BookCoverProps> = ({ coverUrl, title, author, className = '' }) => {
  const [hasError, setHasError] = useState(false);

  // Reseta o estado de erro sempre que a URL da capa mudar ou for recebida
  useEffect(() => {
    setHasError(false);
  }, [coverUrl]);

  // If there's an error or no coverUrl, display a beautiful book design
  if (hasError || !coverUrl) {
    return (
      <div
        className={`w-full h-full bg-gradient-to-br from-slate-800 via-slate-900 to-amber-950/40 p-2.5 flex flex-col justify-between border border-amber-500/20 shadow-inner relative select-none ${className}`}
      >
        <div className="absolute left-1 top-0 bottom-0 w-1 bg-amber-500/30 rounded-full" />
        <div className="flex justify-end">
          <BookOpen size={14} className="text-amber-400/60" />
        </div>
        <div className="my-auto pl-1">
          <h4 className="text-[11px] font-bold text-slate-100 leading-tight line-clamp-3">
            {title}
          </h4>
          <div className="w-8 h-0.5 bg-amber-500/60 my-1" />
          <p className="text-[9px] text-slate-400 line-clamp-1 italic">{author}</p>
        </div>
        <div className="text-[8px] text-amber-500/50 uppercase tracking-widest text-center">
          Luminary
        </div>
      </div>
    );
  }

  return (
    <img
      src={coverUrl}
      alt={title}
      loading="lazy"
      onError={() => setHasError(true)}
      className={`w-full h-full object-cover ${className}`}
    />
  );
};
