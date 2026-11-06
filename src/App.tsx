import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { PhoneSimulator } from './components/PhoneSimulator';
import { Library } from './components/Library';
import { ReaderContainer } from './components/Reader/ReaderContainer';
import { ApkGuideModal } from './components/ApkGuideModal';
import { StorageService } from './services/storage';
import { initializeSampleBooksIfEmpty } from './services/sampleBooks';
import { LiveUpdater } from './services/liveUpdater';
import type { Book } from './types';

export const App: React.FC = () => {
  const [books, setBooks] = useState<Book[]>([]);
  const [activeBook, setActiveBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState(true);
  const [showApkGuide, setShowApkGuide] = useState(false);

  const activeBookRef = useRef<Book | null>(null);
  activeBookRef.current = activeBook;

  const showApkGuideRef = useRef<boolean>(false);
  showApkGuideRef.current = showApkGuide;

  const loadBooks = useCallback(async () => {
    try {
      await initializeSampleBooksIfEmpty();
      const list = await StorageService.getAllBooks();
      setBooks(list);
    } catch (err) {
      console.error('Erro ao carregar livros da biblioteca:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleOpenBook = (book: Book) => {
    setActiveBook(book);
    // Adiciona entrada no histórico para o botão voltar do Android responder
    if (typeof window !== 'undefined' && window.history) {
      window.history.pushState({ screen: 'reader', bookId: book.id }, '');
    }
  };

  const handleCloseReader = useCallback(() => {
    setActiveBook(null);
    loadBooks();
  }, [loadBooks]);

  const handleManualBack = () => {
    if (typeof window !== 'undefined' && window.history && window.history.state?.screen === 'reader') {
      window.history.back();
    } else {
      handleCloseReader();
    }
  };

  // Botão Voltar Físico / Gestual do Android
  useEffect(() => {
    // 1. Interceptação via Web History API (funciona via OTA imediatamente)
    const handlePopState = () => {
      if (activeBookRef.current) {
        handleCloseReader();
      }
    };
    window.addEventListener('popstate', handlePopState);

    // 2. Interceptação via Plugin Nativo @capacitor/app
    let backListener: any = null;
    if (Capacitor.isPluginAvailable('App')) {
      CapApp.addListener('backButton', () => {
        if (activeBookRef.current) {
          handleManualBack();
        } else if (showApkGuideRef.current) {
          setShowApkGuide(false);
        } else {
          CapApp.exitApp();
        }
      }).then((l) => {
        backListener = l;
      });
    }

    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (backListener) backListener.remove();
    };
  }, [handleCloseReader]);

  useEffect(() => {
    loadBooks();
    // Notifica sistema nativo e busca atualizações silenciosas em background
    LiveUpdater.notifyReady();
    LiveUpdater.checkForUpdates();
  }, [loadBooks]);

  return (
    <PhoneSimulator
      onOpenApkGuide={() => setShowApkGuide(true)}
      activeBook={activeBook}
      onBackToLibrary={handleManualBack}
    >
      {loading ? (
        <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950 text-slate-300 gap-3">
          <div className="w-9 h-9 border-3 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-medium text-slate-400">Preparando sua biblioteca...</p>
        </div>
      ) : activeBook ? (
        <ReaderContainer
          book={activeBook}
          onBack={handleManualBack}
        />
      ) : (
        <Library
          books={books}
          onOpenBook={handleOpenBook}
          onRefreshBooks={loadBooks}
        />
      )}

      {/* APK Compilation & Testing Guide Modal */}
      <ApkGuideModal
        isOpen={showApkGuide}
        onClose={() => setShowApkGuide(false)}
      />
    </PhoneSimulator>
  );
};

export default App;
