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
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let animId: number;
    let startTime: number | null = null;
    const duration = 3500; // 3.5s ultra fluido a 60/120 FPS

    // Síntese de áudio cinematográfico leve
    let audioCtx: AudioContext | null = null;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
        const t0 = audioCtx.currentTime;

        const freqs = [110, 164.81, 220, 329.63];
        freqs.forEach((f, idx) => {
          if (!audioCtx) return;
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.type = idx === 0 ? 'sine' : 'triangle';
          osc.frequency.setValueAtTime(f * 0.98, t0);
          osc.frequency.exponentialRampToValueAtTime(f * 1.02, t0 + 2.6);

          gain.gain.setValueAtTime(0.001, t0);
          gain.gain.linearRampToValueAtTime(idx === 0 ? 0.08 : 0.025, t0 + 0.6);
          gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 3.2);

          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.start(t0);
          osc.stop(t0 + 3.3);
        });

        const bufferSize = Math.floor(audioCtx.sampleRate * 2.1);
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
        filter.frequency.setValueAtTime(850, t0 + 0.45);
        filter.frequency.exponentialRampToValueAtTime(2200, t0 + 2.4);
        filter.Q.setValueAtTime(2.2, t0);

        const noiseGain = audioCtx.createGain();
        noiseGain.gain.setValueAtTime(0.0001, t0);
        noiseGain.gain.setValueAtTime(0.0001, t0 + 0.45);
        noiseGain.gain.linearRampToValueAtTime(0.055, t0 + 1.3);
        noiseGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 3.0);

        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(audioCtx.destination);
        noise.start(t0 + 0.45);
        noise.stop(t0 + 3.1);
      }
    } catch {}

    // Partículas 3D otimizadas
    const particles = Array.from({ length: 32 }, () => ({
      x: (Math.random() - 0.5) * 300,
      y: (Math.random() - 0.5) * 300,
      z: (Math.random() - 0.3) * 240,
      vx: (Math.random() - 0.5) * 0.4,
      vy: -Math.random() * 0.6 - 0.2,
      vz: Math.random() * 1.2 + 0.3,
      size: Math.random() * 2.0 + 0.8,
      alpha: Math.random() * 0.6 + 0.25
    }));

    const smoothstep = (edge0: number, edge1: number, x: number) => {
      const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
      return t * t * (3 - 2 * t);
    };

    const easeInOutCubic = (x: number) =>
      x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

    // Pré-alocação de vetores para evitar Garbage Collection (GC) durante o zoom final
    const topPts: Vec2[] = [];
    const botPts: Vec2[] = [];

    const projectPoint = (
      p: Vec3,
      cosP: number,
      sinP: number,
      cosY: number,
      sinY: number,
      camDist: number,
      fov: number,
      cx: number,
      cy: number,
      offsetX: number,
      offsetY: number
    ): Vec2 => {
      const x2 = p.x * cosY + p.z * sinY;
      const y2 = p.y;
      const z2 = -p.x * sinY + p.z * cosY;

      const x3 = x2;
      const y3 = y2 * cosP - z2 * sinP;
      const z3 = y2 * sinP + z2 * cosP;

      const zCam = camDist - z3;
      const safeZ = zCam > 28 ? zCam : 28;
      const scale = fov / safeZ;

      return {
        x: cx + offsetX + x3 * scale,
        y: cy + offsetY + y3 * scale,
        scale,
        zCam: safeZ
      };
    };

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
      const midFlip = Math.sin(baseAngle);
      const cosFlip = Math.cos(baseAngle);

      for (let i = 0; i <= segments; i++) {
        const u = i / segments;
        const spineArch = Math.sin(u * Math.PI) * archFactor * cosFlip;
        const airBend =
          -midFlip * flexAmount * Math.pow(u, 1.35) * Math.cos((flipProgress - 0.3) * Math.PI * 0.7);

        const theta = baseAngle + spineArch + airBend;
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);

        pts.push({ x: curX, z: curZ, nx: -sinT, nz: cosT });

        if (i < segments) {
          curX += ds * cosT;
          curZ += ds * sinT;
        }
      }
      return pts;
    };

    // Renderização ultra-rápida ZERO shadowBlur (usa traço duplo translúcido 10x mais leve na GPU mobile)
    const drawCurvedSurface3D = (
      curve: { x: number; z: number; nx: number; nz: number }[],
      halfHeight: number,
      project: (p: Vec3) => Vec2,
      options: {
        isCover?: boolean;
        lModeGoldIntensity?: number;
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

      const len = curve.length;
      topPts.length = len;
      botPts.length = len;

      for (let i = 0; i < len; i++) {
        const c = curve[i];
        topPts[i] = project({ x: c.x, y: -halfHeight, z: c.z });
        botPts[i] = project({ x: c.x, y: halfHeight, z: c.z });
      }

      ctx.save();
      if (opacity < 0.99) ctx.globalAlpha = opacity;

      for (let i = 0; i < len - 1; i++) {
        const c0 = curve[i];
        const c1 = curve[i + 1];
        const t0 = topPts[i];
        const t1 = topPts[i + 1];
        const b0 = botPts[i];
        const b1 = botPts[i + 1];

        const avgNx = (c0.nx + c1.nx) * 0.5;
        const avgNz = (c0.nz + c1.nz) * 0.5;
        const dot = Math.max(0, avgNx * 0.25 + avgNz * 0.96);
        const u = i / (len - 1);
        const creaseShadow = 0.68 + 0.32 * Math.min(1, u * 4.5);
        const light = Math.min(1, (0.36 + 0.64 * dot) * creaseShadow);

        if (isCover) {
          const obsR = 22 + light * 32;
          const obsG = 18 + light * 26;
          const obsB = 30 + light * 36;

          const goldR = 180 + light * 72;
          const goldG = 115 + light * 75;
          const goldB = 18 + light * 35;

          const r = (obsR * (1 - lModeGoldIntensity) + goldR * lModeGoldIntensity) | 0;
          const g = (obsG * (1 - lModeGoldIntensity) + goldG * lModeGoldIntensity) | 0;
          const b = (obsB * (1 - lModeGoldIntensity) + goldB * lModeGoldIntensity) | 0;
          ctx.fillStyle = `rgb(${r},${g},${b})`;
        } else {
          const r = (218 + light * 37) | 0;
          const g = (196 + light * 52) | 0;
          const b = (150 + light * 76) | 0;
          ctx.fillStyle = `rgb(${r},${g},${b})`;
        }

        // Leve expansão de sub-pixel (0.45px) na direção da tira seguinte para evitar frestas sem precisar de ctx.stroke()
        const dxT = t1.x - t0.x;
        const dyT = t1.y - t0.y;
        const dxB = b1.x - b0.x;
        const dyB = b1.y - b0.y;
        const pad = i < len - 2 ? 0.04 : 0;

        ctx.beginPath();
        ctx.moveTo(t0.x, t0.y);
        ctx.lineTo(t1.x + dxT * pad, t1.y + dyT * pad);
        ctx.lineTo(b1.x + dxB * pad, b1.y + dyB * pad);
        ctx.lineTo(b0.x, b0.y);
        ctx.closePath();
        ctx.fill();
      }

      // Borda frontal dourada da capa (Zero shadowBlur!)
      if (isCover) {
        ctx.beginPath();
        ctx.moveTo(botPts[0].x, botPts[0].y);
        for (let i = 1; i < len; i++) {
          ctx.lineTo(botPts[i].x, botPts[i].y);
        }

        const borderWidth = 3.0 + lModeGoldIntensity * 4.2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Halo dourado externo rápido
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.35)';
        ctx.lineWidth = borderWidth + 4;
        ctx.stroke();

        // Núcleo dourado nítido
        ctx.strokeStyle = lModeGoldIntensity > 0.5 ? '#FBBF24' : '#D97706';
        ctx.lineWidth = borderWidth;
        ctx.stroke();
      }

      // Fio de luz nas bordas das páginas (Zero shadowBlur -> 100% fluido no zoom final!)
      if (!isCover && edgeGlow > 0.02) {
        ctx.beginPath();
        ctx.moveTo(botPts[0].x, botPts[0].y);
        for (let i = 1; i < len; i++) {
          ctx.lineTo(botPts[i].x, botPts[i].y);
        }
        ctx.lineTo(topPts[len - 1].x, topPts[len - 1].y);

        // Passada 1: Halo âmbar suave
        ctx.strokeStyle = `rgba(245, 158, 11, ${(edgeGlow * 0.42).toFixed(2)})`;
        ctx.lineWidth = 3.2;
        ctx.stroke();

        // Passada 2: Fio de luz branco-dourado super fino
        ctx.strokeStyle = `rgba(255, 251, 235, ${(edgeGlow * 0.92).toFixed(2)})`;
        ctx.lineWidth = 0.85;
        ctx.stroke();
      }

      ctx.restore();
    };

    // Limita o DPR a 1.75x no celular para manter 60/120 FPS cravados durante o zoom final
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    let cachedW = 0;
    let cachedH = 0;

    const render = (now: number) => {
      if (!startTime) startTime = now;
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);

      const rect = canvas.getBoundingClientRect();
      if (rect.width !== cachedW || rect.height !== cachedH) {
        cachedW = rect.width;
        cachedH = rect.height;
        canvas.width = Math.round(cachedW * dpr);
        canvas.height = Math.round(cachedH * dpr);
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      const w = cachedW;
      const h = cachedH;
      const cx = w * 0.5;
      const cy = h * 0.5;

      // 1. Fundo Cinematográfico Profundo
      ctx.fillStyle = '#04060b';
      ctx.fillRect(0, 0, w, h);

      // 2. Coreografia Contínua: O Próprio "L" é o Livro
      const unfoldT = easeInOutCubic(smoothstep(0.11, 0.48, progress));
      // Curva de zoom mais suave no final para não explodir polígonos fora da tela
      const zoomT = Math.pow(smoothstep(0.36, 0.92, progress), 1.85);
      const lGoldFactor = 1 - smoothstep(0.16, 0.46, progress);
      const bookFadeOut = 1 - smoothstep(0.82, 0.96, progress);

      // Luz ambiente central
      const glowRadius = Math.max(w, h) * 0.55;
      const bgGlow = ctx.createRadialGradient(cx, cy, 4, cx, cy, glowRadius);
      const glowAlpha = 0.22 * Math.sin(Math.min(1, progress * 1.1) * Math.PI);
      bgGlow.addColorStop(0, `rgba(251, 191, 36, ${glowAlpha.toFixed(2)})`);
      bgGlow.addColorStop(1, 'rgba(4, 6, 11, 0)');
      ctx.fillStyle = bgGlow;
      ctx.fillRect(0, 0, w, h);

      // Moldura Squircle do ícone no início
      const iconFrameAlpha = 1 - smoothstep(0.04, 0.25, progress);
      if (iconFrameAlpha > 0.01) {
        ctx.save();
        ctx.globalAlpha = iconFrameAlpha;
        const frameSize = 148 + (1 - iconFrameAlpha) * 28;
        const fx = cx - frameSize * 0.5;
        const fy = cy - frameSize * 0.5;

        ctx.fillStyle = '#131726';
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(fx, fy, frameSize, frameSize, 34);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      const offsetX = -26 * (1 - unfoldT);
      const offsetY = 22 * (1 - unfoldT) + 10 * Math.sin(unfoldT * Math.PI);

      const camPitch = 1.24 * (1 - unfoldT) + (1.02 - 0.16 * zoomT) * unfoldT;
      const camYaw = -0.18 * (1 - unfoldT);
      const cosP = Math.cos(camPitch);
      const sinP = Math.sin(camPitch);
      const cosY = Math.cos(camYaw);
      const sinY = Math.sin(camYaw);

      // Distância mínima controlada (52) para manter os polígonos leves e ultra fluidos até o último frame
      const camDist = 340 - unfoldT * 65 - zoomT * 223;
      const fov = 420;

      const project = (p: Vec3) =>
        projectPoint(p, cosP, sinP, cosY, sinY, camDist, fov, cx, cy, offsetX, offsetY);

      if (bookFadeOut > 0.01) {
        const pageW = 66;
        const halfH = 44;
        // 14 segmentos garantem curvas perfeitas com metade do custo de CPU no final
        const segments = 14;

        // 1. Capa Direita (Base Horizontal do L)
        const rightCoverCurve = computePageCurve3D(pageW * 1.05, 0, 0.03 * unfoldT, 0, segments, 0, -2.5);
        drawCurvedSurface3D(rightCoverCurve, halfH * 1.04, project, {
          isCover: true,
          lModeGoldIntensity: lGoldFactor,
          opacity: bookFadeOut
        });

        // 2. Capa Esquerda (Haste Vertical do L em 90° -> Desdobra para 180°)
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
          opacity: bookFadeOut
        });

        // 3. Bloco de páginas estáticas (Direita e Esquerda)
        for (let b = 0; b < 2; b++) {
          const stackAngleR = 0.02 + b * 0.03;
          const baseRight = computePageCurve3D(pageW, stackAngleR, 0.08 + 0.15 * unfoldT, 0, segments, 0, b * 1.1);
          drawCurvedSurface3D(baseRight, halfH, project, {
            edgeGlow: b === 1 ? 0.45 : 0.15,
            opacity: bookFadeOut
          });

          const stackAngleL = leftCoverFlip - 0.02 - b * 0.03;
          const baseLeft = computePageCurve3D(pageW, stackAngleL, 0.08 + 0.15 * unfoldT, 0, segments, 0, b * 1.1);
          drawCurvedSurface3D(baseLeft, halfH, project, {
            edgeGlow: b === 1 ? 0.45 : 0.15,
            opacity: bookFadeOut
          });
        }

        // 4. Cascata de Folhas 3D em Alta Velocidade
        const flutterRamp = smoothstep(0.08, 0.32, progress);
        const totalSheets = 7;
        const speed = 0.4 + flutterRamp * (1.85 + progress * 2.1);
        const masterCycle = (elapsed / 1000) * speed;

        const activeSheets: { flip: number; alpha: number }[] = [];
        const maxFlip = leftCoverFlip - 0.05;
        for (let s = 0; s < totalSheets; s++) {
          const rawPhase = (masterCycle + s / totalSheets) % 1;
          const flip = 0.06 + rawPhase * (maxFlip - 0.06);
          const sheetAlpha = (s % 3 === 0 ? 1 : flutterRamp) * bookFadeOut;
          if (sheetAlpha > 0.02) {
            activeSheets.push({ flip, alpha: sheetAlpha });
          }
        }

        const midTarget = leftCoverFlip * 0.5;
        activeSheets.sort((a, b) => Math.abs(b.flip - midTarget) - Math.abs(a.flip - midTarget));

        for (const sheet of activeSheets) {
          const normalizedPos = sheet.flip / Math.max(0.2, leftCoverFlip);
          const midElevation = Math.sin(normalizedPos * Math.PI);

          const curve = computePageCurve3D(
            pageW,
            sheet.flip,
            0.18 + 0.12 * flutterRamp,
            0.25 + 0.42 * flutterRamp,
            segments,
            0,
            1.8 + midElevation * 3.2
          );

          drawCurvedSurface3D(curve, halfH, project, {
            edgeGlow: 0.4 + 0.6 * midElevation,
            opacity: sheet.alpha
          });
        }

        // Articulação Dourada da Lombada
        const spineFront = project({ x: -1, y: halfH * 1.04, z: -1 });
        ctx.fillStyle = `rgba(253, 230, 138, ${bookFadeOut.toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(spineFront.x, spineFront.y, Math.min(12, Math.max(2.5, 2.2 * spineFront.scale)), 0, Math.PI * 2);
        ctx.fill();
      }

      // 5. Poeira Dourada 3D
      const partAlphaBase = Math.sin(progress * Math.PI);
      for (let i = 0; i < particles.length; i++) {
        const pt = particles[i];
        pt.x += pt.vx;
        pt.y += pt.vy;
        pt.z += pt.vz * (1 + zoomT * 2.5);
        if (pt.z > 180) pt.z = -120;

        const proj = project({ x: pt.x, y: pt.y, z: pt.z });
        if (proj.zCam > 32) {
          const r = Math.min(6, Math.max(0.6, pt.size * proj.scale * 0.42));
          ctx.fillStyle = `rgba(253, 230, 138, ${(pt.alpha * partAlphaBase).toFixed(2)})`;
          ctx.beginPath();
          ctx.arc(proj.x, proj.y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 6. Clarão Luminoso e Transição Suave para a Biblioteca
      if (progress > 0.72) {
        const endT = (progress - 0.72) / 0.28;
        const bloomAlpha = Math.sin(Math.min(1, endT * 1.25) * Math.PI) * 0.78;
        if (bloomAlpha > 0.01) {
          ctx.fillStyle = `rgba(254, 243, 199, ${bloomAlpha.toFixed(3)})`;
          ctx.fillRect(0, 0, w, h);
        }

        const blackoutAlpha = smoothstep(0.32, 0.96, endT);
        if (blackoutAlpha > 0.01) {
          ctx.fillStyle = `rgba(2, 6, 23, ${blackoutAlpha.toFixed(3)})`;
          ctx.fillRect(0, 0, w, h);
        }
      }

      ctx.restore();

      if (progress < 1) {
        animId = requestAnimationFrame(render);
      } else {
        onCompleteRef.current();
      }
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      if (audioCtx && audioCtx.state !== 'closed') {
        audioCtx.close().catch(() => {});
      }
    };
  }, []);

  return (
    <div
      onClick={onSkip || (() => onCompleteRef.current())}
      className="relative w-full h-full bg-[#04060b] overflow-hidden flex items-center justify-center cursor-pointer select-none"
    >
      <canvas ref={canvasRef} className="w-full h-full block" />

      <button
        onClick={(e) => {
          e.stopPropagation();
          onCompleteRef.current();
        }}
        className="absolute top-4 right-4 text-[10px] uppercase font-mono tracking-wider text-slate-400 hover:text-white bg-slate-900/70 hover:bg-slate-800 px-3 py-1.5 rounded-full border border-slate-700/60 transition-all z-50 cursor-pointer"
      >
        Pular ›
      </button>
    </div>
  );
};
