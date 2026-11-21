"use client";

import { useEffect, useRef } from "react";

type Dot = { x: number; y: number; vx: number; r: number; farmed: boolean; state: "in" | "out" | "caught"; life: number; lane: number };
type Packet = { t: number };

const REAL = "61,220,151";
const FARMED = "255,93,93";
const AMBER = "255,181,71";

/**
 * The hero picture: activity flows into Vex, real activity passes through,
 * farmed activity is caught, and every check takes a small payment from a
 * tab whose meter never passes its cap.
 */
export default function HeroCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0, h = 0, dpr = 1, raf = 0, last = performance.now();
    const dots: Dot[] = [];
    const packets: Packet[] = [];
    let spawn = 0, seen = 0, spent = 0, flash = 0, angle = 0;
    const CAP = 20; // checks per "day" on the meter

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = canvas.getBoundingClientRect();
      w = r.width; h = r.height;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const core = () => ({ x: w * (w < 640 ? 0.5 : 0.56), y: h * 0.46, r: Math.min(h * 0.24, 92) });
    const tabNode = () => ({ x: w < 640 ? w * 0.14 : w * 0.2, y: h * 0.86 });

    const addDot = () => {
      const lane = Math.random();
      dots.push({ x: -10, y: h * (0.12 + lane * 0.7), vx: 60 + Math.random() * 70, r: 1.6 + Math.random() * 2.2, farmed: Math.random() < 0.34, state: "in", life: 1, lane });
    };

    const step = (dt: number) => {
      spawn += dt;
      while (spawn > 0.12) { spawn -= 0.12; addDot(); }
      angle += dt * 0.9;
      flash = Math.max(0, flash - dt * 2.5);
      const c = core();
      for (const d of dots) {
        if (d.state === "in") {
          // Pull toward the core's height as it nears
          const k = Math.min(1, Math.max(0, (d.x - (c.x - c.r * 3.2)) / (c.r * 2.2)));
          const ty = c.y + (d.lane - 0.5) * c.r * 1.2;
          d.y += (ty - d.y) * k * dt * 4;
          d.x += d.vx * dt;
          if (d.x >= c.x - c.r * 0.95) {
            seen++;
            if (d.farmed) { d.state = "caught"; flash = 1; } else d.state = "out";
            if (seen % 6 === 0) packets.push({ t: 0 });
          }
        } else if (d.state === "out") {
          d.x += d.vx * 1.3 * dt;
          if (d.x > w + 20) d.life = 0;
        } else {
          d.life -= dt * 1.6;
        }
      }
      for (let i = dots.length - 1; i >= 0; i--) if (dots[i].life <= 0) dots.splice(i, 1);
      for (const p of packets) p.t += dt * 0.9;
      for (let i = packets.length - 1; i >= 0; i--) {
        if (packets[i].t >= 1) {
          packets.splice(i, 1);
          spent = spent >= CAP ? 0 : spent + 1; // the cap resets each day
        }
      }
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      const c = core();
      const t = tabNode();

      // Faint lanes
      ctx.strokeStyle = "rgba(255,255,255,0.035)";
      ctx.lineWidth = 1;
      for (let i = 0; i < 7; i++) {
        const y = h * (0.12 + (i / 6) * 0.7);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(c.x - c.r * 3, y, c.x - c.r * 2, c.y + (i / 6 - 0.5) * c.r * 1.2, c.x - c.r, c.y + (i / 6 - 0.5) * c.r * 1.2);
        ctx.stroke();
      }

      // Activity
      for (const d of dots) {
        const col = d.state === "in" ? "236,237,238" : d.farmed ? FARMED : REAL;
        const a = d.state === "in" ? 0.55 : d.state === "caught" ? d.life : 0.85;
        ctx.fillStyle = `rgba(${col},${a})`;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.state === "caught" ? d.r * (1 + (1 - d.life) * 1.5) : d.r, 0, Math.PI * 2);
        ctx.fill();
        if (d.state === "caught") {
          ctx.strokeStyle = `rgba(${FARMED},${d.life * 0.8})`;
          const s = 4 + (1 - d.life) * 4;
          ctx.beginPath();
          ctx.moveTo(d.x - s, d.y - s); ctx.lineTo(d.x + s, d.y + s);
          ctx.moveTo(d.x + s, d.y - s); ctx.lineTo(d.x - s, d.y + s);
          ctx.stroke();
        }
      }

      // Core
      const g = ctx.createRadialGradient(c.x, c.y, c.r * 0.2, c.x, c.y, c.r * 2.2);
      g.addColorStop(0, `rgba(255,106,61,${0.16 + flash * 0.18})`);
      g.addColorStop(1, "rgba(255,106,61,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(c.x, c.y, c.r * 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(12,13,17,0.92)";
      ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.stroke();
      const grad = ctx.createLinearGradient(c.x - c.r, c.y, c.x + c.r, c.y);
      grad.addColorStop(0, "#ff6a3d"); grad.addColorStop(1, "#ffb547");
      ctx.strokeStyle = grad;
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.beginPath(); ctx.arc(c.x, c.y, c.r, angle, angle + 1.1); ctx.stroke();
      ctx.beginPath(); ctx.arc(c.x, c.y, c.r * 0.72, -angle * 1.3, -angle * 1.3 + 0.6); ctx.stroke();
      ctx.fillStyle = "#ecedee";
      ctx.font = `600 ${Math.max(16, c.r * 0.34)}px "Space Grotesk Variable", system-ui`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("vex", c.x, c.y);

      // Tab and the payments it makes
      ctx.font = `500 12px "Inter Variable", system-ui`;
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(144,150,160,0.9)";
      ctx.fillText("your tab", t.x - 4, t.y - 22);
      const mw = 120;
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      roundRect(ctx, t.x - 4, t.y - 10, mw, 8, 4); ctx.fill();
      ctx.fillStyle = `rgba(${AMBER},0.9)`;
      roundRect(ctx, t.x - 4, t.y - 10, mw * (spent / CAP), 8, 4); ctx.fill();
      ctx.fillStyle = "rgba(92,97,107,1)";
      ctx.fillText("capped onchain", t.x - 4, t.y + 14);
      for (const p of packets) {
        const k = easeInOut(p.t);
        const sx = t.x + mw * 0.5, sy = t.y - 14;
        const x = sx + (c.x - sx) * k;
        const y = sy + (c.y + c.r - sy) * k - Math.sin(k * Math.PI) * 40;
        ctx.fillStyle = `rgba(${AMBER},${1 - k * 0.4})`;
        ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
      }
    };

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      step(dt);
      draw();
      raf = requestAnimationFrame(loop);
    };

    if (still) {
      // One settled frame, no motion
      for (let i = 0; i < 260; i++) step(0.04);
      draw();
    } else {
      // Start mid-flow so the first frame already shows the mechanism
      for (let i = 0; i < 140; i++) step(0.04);
      raf = requestAnimationFrame(loop);
    }

    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  return <canvas ref={ref} aria-label="Activity flowing into Vex: real activity passes, farmed activity is caught, each check is paid from a capped tab" role="img" />;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, Math.max(0, w), h, Math.min(r, w / 2));
}
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
