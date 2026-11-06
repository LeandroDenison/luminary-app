import React, { useEffect, useRef } from 'react';

interface CinematicSplashProps {
  onComplete: () => void;
  onSkip?: () => void;
}

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface Vec2 {
  x: number;
  y: number;
  scale: number;
  zCam: number;
}

export const CinematicSplash: React.FC<CinematicSplashProps> = ({ onComplete, onSkip }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let startTime: number | null = null;
    const duration = 3900; // 3.9s de transformação contínua: Ícone "L-Livro" -> Livro Aberto 3D -> Mergulho

    // Síntese de áudio cinematográfico (Acorde profundo + farfalhar realista de folhas)
    let audioCtx: AudioContext | null = null;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
        const t0 = audioCtx.currentTime;

        // 1. Sub-bass & Warm Pad (estilo abertura de cinema)
        const freqs = [110, 164.81, 220, 329.63];
        freqs.forEach((f, idx) => {
          if (!audioCtx) return;
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.type = idx === 0 ? 'sine' : 'triangle';
          osc.frequency.setValueAtTime(f * 0.98, t0);
          osc.frequency.exponentialRampToValueAtTime(f * 1.02, t0 + 2.9);

          gain.gain.setValueAtTime(0.001, t0);
          gain.gain.linearRampToValueAtTime(idx === 0 ? 0.08 : 0.025, t0 + 0.65);
          gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 3.5);

          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.start(t0);
          osc.stop(t0 + 3.6);
        });

        // 2. Pulso rítmico de páginas folheando no ar
        const bufferSize = Math.floor(audioCtx.sampleRate * 2.4);
        const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          const t = i / audioCtx.sampleRate;
          const flutterEnv = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 13.5);
          output[i] = (Math.random() * 2 - 1) * flutterEnv;
        }
        const noise = audioCtx.createBufferSource();
        noise.buffer = noiseBuffer;

        const filter = audioCtx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(850, t0 + 0.55);
        filter.frequency.exponentialRampToValueAtTime(2200, t0 + 2.7);
        filter.Q.setValueAtTime(2.2, t0);

        const noiseGain = audioCtx.createGain();
        noiseGain.gain.setValueAtTime(0.0001, t0);
        noiseGain.gain.setValueAtTime(0.0001, t0 + 0.5);
        noiseGain.gain.linearRampToValueAtTime(0.055, t0 + 1.4);
        noiseGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 3.3);

        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(audioCtx.destination);
        noise.start(t0 + 0.5);
        noise.stop(t0 + 3.4);
      }
    } catch {}

    // Partículas 3D de poeira dourada no espaço ao redor do livro
    const particles = Array.from({ length: 55 }, () => ({
      x: (Math.random() - 0.5) * 320,
      y: (Math.random() - 0.5) * 320,
      z: (Math.random() - 0.3) * 260,
      vx: (Math.random() - 0.5) * 0.4,
      vy: -Math.random() * 0.6 - 0.2,
      vz: Math.random() * 1.2 + 0.3,
      size: Math.random() * 2.2 + 0.8,
      alpha: Math.random() * 0.65 + 0.25
    }));

    const smoothstep = (edge0: number, edge1: number, x: number) => {
      const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
      return t * t * (3 - 2 * t);
    };

    const easeInOutCubic = (x: number) =>
      x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

    // --------------------------------------------------------
    // MOTOR DE PROJEÇÃO 3D REAL (Perspectiva + Rotação de Câmera)
    // --------------------------------------------------------
    const projectPoint = (
      p: Vec3,
      camPitch: number,
      camYaw: number,
      camRoll: number,
      camDist: number,
      fov: number,
      cx: number,
      cy: number,
      offsetX: number,
      offsetY: number
    ): Vec2 => {
      // 1. Rotação em torno de Z (Roll)
      const cosR = Math.cos(camRoll);
      const sinR = Math.sin(camRoll);
      const x1 = p.x * cosR - p.y * sinR;
      const y1 = p.x * sinR + p.y * cosR;
      const z1 = p.z;

      // 2. Rotação em torno de Y (Yaw)
      const cosY = Math.cos(camYaw);
      const sinY = Math.sin(camYaw);
      const x2 = x1 * cosY + z1 * sinY;
      const y2 = y1;
      const z2 = -x1 * sinY + z1 * cosY;

      // 3. Rotação em torno de X (Pitch)
      const cosP = Math.cos(camPitch);
      const sinP = Math.sin(camPitch);
      const x3 = x2;
      const y3 = y2 * cosP - z2 * sinP;
      const z3 = y2 * sinP + z2 * cosP;

      // 4. Translação de profundidade da câmera
      const zCam = camDist - z3;
      const safeZ = Math.max(25, zCam);
      const scale = fov / safeZ;

      return {
        x: cx + offsetX + x3 * scale,
        y: cy + offsetY + y3 * scale,
        scale,
        zCam: safeZ
      };
    };

    // Calcula os vértices 3D de uma folha ou capa com conservação exata de comprimento
    // Nota geométrica fundamental:
    // - flipProgress = 0.00 -> aponta para a DIREITA (+X, base horizontal do "L")
    // - flipProgress = 0.50 -> aponta para CIMA (+Z, haste vertical em 90° do "L"!)
    // - flipProgress = 1.00 -> aponta para a ESQUERDA (-X, livro totalmente aberto em 180°!)
    const computePageCurve3D = (
      pageWidth: number,
      flipProgress: number,
      archFactor: number,
      flexAmount: number,
      segments: number,
      xBaseOffset: number = 0,
      zBaseOffset: number = 0
    ): { x: number; z: number; nx: number; nz: number }[] => {
      const pts: { x: number; z: number; nx: number; nz: number }[] = [];
      let curX = xBaseOffset;
      let curZ = zBaseOffset;
      const ds = pageWidth / segments;

      const baseAngle = flipProgress * Math.PI;
      const midFlip = Math.sin(flipProgress * Math.PI);

      for (let i = 0; i <= segments; i++) {
        const u = i / segments;

        // Arqueamento orgânico perto da lombada
        const spineArch = Math.sin(u * Math.PI) * archFactor * Math.cos(flipProgress * Math.PI);

        // Ondulação em S (arrasto aerodinâmico da folha cortando o ar)
        const airBend =
          -midFlip * flexAmount * Math.pow(u, 1.35) * Math.cos((flipProgress - 0.3) * Math.PI * 0.7);

        const theta = baseAngle + spineArch + airBend;
        const nx = -Math.sin(theta);
        const nz = Math.cos(theta);

        pts.push({ x: curX, z: curZ, nx, nz });

        if (i < segments) {
          curX += ds * Math.cos(theta);
          curZ += ds * Math.sin(theta);
        }
      }
      return pts;
    };

    // Renderiza uma folha ou capa 3D subdividida com iluminação Phong/Lambert e bordas douradas
    const drawCurvedSurface3D = (
      curve: { x: number; z: number; nx: number; nz: number }[],
      halfHeight: number,
      project: (p: Vec3) => Vec2,
      options: {
        isCover?: boolean;
        lModeGoldIntensity?: number; // 1.0 no início quando a capa forma o "L" dourado do ícone
        edgeGlow?: number;
        opacity?: number;
      } = {}
    ) => {
      const {
        isCover = false,
        lModeGoldIntensity = 0,
        edgeGlow = 0,
        opacity = 1
      } = options;

      const topPts: Vec2[] = [];
      const botPts: Vec2[] = [];

      for (let i = 0; i < curve.length; i++) {
        const c = curve[i];
        topPts.push(project({ x: c.x, y: -halfHeight, z: c.z }));
        botPts.push(project({ x: c.x, y: halfHeight, z: c.z }));
      }

      ctx.save();
      ctx.globalAlpha = opacity;

      for (let i = 0; i < curve.length - 1; i++) {
        const c0 = curve[i];
        const c1 = curve[i + 1];
        const t0 = topPts[i];
        const t1 = topPts[i + 1];
        const b0 = botPts[i];
        const b1 = botPts[i + 1];

        const avgNx = (c0.nx + c1.nx) * 0.5;
        const avgNz = (c0.nz + c1.nz) * 0.5;
        const dot = Math.max(0, avgNx * 0.25 + avgNz * 0.96);
        const u = i / (curve.length - 1);
        const creaseShadow = 0.68 + 0.32 * Math.min(1, u * 4.5);
        const light = Math.min(1, (0.36 + 0.64 * dot) * creaseShadow);

        if (isCover) {
          // Transição suave entre o Ouro Vibrante do Ícone "L" (lModeGoldIntensity = 1)
          // e o Couro Obsidiana & Ouro Imperial conforme o livro se abre
          const obsR = 22 + light * 32;
          const obsG = 18 + light * 26;
          const obsB = 30 + light * 36;

          const goldR = 180 + light * 72;
          const goldG = 115 + light * 75;
          const goldB = 18 + light * 35;

          const r = Math.round(obsR * (1 - lModeGoldIntensity) + goldR * lModeGoldIntensity);
          const g = Math.round(obsG * (1 - lModeGoldIntensity) + goldG * lModeGoldIntensity);
          const b = Math.round(obsB * (1 - lModeGoldIntensity) + goldB * lModeGoldIntensity);
          ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        } else {
          // Papel marfim acetinado com reflexo quente dourado
          const r = Math.round(218 + light * 37);
          const g = Math.round(196 + light * 52);
          const b = Math.round(150 + light * 76);
          ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        }

        ctx.beginPath();
        ctx.moveTo(t0.x, t0.y);
        ctx.lineTo(t1.x, t1.y);
        ctx.lineTo(b1.x, b1.y);
        ctx.lineTo(b0.x, b0.y);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = 0.65;
        ctx.stroke();
      }

      // Se for a capa, desenha a borda frontal dourada espessa (que forma a silhueta da letra "L" no início!)
      if (isCover) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(botPts[0].x, botPts[0].y);
        for (let i = 1; i < botPts.length; i++) {
          ctx.lineTo(botPts[i].x, botPts[i].y);
        }

        const borderWidth = 3.2 + lModeGoldIntensity * 4.5;
        const grad = ctx.createLinearGradient(
          botPts[0].x,
          botPts[0].y,
          botPts[botPts.length - 1].x,
          botPts[botPts.length - 1].y
        );
        grad.addColorStop(0, '#FDE68A');
        grad.addColorStop(0.5, '#F59E0B');
        grad.addColorStop(1, '#D97706');

        ctx.strokeStyle = grad;
        ctx.lineWidth = borderWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowColor = 'rgba(245, 158, 11, 0.55)';
        ctx.shadowBlur = 8 + lModeGoldIntensity * 8;
        ctx.stroke();
        ctx.restore();
      }

      // Contorno luminoso na borda frontal da folha de papel
      if (!isCover && edgeGlow > 0.01) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        ctx.beginPath();
        ctx.moveTo(botPts[0].x, botPts[0].y);
        for (let i = 1; i < botPts.length; i++) {
          ctx.lineTo(botPts[i].x, botPts[i].y);
        }
        ctx.lineTo(topPts[topPts.length - 1].x, topPts[topPts.length - 1].y);

        ctx.strokeStyle = `rgba(251, 191, 36, ${edgeGlow * 0.85})`;
        ctx.lineWidth = 1.4;
        ctx.shadowColor = '#F59E0B';
        ctx.shadowBlur = 8;
        ctx.stroke();

        ctx.strokeStyle = `rgba(255, 251, 235, ${edgeGlow * 0.9})`;
        ctx.lineWidth = 0.7;
        ctx.shadowBlur = 0;
        ctx.stroke();

        ctx.restore();
      }

      ctx.restore();
    };

    const render = (now: number) => {
      if (!startTime) startTime = now;
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);

      const dpr = window.devicePixelRatio || 2;
      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      const w = rect.width;
      const h = rect.height;
      const cx = w / 2;
      const cy = h / 2;

      // 1. Fundo Cinematográfico Profundo
      ctx.fillStyle = '#04060b';
      ctx.fillRect(0, 0, w, h);

      // Luz volumétrica central atrás do L-Livro
      const glowRadius = Math.max(w, h) * (0.42 + progress * 0.42);
      const bgGlow = ctx.createRadialGradient(cx, cy, 5, cx, cy, glowRadius);
      const glowAlpha =
        0.16 + 0.14 * Math.sin(Math.min(1, progress * 1.1) * Math.PI) + (progress > 0.6 ? (progress - 0.6) * 0.5 : 0);
      bgGlow.addColorStop(0, `rgba(251, 191, 36, ${Math.min(0.65, glowAlpha)})`);
      bgGlow.addColorStop(0.45, `rgba(217, 119, 6, ${Math.min(0.25, glowAlpha * 0.5)})`);
      bgGlow.addColorStop(1, 'rgba(4, 6, 11, 0)');
      ctx.fillStyle = bgGlow;
      ctx.fillRect(0, 0, w, h);

      // --------------------------------------------------------
      // COREOGRAFIA CONTÍNUA: O PRÓPRIO "L" É O LIVRO!
      // --------------------------------------------------------
      // Fase 1 (0.00 -> 0.18): O livro está aberto em exatos 90° (haste esquerda em pé = 0.5, base direita deitada = 0.0),
      //                        formando a própria letra "L" do ícone da Home!
      // Fase 2 (0.14 -> 0.50): A haste vertical do "L" se desdobra para a esquerda (de 90° para 180°),
      //                        transformando o "L" no livro totalmente aberto enquanto a lombada centraliza na tela!
      // Fase 3 (0.20 -> 0.90): As páginas dentro do L ganham velocidade máxima em ondas 3D S-curve
      //                        enquanto o livro voa em direção ao leitor até cobrir toda a tela!

      const unfoldT = easeInOutCubic(smoothstep(0.12, 0.50, progress));
      const zoomT = Math.pow(smoothstep(0.38, 0.94, progress), 2.25);
      const lGoldFactor = 1 - smoothstep(0.18, 0.48, progress);

      // Moldura Squircle do ícone no início (dissolve suavemente quando o L começa a se desdobrar)
      const iconFrameAlpha = 1 - smoothstep(0.04, 0.26, progress);
      if (iconFrameAlpha > 0.01) {
        ctx.save();
        ctx.globalAlpha = iconFrameAlpha;
        const frameSize = 148 + (1 - iconFrameAlpha) * 28;
        const fx = cx - frameSize / 2;
        const fy = cy - frameSize / 2;

        const frameGrad = ctx.createLinearGradient(fx, fy, fx + frameSize, fy + frameSize);
        frameGrad.addColorStop(0, '#1E2235');
        frameGrad.addColorStop(1, '#0B0D14');

        ctx.fillStyle = frameGrad;
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(fx, fy, frameSize, frameSize, 34);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      // No modo "L" (unfoldT = 0), a lombada fica no canto inferior esquerdo do L (-26, +22) para que o L fique centralizado.
      // Conforme o L se abre em livro (unfoldT -> 1), a lombada desliza para o centro exato da tela (0, 0).
      const offsetX = -26 * (1 - unfoldT);
      const offsetY = 22 * (1 - unfoldT) + 12 * Math.sin(unfoldT * Math.PI);

      // Ângulos 3D da câmera:
      // No início (unfoldT = 0), camPitch = 1.24 rad (~71°) e camYaw = -0.18 rad mostram o "L" com profundidade 3D isométrica limpa.
      // Ao abrir (unfoldT -> 1), alinha de frente (camYaw = 0) com visão dramática de baixo (camPitch = 1.02 -> 0.85).
      const camPitch = 1.24 * (1 - unfoldT) + (1.02 - 0.18 * zoomT) * unfoldT;
      const camYaw = -0.18 * (1 - unfoldT);
      const camRoll = 0;

      const camDist = 340 - unfoldT * 65 - zoomT * 245;
      const fov = 420;

      const project = (p: Vec3) =>
        projectPoint(p, camPitch, camYaw, camRoll, camDist, fov, cx, cy, offsetX, offsetY);

      const pageW = 66;
      const halfH = 44;
      const segments = 20;

      // 1. HASTE HORIZONTAL DO "L" -> CAPA DIREITA DO LIVRO (flip = 0.0)
      const rightCoverCurve = computePageCurve3D(pageW * 1.05, 0, 0.03 * unfoldT, 0, segments, 0, -2.5);
      drawCurvedSurface3D(rightCoverCurve, halfH * 1.04, project, {
        isCover: true,
        lModeGoldIntensity: lGoldFactor,
        edgeGlow: 0.35
      });

      // 2. HASTE VERTICAL DO "L" (90° = flip 0.50) -> SE DESDOBRA NA CAPA ESQUERDA DO LIVRO (180° = flip 0.99)!
      const leftCoverFlip = 0.50 + unfoldT * 0.49;
      const leftCoverCurve = computePageCurve3D(
        pageW * 1.05,
        leftCoverFlip,
        0.03 * unfoldT,
        0.12 * Math.sin(unfoldT * Math.PI),
        segments,
        -2.5 * (1 - unfoldT),
        -2.5 * unfoldT
      );

      drawCurvedSurface3D(leftCoverCurve, halfH * 1.04, project, {
        isCover: true,
        lModeGoldIntensity: lGoldFactor,
        edgeGlow: 0.35
      });

      // 3. Bloco de páginas da Base Horizontal (Direita)
      for (let b = 0; b < 3; b++) {
        const stackAngle = 0.015 + b * 0.022;
        const baseRight = computePageCurve3D(
          pageW,
          stackAngle,
          0.08 + 0.15 * unfoldT,
          0,
          segments,
          0,
          b * 0.8
        );
        drawCurvedSurface3D(baseRight, halfH, project, {
          edgeGlow: b === 2 ? 0.45 : 0.15
        });
      }

      // 4. Bloco de páginas da Haste Vertical (em 90° no L, desdobrando junto com a capa esquerda para 180°)
      for (let b = 0; b < 3; b++) {
        const stackAngle = leftCoverFlip - 0.018 - b * 0.022;
        const baseLeft = computePageCurve3D(
          pageW,
          stackAngle,
          0.08 + 0.15 * unfoldT,
          0,
          segments,
          0,
          b * 0.8
        );
        drawCurvedSurface3D(baseLeft, halfH, project, {
          edgeGlow: b === 2 ? 0.45 : 0.15
        });
      }

      // 5. PÁGINAS INTERNAS DO "L" QUE SE TORNAM A CASCATA DE FOLHAS EM ALTA VELOCIDADE!
      // No instante 0 (ícone L), já existem 2 folhas abertas em leque dentro do ângulo de 90° do L.
      // Assim que a animação começa, elas aceleram e puxam uma correnteza fluida de folhas 3D!
      const flutterRamp = smoothstep(0.08, 0.35, progress);
      const totalSheets = 9;
      const speed = 0.4 + flutterRamp * (1.8 + progress * 2.3);
      const masterCycle = (elapsed / 1000) * speed;

      const activeSheets: { flip: number; id: number; alpha: number }[] = [];
      for (let s = 0; s < totalSheets; s++) {
        const rawPhase = (masterCycle + s / totalSheets) % 1;
        // As páginas viajam da base direita (0.06) até a haste esquerda (leftCoverFlip - 0.05)
        const maxFlip = leftCoverFlip - 0.05;
        const flip = 0.06 + rawPhase * (maxFlip - 0.06);

        // No frame inicial do ícone, destacamos 2 páginas estáticas no canto do L e fazemos as demais surgirem suavemente
        const sheetAlpha = s % 4 === 0 ? 1 : flutterRamp;
        if (sheetAlpha > 0.02) {
          activeSheets.push({ flip, id: s, alpha: sheetAlpha });
        }
      }

      // Painter's Algorithm: desenha primeiro as folhas mais próximas das capas e por último as do topo do arco central
      const midTarget = leftCoverFlip * 0.5;
      activeSheets.sort((a, b) => Math.abs(b.flip - midTarget) - Math.abs(a.flip - midTarget));

      for (const sheet of activeSheets) {
        const normalizedPos = sheet.flip / Math.max(0.2, leftCoverFlip);
        const midElevation = Math.sin(normalizedPos * Math.PI);

        const curve = computePageCurve3D(
          pageW,
          sheet.flip,
          0.18 + 0.12 * flutterRamp,
          0.25 + 0.42 * flutterRamp, // Curva em S ganha força conforme a paginação acelera
          segments,
          0,
          1.8 + midElevation * 3.2
        );

        drawCurvedSurface3D(curve, halfH, project, {
          edgeGlow: (0.4 + 0.6 * midElevation),
          opacity: sheet.alpha
        });
      }

      // Articulação Dourada da Lombada (Vértice do L que se torna o centro da lombada do livro)
      const spineFront = project({ x: -1, y: halfH * 1.04, z: -1 });
      ctx.save();
      ctx.fillStyle = '#FDE68A';
      ctx.shadowColor = '#F59E0B';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(spineFront.x, spineFront.y, Math.max(2.5, 3.2 * spineFront.scale * 0.7), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 6. Poeira Dourada 3D
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      particles.forEach((pt) => {
        pt.x += pt.vx;
        pt.y += pt.vy;
        pt.z += pt.vz * (1 + zoomT * 3);
        if (pt.z > 180) pt.z = -120;

        const proj = project({ x: pt.x, y: pt.y, z: pt.z });
        if (proj.zCam > 30) {
          const r = Math.max(0.5, pt.size * proj.scale * 0.45);
          ctx.fillStyle = `rgba(253, 230, 138, ${pt.alpha * Math.sin(progress * Math.PI)})`;
          ctx.beginPath();
          ctx.arc(proj.x, proj.y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      });
      ctx.restore();

      // --------------------------------------------------------
      // FASE FINAL: CLARÃO LUMINOSO E TRANSIÇÃO BLACKOUT PARA O APP
      // --------------------------------------------------------
      if (progress > 0.76) {
        const endT = (progress - 0.76) / 0.24;
        const bloomAlpha = Math.sin(Math.min(1, endT * 1.35) * Math.PI) * 0.75;
        if (bloomAlpha > 0.01) {
          ctx.fillStyle = `rgba(254, 243, 199, ${bloomAlpha})`;
          ctx.fillRect(0, 0, w, h);
        }

        const blackoutAlpha = smoothstep(0.35, 0.98, endT);
        ctx.fillStyle = `rgba(2, 6, 23, ${blackoutAlpha})`;
        ctx.fillRect(0, 0, w, h);
      }

      ctx.restore();

      if (progress < 1) {
        animId = requestAnimationFrame(render);
      } else {
        onComplete();
      }
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      if (audioCtx && audioCtx.state !== 'closed') {
        audioCtx.close().catch(() => {});
      }
    };
  }, [onComplete]);

  return (
    <div
      onClick={onSkip || onComplete}
      className="relative w-full h-full bg-[#04060b] overflow-hidden flex items-center justify-center cursor-pointer select-none"
    >
      <canvas ref={canvasRef} className="w-full h-full block" />

      <button
        onClick={(e) => {
          e.stopPropagation();
          onComplete();
        }}
        className="absolute top-4 right-4 text-[10px] uppercase font-mono tracking-wider text-slate-400 hover:text-white bg-slate-900/70 hover:bg-slate-800 px-3 py-1.5 rounded-full border border-slate-700/60 transition-all z-50 cursor-pointer"
      >
        Pular ›
      </button>
    </div>
  );
};
