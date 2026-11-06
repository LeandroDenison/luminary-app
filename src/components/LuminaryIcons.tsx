import React from 'react';

export type IconVariant = 
  | 'modern-glow'
  | 'cradled-spine'
  | 'monoline-ribbon'
  | 'classic-serif'
  | 'negative-space'
  | 'luminary-spark';

export interface IconConcept {
  id: IconVariant;
  name: string;
  tagline: string;
  description: string;
}

export const ICON_CONCEPTS: IconConcept[] = [
  {
    id: 'modern-glow',
    name: 'Conceito 1: Geométrico & Glow',
    tagline: 'Moderno, limpo e com iluminação quente',
    description: 'Um L geométrico e robusto em gradiente âmbar/dourado. No canto interno, um livro aberto com páginas luminosas que iluminam o corpo da letra.'
  },
  {
    id: 'cradled-spine',
    name: 'Conceito 2: O Próprio L é o Livro',
    tagline: 'O livro aberto em 90° forma a letra L',
    description: 'A haste vertical e a base horizontal da letra L são as próprias capas e páginas do livro aberto em 90°, que se desdobra na animação de entrada.'
  },
  {
    id: 'monoline-ribbon',
    name: 'Conceito 3: Fita Contínua / Minimalista',
    tagline: 'Fluidez editorial e linhas elegantes',
    description: 'Traço único e sofisticado estilo Apple/Linear. A base do L curva-se naturalmente para formar as páginas abertas de um livro.'
  },
  {
    id: 'classic-serif',
    name: 'Conceito 4: Serifado Editorial',
    tagline: 'Tradição literária e alta classe',
    description: 'Uma letra L serifada inspirada na tipografia dos grandes clássicos, com um livro aberto refinado repousando na base.'
  },
  {
    id: 'negative-space',
    name: 'Conceito 5: Espaço Negativo',
    tagline: 'Silhueta icônica e alto impacto',
    description: 'Um bloco sólido e marcante onde o canto interno do L é esculpido pelo recorte de um livro aberto. Visível com clareza mesmo em 16x16px.'
  },
  {
    id: 'luminary-spark',
    name: 'Conceito 6: Luminary (Luz & Inspiração)',
    tagline: 'O livro como farol de conhecimento',
    description: 'O livro no vértice emana um feixe suave de luz e uma estrela guia que sobe pela coluna do L, remetendo ao nome Luminary.'
  }
];

interface LuminaryIconProps {
  variant?: IconVariant;
  size?: number;
  className?: string;
  showBackground?: boolean;
}

