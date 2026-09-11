"use client"

import { useEffect, useRef } from "react"
import * as THREE from "three"

import { cn } from "@/lib/utils"

/**
 * ascii-turntable — an extruded solid that turns with the cursor, redrawn as
 * characters on a grid.
 *
 * The shape is vector and extruded at runtime, so it stays crisp at every angle
 * for a couple of KB. The pre-rendered alternative is a frame sequence: dozens
 * of PNGs, megabytes, and only as many angles as you exported.
 *
 * Two decisions worth keeping if you edit this:
 *
 * LIGHTING IS GRADED FOR THE CHARACTERS, NOT THE SOLID. Sampled to one cell per
 * `cell` px, a well-lit face saturates to a single glyph, because ten ramp
 * characters cannot carry a specular edge. Exposure sits low so the face lands
 * mid-ramp with headroom above it. The 3D layer is never composited: it renders
 * only so the ASCII pass has something to read.
 *
 * THE POINTER NEVER DRAWS. It writes a target and the rAF loop owns painting,
 * so a burst of pointermove costs one frame, not one repaint each.
 */

export type TurntableShape = "ring" | "bars" | "token"

export interface AsciiTurntableProps {
  /** which solid to turn. custom art goes through `contours`. */
  shape?: TurntableShape
  /** normalised outer/hole polygons, roughly -1..1, from any traced svg */
  contours?: { outer: [number, number][]; holes?: [number, number][][] }[]
  /** character cell in css px. smaller keeps more of the form, costs more paint. */
  cell?: number
  /** dark to light. the first character is treated as empty. */
  ramp?: string
  /** max yaw either side of centre, in degrees */
  sweep?: number
  /** overlay repaint cap, held apart from the 3d loop */
  fps?: number
  className?: string
  height?: number | string
}

const RING = () => {
  const s = new THREE.Shape()
  s.absarc(0, 0, 1, 0, Math.PI * 2, false)
  const h = new THREE.Path()
  h.absarc(0, 0, 0.46, 0, Math.PI * 2, true)
  s.holes.push(h)
  return [s]
}

const BARS = () => {
  const hs = [0.85, 1.45, 1.05, 1.75]
  const w = 0.3
  const gap = 0.2
  const span = hs.length * w + (hs.length - 1) * gap
  return hs.map((h, i) => {
    const x = -span / 2 + i * (w + gap)
    const s = new THREE.Shape()
    const r = 0.06
    const y0 = -h / 2
    const y1 = h / 2
    s.moveTo(x + r, y0)
    s.lineTo(x + w - r, y0)
    s.quadraticCurveTo(x + w, y0, x + w, y0 + r)
    s.lineTo(x + w, y1 - r)
    s.quadraticCurveTo(x + w, y1, x + w - r, y1)
    s.lineTo(x + r, y1)
    s.quadraticCurveTo(x, y1, x, y1 - r)
    s.lineTo(x, y0 + r)
    s.quadraticCurveTo(x, y0, x + r, y0)
    return s
  })
}

const TOKEN = () => {
  const a = 1.55
  const r = 0.34
  const s = new THREE.Shape()
  s.moveTo(-a + r, -a)
  s.lineTo(a - r, -a)
  s.quadraticCurveTo(a, -a, a, -a + r)
  s.lineTo(a, a - r)
  s.quadraticCurveTo(a, a, a - r, a)
  s.lineTo(-a + r, a)
  s.quadraticCurveTo(-a, a, -a, a - r)
  s.lineTo(-a, -a + r)
  s.quadraticCurveTo(-a, -a, -a + r, -a)
  const h = new THREE.Path()
  h.absarc(0, 0, 0.62, 0, Math.PI * 2, true)
  s.holes.push(h)
  return [s]
}

const BUILTIN: Record<TurntableShape, () => THREE.Shape[]> = {
  ring: RING,
  bars: BARS,
  token: TOKEN,
}

