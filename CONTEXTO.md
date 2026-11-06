# 📚 Luminary Leitor — Contexto Mestre do Projeto

> **Para novos chats ou outros computadores:** Este documento contém o histórico completo de arquitetura, decisões técnicas, comandos de build, status de versões e o roadmap de melhorias do **Luminary Leitor**.

---

## 1. 📌 Visão Geral do Projeto

* **Nome da Aplicação:** Luminary Leitor
* **Tipo:** Aplicativo Android e PWA para leitura de livros digitais (EPUB e PDF).
* **Foco:** Experiência de leitura premium, rápida, livre de anúncios, com tipografia profissional, persistência offline em IndexedDB e sincronização opcional com o Google Drive.
* **Repositório de Deploy / Código:** `https://github.com/LeandroDenison/luminary-app.git`
  * Branch `source`: Código-fonte completo (React, TypeScript, Android, scripts).
  * Branch `main`: Distribuição PWA / GitHub Pages e pacotes de atualização OTA.
* **URL Pública (PWA / GitHub Pages):** `https://leandrodenison.github.io/luminary-app/`
* **Instalador APK Direto:** `https://leandrodenison.github.io/luminary-app/LuminaryLeitor.apk`
* **Versão Ativa Atual:** `v1.0.24` (Manifesto: `version.json`)

---

## 2. 🛠️ Stack Tecnológica

| Camada | Tecnologia | Detalhes |
|---|---|---|
| **Frontend** | React 18 + TypeScript + Vite | Interface responsiva e fluida |
| **Estilização** | Tailwind CSS v4 + Lucide Icons | Dark theme nativo em tons de slate/amber |
| **Mobile Core** | Capacitor 8 (Android) | Wrapper nativo com suporte a APIs de sistema |
| **Leitura EPUB** | `epubjs` | Suporte a capítulos, paginação e rolagem contínua |
| **Leitura PDF** | Canvas / PDF.js + Reflow Engine | Renderização vetorial e modo de texto fluido adaptável |
| **Armazenamento** | IndexedDB via `localforage` | Livros, capas, posições de leitura, bookmarks |
| **Nuvem** | Google Drive API v3 | Autenticação Google, varredura recursiva de pastas e sincronização |
| **Atualizações** | `@capgo/capacitor-updater` | Atualizações silenciosas Over-the-Air (OTA) |
| **Compartilhar** | `@capacitor/share` + `@capacitor/filesystem` | Compartilhamento nativo de imagens para Instagram/WhatsApp |

---

## 3. 📱 Arquitetura Mobile & Regra Crítica do Android

### A. Atualizações OTA (Over-The-Air)
* O app possui um sistema de atualização automática via GitHub Pages:
  * O app consulta periodicamente `https://leandrodenison.github.io/luminary-app/version.json`.
  * Se a versão for mais recente, baixa o pacote `dist-<versão>.zip` com validação de checksum SHA-256 e recarrega na hora.
* **O que a OTA atualiza:** Código HTML, CSS, JavaScript, componentes React, imagens e lógica de frontend.

### B. Quando é Obrigatório Gerar um Novo APK (`.apk`):
* **Regra Fundamental:** Atualizações OTA **NÃO** conseguem injetar código Java nativo ou alterar o `AndroidManifest.xml` de um APK já instalado.
* Quando novos plugins nativos forem adicionados (como `@capacitor/share`, `@capacitor/filesystem`, permissões de `FileProvider` em `file_paths.xml` ou novos serviços nativos), é **indispensável** compilar e instalar um novo `LuminaryLeitor.apk`.

---

## 4. 🚀 Funcionalidades Já Implementadas (Até v1.0.24)

### 📖 Leitor & Usabilidade
0. **Busca na Web de Metadados Incompletos, Higienização de Séries & Filtros Avançados (v1.0.24):**
   - **Busca de Metadados na Web:** Varredura em segundo plano e sob demanda via Apple Books / Open Library para preencher autores em livros onde o arquivo veio sem autor ("Autor desconhecido"), capas em alta resolução e sinopses completas.
   - **Higienização de Séries & Volumes:** Remove prefixos ruidosos como `"#2 - "`, `"02 - "` ou `"Vol. 2 - "` do título do livro, extraindo o volume para uma badge destacada na capa (`Vol. 2`) e a série para uma tag elegante sobre o título (`A Torre Negra · #2`), seguindo o padrão de referências consagradas como Kindle, Apple Books e Goodreads.
   - **Filtros e Ordenação Avançada na Estante:** Botão moderno no canto direito da barra de pesquisa com ordenação completa (A-Z, Z-A, Recentes, Maior Progresso, Autor A-Z) e filtros dinâmicos por autor (com contagem de obras) e por série, além de chips com remoção rápida em 1 toque.
   - **Completar Dados na Web nos Detalhes:** Botão com ícone de varinha mágica na tela de detalhes do livro para enriquecer qualquer obra individual instantaneamente.
