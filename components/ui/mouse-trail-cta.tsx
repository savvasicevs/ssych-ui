"use client"

import { useEffect, useRef } from "react"
import { useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

const ACCENT: [number, number, number] = [90, 170, 255]
const accentRgba = (a: number) => `rgba(${ACCENT[0]},${ACCENT[1]},${ACCENT[2]},${a})`

type Particle = { x: number; y: number; vx: number; vy: number; born: number; size: number }

const LIFE_MS = 600
const GRAVITY_R = 140
const SPAWN_GAP_MS = 28

/**
 * A CTA stage where the cursor leaves a restrained particle trail (1–2px
 * accent dots with a soft additive glow, 0.6s decay). Near the pill the dots
 * gravitate toward it and feed its border glow — signal language, no glitter.
 * Honors reduced motion by rendering a static pill.
 */
export function MouseTrailCta({
  label = "Start your free trial",
  href = "#",
  className,
  onClick,
}: {
  label?: string
  href?: string
  className?: string
  onClick?: () => void
}) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const pillRef = useRef<HTMLAnchorElement | null>(null)
  const ringRef = useRef<HTMLDivElement | null>(null)
  const reduced = useReducedMotion() ?? false

  useEffect(() => {
    if (reduced) return
    const root = rootRef.current
    const canvas = canvasRef.current
    const pill = pillRef.current
    const ring = ringRef.current
    if (!root || !canvas || !pill) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let raf = 0
    let running = false
    let onScreen = true
    let lastSpawn = 0
    let charge = 0 // 0..1 — particles arriving at the pill feed this
    const particles: Particle[] = []

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const resize = () => {
      const r = root.getBoundingClientRect()
      canvas.width = Math.max(1, Math.round(r.width * dpr))
      canvas.height = Math.max(1, Math.round(r.height * dpr))
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(root)

    const pillCenter = () => {
      const rr = root.getBoundingClientRect()
      const pr = pill.getBoundingClientRect()
      return { x: pr.left - rr.left + pr.width / 2, y: pr.top - rr.top + pr.height / 2, rx: pr.width / 2 }
    }

    const applyCharge = () => {
      const [cr, cg, cb] = ACCENT
      const t = charge
      const r = Math.round(255 + (cr - 255) * t)
      const g = Math.round(255 + (cg - 255) * t)
      const b = Math.round(255 + (cb - 255) * t)
      pill.style.borderColor = `rgba(${r},${g},${b},${0.4 + 0.5 * t})`
      pill.style.boxShadow = t > 0.02 ? `0 0 ${22 * t}px ${accentRgba(0.34 * t)}` : "none"
      // the hairline ring brightens as charge arrives
      if (ring) {
        ring.style.opacity = String(0.35 + 0.65 * t)
        ring.style.filter = `saturate(${1 + t}) brightness(${1 + 0.5 * t})`
      }
    }

    const tick = (now: number) => {
      raf = 0
      const w = canvas.width / dpr
      const h = canvas.height / dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      ctx.globalCompositeOperation = "lighter"

      const c = pillCenter()
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]
        const age = (now - p.born) / LIFE_MS
        if (age >= 1) {
          particles.splice(i, 1)
          continue
        }
        const dx = c.x - p.x
        const dy = c.y - p.y
        const d = Math.hypot(dx, dy)
        if (d < GRAVITY_R && d > 1) {
          const pull = (1 - d / GRAVITY_R) * 0.9
          p.vx += (dx / d) * pull
          p.vy += (dy / d) * pull
        }
        if (d < c.rx + 10) {
          charge = Math.min(1, charge + 0.08)
          particles.splice(i, 1)
          continue
        }
        p.vx *= 0.92
        p.vy *= 0.92
        p.x += p.vx
        p.y += p.vy
        const fade = 1 - age
        // soft additive glow halo + crisp core
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size * 2.4, 0, Math.PI * 2)
        ctx.fillStyle = accentRgba(0.16 * fade)
        ctx.fill()
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size * 0.75, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${Math.round(160 + 95 * fade)},${Math.round(200 + 55 * fade)},255,${0.85 * fade})`
        ctx.fill()
      }
      ctx.globalCompositeOperation = "source-over"

      charge = Math.max(0, charge - 0.012)
      applyCharge()

      if (onScreen && (particles.length > 0 || charge > 0.01)) raf = requestAnimationFrame(tick)
      else running = false
    }

    const ensureLoop = () => {
      if (!running && onScreen) {
        running = true
        raf = requestAnimationFrame(tick)
      }
    }

    const onMove = (e: PointerEvent) => {
      const now = performance.now()
      if (now - lastSpawn < SPAWN_GAP_MS) return
      lastSpawn = now
      const r = root.getBoundingClientRect()
      particles.push({
        x: e.clientX - r.left + (Math.random() - 0.5) * 6,
        y: e.clientY - r.top + (Math.random() - 0.5) * 6,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        born: now,
        size: Math.random() < 0.5 ? 1 : 2,
      })
      if (particles.length > 80) particles.shift()
      ensureLoop()
    }

    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting
      if (!onScreen && raf) {
        cancelAnimationFrame(raf)
        raf = 0
        running = false
      } else if (onScreen) ensureLoop()
    })
    io.observe(root)
    root.addEventListener("pointermove", onMove)

    return () => {
      root.removeEventListener("pointermove", onMove)
      io.disconnect()
      ro.disconnect()
      if (raf) cancelAnimationFrame(raf)
    }
  }, [reduced])

  return (
    <div
      ref={rootRef}
      className={cn("relative flex items-center justify-center overflow-hidden", className)}
    >
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />
      <div className="relative">
        {/* hairline accent ring — intensity driven by the charge (opacity/filter on the ref) */}
        <div
          ref={ringRef}
          aria-hidden
          className="pointer-events-none absolute -inset-px z-0 rounded-[60px]"
          style={{ opacity: 0.35, boxShadow: `inset 0 0 0 1px ${accentRgba(0.55)}` }}
        />
        <a
          ref={pillRef}
          href={href}
          onClick={onClick}
          className="group relative z-10 inline-flex overflow-hidden rounded-[60px] border border-foreground/40 px-6 py-3 text-[15px] font-semibold text-foreground transition-colors"
        >
          <span className="absolute inset-0 origin-bottom scale-y-0 bg-foreground transition-transform duration-300 ease-out group-hover:scale-y-100" />
          <span className="relative transition-colors duration-300 group-hover:text-background">{label}</span>
        </a>
      </div>
    </div>
  )
}
