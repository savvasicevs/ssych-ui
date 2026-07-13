'use client';

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';

// Types for the component
interface DockApp {
  id: string;
  name: string;
  /** An icon node, an emoji/text string, or an image URL string (/, http, data:, blob:). */
  icon: React.ReactNode;
  /** Tile background (CSS color/gradient). Defaults to a neutral slate. */
  color?: string;
}

interface MacOSDockProps {
  /** Defaults to a small emoji demo set, so a bare <MacOSDock /> renders a working dock. */
  apps?: DockApp[];
  onAppClick?: (appId: string) => void;
  openApps?: string[];
  className?: string;
}

// Self-contained demo apps (emoji tiles) — what renders when no `apps` are passed,
// e.g. v0 / preview sandboxes mounting the component bare.
const DEMO_APPS: DockApp[] = [
  { id: "finder", name: "Finder", icon: "\u{1F5C2}\u{FE0F}", color: "linear-gradient(180deg,#57a8ff,#1f7ae0)" },
  { id: "mail", name: "Mail", icon: "\u2709\u{FE0F}", color: "linear-gradient(180deg,#5a67f2,#3f4ad4)" },
  { id: "notes", name: "Notes", icon: "\u{1F4DD}", color: "linear-gradient(180deg,#ffd45e,#f0a92e)" },
  { id: "music", name: "Music", icon: "\u{1F3B5}", color: "linear-gradient(180deg,#ff6482,#e6335a)" },
  { id: "photos", name: "Photos", icon: "\u{1F5BC}\u{FE0F}", color: "linear-gradient(180deg,#35c5a8,#149a80)" },
];