export function AsciiTurntable({
  shape = "token",
  contours,
  cell = 10,
  ramp = " .:-=+*#%@",
  sweep = 58,
  fps = 24,
  className = "",
  height = 420,
}: AsciiTurntableProps) {
  const glRef = useRef<HTMLCanvasElement>(null)
  const asciiRef = useRef<HTMLCanvasElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current!
    const canvas = glRef.current!
    const aCanvas = asciiRef.current!
    const aCtx = aCanvas.getContext("2d")!
    const sampler = document.createElement("canvas")
    const sCtx = sampler.getContext("2d", { willReadFrequently: true })!
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches

    /* The ink follows the theme's foreground so this reads on a light ground
       too. It is handed to canvas verbatim rather than parsed: Tailwind v4
       resolves `color` to oklab(), and pulling digits out of that string gave
       rgb(0, 999994, 0) — a bright green mark on every theme. Canvas accepts
       modern colour syntax, so alpha rides on globalAlpha instead. */
    const ink = getComputedStyle(host).color || "rgb(232,234,238)"

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true, // drawImage off a webgl canvas needs the buffer kept
    })
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 0.9

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100)
    camera.position.set(0, 0, 7.2)
    const group = new THREE.Group()
    scene.add(group)

    scene.add(new THREE.AmbientLight(0xffffff, 0.2))
    const key = new THREE.DirectionalLight(0xffffff, 2.75)
    key.position.set(-3, 4, 6)
    const fill = new THREE.DirectionalLight(0xffffff, 0.4)
    fill.position.set(4, 2, 4)
    scene.add(key, fill)

    const mat = new THREE.MeshStandardMaterial({
      color: 0xb8c0cc,
      metalness: 0.3,
      roughness: 0.52,
    })

    const shapes: THREE.Shape[] = contours
      ? contours.map((c) => {
          const holes = c.holes ?? []
          const sh = new THREE.Shape(c.outer.map((p) => new THREE.Vector2(p[0], p[1])))
          holes.forEach((h) =>
            sh.holes.push(new THREE.Path(h.map((p) => new THREE.Vector2(p[0], p[1])))),
          )
          return sh
        })
      : BUILTIN[shape]()

    shapes.forEach((sh) =>
      group.add(
        new THREE.Mesh(
          new THREE.ExtrudeGeometry(sh, {
            depth: 0.34,
            bevelEnabled: true,
            bevelThickness: 0.035,
            bevelSize: 0.028,
            bevelSegments: 4,
            curveSegments: 24,
          }),
          mat,
        ),
      ),
    )
    // centre the whole mark, not each piece: per-geometry centring stacks them
    const box = new THREE.Box3().setFromObject(group)
    const c0 = box.getCenter(new THREE.Vector3())
    group.children.forEach((m) => m.position.sub(c0))
    const size = box.getSize(new THREE.Vector3())
    group.scale.setScalar(3.15 / Math.max(size.x, size.y))

    const SWEEP = THREE.MathUtils.degToRad(sweep)
    let target = 0
    let current = 0
    let engaged = false
    let cols = 0
    let rows = 0
    let w = 0
    let h = 0
    let raf = 0
    let lastPaint = 0
    const t0 = performance.now()

    const resize = () => {
      w = host.clientWidth
      h = host.clientHeight
      if (!w || !h) return
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      const dpr = Math.min(devicePixelRatio || 1, 2)
      aCanvas.width = w * dpr
      aCanvas.height = h * dpr
      aCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
      aCtx.textBaseline = "top"
      aCtx.font = `${Math.round(cell * 1.02)}px "SF Mono", Menlo, ui-monospace, monospace`
      cols = Math.ceil(w / cell)
      rows = Math.ceil(h / cell)
      sampler.width = cols
      sampler.height = rows
    }

    const draw = () => {
      aCtx.globalAlpha = 1
      sCtx.clearRect(0, 0, cols, rows)
      sCtx.drawImage(canvas, 0, 0, cols, rows)
      const d = sCtx.getImageData(0, 0, cols, rows).data
      aCtx.clearRect(0, 0, w, h)
      aCtx.fillStyle = ink
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const i = (y * cols + x) * 4
          const a = d[i + 3] / 255
          if (a < 0.06) continue
          let lum = ((0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255) * a
          // the lit band is narrow by design, so it is stretched over the ramp
          lum = Math.min(1, Math.max(0, (lum - 0.32) / 0.48))
          const k = Math.min(ramp.length - 1, Math.floor(lum * ramp.length))
          if (k <= 0) continue
          aCtx.globalAlpha = 0.35 + 0.65 * lum
          aCtx.fillText(ramp[k], x * cell, y * cell)
        }
      }
    }

    /* pointer writes a target only; the loop owns painting */
    const onMove = (e: PointerEvent) => {
      const r = host.getBoundingClientRect()
      target = ((e.clientX - r.left) / r.width - 0.5) * 2 * SWEEP
      engaged = true
    }
    host.addEventListener("pointermove", onMove, { passive: true })

    const ro = new ResizeObserver(() => {
      resize()
      if (reduce) {
        renderer.render(scene, camera)
        draw()
      }
    })
    ro.observe(host)

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      if (!engaged) current = Math.sin(((performance.now() - t0) / 1000) * 0.35) * SWEEP * 0.55
      else current += (target - current) * 0.08
      group.rotation.y = current
      group.rotation.x = -current * 0.06
      renderer.render(scene, camera)
      if (now - lastPaint >= 1000 / fps) {
        lastPaint = now
        draw()
      }
    }

    resize()
    canvas.style.opacity = "0"; // renders for sampling only
    if (reduce) {
      renderer.render(scene, camera)
      draw()
    } else {
      raf = requestAnimationFrame(tick)
    }

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      host.removeEventListener("pointermove", onMove)
      group.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose()
      })
      mat.dispose()
      renderer.dispose()
    }
  }, [shape, contours, cell, ramp, sweep, fps])

  return (
    <div
      ref={hostRef}
      className={cn(
        "relative w-full overflow-hidden rounded-xl border border-foreground/[0.04] text-foreground/[0.85]",
        className,
      )}
      style={{
        height,
        background: "var(--card)",
        boxShadow: "inset 0 1px 0 0 color-mix(in srgb, var(--foreground) 4%, transparent)",
      }}
    >
      <canvas ref={glRef} className="absolute inset-0 h-full w-full" />
      <canvas ref={asciiRef} className="absolute inset-0 h-full w-full" />
    </div>
  )
}