0. **Eliminação Inteligente de Livros Incompletos por Score de Completude (v1.0.23):**
   * **Critério de Seleção do Mais Completo:** Avaliação objetiva por pontuação (`getBookCompletenessScore`): autor conhecido (+100), progresso de leitura (+50+prog), capa válida (+30), páginas (+20), descrição (+10), Drive (+15) e marcadores (+5 cada).
   * **Fusão & Exclusão Automática da Cópia Incompleta:** Resolve duplicatas entre arquivos diferentes da mesma obra (ex: *"O Cemitério - Autor desconhecido"* vs *"O Cemitério - Stephen King"*). Preserva todo o progresso e arquivo do vencedor, transferindo dados faltantes e deletando o registro incompleto localmente.
   * **Prevenção Ativa no Sync:** Durante a varredura do Google Drive, não cria novas entradas caso o livro já exista com autor parcial ou desconhecido, apenas enriquece os metadados.
0. **Busca Ultrarrápida de Capas em Alta Resolução (v1.0.22):**
   * **Integração com Apple Books / iTunes Search API:** Busca automática de capas das edições oficiais brasileiras em alta definição (600x600 HD), sem restrições de cota ou bloqueios de CORS.
   * **Atualização em Tempo Real na Estante:** O `CoverLoader` entrega as capas com transição instantânea sem precisar recarregar toda a estante.
   * **Sanitização de URLs do Drive:** Substitui URLs inacessíveis do Google Drive por capas públicas seguras e de carregamento imediato.