// Underglow colour: the site accent at rest, else the first hex found in the hovered app's tile.
const ACCENT_GLOW = "#5aaaff";
const firstHex = (c?: string) => c?.match(/#[0-9a-fA-F]{6}/)?.[0] ?? ACCENT_GLOW;

const MacOSDock: React.FC<MacOSDockProps> = ({ 
  apps = DEMO_APPS, 
  onAppClick = () => {}, 
  openApps = [],
  className = ''
}) => {
  const [mouseX, setMouseX] = useState<number | null>(null);
  const [currentScales, setCurrentScales] = useState<number[]>(apps.map(() => 1));
  const [currentPositions, setCurrentPositions] = useState<number[]>([]);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const iconRefs = useRef<(HTMLDivElement | null)[]>([]);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const lastMouseMoveTime = useRef<number>(0);
  const [containerWidth, setContainerWidth] = useState(0);

  // Size the dock to fit its container, so it scales cleanly from phones to
  // desktops without clipping or overflowing.
  const config = useMemo(() => {
    const n = Math.max(1, apps.length);
    // Total dock width ≈ base * (n icons + gaps@8% + 2×padding@12%); invert to fit.
    const factor = n + 0.08 * (n - 1) + 0.24;
    const avail = containerWidth > 0 ? containerWidth * 0.92 : n * 72;
    const baseIconSize = Math.max(34, Math.min(72, avail / factor));
    const maxScale = baseIconSize >= 60 ? 1.8 : baseIconSize >= 46 ? 1.6 : 1.45;
    const effectWidth = Math.min((containerWidth || 300) * 0.85, baseIconSize * 4);
    return { baseIconSize, maxScale, effectWidth };
  }, [apps.length, containerWidth]);

  const { baseIconSize, maxScale, effectWidth } = config;
  const minScale = 1.0;
  const baseSpacing = Math.max(4, baseIconSize * 0.08);

  // Track the container width so the dock re-fits on resize / orientation change.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const update = () => setContainerWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Authentic macOS cosine-based magnification algorithm
  const calculateTargetMagnification = useCallback((mousePosition: number | null) => {
    if (mousePosition === null) {
      return apps.map(() => minScale);
    }

    return apps.map((_, index) => {
      const normalIconCenter = (index * (baseIconSize + baseSpacing)) + (baseIconSize / 2);
      const minX = mousePosition - (effectWidth / 2);
      const maxX = mousePosition + (effectWidth / 2);
      
      if (normalIconCenter < minX || normalIconCenter > maxX) {
        return minScale;
      }
      
      const theta = ((normalIconCenter - minX) / effectWidth) * 2 * Math.PI;
      const cappedTheta = Math.min(Math.max(theta, 0), 2 * Math.PI);
      const scaleFactor = (1 - Math.cos(cappedTheta)) / 2;
      
      return minScale + (scaleFactor * (maxScale - minScale));
    });
  }, [apps, baseIconSize, baseSpacing, effectWidth, maxScale, minScale]);

  // Calculate positions based on current scales
  const calculatePositions = useCallback((scales: number[]) => {
    let currentX = 0;
    
    return scales.map((scale) => {
      const scaledWidth = baseIconSize * scale;
      const centerX = currentX + (scaledWidth / 2);
      currentX += scaledWidth + baseSpacing;
      return centerX;
    });
  }, [baseIconSize, baseSpacing]);

  // Initialize positions
  useEffect(() => {
    const initialScales = apps.map(() => minScale);
    const initialPositions = calculatePositions(initialScales);
    setCurrentScales(initialScales);
    setCurrentPositions(initialPositions);
  }, [apps, calculatePositions, minScale, config]);

  // Animation loop
  const animateToTarget = useCallback(() => {
    const targetScales = calculateTargetMagnification(mouseX);
    const targetPositions = calculatePositions(targetScales);
    const lerpFactor = mouseX !== null ? 0.2 : 0.12;

    setCurrentScales(prevScales => {
      return prevScales.map((currentScale, index) => {
        const diff = targetScales[index] - currentScale;
        return currentScale + (diff * lerpFactor);
      });
    });

    setCurrentPositions(prevPositions => {
      return prevPositions.map((currentPos, index) => {
        const diff = targetPositions[index] - currentPos;
        return currentPos + (diff * lerpFactor);
      });
    });

    const scalesNeedUpdate = currentScales.some((scale, index) => 
      Math.abs(scale - targetScales[index]) > 0.002
    );
    const positionsNeedUpdate = currentPositions.some((pos, index) => 
      Math.abs(pos - targetPositions[index]) > 0.1
    );
    
    if (scalesNeedUpdate || positionsNeedUpdate || mouseX !== null) {
      animationFrameRef.current = requestAnimationFrame(animateToTarget);
    }
  }, [mouseX, calculateTargetMagnification, calculatePositions, currentScales, currentPositions]);

  // Start/stop animation loop
  useEffect(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    animationFrameRef.current = requestAnimationFrame(animateToTarget);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [animateToTarget]);

  // Throttled mouse movement handler
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const now = performance.now();
    
    if (now - lastMouseMoveTime.current < 16) {
      return;
    }
    
    lastMouseMoveTime.current = now;
    
    if (dockRef.current) {
      const rect = dockRef.current.getBoundingClientRect();
      const padding = Math.max(8, baseIconSize * 0.12);
      setMouseX(e.clientX - rect.left - padding);
    }
  }, [baseIconSize]);

  const handleMouseLeave = useCallback(() => {
    setMouseX(null);
  }, []);

  const createBounceAnimation = (element: HTMLElement) => {
    const bounceHeight = Math.max(-8, -baseIconSize * 0.15);
    element.style.transition = 'transform 0.2s ease-out';
    element.style.transform = `translateY(${bounceHeight}px)`;
    
    setTimeout(() => {
      element.style.transform = 'translateY(0px)';
    }, 200);
  };

  const handleAppClick = (appId: string, index: number) => {
    if (iconRefs.current[index]) {
      if (typeof window !== 'undefined' && (window as any).gsap) {
        const gsap = (window as any).gsap;
        const bounceHeight = currentScales[index] > 1.3 ? -baseIconSize * 0.2 : -baseIconSize * 0.15;
        
        gsap.to(iconRefs.current[index], {
          y: bounceHeight,
          duration: 0.2,
          ease: 'power2.out',
          yoyo: true,
          repeat: 1,
          transformOrigin: 'bottom center'
        });
      } else {
        createBounceAnimation(iconRefs.current[index]!);
      }
    }
    
    onAppClick(appId);
  };

  // Calculate content width
  const contentWidth = currentPositions.length > 0 
    ? Math.max(...currentPositions.map((pos, index) => 
        pos + (baseIconSize * currentScales[index]) / 2
      ))
    : (apps.length * (baseIconSize + baseSpacing)) - baseSpacing;

  const padding = Math.max(8, baseIconSize * 0.12);

  // Command-Dock underglow + tooltip — the currently magnified icon (peak scale) drives both.
  const hoveredIndex =
    mouseX !== null && currentScales.length
      ? currentScales.reduce((best, s, i, arr) => (s > arr[best] ? i : best), 0)
      : null;
  const glowHex = hoveredIndex !== null ? firstHex(apps[hoveredIndex]?.color) : ACCENT_GLOW;
  const dockActive = mouseX !== null;

    return (
    <div ref={wrapperRef} className="flex w-full justify-center">
    <div
      ref={dockRef}
      className={`relative backdrop-blur-md ${className}`}
      style={{
        width: `${contentWidth + padding * 2}px`,
        background: 'linear-gradient(to bottom, rgba(28,34,48,0.92), rgba(8,11,18,0.94))',
        borderRadius: `${Math.max(12, baseIconSize * 0.4)}px`,
        border: '1px solid rgba(255,255,255,0.06)',
        boxShadow: `
          0 ${Math.max(8, baseIconSize * 0.18)}px ${Math.max(24, baseIconSize * 0.5)}px rgba(0,0,0,0.5),
          inset 0 1px 0 rgba(255,255,255,0.10),
          inset 0 -1px 0 rgba(0,0,0,0.5)
        `,
        padding: `${padding}px`
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* specular top highlight along the tray lip */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-4 top-px h-px rounded-full"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)' }}
      />

      <div
        className="relative"
        style={{
          height: `${baseIconSize}px`,
          width: '100%'
        }}
      >
        {apps.map((app, index) => {
          const scale = currentScales[index];
          const position = currentPositions[index] || 0;
          const scaledSize = baseIconSize * scale;
          
          return (
            <div
              key={app.id}
              ref={(el) => { iconRefs.current[index] = el; }}
              className="absolute flex cursor-pointer flex-col items-center justify-end"
              aria-label={app.name}
              onClick={() => handleAppClick(app.id, index)}
              style={{
                left: `${position - scaledSize / 2}px`,
                bottom: '0px',
                width: `${scaledSize}px`,
                height: `${scaledSize}px`,
                transformOrigin: 'bottom center',
                zIndex: Math.round(scale * 10)
              }}
            >
              {/* hairline tooltip chip — shown above the magnified icon */}
              {hoveredIndex === index && (
                <div className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-3 -translate-x-1/2 whitespace-nowrap rounded-md border border-white/[0.06] bg-[#0A0E16] px-2 py-1 text-[10px] uppercase tracking-[0.1em] text-white/70 shadow-[0_8px_24px_rgba(0,0,0,0.5)]">
                  {app.name}
                  <span
                    aria-hidden
                    className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 border-b border-r border-white/[0.06] bg-[#0A0E16]"
                  />
                </div>
              )}

              {/* Rounded-square tile (iOS/macOS Big Sur style) holding a Phosphor icon or image */}
              <div
                className="flex items-center justify-center overflow-hidden text-white"
                style={{
                  width: `${scaledSize}px`,
                  height: `${scaledSize}px`,
                  borderRadius: `${Math.max(8, scaledSize * 0.235)}px`,
                  background: app.color ?? 'linear-gradient(160deg, #3b3f4a 0%, #20242e 100%)',
                  border: '1px solid rgba(255, 255, 255, 0.14)',
                  boxShadow: `0 ${scale > 1.2 ? Math.max(2, baseIconSize * 0.05) : Math.max(1, baseIconSize * 0.03)}px ${scale > 1.2 ? Math.max(4, baseIconSize * 0.1) : Math.max(2, baseIconSize * 0.06)}px rgba(0,0,0,${0.25 + (scale - 1) * 0.15}), inset 0 1px 0 rgba(255,255,255,0.18)`
                }}
              >
                {typeof app.icon === 'string' && /^(\/|https?:|data:|blob:)/.test(app.icon) ? (
                  <img src={app.icon} alt={app.name} className="h-full w-full object-cover" />
                ) : (
                  <span className="flex items-center justify-center" style={{ fontSize: `${scaledSize * 0.52}px`, lineHeight: 1 }}>
                    {app.icon}
                  </span>
                )}
              </div>
              
              {/* App Indicator Dot */}
              {openApps.includes(app.id) && (
                <div 
                  className="absolute"
                  style={{
                    bottom: `${Math.max(-2, -baseIconSize * 0.05)}px`,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: `${Math.max(3, baseIconSize * 0.06)}px`,
                    height: `${Math.max(3, baseIconSize * 0.06)}px`,
                    borderRadius: '50%',
                    backgroundColor: 'rgba(255, 255, 255, 0.8)',
                    boxShadow: '0 0 4px rgba(0, 0, 0, 0.3)',
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* accent underglow — colour follows the magnified icon (Command Dock language) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-4 -bottom-[6px] h-[2px] rounded-full transition-opacity duration-300"
        style={{ background: `linear-gradient(90deg, transparent, ${glowHex}a6, transparent)`, opacity: dockActive ? 1 : 0.4 }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-x-6 -bottom-4 top-1/3 transition-opacity duration-300"
        style={{ background: `radial-gradient(55% 90% at 50% 100%, ${glowHex}29, transparent 70%)`, opacity: dockActive ? 1 : 0 }}
      />
    </div>
    </div>
  );
};

export default MacOSDock;