export const LuminaryIcon: React.FC<LuminaryIconProps> = ({
  variant = 'modern-glow',
  size = 40,
  className = '',
  showBackground = true
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        {/* Gradiente Dourado Luminary */}
        <linearGradient id={`gold-grad-${variant}`} x1="15" y1="15" x2="85" y2="85" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FDE68A" />
          <stop offset="40%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#D97706" />
        </linearGradient>

        {/* Gradiente Fundo Escuro Obsidian */}
        <linearGradient id={`bg-grad-${variant}`} x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1E2235" />
          <stop offset="100%" stopColor="#0B0D14" />
        </linearGradient>

        {/* Brilho Suave */}
        <filter id={`glow-${variant}`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* Fundo Squircle (opcional) */}
      {showBackground && (
        <rect
          x="3"
          y="3"
          width="94"
          height="94"
          rx="22"
          fill={`url(#bg-grad-${variant})`}
          stroke="#F59E0B"
          strokeWidth="1.5"
          strokeOpacity="0.35"
        />
      )}

      {/* RENDERIZAÇÃO ESPECÍFICA DE CADA CONCEITO */}
      {variant === 'modern-glow' && (
        <g>
          {/* Letra L moderna com cantos arredondados */}
          {/* Vertical: x=22..36, y=20..80. Horizontal: x=22..78, y=66..80 */}
          <path
            d="M 28 20 
               C 32 20, 35 23, 35 27 
               L 35 67 
               L 75 67 
               C 78 67, 81 70, 81 74 
               C 81 78, 78 81, 74 81 
               L 27 81 
               C 23 81, 20 78, 20 74 
               L 20 27 
               C 20 23, 23 20, 27 20 Z"
            fill={`url(#gold-grad-${variant})`}
          />

          {/* Livro Aberto pousado no canto interno (x=40..74, y=42..65) */}
          <g transform="translate(42, 45)">
            {/* Páginas do livro abertas */}
            {/* Página esquerda */}
            <path
              d="M 15 15 C 9 13, 2 15, 0 16 L 0 5 C 2 4, 9 2, 15 4 Z"
              fill="#FFFBEB"
              fillOpacity="0.95"
            />
            {/* Página direita */}
            <path
              d="M 15 15 C 21 13, 28 15, 30 16 L 30 5 C 28 4, 21 2, 15 4 Z"
              fill="#FEF3C7"
              fillOpacity="0.95"
            />
            {/* Lombada central */}
            <line x1="15" y1="3" x2="15" y2="16" stroke="#B45309" strokeWidth="1.5" strokeLinecap="round" />
            {/* Linhas de texto sutis */}
            <line x1="3" y1="8" x2="11" y2="7" stroke="#D97706" strokeWidth="0.8" strokeLinecap="round" opacity="0.6" />
            <line x1="3" y1="11" x2="11" y2="10" stroke="#D97706" strokeWidth="0.8" strokeLinecap="round" opacity="0.6" />
            <line x1="19" y1="7" x2="27" y2="8" stroke="#D97706" strokeWidth="0.8" strokeLinecap="round" opacity="0.6" />
            <line x1="19" y1="10" x2="27" y2="11" stroke="#D97706" strokeWidth="0.8" strokeLinecap="round" opacity="0.6" />
          </g>

          {/* Brilho dourado atrás do livro */}
          <circle cx="57" cy="53" r="10" fill="#FBBF24" opacity="0.15" filter={`url(#glow-${variant})`} />
        </g>
      )}

      {variant === 'cradled-spine' && (
        <g>
          {/* Brilho ambiente suave no centro do L-Livro */}
          <circle cx="48" cy="54" r="24" fill="#F59E0B" opacity="0.14" filter={`url(#glow-${variant})`} />

          {/* SOMBRA 3D DE PROFUNDIDADE (Topo/Fundo do livro formando o L em 3D) */}
          {/* Aba vertical (Fundo 3D da página vertical) */}
          <path
            d="M 24 74 L 34 62 L 34 18 L 24 26 Z"
            fill="#B45309"
            opacity="0.55"
          />
          {/* Aba horizontal (Fundo 3D da página horizontal) */}
          <path
            d="M 24 74 L 34 62 L 82 62 L 74 74 Z"
            fill="#92400E"
            opacity="0.5"
          />

          {/* FOLHAS EM MOVIMENTO NO ÂNGULO DO "L" (Folheando entre a base e a haste vertical) */}
          {/* Folha 1 subindo da base para a vertical */}
          <path
            d="M 28 72 C 44 62, 56 54, 66 44 L 74 36 C 62 46, 50 54, 34 62 Z"
            fill="#FDE68A"
            opacity="0.55"
          />
          <path
            d="M 28 72 C 44 62, 56 54, 66 44"
            stroke="#FFFBEB"
            strokeWidth="1.6"
            strokeLinecap="round"
            fill="none"
          />

          {/* Folha 2 mais próxima da haste vertical */}
          <path
            d="M 28 72 C 34 54, 38 38, 46 26 L 54 20 C 46 32, 42 46, 34 62 Z"
            fill="#FEF3C7"
            opacity="0.8"
          />
          <path
            d="M 28 72 C 34 54, 38 38, 46 26"
            stroke="#FFFFFF"
            strokeWidth="1.8"
            strokeLinecap="round"
            fill="none"
          />

          {/* MIOLO DE PÁGINAS QUE FORMA O CORPO INTERNO DO "L" */}
          {/* Bloco de páginas vertical (Haste em pé do L) */}
          <path
            d="M 28 72 C 29 55, 29 38, 28 24 L 35 18 C 36 32, 36 48, 35 63 Z"
            fill="#FFFBEB"
          />
          {/* Bloco de páginas horizontal (Base deitada do L) */}
          <path
            d="M 28 72 C 45 70, 62 70, 76 72 L 83 63 C 69 61, 52 61, 35 63 Z"
            fill="#FEF3C7"
          />

          {/* A PRÓPRIA CAPA DOURADA DO LIVRO FORMANDO O "L" EXTERNO */}
          <path
            d="M 21 23 
               C 21 20, 23 19, 26 19 
               L 29 19 
               L 29 71 
               L 78 71 
               C 80 71, 82 73, 82 75 
               C 82 78, 80 79, 77 79 
               L 25 79 
               C 22 79, 21 77, 21 74 Z"
            fill={`url(#gold-grad-${variant})`}
          />

          {/* Lombada articulada no vértice do L (Canto inferior esquerdo) */}
          <circle cx="25" cy="75" r="3.5" fill="#FDE68A" />
          <path d="M 28 72 L 35 63" stroke="#D97706" strokeWidth="2" strokeLinecap="round" />
        </g>
      )}

      {variant === 'monoline-ribbon' && (
        <g>
          {/* Traço contínuo moderno e elegante */}
          <path
            d="M 26 22 
               L 26 76 
               L 42 76 
               C 44 72, 48 68, 54 68 
               C 60 68, 66 73, 70 76 
               L 82 76"
            stroke={`url(#gold-grad-${variant})`}
            strokeWidth="8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Livro minimalista flutuando no canto interno */}
          <path
            d="M 44 60 C 49 56, 54 56, 58 59 C 62 56, 67 56, 72 60 L 72 47 C 67 43, 62 43, 58 46 C 54 43, 49 43, 44 47 Z"
            fill={`url(#gold-grad-${variant})`}
          />
          <line x1="58" y1="46" x2="58" y2="59" stroke="#1E2235" strokeWidth="1.5" strokeLinecap="round" />
        </g>
      )}

      {variant === 'classic-serif' && (
        <g>
          {/* L Serifado Elegante clássico */}
          {/* Top serif */}
          <path d="M 18 24 L 38 24 L 38 28 L 32 28 L 32 68 L 76 68 L 76 60 L 80 60 L 80 78 L 18 78 L 18 74 L 24 74 L 24 28 L 18 28 Z" fill={`url(#gold-grad-${variant})`} />

          {/* Livro encadernado clássico com páginas no canto interno */}
          <g transform="translate(38, 42)">
            {/* Capa do livro */}
            <path d="M 2 24 C 8 20, 16 20, 20 22 C 24 20, 32 20, 38 24 L 38 8 C 32 4, 24 4, 20 6 C 16 4, 8 4, 2 8 Z" fill="#FFFDF5" />
            <path d="M 2 8 C 8 4, 16 4, 20 6 C 24 4, 32 4, 38 8" stroke="#D97706" strokeWidth="1.2" fill="none" />
            <path d="M 20 6 L 20 22" stroke="#92400E" strokeWidth="1.5" />
            {/* Fita de página dourada */}
            <path d="M 20 10 Q 23 18 24 25" stroke="#F59E0B" strokeWidth="1.2" fill="none" />
          </g>
        </g>
      )}

      {variant === 'negative-space' && (
        <g>
          {/* L em formato de bloco sólido chanfrado */}
          {/* A forma do livro é "recortada" no encontro interno */}
          <path
            d="M 20 18 
               L 42 18 
               L 42 42 
               C 46 40, 52 40, 56 42 
               C 60 40, 66 40, 70 42 
               L 70 56 
               L 82 56 
               L 82 82 
               L 20 82 Z"
            fill={`url(#gold-grad-${variant})`}
          />

          {/* O livro recortado no canto interno em contraste escuro */}
          <g transform="translate(42, 42)">
            {/* Página esquerda */}
            <path d="M 0 0 C 4 -2, 10 -2, 14 0 L 14 14 C 10 12, 4 12, 0 14 Z" fill="#0B0D14" />
            {/* Página direita */}
            <path d="M 14 0 C 18 -2, 24 -2, 28 0 L 28 14 C 24 12, 18 12, 14 14 Z" fill="#141824" />
            {/* Linha divisória da página */}
            <line x1="14" y1="0" x2="14" y2="14" stroke="#F59E0B" strokeWidth="1.2" strokeLinecap="round" />
          </g>
        </g>
      )}

      {variant === 'luminary-spark' && (
        <g>
          {/* L arredondado com brilho ascendente */}
          <path
            d="M 24 22 
               C 28 22, 33 25, 33 29 
               L 33 67 
               L 76 67 
               C 79 67, 82 70, 82 74 
               C 82 78, 79 81, 76 81 
               L 24 81 
               C 20 81, 18 78, 18 74 
               L 18 29 
               C 18 25, 20 22, 24 22 Z"
            fill={`url(#gold-grad-${variant})`}
          />

          {/* Livro aberto no canto com páginas abertas */}
          <g transform="translate(40, 48)">
            <path
              d="M 17 16 C 10 14, 3 16, 0 17 L 0 6 C 3 5, 10 3, 17 5 Z"
              fill="#FFFFFF"
            />
            <path
              d="M 17 16 C 24 14, 31 16, 34 17 L 34 6 C 31 5, 24 3, 17 5 Z"
              fill="#FEF3C7"
            />
            <line x1="17" y1="4" x2="17" y2="16" stroke="#D97706" strokeWidth="1.5" />
          </g>

          {/* Feixes de luz e estrela Luminary subindo pelo L */}
          {/* Estrela brilhante no alto do L */}
          <g transform="translate(25, 29)">
            <path
              d="M 0 -4 L 1 -1 L 4 0 L 1 1 L 0 4 L -1 1 L -4 0 L -1 -1 Z"
              fill="#FFFBEB"
              filter={`url(#glow-${variant})`}
            />
          </g>

          {/* Raios de luz sutis saindo do livro */}
          <line x1="50" y1="46" x2="42" y2="35" stroke="#FDE68A" strokeWidth="1" strokeDasharray="1 2" opacity="0.6" />
          <line x1="57" y1="46" x2="57" y2="30" stroke="#FDE68A" strokeWidth="1" strokeDasharray="1 2" opacity="0.8" />
          <line x1="64" y1="46" x2="72" y2="35" stroke="#FDE68A" strokeWidth="1" strokeDasharray="1 2" opacity="0.6" />
          
          <circle cx="57" cy="27" r="1.5" fill="#FFFBEB" />
        </g>
      )}
    </svg>
  );
};