0. **Sessão Contínua Google Drive & Auto-Desduplicação de Livros (v1.0.21):**
   * **Sessão Persistente Sem Quedas:** Renovação transparente e silenciosa do token de acesso do Google (Google Play Services / OAuth). Se qualquer chamada responder 401, o app renova em background e repete a requisição automaticamente, acabando com as quedas frequentes de login.
   * **Desduplicação & Fusão Inteligente:** O algoritmo [`deduplicateAndMergeBooks`](file:///c:/Users/leand/OneDrive%20-%20HAPVIDA%20ASSIST%C3%8ANCIA%20M%C3%89DICA%20LTDA/%C3%81rea%20de%20Trabalho/luminary-app/src/services/driveSync.ts) identifica cópias repetidas (mesmo com nomes como *"Cópia de"*, `(1)` ou IDs locais diferentes) e funde as obras em um único livro na estante, preservando o maior progresso de leitura, marcadores e vinculação com o Drive.
0. **Carregamento Assíncrono de Capas & Reconhecimento Profundo (v1.0.20):**
   * **Carregamento Suave em Segundo Plano:** O `CoverLoader` busca miniaturas leves do Google Drive e APIs abertas (Google Books / Open Library) gradualmente durante o uso do app, sem travar a interface, e salva localmente no IndexedDB de forma definitiva.
   * **Extração Infalível de Capas em EPUBs:** Algoritmo profundo em 4 camadas que inspeciona o manifesto (`properties="cover-image"`), a primeira página do spine (`cover.xhtml` com tags `<img>` ou `<image>` SVG) e varredura do arquivo ZIP. Corrige o reconhecimento de capas em obras brasileiras da Suma/LeYa (ex: *"A Hora do Vampiro"* e *"O Cemitério"* de Stephen King).
0. **Catálogo Leve & Download Sob Demanda (v1.0.19):**
   * **Sincronização Ultrarrápida:** Entrega a estante completa com título, autor, formato e série em poucos segundos, sem baixar gigabytes de arquivos pesados durante o sync.
   * **Download 100% Sob Demanda:** O arquivo PDF/EPUB pesado só é baixado quando o usuário toca no livro para ler pela primeira vez, poupando a memória do celular e a internet móvel.
   * **Banco de Dados em Nuvem (`biblioteca.json`):** Mantém o catálogo consolidado no Google Drive para sincronização quase instantânea entre celulares.
1. **Tipografia Profissional:**
   * Fontes literárias integradas: **Literata** (Google), **Merriweather**, **Lora**, **Atkinson Hyperlegible** (acessibilidade) e **Inter**.
   * Sliders de ajuste de tamanho de fonte, altura de linha (espaçamento) e margens laterais.
2. **Ajuste de Brilho por Gesto Lateral:**
   * Deslizar verticalmente o dedo na margem esquerda da tela regula o brilho instantaneamente de 10% a 100%, com feedback visual animado.
3. **Card de Citação Compartilhável (Instagram / WhatsApp):**
   * Disparado ao selecionar qualquer texto no leitor ou via botão de ação.
   * Formatos: **Stories (9:16)**, **Feed Quadrado (1:1)** e **Auto** (ajustado exatamente à altura da frase).
   * Alinhamento de texto com toggle **Justificado** (com distribuição calculada em Canvas) ou **À Esquerda**.
   * Slider de tamanho de fonte para a citação (14px a 32px).
   * **Compartilhar Nativo:** Envia imagem PNG limpa via Android Share Sheet direto para o Instagram Stories/Feed ou WhatsApp.
   * **Copiar Card (Imagem):** Copia o PNG do card para o clipboard via `ClipboardItem`.
   * **Visualização Direta à Prova de Falhas:** Submodal com imagem real, permitindo toque longo do Android para salvar/compartilhar.
4. **Modo Reflow de PDF (Texto Fluido para Telas Pequenas - Ideia #7):**
   * Extração de texto estruturado com agrupamento geométrico de linhas e reconstrução de parágrafos via `pdfReflow.ts`.
   * Elimina a necessidade de dar zoom e arrastar a tela em celulares.
   * Suporte total a troca de fontes literárias, tamanho da letra, entrelinhas e margens no PDF.
   * Alternador rápido na barra superior: **[Texto Adaptável]** vs **[Layout Original]**.
   * Fallback visual inteligente: páginas que contêm apenas ilustrações, fórmulas ou diagramas são renderizadas em alta resolução no próprio fluxo sem perda.
   * Habilita a seleção direta de texto do PDF para criação de **Cards de Citação**.
   * **Seleção & Cópia Facilitada (EPUB & PDF):** Barra flutuante de ação rápida ao selecionar texto (`[Copiar]` e `[Criar Card]`) ativa em livros EPUB e PDF Reflow, com permissões CSS irrestritas (`user-select: text !important`), destaque visual em tom âmbar e prevenção de virada de página acidental durante a seleção.
5. **Varredura Recursiva de Subpastas & Séries no Google Drive (v1.0.18):**
   * Reconhecimento automático de livros em qualquer nível de profundidade de subpastas no Google Drive (BFS em lotes otimizados).
   * Identificação de pastas de autores e coleções/séries (ex: `livros / Stephen King / A Torre Negra / Livro.epub`).
   * Inferência inteligente: quando o PDF ou EPUB não possui metadados de autor pré-gravados ou está como "Desconhecido", o nome da pasta do autor é associado automaticamente, e a série/coleção é anexada à descrição do livro.
6. **Gerenciamento de Biblioteca:**
   * Busca em tempo real por título e por autor (independente de acentos ou maiúsculas).
   * Opção de **Ocultar / Arquivar Livros** (permite limpar testes ou livros duplicados mantendo os dados preservados).
   * Filtro na biblioteca para alternar entre "Livros Ativos" e "Arquivados" com botão de desarquivar.
   * Sincronização bidirecional e backup com o Google Drive.

---

## 5. 💡 Roadmap de Ideias Guardadas do Brainstorming

As ideias #3, #6 e #7 foram implementadas. O restante do banco de ideias aprovadas para futuras versões inclui:

1. **🖍️ Destaques com Cores e Caderno de Citações (Ideia #1):**
   * Marca-texto com 4 cores (amarelo, verde, rosa, azul) e painel centralizado reunindo todos os destaques do livro.
2. **⚡ Estimativa de Tempo de Leitura (Ideia #2):**
   * Cálculo de palavras por minuto (WPM) com indicador: *"faltam X min para terminar o capítulo"*.
3. **🎧 Modo Áudio / Leitura em Voz Alta - TTS (Ideia #4):**
   * Player integrado utilizando a síntese de voz nativa do Android (*SpeechSynthesis* pt-BR).
4. **🏷️ Coleções / Pastas Personalizadas & Tags (Ideia #5):**
   * Categorias customizáveis (ex: *"Faculdade"*, *"Favoritos"*, *"Ficção"*).
5. **📊 Metas e Hábitos de Leitura - "Streak" Diário (Ideia #8):**
   * Registro de minutos lidos por dia e sequência de dias seguidos (foguinho 🔥).
6. **🔍 Dicionário e Tradução Rápida (Ideia #9):**
   * Janela pop-up com significado de palavras incomuns ao tocar e segurar.
7. **📄 Animação de Virada de Página Realista (Ideia #10):**
   * Efeito de dobra 3D (page-flip) no modo paginado.

---

## 6. ⚙️ Comandos Úteis de Desenvolvimento

### Rodar localmente:
```bash
npm run dev
```

### Compilar e validar TypeScript:
```bash
npm run build
```

### Empacotar e publicar versão OTA:
```bash
# 1. Atualizar CURRENT_APP_VERSION em src/services/liveUpdater.ts
# 2. Executar o empacotador OTA:
node scripts/package-ota.js 1.0.18

# 3. Comitar e subir no repositório deploy_pages:
cd deploy_pages
git add -A
git commit -m "Release v1.0.18"
git push origin main
```

### Compilar o APK Android nativo (quando alterar plugins nativos):
```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
npx cap sync android
cd android
.\gradlew.bat assembleDebug

# Copiar APK gerado para distribuição:
Copy-Item "android\app\build\outputs\apk\debug\app-debug.apk" "deploy_pages\LuminaryLeitor.apk" -Force
```
