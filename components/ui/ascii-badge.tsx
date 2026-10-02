"use client"

import { useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent } from "react"
import { cn } from "@/lib/utils"

/* ASCII Badge — any single-path SVG mark as a 3D badge drawn in characters, with WebGPU.

   The same badge as Metal Badge: the mark flattened, rolled over a slight round into a straight
   side, the face bent onto a dome, a back behind it, lit by one light that follows the cursor.
   What changes is the last pass. The lit surface is rendered offscreen as before, then read
   back per cell: each cell's brightness picks a character from a ramp (" .,:;-~=+*oxX#%@" by
   default, sixteen steps in 5px cells), drawn from a glyph atlas the component paints once with the page's monospace
   font. Turn the badge and the characters change with the light, because they are the light.

   Motion: an 8s idle sway. Anywhere over the component's root (a padded stage) the badge leans
   toward the pointer and the light turns to face it. Click or tap flips it two turns, a swipe
   spins it and it settles on the front; Enter or Space from the keyboard. Touch leaves
   vertical scrolling to the page.

   Ink follows the theme: white on a dark page, near black on a light one, read from the
   `.dark` class when the badge draws.

   Fallback: where WebGPU is missing, fails to start or loses its device, the mark is one flat
   face filled with a pattern of characters, with the same tilt and flip. The root's
   data-renderer says which is live: "gpu" or "fallback".

   No dependencies: the renderer is raw WebGPU, and earcut is inlined below with its licence. */

export type AsciiBadgeProps = {
  /** the mark's SVG path data (`d`), commands M L H V C A Z: any single-path mark becomes a badge; the ssych mark by default */
  path?: string
  /** the path's viewBox, e.g. "0 0 437.287 529.764" */
  viewBox?: string
  /** width in px; the height follows the viewBox */
  size?: number
  /** click, tap, swipe or Enter/Space to flip it; off makes it decorative */
  flip?: boolean
  /** the idle sway */
  sway?: boolean
  /** accessible name of the flip button */
  label?: string
  /** a fixed [rx, ry] or [rx, ry, flip] in degrees: one still frame, no sway, cursor or flip (for stills) */
  pose?: readonly [number, number] | readonly [number, number, number]
  /** dark to light; the first character is treated as empty */
  ramp?: string
  /** character cell in css px. smaller keeps more of the form, costs more paint */
  cell?: number
  className?: string
}

/* ── the material, as ratios of the Figma master's 114.714 × 99.0732 box. These stops are the
   metal itself (a lit surface does not follow the page theme), not theme colours. ── */
const REF_W = 114.714
const REF_H = 99.0732
const FILL = {
  x1: 57 / REF_W,
  y1: -4.5 / REF_H,
  x2: 32.5 / REF_W,
  y2: 95.5 / REF_H,
  stops: [
    [0, "#ffffff"],
    [0.477953, "#E4E4E4"],
    [0.60838, "#C4C4C4"],
    [0.860602, "#a0a0a0"],
    [1, "#5c5c5c"],
  ] as [number, string][],
}
const STROKE = {
  tx: 83.5 / REF_W,
  ty: 7 / REF_H,
  rotate: 124.824,
  sx: 112.071 / REF_W,
  sy: 129.764 / REF_H,
  stops: [
    [0.072088, "#F7F7F7"],
    [0.384626, "#E4E4E4"],
    [0.764375, "#7B7B7B"],
    [1, "#ffffff"],
  ] as [number, string][],
}

const MAX = 16 // degrees of tilt, reached RANGE px from the badge's centre
const RANGE = 520
const CAMERA = 4.0625 // camera distance in mark widths (a 260px perspective on a 64px mark)
const SWAY = 8 // degrees either way, about the axis (0.22, 1, 0), over SWAY_PERIOD seconds
const SWAY_PERIOD = 8
const CANVAS_PAD = 1.7 // the canvas's side in mark widths: room for the tilt, the sway, the flip and the edge
const RAD = Math.PI / 180

/* ── flip: click, tap or swipe to turn the badge about its vertical axis ─────────────────
   A click or tap is a flick of a coin: two whole turns that start at full speed, ease out
   slowly (quint), carry OVER_DEG past the front and settle back
   at the pointer. A swipe follows the finger, then carries on at its speed and settles on a
   whole turn with a spring. A vertical swipe, or one the browser takes for a scroll
   (pointercancel), settles without a turn. The owner steps it every frame while busy(). */
const DRAG = 0.9 // degrees of turn per px of swipe
const TAP = 6 // px a press may travel and still count as a click or tap
const SPRING = 38 // stiffness, with damping just under critical
const DAMPING = 2 * Math.sqrt(SPRING) * 0.78
const FLICK_TURNS = 2
const FLICK_S = 1.9
const OVER_DEG = 12
const OVER_AT = 0.78
/** degrees travelled past the start, for a flick of `total` degrees at time t (0..1) */
const flickAngle = (total: number, t: number) => {
  if (t < OVER_AT) {
    const u = t / OVER_AT
    return (total + OVER_DEG) * (1 - (1 - u) ** 5)
  }
  const u = (t - OVER_AT) / (1 - OVER_AT)
  return total + (OVER_DEG * (1 + Math.cos(Math.PI * u))) / 2
}

type Flip = { angle: () => number; busy: () => boolean; step: (dt: number) => void; turn: () => void; dispose: () => void }

function createFlip(hit: HTMLElement, onStart: () => void): Flip {
  let angle = 0
  let velocity = 0
  let target = 0
  let springing = false
  let dragging = false
  let pressX = 0
  let pressY = 0
  let pressAngle = 0
  let lastX = 0
  let lastTime = 0
  let dragVelocity = 0
  let travel = 0
  let travelY = 0
  let flick: { from: number; to: number; t: number } | null = null

  const turnOnce = () => {
    springing = false
    velocity = 0
    flick = { from: angle, to: Math.round(angle / 360) * 360 + 360 * FLICK_TURNS, t: 0 }
  }
  const down = (e: PointerEvent) => {
    if (!e.isPrimary) return
    hit.setPointerCapture(e.pointerId)
    dragging = true
    springing = false
    flick = null // catching a spinning coin stops it where it is
    pressX = lastX = e.clientX
    pressY = e.clientY
    pressAngle = angle
    lastTime = performance.now()
    dragVelocity = 0
    travel = 0
    travelY = 0
    onStart()
  }
  const move = (e: PointerEvent) => {
    if (!dragging) return
    const now = performance.now()
    travel = Math.max(travel, Math.abs(e.clientX - pressX))
    travelY = Math.max(travelY, Math.abs(e.clientY - pressY))
    if (travel >= TAP) angle = pressAngle + (e.clientX - pressX) * DRAG
    const elapsed = Math.max(now - lastTime, 1) / 1000
    dragVelocity = dragVelocity * 0.6 + (((e.clientX - lastX) * DRAG) / elapsed) * 0.4
    lastX = e.clientX
    lastTime = now
  }
  const up = () => {
    if (!dragging) return
    dragging = false
    const turn = Math.round(angle / 360) * 360
    if (travel < TAP && travelY >= TAP) {
      // a vertical swipe that stayed with the badge: no turn
      target = turn
      velocity = 0
      springing = true
    } else if (travel < TAP) {
      turnOnce()
    } else {
      // a swipe: carry on at its speed, settle on a whole turn in that direction
      velocity = dragVelocity
      target = Math.round((angle + dragVelocity * 0.35) / 360) * 360
      if (target === turn && Math.abs(dragVelocity) > 400) target += Math.sign(dragVelocity) * 360
      springing = true
    }
  }
  const cancel = () => {
    if (!dragging) return
    dragging = false
    target = Math.round(angle / 360) * 360
    velocity = 0
    springing = true
  }
  hit.addEventListener("pointerdown", down)
  hit.addEventListener("pointermove", move)
  hit.addEventListener("pointerup", up)
  hit.addEventListener("pointercancel", cancel)

  return {
    angle: () => angle,
    busy: () => dragging || springing || flick !== null,
    turn() {
      if (dragging) return
      turnOnce()
      onStart()
    },
    step(dt) {
      if (flick) {
        flick.t = Math.min(1, flick.t + dt / FLICK_S)
        angle = flick.from + flickAngle(flick.to - flick.from, flick.t)
        if (flick.t >= 1) {
          flick = null
          angle = 0 // a whole number of turns is the front again
        }
        return
      }
      if (!springing) return
      // small fixed steps, so a long frame cannot throw the spring
      for (let left = dt; left > 0; left -= 1 / 240) {
        const h = Math.min(left, 1 / 240)
        velocity += (SPRING * (target - angle) - DAMPING * velocity) * h
        angle += velocity * h
      }
      if (Math.abs(target - angle) < 0.05 && Math.abs(velocity) < 0.5) {
        springing = false
        angle = 0
        target = 0
        velocity = 0
      }
    },
    dispose() {
      hit.removeEventListener("pointerdown", down)
      hit.removeEventListener("pointermove", move)
      hit.removeEventListener("pointerup", up)
      hit.removeEventListener("pointercancel", cancel)
    },
  }
}

/* ── motion: the sway, the cursor's lean and light, and the flip, stepped per frame ────────
   Shared by both renderers, which only draw the state they are handed. The pointer is read
   on the flat stage (the root), never on the badge that turns. The loop runs only while
   the badge is active (on screen, renderer ready) and something moves. */
type Motion = { rx: number; ry: number; flip: number; sway: number; light: number; lx: number; ly: number; lz: number; hover: boolean }
type Driver = { setActive: (active: boolean) => void; redraw: () => void; turn: () => void; dispose: () => void }

/** the idle sway at t seconds: −SWAY to +SWAY and back, eased at both ends */
function swayAt(t: number) {
  const phase = (t % SWAY_PERIOD) / SWAY_PERIOD
  const leg = phase < 0.5 ? phase * 2 : (1 - phase) * 2
  return -SWAY + 2 * SWAY * leg * leg * (3 - 2 * leg)
}

function createDriver(o: {
  root: HTMLElement
  /** takes clicks, taps and swipes to flip the badge */
  hit: HTMLElement
  pose?: number[]
  sway: boolean
  still: boolean
  flip: boolean
  /** the chrome gradient's resting direction, dark to bright, in degrees */
  baseDeg: number
  draw: (m: Motion) => void
  onError: (error: unknown) => void
}): Driver {
  const { root, hit, pose, still } = o
  const swaying = o.sway && !still
  const m: Motion = { rx: pose?.[0] ?? 0, ry: pose?.[1] ?? 0, flip: pose?.[2] ?? 0, sway: swaying ? swayAt(0) : 0, light: 0, lx: 0.2, ly: 0.8, lz: 1, hover: false }
  let tx = m.rx
  let ty = m.ry
  let lightTarget = 0
  const lightTo = [0.2, 0.8, 1]
  let swayTime = 0
  let active = false
  let dirty = true
  let raf = 0
  let last = 0

  const wake = () => {
    if (!active || raf) return
    last = performance.now()
    raf = requestAnimationFrame(tick)
  }
  const flipper = o.flip && !still ? createFlip(hit, wake) : null

  function tick(now: number) {
    raf = 0
    if (!active) return
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    let moving = false
    if (!still) {
      const busy = flipper?.busy() ?? false
      if (swaying && !m.hover && !busy) {
        swayTime += dt
        m.sway = swayAt(swayTime)
        moving = true
      }
      const follow = 1 - Math.exp(-dt / (m.hover ? 0.1 : 0.3))
      m.rx += (tx - m.rx) * follow
      m.ry += (ty - m.ry) * follow
      const turn = ((((lightTarget - m.light) % 360) + 540) % 360) - 180
      m.light += turn * (1 - Math.exp(-dt / 0.12))
      const k = 1 - Math.exp(-dt / 0.15)
      m.lx += (lightTo[0] - m.lx) * k
      m.ly += (lightTo[1] - m.ly) * k
      m.lz += (lightTo[2] - m.lz) * k
      flipper?.step(dt)
      m.flip = flipper?.angle() ?? 0
      moving ||=
        busy ||
        Math.abs(tx - m.rx) + Math.abs(ty - m.ry) > 0.01 ||
        Math.abs(turn) > 0.05 ||
        Math.abs(lightTo[0] - m.lx) + Math.abs(lightTo[1] - m.ly) + Math.abs(lightTo[2] - m.lz) > 0.002
    }
    if (moving || dirty) {
      dirty = false
      try {
        o.draw(m)
      } catch (error) {
        // a frame that throws would stop the loop silently; hand over to the fallback instead
        active = false
        o.onError(error)
        return
      }
    }
    if (moving) raf = requestAnimationFrame(tick)
  }

  const onMove = (e: PointerEvent) => {
    // touch scrolls the page instead: leaning would need touch-action: none on the stage
    if (e.pointerType === "touch") return
    const r = hit.getBoundingClientRect()
    const ox = e.clientX - (r.left + r.width / 2)
    const oy = e.clientY - (r.top + r.height / 2)
    const dx = Math.max(-1, Math.min(1, ox / RANGE))
    const dy = Math.max(-1, Math.min(1, oy / RANGE))
    m.hover = true
    ty = dx * MAX
    tx = -dy * MAX
    lightTarget = Math.atan2(oy, ox) / RAD - o.baseDeg
    lightTo[0] = dx * 1.4
    lightTo[1] = -dy * 1.4
    lightTo[2] = 1
    wake()
  }
  const onLeave = (e: PointerEvent) => {
    if (e.pointerType === "touch") return
    m.hover = false
    tx = 0
    ty = 0
    lightTarget = 0
    lightTo.splice(0, 3, 0.2, 0.8, 1)
    wake()
  }
  if (!still) {
    root.addEventListener("pointermove", onMove)
    root.addEventListener("pointerleave", onLeave)
  }

  return {
    setActive(next) {
      if (next === active) return
      active = next
      if (active) {
        dirty = true
        wake()
      } else {
        cancelAnimationFrame(raf)
        raf = 0
      }
    },
    redraw() {
      dirty = true
      wake()
    },
    turn: () => flipper?.turn(),
    dispose() {
      active = false
      cancelAnimationFrame(raf)
      root.removeEventListener("pointermove", onMove)
      root.removeEventListener("pointerleave", onLeave)
      flipper?.dispose()
    },
  }
}

/* ── earcut 3.0.2 (https://github.com/mapbox/earcut), ported to TypeScript unchanged in
   behaviour, from three.js's copy (three/src/extras/lib/earcut.js; three.js is MIT, © 2010-2026
   three.js authors). Two coordinates per point.

   ISC License

   Copyright (c) 2024, Mapbox

   Permission to use, copy, modify, and/or distribute this software for any purpose
   with or without fee is hereby granted, provided that the above copyright notice
   and this permission notice appear in all copies.

   THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
   REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
   FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
   INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS
   OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER
   TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF
   THIS SOFTWARE. ── */
class EarNode {
  i: number
  x: number
  y: number
  prev: EarNode = this
  next: EarNode = this
  z = 0
  prevZ: EarNode | null = null
  nextZ: EarNode | null = null
  steiner = false
  constructor(i: number, x: number, y: number) {
    this.i = i
    this.x = x
    this.y = y
  }
}

/** triangle indices for a flat [x, y, …] outline followed by its holes, which start at `holeIndices` */
function earcut(data: number[], holeIndices: number[]): number[] {
  const hasHoles = holeIndices.length > 0
  const outerLen = hasHoles ? holeIndices[0] * 2 : data.length
  let outerNode = linkedList(data, 0, outerLen, true)
  const triangles: number[] = []
  if (!outerNode || outerNode.next === outerNode.prev) return triangles
  let minX = 0
  let minY = 0
  let invSize = 0
  if (hasHoles) outerNode = eliminateHoles(data, holeIndices, outerNode)
  // if the shape is not too simple, use a z-order curve hash later; calculate the polygon's bbox
  if (data.length > 80 * 2) {
    minX = data[0]
    minY = data[1]
    let maxX = minX
    let maxY = minY
    for (let i = 2; i < outerLen; i += 2) {
      const x = data[i]
      const y = data[i + 1]
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
    // minX, minY and invSize transform coords into integers for the z-order
    invSize = Math.max(maxX - minX, maxY - minY)
    invSize = invSize !== 0 ? 32767 / invSize : 0
  }
  earcutLinked(outerNode, triangles, minX, minY, invSize, 0)
  return triangles
}

// a circular doubly linked list from polygon points in the specified winding order
function linkedList(data: number[], start: number, end: number, clockwise: boolean) {
  let last: EarNode | undefined
  if (clockwise === signedArea(data, start, end) > 0) {
    for (let i = start; i < end; i += 2) last = insertNode((i / 2) | 0, data[i], data[i + 1], last)
  } else {
    for (let i = end - 2; i >= start; i -= 2) last = insertNode((i / 2) | 0, data[i], data[i + 1], last)
  }
  if (last && equals(last, last.next)) {
    removeNode(last)
    last = last.next
  }
  return last
}

// eliminate colinear or duplicate points
function filterPoints(start: EarNode, end: EarNode = start) {
  let p = start
  let again: boolean
  do {
    again = false
    if (!p.steiner && (equals(p, p.next) || area(p.prev, p, p.next) === 0)) {
      removeNode(p)
      p = end = p.prev
      if (p === p.next) break
      again = true
    } else {
      p = p.next
    }
  } while (again || p !== end)
  return end
}

// main ear slicing loop which triangulates a polygon (given as a linked list)
function earcutLinked(start: EarNode | undefined, triangles: number[], minX: number, minY: number, invSize: number, pass: number) {
  if (!start) return
  let ear = start
  // interlink polygon nodes in z-order
  if (!pass && invSize) indexCurve(ear, minX, minY, invSize)
  let stop = ear
  // iterate through ears, slicing them one by one
  while (ear.prev !== ear.next) {
    const prev = ear.prev
    const next = ear.next
    if (invSize ? isEarHashed(ear, minX, minY, invSize) : isEar(ear)) {
      triangles.push(prev.i, ear.i, next.i) // cut off the triangle
      removeNode(ear)
      // skipping the next vertex leads to less sliver triangles
      ear = next.next
      stop = next.next
      continue
    }
    ear = next
    // if we looped through the whole remaining polygon and can't find any more ears
    if (ear === stop) {
      if (!pass) {
        // try filtering points and slicing again
        earcutLinked(filterPoints(ear), triangles, minX, minY, invSize, 1)
      } else if (pass === 1) {
        // if this didn't work, try curing all small self-intersections locally
        ear = cureLocalIntersections(filterPoints(ear), triangles)
        earcutLinked(ear, triangles, minX, minY, invSize, 2)
      } else if (pass === 2) {
        // as a last resort, try splitting the remaining polygon into two
        splitEarcut(ear, triangles, minX, minY, invSize)
      }
      break
    }
  }
}

// check whether a polygon node forms a valid ear with adjacent nodes
function isEar(ear: EarNode) {
  const a = ear.prev
  const b = ear
  const c = ear.next
  if (area(a, b, c) >= 0) return false // reflex, can't be an ear
  // now make sure we don't have other points inside the potential ear
  const ax = a.x, bx = b.x, cx = c.x, ay = a.y, by = b.y, cy = c.y
  const x0 = Math.min(ax, bx, cx), y0 = Math.min(ay, by, cy), x1 = Math.max(ax, bx, cx), y1 = Math.max(ay, by, cy)
  let p = c.next
  while (p !== a) {
    if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1 && pointInTriangleExceptFirst(ax, ay, bx, by, cx, cy, p.x, p.y) && area(p.prev, p, p.next) >= 0) return false
    p = p.next
  }
  return true
}

function isEarHashed(ear: EarNode, minX: number, minY: number, invSize: number) {
  const a = ear.prev
  const b = ear
  const c = ear.next
  if (area(a, b, c) >= 0) return false // reflex, can't be an ear
  const ax = a.x, bx = b.x, cx = c.x, ay = a.y, by = b.y, cy = c.y
  const x0 = Math.min(ax, bx, cx), y0 = Math.min(ay, by, cy), x1 = Math.max(ax, bx, cx), y1 = Math.max(ay, by, cy)
  // z-order range for the current triangle bbox
  const minZ = zOrder(x0, y0, minX, minY, invSize)
  const maxZ = zOrder(x1, y1, minX, minY, invSize)
  let p = ear.prevZ
  let n = ear.nextZ
  const blocks = (q: EarNode) => q.x >= x0 && q.x <= x1 && q.y >= y0 && q.y <= y1 && q !== a && q !== c && pointInTriangleExceptFirst(ax, ay, bx, by, cx, cy, q.x, q.y) && area(q.prev, q, q.next) >= 0
  // look for points inside the triangle in both directions
  while (p && p.z >= minZ && n && n.z <= maxZ) {
    if (blocks(p)) return false
    p = p.prevZ
    if (blocks(n)) return false
    n = n.nextZ
  }
  // look for remaining points in decreasing z-order
  while (p && p.z >= minZ) {
    if (blocks(p)) return false
    p = p.prevZ
  }
  // look for remaining points in increasing z-order
  while (n && n.z <= maxZ) {
    if (blocks(n)) return false
    n = n.nextZ
  }
  return true
}

// go through all polygon nodes and cure small local self-intersections
function cureLocalIntersections(start: EarNode, triangles: number[]) {
  let p = start
  do {
    const a = p.prev
    const b = p.next.next
    if (!equals(a, b) && intersects(a, p, p.next, b) && locallyInside(a, b) && locallyInside(b, a)) {
      triangles.push(a.i, p.i, b.i)
      // remove two nodes involved
      removeNode(p)
      removeNode(p.next)
      p = start = b
    }
    p = p.next
  } while (p !== start)
  return filterPoints(p)
}

// try splitting polygon into two and triangulate them independently
function splitEarcut(start: EarNode, triangles: number[], minX: number, minY: number, invSize: number) {
  // look for a valid diagonal that divides the polygon into two
  let a = start
  do {
    let b = a.next.next
    while (b !== a.prev) {
      if (a.i !== b.i && isValidDiagonal(a, b)) {
        // split the polygon in two by the diagonal
        let c = splitPolygon(a, b)
        // filter colinear points around the cuts
        a = filterPoints(a, a.next)
        c = filterPoints(c, c.next)
        // run earcut on each half
        earcutLinked(a, triangles, minX, minY, invSize, 0)
        earcutLinked(c, triangles, minX, minY, invSize, 0)
        return
      }
      b = b.next
    }
    a = a.next
  } while (a !== start)
}

// link every hole into the outer loop, producing a single-ring polygon without holes
function eliminateHoles(data: number[], holeIndices: number[], outerNode: EarNode) {
  const queue: EarNode[] = []
  for (let i = 0, len = holeIndices.length; i < len; i++) {
    const start = holeIndices[i] * 2
    const end = i < len - 1 ? holeIndices[i + 1] * 2 : data.length
    const list = linkedList(data, start, end, false)
    if (!list) continue
    if (list === list.next) list.steiner = true
    queue.push(getLeftmost(list))
  }
  queue.sort(compareXYSlope)
  // process holes from left to right
  for (let i = 0; i < queue.length; i++) outerNode = eliminateHole(queue[i], outerNode)
  return outerNode
}

function compareXYSlope(a: EarNode, b: EarNode) {
  let result = a.x - b.x
  // when the left-most point of 2 holes meet at a vertex, sort the holes counterclockwise so that when we find
  // the bridge to the outer shell is always the point that they meet at.
  if (result === 0) {
    result = a.y - b.y
    if (result === 0) {
      const aSlope = (a.next.y - a.y) / (a.next.x - a.x)
      const bSlope = (b.next.y - b.y) / (b.next.x - b.x)
      result = aSlope - bSlope
    }
  }
  return result
}

// find a bridge between vertices that connects hole with an outer ring and link it
function eliminateHole(hole: EarNode, outerNode: EarNode) {
  const bridge = findHoleBridge(hole, outerNode)
  if (!bridge) return outerNode
  const bridgeReverse = splitPolygon(bridge, hole)
  // filter collinear points around the cuts
  filterPoints(bridgeReverse, bridgeReverse.next)
  return filterPoints(bridge, bridge.next)
}

// David Eberly's algorithm for finding a bridge between hole and outer polygon
function findHoleBridge(hole: EarNode, outerNode: EarNode) {
  let p = outerNode
  const hx = hole.x
  const hy = hole.y
  let qx = -Infinity
  let m: EarNode | undefined
  // find a segment intersected by a ray from the hole's leftmost point to the left; segment's endpoint
  // with lesser x will be potential connection point, unless they intersect at a vertex, then choose the vertex
  if (equals(hole, p)) return p
  do {
    if (equals(hole, p.next)) return p.next
    else if (hy <= p.y && hy >= p.next.y && p.next.y !== p.y) {
      const x = p.x + ((hy - p.y) * (p.next.x - p.x)) / (p.next.y - p.y)
      if (x <= hx && x > qx) {
        qx = x
        m = p.x < p.next.x ? p : p.next
        if (x === hx) return m // hole touches outer segment; pick leftmost endpoint
      }
    }
    p = p.next
  } while (p !== outerNode)
  if (!m) return null
  // look for points inside the triangle of hole point, segment intersection and endpoint; if there are none,
  // we have a valid connection; otherwise choose the point of the minimum angle with the ray as connection point
  const stop = m
  const mx = m.x
  const my = m.y
  let tanMin = Infinity
  p = m
  do {
    if (hx >= p.x && p.x >= mx && hx !== p.x && pointInTriangle(hy < my ? hx : qx, hy, mx, my, hy < my ? qx : hx, hy, p.x, p.y)) {
      const tan = Math.abs(hy - p.y) / (hx - p.x) // tangential
      if (locallyInside(p, hole) && (tan < tanMin || (tan === tanMin && (p.x > m.x || (p.x === m.x && sectorContainsSector(m, p)))))) {
        m = p
        tanMin = tan
      }
    }
    p = p.next
  } while (p !== stop)
  return m
}

// whether sector in vertex m contains sector in vertex p in the same coordinates
function sectorContainsSector(m: EarNode, p: EarNode) {
  return area(m.prev, m, p.prev) < 0 && area(p.next, m, m.next) < 0
}

// interlink polygon nodes in z-order
function indexCurve(start: EarNode, minX: number, minY: number, invSize: number) {
  let p = start
  do {
    if (p.z === 0) p.z = zOrder(p.x, p.y, minX, minY, invSize)
    p.prevZ = p.prev
    p.nextZ = p.next
    p = p.next
  } while (p !== start)
  p.prev.nextZ = null // p.prevZ is p.prev here
  p.prevZ = null
  sortLinked(p)
}

// Simon Tatham's linked list merge sort algorithm
// http://www.chiark.greenend.org.uk/~sgtatham/algorithms/listsort.html
function sortLinked(head: EarNode) {
  let list: EarNode | null = head
  let numMerges: number
  let inSize = 1
  do {
    let p: EarNode | null = list
    list = null
    let tail: EarNode | null = null
    numMerges = 0
    while (p) {
      numMerges++
      let q: EarNode | null = p
      let pSize = 0
      for (let i = 0; i < inSize; i++) {
        pSize++
        q = q.nextZ
        if (!q) break
      }
      let qSize = inSize
      while (pSize > 0 || (qSize > 0 && q)) {
        let e: EarNode
        // p is set while pSize > 0, and q whenever p is not taken, so the last branch never runs
        if (p && pSize !== 0 && (qSize === 0 || !q || p.z <= q.z)) {
          e = p
          p = p.nextZ
          pSize--
        } else if (q) {
          e = q
          q = q.nextZ
          qSize--
        } else break
        if (tail) tail.nextZ = e
        else list = e
        e.prevZ = tail
        tail = e
      }
      p = q
    }
    if (tail) tail.nextZ = null
    inSize *= 2
  } while (numMerges > 1)
}

// z-order of a point given coords and inverse of the longer side of data bbox
function zOrder(px: number, py: number, minX: number, minY: number, invSize: number) {
  // coords are transformed into non-negative 15-bit integer range
  let x = ((px - minX) * invSize) | 0
  let y = ((py - minY) * invSize) | 0
  x = (x | (x << 8)) & 0x00ff00ff
  x = (x | (x << 4)) & 0x0f0f0f0f
  x = (x | (x << 2)) & 0x33333333
  x = (x | (x << 1)) & 0x55555555
  y = (y | (y << 8)) & 0x00ff00ff
  y = (y | (y << 4)) & 0x0f0f0f0f
  y = (y | (y << 2)) & 0x33333333
  y = (y | (y << 1)) & 0x55555555
  return x | (y << 1)
}

// find the leftmost node of a polygon ring
function getLeftmost(start: EarNode) {
  let p = start
  let leftmost = start
  do {
    if (p.x < leftmost.x || (p.x === leftmost.x && p.y < leftmost.y)) leftmost = p
    p = p.next
  } while (p !== start)
  return leftmost
}

// check if a point lies within a convex triangle
function pointInTriangle(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, px: number, py: number) {
  return (cx - px) * (ay - py) >= (ax - px) * (cy - py) && (ax - px) * (by - py) >= (bx - px) * (ay - py) && (bx - px) * (cy - py) >= (cx - px) * (by - py)
}

// check if a point lies within a convex triangle but false if its equal to the first point of the triangle
function pointInTriangleExceptFirst(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, px: number, py: number) {
  return !(ax === px && ay === py) && pointInTriangle(ax, ay, bx, by, cx, cy, px, py)
}

// check if a diagonal between two polygon nodes is valid (lies in polygon interior)
function isValidDiagonal(a: EarNode, b: EarNode) {
  return (
    a.next.i !== b.i &&
    a.prev.i !== b.i &&
    !intersectsPolygon(a, b) && // doesn't intersect other edges
    ((locallyInside(a, b) && locallyInside(b, a) && middleInside(a, b) && // locally visible
      !!(area(a.prev, a, b.prev) || area(a, b.prev, b))) || // does not create opposite-facing sectors
      (equals(a, b) && area(a.prev, a, a.next) > 0 && area(b.prev, b, b.next) > 0)) // special zero-length case
  )
}

// signed area of a triangle
function area(p: EarNode, q: EarNode, r: EarNode) {
  return (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y)
}

function equals(p1: EarNode, p2: EarNode) {
  return p1.x === p2.x && p1.y === p2.y
}

// check if two segments intersect
function intersects(p1: EarNode, q1: EarNode, p2: EarNode, q2: EarNode) {
  const o1 = Math.sign(area(p1, q1, p2))
  const o2 = Math.sign(area(p1, q1, q2))
  const o3 = Math.sign(area(p2, q2, p1))
  const o4 = Math.sign(area(p2, q2, q1))
  if (o1 !== o2 && o3 !== o4) return true // general case
  if (o1 === 0 && onSegment(p1, p2, q1)) return true // p1, q1 and p2 are collinear and p2 lies on p1q1
  if (o2 === 0 && onSegment(p1, q2, q1)) return true // p1, q1 and q2 are collinear and q2 lies on p1q1
  if (o3 === 0 && onSegment(p2, p1, q2)) return true // p2, q2 and p1 are collinear and p1 lies on p2q2
  if (o4 === 0 && onSegment(p2, q1, q2)) return true // p2, q2 and q1 are collinear and q1 lies on p2q2
  return false
}

// for collinear points p, q, r, check if point q lies on segment pr
function onSegment(p: EarNode, q: EarNode, r: EarNode) {
  return q.x <= Math.max(p.x, r.x) && q.x >= Math.min(p.x, r.x) && q.y <= Math.max(p.y, r.y) && q.y >= Math.min(p.y, r.y)
}

// check if a polygon diagonal intersects any polygon segments
function intersectsPolygon(a: EarNode, b: EarNode) {
  let p = a
  do {
    if (p.i !== a.i && p.next.i !== a.i && p.i !== b.i && p.next.i !== b.i && intersects(p, p.next, a, b)) return true
    p = p.next
  } while (p !== a)
  return false
}

// check if a polygon diagonal is locally inside the polygon
function locallyInside(a: EarNode, b: EarNode) {
  return area(a.prev, a, a.next) < 0 ? area(a, b, a.next) >= 0 && area(a, a.prev, b) >= 0 : area(a, b, a.prev) < 0 || area(a, a.next, b) < 0
}

// check if the middle point of a polygon diagonal is inside the polygon
function middleInside(a: EarNode, b: EarNode) {
  let p = a
  let inside = false
  const px = (a.x + b.x) / 2
  const py = (a.y + b.y) / 2
  do {
    if (p.y > py !== p.next.y > py && p.next.y !== p.y && px < ((p.next.x - p.x) * (py - p.y)) / (p.next.y - p.y) + p.x) inside = !inside
    p = p.next
  } while (p !== a)
  return inside
}

// link two polygon vertices with a bridge; if the vertices belong to the same ring, it splits polygon into two;
// if one belongs to the outer ring and another to a hole, it merges it into a single ring
function splitPolygon(a: EarNode, b: EarNode) {
  const a2 = new EarNode(a.i, a.x, a.y)
  const b2 = new EarNode(b.i, b.x, b.y)
  const an = a.next
  const bp = b.prev
  a.next = b
  b.prev = a
  a2.next = an
  an.prev = a2
  b2.next = a2
  a2.prev = b2
  bp.next = b2
  b2.prev = bp
  return b2
}

// create a node and optionally link it with previous one (in a circular doubly linked list)
function insertNode(i: number, x: number, y: number, last: EarNode | undefined) {
  const p = new EarNode(i, x, y)
  if (last) {
    p.next = last.next
    p.prev = last
    last.next.prev = p
    last.next = p
  }
  return p
}

function removeNode(p: EarNode) {
  p.next.prev = p.prev
  p.prev.next = p.next
  if (p.prevZ) p.prevZ.nextZ = p.nextZ
  if (p.nextZ) p.nextZ.prevZ = p.prevZ
}

function signedArea(data: number[], start: number, end: number) {
  let sum = 0
  for (let i = start, j = end - 2; i < end; i += 2) {
    sum += (data[j] - data[i]) * (data[i + 1] + data[j + 1])
    j = i
  }
  return sum
}
/* ── end of earcut ── */

/* ── the mesh: an SVG path as a slightly rounded, domed badge with a front and a back ─────
   1. The path is flattened to rings (curves and arcs split by length). A ring inside an odd
      number of others is a hole; the rest are solid shapes. Every edge is cut to at most `edge`.
   2. Within ROUND of an outline the surface rolls over a quarter ellipse (ROUND wide,
      ROUND_DEPTH deep) into a straight side, built as BEVEL_STEPS rings stepped in from the
      outline. A hole gets the same edge, turned inward.
   3. The face inside the rings is triangulated (earcut, with its holes), and its inside edges
      are split until none is longer than `face`, or `near` within EDGE_BAND of an outline.
      Edges on the rings are never split, so face and rings meet without cracks.
   4. Every point sits on a sphere of radius R mark widths (keeping its flat x and y), with the
      roll taken straight back in z. The back is the same bent sheet THICKNESS behind.
   5. Each vertex carries its distance to the nearest outline as a fraction of EDGE_BAND, so the
      shader can draw the light outline along the art's edge at any viewing angle.
   Units: mark widths, origin at the art's centre, y up, z toward the viewer. `detail` scales
   every edge length: 1 for a large badge, more for a small one, which needs fewer triangles. */
type V2 = [number, number]
type Mesh = { vertices: Float32Array; indices: Uint32Array }

const BADGE = {
  R: 1.1, // sphere radius in mark widths
  THICKNESS: 0.085, // front to back at the rim
  ROUND: 0.014, // how far in from the outline the surface rolls over: a slight round, so edges stay crisp
  ROUND_DEPTH: 0.01, // how far back the roll takes it before the straight side
  BEVEL_STEPS: 5,
  EDGE_BAND: 0.05, // how far in from the outline the shader's light outline reaches
  EDGE: 0.01, // longest outline edge, longest edge inside the face, and inside the face near an outline (detail 1)
  FACE_EDGE: 0.03,
  NEAR_EDGE: 0.012,
}
/** floats per vertex: position 3, normal 3, art uv 2, edge 1 (0 on the outline, 1 at EDGE_BAND in) */
const STRIDE = 9

/** SVG arc to points, from the endpoint form (SVG 1.1 implementation notes, F.6.5) */
function arc(x1: number, y1: number, rxIn: number, ryIn: number, rotation: number, large: boolean, sweep: boolean, x2: number, y2: number, step: number, to: (x: number, y: number) => void) {
  let rx = Math.abs(rxIn)
  let ry = Math.abs(ryIn)
  if (rx === 0 || ry === 0 || (x1 === x2 && y1 === y2)) {
    to(x2, y2)
    return
  }
  const phi = (rotation * Math.PI) / 180
  const cos = Math.cos(phi)
  const sin = Math.sin(phi)
  const dx = (x1 - x2) / 2
  const dy = (y1 - y2) / 2
  const xp = cos * dx + sin * dy
  const yp = -sin * dx + cos * dy
  const lambda = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry)
  if (lambda > 1) {
    rx *= Math.sqrt(lambda)
    ry *= Math.sqrt(lambda)
  }
  const numerator = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp
  const denominator = rx * rx * yp * yp + ry * ry * xp * xp
  const k = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, numerator / denominator))
  const cxp = (k * rx * yp) / ry
  const cyp = (-k * ry * xp) / rx
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2
  const angle = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
  const start = angle(1, 0, (xp - cxp) / rx, (yp - cyp) / ry)
  let delta = angle((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry)
  if (!sweep && delta > 0) delta -= 2 * Math.PI
  else if (sweep && delta < 0) delta += 2 * Math.PI
  const n = Math.max(2, Math.ceil((Math.abs(delta) * Math.max(rx, ry)) / step))
  for (let i = 1; i < n; i++) {
    const t = start + (delta * i) / n
    to(cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos)
  }
  to(x2, y2)
}

/** absolute and relative M L H V C A Z */
function flatten(d: string, step: number): V2[][] {
  const tokens = d.match(/[MmLlHhVvCcAaZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? []
  const rings: V2[][] = []
  let ring: V2[] = []
  let i = 0
  let cmd = ""
  let x = 0
  let y = 0
  let sx = 0
  let sy = 0
  const num = () => parseFloat(tokens[i++])
  const to = (px: number, py: number) => {
    ring.push([px, py])
    x = px
    y = py
  }
  while (i < tokens.length) {
    if (/^[A-Za-z]$/.test(tokens[i])) cmd = tokens[i++]
    const rel = cmd === cmd.toLowerCase()
    const ox = rel ? x : 0
    const oy = rel ? y : 0
    switch (cmd.toUpperCase()) {
      case "M": {
        if (ring.length) rings.push(ring)
        ring = []
        to(num() + ox, num() + oy)
        sx = x
        sy = y
        cmd = rel ? "l" : "L" // further pairs after M are lines
        break
      }
      case "L":
        to(num() + ox, num() + oy)
        break
      case "H":
        to(num() + ox, y)
        break
      case "V":
        to(x, num() + oy)
        break
      case "C": {
        const x0 = x
        const y0 = y
        const x1 = num() + ox
        const y1 = num() + oy
        const x2 = num() + ox
        const y2 = num() + oy
        const x3 = num() + ox
        const y3 = num() + oy
        const length = Math.hypot(x1 - x0, y1 - y0) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(x3 - x2, y3 - y2)
        const n = Math.max(2, Math.ceil(length / step))
        for (let k = 1; k <= n; k++) {
          const t = k / n
          const u = 1 - t
          to(u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3, u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3)
        }
        break
      }
      case "A": {
        const rx = num()
        const ry = num()
        const rotation = num()
        const large = num() !== 0
        const sweep = num() !== 0
        const ex = num() + ox
        const ey = num() + oy
        arc(x, y, rx, ry, rotation, large, sweep, ex, ey, step, to)
        break
      }
      case "Z":
        if (ring.length) rings.push(ring)
        ring = []
        x = sx
        y = sy
        break
      default:
        throw new Error(`AsciiBadge: path command "${cmd}" is not supported`)
    }
  }
  if (ring.length) rings.push(ring)
  return rings
}

/** into mark widths (centred, y up), no repeated points, counter-clockwise, edges no longer than `edge` */
/** A corner that turns harder than SHARP_TURN degrees is rounded off before the mesh is built. The rim
 *  and the side wall are pushed out along each point's mitre, and at a near hairline point that push
 *  hits its cap and tears the rim (the slit in the ssych library mark turns about 133°). The rounding
 *  is BLUNT of the badge's width, the same as ROUND (the roll over the edge): any point sharper
 *  than the roll dents, so the tip gets the round a real rolled edge would give it. */
const SHARP_TURN = 100
const BLUNT = 0.014

function blunt(pts: V2[]): V2[] {
  const n = pts.length
  const lim = Math.cos((SHARP_TURN * Math.PI) / 180)
  const dir = (a: V2, b: V2): V2 => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l] }
  const sharp: number[] = []
  for (let i = 0; i < n; i++) {
    const u1 = dir(pts[(i + n - 1) % n], pts[i])
    const u2 = dir(pts[i], pts[(i + 1) % n])
    if (u1[0] * u2[0] + u1[1] * u2[1] < lim) sharp.push(i)
  }
  if (!sharp.length) return pts
  // walk BLUNT along the outline each way from a corner (across as many small segments as it takes)
  const walk = (i: number, step: 1 | -1) => {
    let left = BLUNT
    let j = i
    for (let guard = 0; guard < n / 2; guard++) {
      const k = (j + step + n) % n
      const l = Math.hypot(pts[k][0] - pts[j][0], pts[k][1] - pts[j][1])
      if (l >= left) {
        const f = left / (l || 1)
        return { at: [pts[j][0] + (pts[k][0] - pts[j][0]) * f, pts[j][1] + (pts[k][1] - pts[j][1]) * f] as V2, skip: guard }
      }
      left -= l
      j = k
    }
    return { at: pts[j], skip: 0 }
  }
  const drop = new Set<number>()
  const curve = new Map<number, V2[]>()
  for (const i of sharp) {
    const s = walk(i, -1)
    const e = walk(i, 1)
    for (let g = 1; g <= s.skip; g++) drop.add((i - g + n) % n)
    for (let g = 1; g <= e.skip; g++) drop.add((i + g) % n)
    // from a little before the corner to a little after it, with the corner as the control point:
    // it leaves along the incoming edge and arrives along the outgoing one in gentle turns
    const p = pts[i]
    const c: V2[] = []
    for (let k = 0; k <= 8; k++) {
      const q = k / 8
      const w0 = (1 - q) * (1 - q)
      const w1 = 2 * q * (1 - q)
      const w2 = q * q
      c.push([s.at[0] * w0 + p[0] * w1 + e.at[0] * w2, s.at[1] * w0 + p[1] * w1 + e.at[1] * w2])
    }
    curve.set(i, c)
  }
  const out: V2[] = []
  for (let i = 0; i < n; i++) {
    if (curve.has(i)) out.push(...curve.get(i)!)
    else if (!drop.has(i)) out.push(pts[i])
  }
  return out
}

function prepare(ring: V2[], x0: number, y0: number, w: number, h: number, edge: number): V2[] {
  const mapped = ring.map(([px, py]): V2 => [(px - x0 - w / 2) / w, -(py - y0 - h / 2) / w])
  let pts = mapped.filter((p, i) => {
    const q = mapped[(i + mapped.length - 1) % mapped.length]
    return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-7
  })
  let signed = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    signed += a[0] * b[1] - b[0] * a[1]
  }
  if (signed < 0) pts.reverse()
  pts = blunt(pts)
  const out: V2[] = []
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / edge))
    for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n])
  }
  return out
}

function contains(ring: V2[], p: V2) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]
    const b = ring[j]
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside
  }
  return inside
}

/** each point's outward direction (the mitre of its two edges, to the right of travel) and how far to step along it per unit of inset */
function mitres(pts: V2[]) {
  const n = pts.length
  const unit = (px: number, py: number): V2 | null => {
    const l = Math.hypot(px, py)
    return l < 1e-12 ? null : [px / l, py / l]
  }
  return pts.map((p, i) => {
    const a = pts[(i + n - 1) % n]
    const b = pts[(i + 1) % n]
    const e1 = unit(p[0] - a[0], p[1] - a[1]) ?? [1, 0]
    const e2 = unit(b[0] - p[0], b[1] - p[1]) ?? e1
    const n1: V2 = [e1[1], -e1[0]] // outward for a counter-clockwise outline, into the hole for a clockwise one
    const n2: V2 = [e2[1], -e2[0]]
    const m = unit(n1[0] + n2[0], n1[1] + n2[1]) ?? n2
    // capped so a sharp tip does not throw its inset far past the shape
    return { m, scale: 1 / Math.max(m[0] * n1[0] + m[1] * n1[1], 0.4) }
  })
}

/** for one shape's outlines: a point's distance to the nearest (capped at the reach) and the direction toward it */
function outlineDistance(loops: V2[][]) {
  const reach = Math.max(BADGE.ROUND, BADGE.EDGE_BAND)
  const cells = new Map<string, [number, number][]>()
  loops.forEach((pts, k) => {
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]
      const b = pts[(i + 1) % pts.length]
      for (let cx = Math.floor(Math.min(a[0], b[0]) / reach); cx <= Math.floor(Math.max(a[0], b[0]) / reach); cx++) {
        for (let cy = Math.floor(Math.min(a[1], b[1]) / reach); cy <= Math.floor(Math.max(a[1], b[1]) / reach); cy++) {
          const key = `${cx},${cy}`
          const list = cells.get(key)
          if (list) list.push([k, i])
          else cells.set(key, [[k, i]])
        }
      }
    }
  })
  return (px: number, py: number) => {
    let best = reach
    let dx = 0
    let dy = 0
    const cx = Math.floor(px / reach)
    const cy = Math.floor(py / reach)
    // a segment within reach passes through one of the 9 cells around the point
    for (let x = cx - 1; x <= cx + 1; x++) {
      for (let y = cy - 1; y <= cy + 1; y++) {
        for (const [k, i] of cells.get(`${x},${y}`) ?? []) {
          const pts = loops[k]
          const a = pts[i]
          const b = pts[(i + 1) % pts.length]
          const ex = b[0] - a[0]
          const ey = b[1] - a[1]
          const t = Math.max(0, Math.min(1, ((px - a[0]) * ex + (py - a[1]) * ey) / (ex * ex + ey * ey || 1)))
          const qx = a[0] + ex * t
          const qy = a[1] + ey * t
          const dist = Math.hypot(px - qx, py - qy)
          if (dist < best) {
            best = dist
            dx = qx - px
            dy = qy - py
          }
        }
      }
    }
    const l = Math.hypot(dx, dy) || 1
    return { dist: best, ox: dx / l, oy: dy / l }
  }
}

/** the roll over the badge's edge at `dist` in from the outline: how far back, and the normal's outward and forward parts */
function roll(dist: number) {
  const { ROUND, ROUND_DEPTH } = BADGE
  if (dist >= ROUND) return { depth: 0, out: 0, fwd: 1 }
  const s = 1 - dist / ROUND
  const c = Math.sqrt(Math.max(1 - s * s, 0))
  const a = ROUND_DEPTH * s
  const b = ROUND * c
  const l = Math.hypot(a, b) || 1
  return { depth: -ROUND_DEPTH * (1 - c), out: a / l, fwd: b / l }
}

const edgeKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`)

/** split triangle edges longer than limit(a, b) (never `fixed` ones) until none is left; neighbours split the same edges, so the mesh stays watertight */
/** how long the mesh build may hold the main thread before it gives the page a turn (ms) */
const SLICE_MS = 8
const nextTurn = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

async function refine(pts: V2[], input: number[], fixed: Set<string>, limit: (a: number, b: number) => number) {
  let tris = input
  /* the build gives the page a turn every SLICE_MS (2026-10-01): one mesh is 0.2 to 0.8 s of
     work, and done in one go it froze the Effects page as it opened. Same work, same order. */
  let deadline = performance.now() + SLICE_MS
  const mids = new Map<string, number>()
  const mid = (a: number, b: number) => {
    const key = edgeKey(a, b)
    let m = mids.get(key)
    if (m === undefined) {
      m = pts.length
      pts.push([(pts[a][0] + pts[b][0]) / 2, (pts[a][1] + pts[b][1]) / 2])
      mids.set(key, m)
    }
    return m
  }
  /* SPEED (2026-10-01). Every pass used to test every triangle again, finished ones included,
     and every test built a string key and asked limit() afresh: a page of eight badges (the
     Effects page) froze for seconds while their meshes built. Now a triangle that passed is
     carried over without a second look (none of its edges is long, and a neighbour only ever
     splits a long edge, so it can never change), and each edge's answer is kept under a number
     key (the ordered pair): its points never move, so the answer never changes. The same mesh, in the same
     triangle order, for a fraction of the work. */
  const answers = new Map<number, boolean>()
  const long = (a: number, b: number) => {
    // the ordered pair: limit() may read its two points in order, so (a, b) and (b, a) are kept apart
    const k = a * 67108864 + b
    let v = answers.get(k)
    if (v === undefined) {
      v = !fixed.has(edgeKey(a, b)) && Math.hypot(pts[a][0] - pts[b][0], pts[a][1] - pts[b][1]) > limit(a, b)
      answers.set(k, v)
    }
    return v
  }
  let done: boolean[] = []
  for (let pass = 0; pass < 20; pass++) {
    const out: number[] = []
    const outDone: boolean[] = []
    let split = false
    for (let t = 0; t < tris.length; t += 3) {
      if (t % 3072 === 0 && performance.now() > deadline) {
        await nextTurn()
        deadline = performance.now() + SLICE_MS
      }
      let [a, b, c] = [tris[t], tris[t + 1], tris[t + 2]]
      if (done[t / 3]) {
        out.push(a, b, c)
        outDone.push(true)
        continue
      }
      let flags = [long(a, b), long(b, c), long(c, a)]
      const count = flags.filter(Boolean).length
      if (count === 0) {
        out.push(a, b, c)
        outDone.push(true)
        continue
      }
      split = true
      if (count === 1) {
        while (!flags[0]) {
          ;[a, b, c] = [b, c, a]
          flags = [flags[1], flags[2], flags[0]]
        }
        const ab = mid(a, b)
        out.push(a, ab, c, ab, b, c)
        outDone.push(false, false)
      } else if (count === 2) {
        while (flags[2]) {
          ;[a, b, c] = [b, c, a]
          flags = [flags[1], flags[2], flags[0]]
        }
        const ab = mid(a, b)
        const bc = mid(b, c)
        out.push(ab, b, bc, a, ab, bc, a, bc, c)
        outDone.push(false, false, false)
      } else {
        const ab = mid(a, b)
        const bc = mid(b, c)
        const ca = mid(c, a)
        out.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca)
        outDone.push(false, false, false, false)
      }
    }
    tris = out
    done = outDone
    if (!split) break
  }
  return tris
}

async function buildMesh(d: string, x0: number, y0: number, w: number, h: number, detail: number): Promise<Mesh> {
  const { R, THICKNESS, ROUND, BEVEL_STEPS, EDGE_BAND } = BADGE
  const edge = BADGE.EDGE * detail
  const faceEdge = BADGE.FACE_EDGE * detail
  const nearEdge = BADGE.NEAR_EDGE * detail
  const zMid = (R + Math.sqrt(R * R - 0.25)) / 2 // centres the dome in depth
  const aspect = h / w
  const verts: number[] = []
  const indices: number[] = []

  /** a vertex over flat (x, y): `depth` back from its own surface, normal from the roll's outward and forward parts; the back mirrors the front through the sheet */
  const emit = (x: number, y: number, depth: number, ox: number, oy: number, out: number, fwd: number, edgeFraction: number, back: boolean) => {
    const s = Math.sqrt(Math.max(R * R - x * x - y * y, 1e-6))
    const f = back ? -fwd : fwd
    const Nx = out * ox + (f * x) / R
    const Ny = out * oy + (f * y) / R
    const Nz = (f * s) / R
    const l = Math.hypot(Nx, Ny, Nz) || 1
    const surface = s - zMid
    verts.push(x, y, back ? surface - THICKNESS - depth : surface + depth, Nx / l, Ny / l, Nz / l, x + 0.5, aspect / 2 - y, edgeFraction)
    return verts.length / STRIDE - 1
  }

  // the rings: the roll, evenly spaced in angle from the face to the outline, then the middle of the side
  const profile = Array.from({ length: BEVEL_STEPS + 1 }, (_, k) => {
    const inset = ROUND * (1 - Math.sin(((k / BEVEL_STEPS) * Math.PI) / 2))
    return { inset, ...roll(inset), edge: inset / EDGE_BAND }
  })
  profile.push({ inset: 0, depth: -THICKNESS / 2, out: 1, fwd: 0, edge: 0 })

  // solid shapes and their holes: a ring inside an odd number of others is a hole, turned clockwise
  const rings = flatten(d, edge * w)
    .map((r) => prepare(r, x0, y0, w, h, edge))
    .filter((r) => r.length >= 3)
  const depthOf = rings.map((r, i) => rings.reduce((n, other, j) => n + (j !== i && contains(other, r[0]) ? 1 : 0), 0))
  const shapes = rings.flatMap((outer, i) =>
    depthOf[i] % 2 ? [] : [{ outer, holes: rings.filter((r, j) => depthOf[j] === depthOf[i] + 1 && contains(outer, r[0])).map((r) => [...r].reverse()) }],
  )

  for (const { outer, holes } of shapes) {
    const loops = [outer, ...holes].map((pts) => ({ pts, mit: mitres(pts) }))
    const nearest = outlineDistance(loops.map((loop) => loop.pts))
    const inset = (loop: (typeof loops)[number], i: number, amount: number): V2 => [
      loop.pts[i][0] - loop.mit[i].m[0] * amount * loop.mit[i].scale,
      loop.pts[i][1] - loop.mit[i].m[1] * amount * loop.mit[i].scale,
    ]

    // the face's flat layout, shared by front and back: each loop's innermost ring, filled around the holes
    const face: V2[] = []
    const holeStarts: number[] = []
    const owner: [number, number][] = []
    const outline = new Set<string>()
    loops.forEach((loop, k) => {
      const start = face.length
      const n = loop.pts.length
      if (k > 0) holeStarts.push(start)
      for (let i = 0; i < n; i++) {
        face.push(inset(loop, i, ROUND))
        owner.push([k, i])
        outline.add(edgeKey(start + i, start + ((i + 1) % n)))
      }
    })
    const ringPoints = face.length
    const dist: number[] = []
    const distOf = (i: number) => (dist[i] ??= nearest(face[i][0], face[i][1]).dist)
    const limit = (a: number, b: number) => (Math.min(distOf(a), distOf(b)) < EDGE_BAND ? nearEdge : faceEdge)
    const tris = await refine(face, earcut(face.flat(), holeStarts), outline, limit)
    const inner = face.map((p, i) => (i < ringPoints ? null : nearest(p[0], p[1])))

    for (const back of [false, true]) {
      await nextTurn()
      const ringIds = loops.map((loop) =>
        profile.map((q) =>
          loop.pts.map((_, i) => {
            const [x, y] = inset(loop, i, q.inset)
            return emit(x, y, q.depth, loop.mit[i].m[0], loop.mit[i].m[1], q.out, q.fwd, q.edge, back)
          }),
        ),
      )
      loops.forEach((loop, k) => {
        const rs = ringIds[k]
        const n = loop.pts.length
        for (let r = 0; r + 1 < rs.length; r++) {
          for (let i = 0; i < n; i++) {
            const j = (i + 1) % n
            const A = rs[r][i]
            const B = rs[r][j]
            const C = rs[r + 1][j]
            const D = rs[r + 1][i]
            if (back) indices.push(A, C, D, A, B, C)
            else indices.push(A, D, C, A, C, B)
          }
        }
      })
      const ids = face.map((p, i) => {
        const near = inner[i]
        if (!near) return ringIds[owner[i][0]][0][owner[i][1]]
        const shape = roll(near.dist)
        return emit(p[0], p[1], shape.depth, near.ox, near.oy, shape.out, shape.fwd, Math.min(near.dist, EDGE_BAND) / EDGE_BAND, back)
      })
      for (let t = 0; t < tris.length; t += 3) {
        if (back) indices.push(ids[tris[t]], ids[tris[t + 2]], ids[tris[t + 1]])
        else indices.push(ids[tris[t]], ids[tris[t + 1]], ids[tris[t + 2]])
      }
    }
  }

  return { vertices: new Float32Array(verts), indices: new Uint32Array(indices) }
}
/* ── end of the mesh ── */

/** meshes by detail, viewBox and path, so a mark on the page twice is built once. The map is
 *  shared on the window by every badge in this family, keyed by the mesh settings too: the
 *  finishes that build the same domed mesh (same BADGE values, same code) build it once between
 *  them, so the Effects page builds four meshes where it built eight (2026-10-01: each build is
 *  a 180 to 490 ms main-thread task on a real GPU). Alone in someone's project it is a plain map. */
const MESHES: Map<string, Promise<Mesh>> = ((globalThis as { __badgeMeshBuilds?: Map<string, Promise<Mesh>> }).__badgeMeshBuilds ??= new Map())
const MESH_SETTINGS = JSON.stringify(BADGE)
function meshFor(d: string, viewBox: string, detail: number) {
  const key = `${MESH_SETTINGS}|${detail}:${viewBox}:${d}`
  let mesh = MESHES.get(key) // a build in flight is shared too
  if (!mesh) {
    const [x0, y0, w, h] = viewBox.split(/[\s,]+/).map(Number)
    mesh = buildMesh(d, x0, y0, w, h, detail)
    MESHES.set(key, mesh)
  }
  return mesh
}

/* ── the shaders ──────────────────────────────────────────────────────────────────────── */

/** the badge: the Figma chrome as a brushed, satin metal on the domed mesh, lit by one light that follows the cursor */
const BADGE_WGSL = /* wgsl */ `
struct Scene {
  view_proj: mat4x4f,
  model: mat4x4f,
  eye: vec4f,   // camera position
  light: vec4f, // xyz: toward the light, w: its strength
  grad: vec4f,  // xy: cos and sin of the gradient's turn toward the cursor, z: art height in widths
  ends: vec4f,  // the Figma gradient's bright end (xy) and dark end (zw), in art widths, y down
}
@group(0) @binding(0) var<uniform> scene: Scene;

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) world: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
  @location(3) edge: f32,
}

@vertex
fn vs_main(@location(0) position: vec3f, @location(1) normal: vec3f, @location(2) uv: vec2f, @location(3) edge: f32) -> VertexOut {
  var out: VertexOut;
  let world = scene.model * vec4f(position, 1.0);
  out.position = scene.view_proj * world;
  out.world = world.xyz;
  out.normal = (scene.model * vec4f(normal, 0.0)).xyz;
  out.uv = uv;
  out.edge = edge;
  return out;
}

// the fill's stops: #fff, #E4E4E4, #C4C4C4, #A0A0A0, #5C5C5C
fn chrome(t: f32) -> vec3f {
  let x = clamp(t, 0.0, 1.0);
  if (x < 0.477953) { return mix(vec3f(1.0), vec3f(0.894), x / 0.477953); }
  if (x < 0.60838) { return mix(vec3f(0.894), vec3f(0.769), (x - 0.477953) / 0.130427); }
  if (x < 0.860602) { return mix(vec3f(0.769), vec3f(0.627), (x - 0.60838) / 0.252222); }
  return mix(vec3f(0.627), vec3f(0.361), (x - 0.860602) / 0.139398);
}

// fine brushed grain, 0..1: soft lines across the art at two scales, attached to the surface
fn hash1(x: f32) -> f32 {
  return fract(sin(x * 127.1) * 43758.5453);
}
fn lines(k: f32) -> f32 {
  let i = floor(k);
  let f = fract(k);
  return mix(hash1(i), hash1(i + 1.0), f * f * (3.0 - 2.0 * f));
}
fn brushed(uv: vec2f) -> f32 {
  return lines(uv.y * 110.0 + uv.x * 9.0) * 0.6 + lines(uv.y * 60.0 - uv.x * 5.0 + 17.0) * 0.4;
}

// handled metal: soft, irregular patches like smudges on a polished surface (smooth 2D value noise)
fn hash2(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
}
fn cloud(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let a = hash2(i);
  let b = hash2(i + vec2f(1.0, 0.0));
  let c = hash2(i + vec2f(0.0, 1.0));
  let d = hash2(i + vec2f(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
fn patches(uv: vec2f) -> f32 {
  let n = cloud(uv * 3.2 + vec2f(3.1, 7.4)) * 0.6 + cloud(uv * 7.5 + vec2f(19.3, 2.7)) * 0.4;
  return smoothstep(0.36, 0.68, n);
}

@fragment
fn fs_main(v: VertexOut) -> @location(0) vec4f {
  let n = normalize(v.normal);
  let view = normalize(scene.eye.xyz - v.world);
  let c = scene.grad.x;
  let s = scene.grad.y;

  // the metal's colour: the Figma gradient, turned about the art's centre so its bright end faces the cursor
  let centre = vec2f(0.5, scene.grad.z * 0.5);
  let q = v.uv - centre;
  let p = vec2f(q.x * c + q.y * s, -q.x * s + q.y * c) + centre;
  let axis = scene.ends.zw - scene.ends.xy;
  let base = chrome(dot(p - scene.ends.xy, axis) / dot(axis, axis));

  // one light, as metal takes it: deep shade away from the light, and a highlight tinted by the
  // metal's own colour, a tight core inside a broad sheen
  let l = normalize(scene.light.xyz);
  let grain = brushed(v.uv);
  let smudge = patches(v.uv);
  var colour = base * (0.34 + 0.76 * max(dot(n, l), 0.0));
  let nh = max(dot(n, normalize(l + view)), 0.0);
  let core = pow(nh, 70.0) * 0.35 * (0.75 + 0.5 * grain) * (1.0 - 0.8 * smudge);
  let sheen = pow(nh, mix(18.0, 6.0, smudge)) * mix(0.22, 0.34, smudge);
  colour += (base * 0.6 + vec3f(0.4)) * (core + sheen) * scene.light.w;

  // what metal mirrors besides the light: the room, lighter above and darker below
  let r = reflect(-view, n);
  colour *= mix(mix(0.72, 1.12, smoothstep(-0.5, 0.7, r.y)), 0.95, 0.5 * smudge);

  // the brushed grain, faint; the smudged patches a touch duller than the clean metal
  colour *= 0.97 + 0.06 * grain;
  colour *= mix(1.03, 0.8, smudge);

  // edge glare: a thin reflected light along the outlines where the surface turns away
  let away = 1.0 - clamp(dot(n, view), 0.0, 1.0);
  let dark = 1.0 - clamp(dot(colour, vec3f(0.333)), 0.0, 1.0);
  colour += vec3f(pow(away, 2.0) * (0.12 + 0.5 * dark) + pow(away, 3.0) * 0.95 * dark);

  // the outline: a light line along the art's edge, strongest where the metal is dark
  let e = clamp(v.edge, 0.0, 1.0);
  let line = 1.0 - smoothstep(0.06, 0.16, e);
  let tail = pow(1.0 - e, 6.0) * 0.35;
  colour += vec3f((line + tail) * (0.14 + 0.66 * dark));

  return vec4f(min(colour, vec3f(1.0)), 1.0);
}
`

/** the present pass: a fullscreen triangle that copies the resolved badge to the canvas. The
    target clears to transparent, so its resolved edges are already premultiplied. */
const PRESENT_WGSL = /* wgsl */ `
struct Out {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}
@vertex
fn vs_main(@builtin(vertex_index) i: u32) -> Out {
  var pos = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var uv = array<vec2f, 3>(vec2f(0.0, 1.0), vec2f(2.0, 1.0), vec2f(0.0, -1.0));
  var out: Out;
  out.position = vec4f(pos[i], 0.0, 1.0);
  out.uv = uv[i];
  return out;
}
@group(0) @binding(0) var scene: texture_2d<f32>;
@group(0) @binding(1) var sceneSampler: sampler;
@group(0) @binding(2) var atlas: texture_2d<f32>;
struct Ascii {
  cell: f32,   // one character cell, in scene pixels
  glyphs: f32, // characters in the atlas, dark to light
  side: f32,   // the scene texture's size, in pixels
  gain: f32,   // brightness to ramp position
  ink: vec4f,  // the character colour
}
@group(0) @binding(3) var<uniform> ascii: Ascii;
// each cell reads the lit surface at its centre, its brightness picks a character, and the
// character is drawn from the atlas across the cell. Empty where the badge is not.
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let px = uv * ascii.side;
  let cell = floor(px / ascii.cell);
  let centre = (cell + 0.5) * ascii.cell / ascii.side;
  let c = textureSampleLevel(scene, sceneSampler, centre, 0.0);
  if (c.a < 0.5) { return vec4f(0.0); }
  let lum = dot(c.rgb, vec3f(0.299, 0.587, 0.114));
  let idx = floor(clamp(lum * ascii.gain, 0.0, 0.999) * ascii.glyphs);
  let f = fract(px / ascii.cell);
  let g = textureSampleLevel(atlas, sceneSampler, vec2f((idx + f.x) / ascii.glyphs, f.y), 0.0);
  return vec4f(ascii.ink.rgb * g.a, g.a);
}
`

/* ── WebGPU: the few calls this file makes, typed here so it builds without @webgpu/types ── */
type GpuBuffer = { destroy(): void }
type GpuTexture = { createView(): object; destroy(): void }
type GpuPipeline = { getBindGroupLayout(index: number): object }
type GpuPass = {
  setPipeline(pipeline: GpuPipeline): void
  setBindGroup(index: number, group: object): void
  setVertexBuffer(slot: number, buffer: GpuBuffer): void
  setIndexBuffer(buffer: GpuBuffer, format: "uint32"): void
  draw(vertices: number): void
  drawIndexed(indices: number): void
  end(): void
}
type GpuColorAttachment = { view: object; resolveTarget?: object; clearValue: number[]; loadOp: "clear"; storeOp: "store" | "discard" }
type GpuDevice = {
  readonly queue: {
    writeBuffer(buffer: GpuBuffer, offset: number, data: Float32Array | Uint32Array): void
    submit(commands: object[]): void
    copyExternalImageToTexture(source: { source: HTMLCanvasElement }, destination: { texture: GpuTexture }, size: [number, number]): void
  }
  readonly lost: Promise<unknown>
  createBuffer(desc: { size: number; usage: number }): GpuBuffer
  createTexture(desc: { size: [number, number]; format: string; usage: number; sampleCount?: number }): GpuTexture
  createSampler(desc: { minFilter: "linear"; magFilter: "linear" }): object
  createShaderModule(desc: { code: string }): object
  createRenderPipelineAsync(desc: object): Promise<GpuPipeline>
  createBindGroup(desc: { layout: object; entries: { binding: number; resource: object }[] }): object
  createCommandEncoder(): {
    beginRenderPass(desc: {
      colorAttachments: GpuColorAttachment[]
      depthStencilAttachment?: { view: object; depthClearValue: number; depthLoadOp: "clear"; depthStoreOp: "discard" }
    }): GpuPass
    finish(): object
  }
  pushErrorScope(filter: "out-of-memory"): void
  popErrorScope(): Promise<unknown>
  destroy(): void
}
type Gpu = { requestAdapter(): Promise<{ requestDevice(): Promise<GpuDevice> } | null>; getPreferredCanvasFormat(): string }
type GpuCanvasContext = { configure(config: { device: GpuDevice; format: string; alphaMode: "premultiplied" }): void; unconfigure(): void; getCurrentTexture(): GpuTexture }

/** GPUBufferUsage and GPUTextureUsage bits */
const BUFFER = { COPY_DST: 0x8, INDEX: 0x10, VERTEX: 0x20, UNIFORM: 0x40 }
const TEXTURE = { COPY_DST: 0x2, TEXTURE_BINDING: 0x4, RENDER_ATTACHMENT: 0x10 }

const webgpu = () => (typeof navigator === "undefined" ? undefined : (navigator as Navigator & { gpu?: Gpu }).gpu)

/* one device for the page, made by the first badge and destroyed with the last, with both
   pipelines compiled once for it */
type Shared = { device: GpuDevice; format: string; badge: GpuPipeline; present: GpuPipeline; sampler: object }
type SharedEntry = { ready: Promise<Shared>; users: number }
let shared: SharedEntry | null = null

async function openGpu(gpu: Gpu): Promise<Shared> {
  const adapter = await gpu.requestAdapter()
  if (!adapter) throw new Error("AsciiBadge: no WebGPU adapter")
  const device = await adapter.requestDevice()
  const format = gpu.getPreferredCanvasFormat()
  const badgeShader = device.createShaderModule({ code: BADGE_WGSL })
  const presentShader = device.createShaderModule({ code: PRESENT_WGSL })
  const [badge, present] = await Promise.all([
    device.createRenderPipelineAsync({
      layout: "auto",
      vertex: {
        module: badgeShader,
        entryPoint: "vs_main",
        buffers: [
          {
            arrayStride: STRIDE * 4,
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x3" },
              { shaderLocation: 1, offset: 12, format: "float32x3" },
              { shaderLocation: 2, offset: 24, format: "float32x2" },
              { shaderLocation: 3, offset: 32, format: "float32" },
            ],
          },
        ],
      },
      fragment: { module: badgeShader, entryPoint: "fs_main", targets: [{ format: "rgba8unorm" }] },
      primitive: { topology: "triangle-list", cullMode: "none" },
      depthStencil: { format: "depth24plus", depthWriteEnabled: true, depthCompare: "less-equal" },
      multisample: { count: 4 },
    }),
    device.createRenderPipelineAsync({
      layout: "auto",
      vertex: { module: presentShader, entryPoint: "vs_main" },
      fragment: { module: presentShader, entryPoint: "fs_main", targets: [{ format }] },
      primitive: { topology: "triangle-list" },
    }),
  ])
  return { device, format, badge, present, sampler: device.createSampler({ minFilter: "linear", magFilter: "linear" }) }
}

function acquireGpu(gpu: Gpu): SharedEntry {
  if (!shared) {
    const entry: SharedEntry = { ready: openGpu(gpu), users: 0 }
    shared = entry
    const forget = () => {
      if (shared === entry) shared = null
    }
    entry.ready.then((g) => g.device.lost.then(forget), forget)
  }
  shared.users++
  return shared
}
function releaseGpu(entry: SharedEntry) {
  entry.users--
  if (entry.users > 0) return
  if (shared === entry) shared = null
  entry.ready.then((g) => g.device.destroy()).catch(() => {})
}

/* 4x4 matrices, column-major */
type M4 = Float32Array
function mul(a: M4, b: M4): M4 {
  const o = new Float32Array(16)
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let sum = 0
      for (let k = 0; k < 4; k++) sum += a[k * 4 + r] * b[c * 4 + k]
      o[c * 4 + r] = sum
    }
  }
  return o
}
/** right-handed rotation about a unit axis */
function rotation(x: number, y: number, z: number, angle: number): M4 {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const k = 1 - c
  // prettier-ignore
  return new Float32Array([
    c + x * x * k, y * x * k + z * s, z * x * k - y * s, 0,
    x * y * k - z * s, c + y * y * k, z * y * k + x * s, 0,
    x * z * k + y * s, y * z * k - x * s, c + z * z * k, 0,
    0, 0, 0, 1,
  ])
}
/** WebGPU clip space (depth 0..1), camera looking down −z */
function perspective(fovy: number, aspect: number, near: number, far: number): M4 {
  const f = 1 / Math.tan(fovy / 2)
  const nf = 1 / (near - far)
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, far * nf, -1, 0, 0, far * near * nf, 0])
}
function translation(x: number, y: number, z: number): M4 {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1])
}

type Renderer = { draw: (m: Motion) => void; dispose: () => void }

/** the badge on `canvas`: the mesh, its buffers and targets on the shared device. `onLost` runs if the device goes away */
/** the glyph atlas: one 32px cell per ramp character, white on clear, the page's monospace */
function paintAtlas(ramp: string): HTMLCanvasElement {
  const CELL = 32
  const c = document.createElement("canvas")
  c.width = CELL * ramp.length
  c.height = CELL
  const ctx = c.getContext("2d")!
  ctx.fillStyle = "#fff"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.font = `600 ${CELL * 0.92}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`
  for (let i = 0; i < ramp.length; i++) ctx.fillText(ramp[i], i * CELL + CELL / 2, CELL / 2 + 1)
  return c
}

async function createRenderer(gpu: Gpu, canvas: HTMLCanvasElement, d: string, viewBox: string, detail: number, ramp: string, cellPx: number, onLost: () => void): Promise<Renderer> {
  const [, , w, h] = viewBox.split(/[\s,]+/).map(Number)
  const aspect = h / w
  const mesh = await meshFor(d, viewBox, detail)
  const entry = acquireGpu(gpu)
  let g: Shared
  try {
    g = await entry.ready
  } catch (error) {
    releaseGpu(entry)
    throw error
  }
  const { device } = g
  const context = canvas.getContext("webgpu") as unknown as GpuCanvasContext | null
  if (!context) {
    releaseGpu(entry)
    throw new Error("AsciiBadge: no WebGPU canvas context")
  }
  let disposed = false
  device.lost.then(() => {
    if (!disposed) onLost()
  })
  context.configure({ device, format: g.format, alphaMode: "premultiplied" })

  const upload = (data: Float32Array | Uint32Array, usage: number) => {
    const buffer = device.createBuffer({ size: data.byteLength, usage: usage | BUFFER.COPY_DST })
    device.queue.writeBuffer(buffer, 0, data)
    return buffer
  }
  const vertices = upload(mesh.vertices, BUFFER.VERTEX)
  const indices = upload(mesh.indices, BUFFER.INDEX)
  const count = mesh.indices.length
  const uniforms = new Float32Array(48) // the Scene struct: two mat4x4f and four vec4f
  const sceneBuffer = device.createBuffer({ size: uniforms.byteLength, usage: BUFFER.UNIFORM | BUFFER.COPY_DST })
  const sceneGroup = device.createBindGroup({ layout: g.badge.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: sceneBuffer } }] })
  const glyphs = Math.max(2, ramp.length)
  const atlasCanvas = paintAtlas(ramp)
  const atlas = device.createTexture({ size: [atlasCanvas.width, atlasCanvas.height], format: "rgba8unorm", usage: TEXTURE.COPY_DST | TEXTURE.TEXTURE_BINDING | TEXTURE.RENDER_ATTACHMENT })
  device.queue.copyExternalImageToTexture({ source: atlasCanvas }, { texture: atlas }, [atlasCanvas.width, atlasCanvas.height])
  const atlasView = atlas.createView()
  const asciiUniforms = new Float32Array(8) // the Ascii struct: four f32 and a vec4f
  const asciiBuffer = device.createBuffer({ size: asciiUniforms.byteLength, usage: BUFFER.UNIFORM | BUFFER.COPY_DST })

  const swayLength = Math.hypot(0.22, 1)
  uniforms.set(mul(perspective(2 * Math.atan(CANVAS_PAD / 2 / CAMERA), 1, 0.1, 20), translation(0, 0, -CAMERA)), 0)
  uniforms.set([0, 0, CAMERA, 1], 32)
  uniforms.set([FILL.x1, FILL.y1 * aspect, FILL.x2, FILL.y2 * aspect], 44)

  /* the offscreen targets, remade when the canvas's pixel size changes: 4x MSAA colour and
     depth, resolved into a texture the present pass samples */
  type Targets = { textures: GpuTexture[]; msaa: object; resolve: object; depth: object; group: object }
  let side = 0
  let targets: Targets | null = null
  const resize = (next: number): Targets => {
    targets?.textures.forEach((t) => t.destroy())
    side = next
    canvas.width = canvas.height = side
    device.pushErrorScope("out-of-memory")
    const texture = (format: string, usage: number, sampleCount: number) => device.createTexture({ size: [side, side], format, usage, sampleCount })
    const msaa = texture("rgba8unorm", TEXTURE.RENDER_ATTACHMENT, 4)
    const resolve = texture("rgba8unorm", TEXTURE.RENDER_ATTACHMENT | TEXTURE.TEXTURE_BINDING, 1)
    const depth = texture("depth24plus", TEXTURE.RENDER_ATTACHMENT, 4)
    device.popErrorScope().then((error) => {
      if (error && !disposed) onLost()
    })
    const group = device.createBindGroup({
      layout: g.present.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: resolve.createView() },
        { binding: 1, resource: g.sampler },
        { binding: 2, resource: atlasView },
        { binding: 3, resource: { buffer: asciiBuffer } },
      ],
    })
    targets = { textures: [msaa, resolve, depth], msaa: msaa.createView(), resolve: resolve.createView(), depth: depth.createView(), group }
    return targets
  }

  return {
    draw(m) {
      if (disposed) return
      const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1))
      const next = Math.max(1, Math.round(canvas.clientWidth * dpr))
      const t = next === side && targets ? targets : resize(next)
      // the sway axis is rotate3d(0.22, 1, 0) in the page's y-down space; y up flips its x
      const model = mul(rotation(1, 0, 0, -m.rx * RAD), mul(rotation(0, 1, 0, (m.ry + m.flip) * RAD), rotation(-0.22 / swayLength, 1 / swayLength, 0, m.sway * RAD)))
      const ll = Math.hypot(m.lx, m.ly, m.lz) || 1
      uniforms.set(model, 16)
      uniforms.set([m.lx / ll, m.ly / ll, m.lz / ll, 1], 36)
      uniforms.set([Math.cos(m.light * RAD), Math.sin(m.light * RAD), aspect, 0], 40)
      device.queue.writeBuffer(sceneBuffer, 0, uniforms)
      // the cell in scene pixels, and the ink for this theme
      const dark = document.documentElement.classList.contains("dark") || !document.documentElement.classList.contains("light")
      asciiUniforms.set([Math.max(3, Math.round(cellPx * dpr)), glyphs, side, 1.25, ...(dark ? [0.92, 0.93, 0.95, 1] : [0.08, 0.08, 0.1, 1])])
      device.queue.writeBuffer(asciiBuffer, 0, asciiUniforms)
      const encoder = device.createCommandEncoder()
      const scene = encoder.beginRenderPass({
        colorAttachments: [{ view: t.msaa, resolveTarget: t.resolve, clearValue: [0, 0, 0, 0], loadOp: "clear", storeOp: "discard" }],
        depthStencilAttachment: { view: t.depth, depthClearValue: 1, depthLoadOp: "clear", depthStoreOp: "discard" },
      })
      scene.setPipeline(g.badge)
      scene.setBindGroup(0, sceneGroup)
      scene.setVertexBuffer(0, vertices)
      scene.setIndexBuffer(indices, "uint32")
      scene.drawIndexed(count)
      scene.end()
      const present = encoder.beginRenderPass({
        colorAttachments: [{ view: context.getCurrentTexture().createView(), clearValue: [0, 0, 0, 0], loadOp: "clear", storeOp: "store" }],
      })
      present.setPipeline(g.present)
      present.setBindGroup(0, t.group)
      present.draw(3)
      present.end()
      device.queue.submit([encoder.finish()])
    },
    dispose() {
      if (disposed) return
      disposed = true
      vertices.destroy()
      indices.destroy()
      sceneBuffer.destroy()
      targets?.textures.forEach((t) => t.destroy())
      try {
        atlas.destroy()
        context.unconfigure()
      } catch {
        /* the device may already be gone */
      }
      releaseGpu(entry)
    },
  }
}

/* the stage CSS, scoped by the abadge- prefix. On a light page the metal is taken down to
   glossy black (brightness, then contrast) so it stays visible on white; `.dark` turns that
   off. The fallback's sheen sweeps on the sway's 8s clock, brightest mid-face, and fades out
   (300ms, smooth-out) while the cursor drives the light. It is painted, not composited (its
   sweep, pulse and fade are a background position and two registered numbers), so the flat
   face stays one layer. */
const CSS = `
@property --abadge-a{syntax:"<number>";inherits:false;initial-value:0.35}
@property --abadge-on{syntax:"<number>";inherits:false;initial-value:1}
.abadge-art{color:#141416}
.dark .abadge-art{color:#ebecf0}
.abadge-sheen{--abadge-a:0.35;--abadge-on:1;background:linear-gradient(100deg,transparent 32%,rgb(255 255 255/calc(0.85*var(--abadge-a)*var(--abadge-on))) 50%,transparent 68%) 130% 0/220% 100% no-repeat;transition:--abadge-on 300ms cubic-bezier(0.22,1,0.36,1);animation:abadge-light 8s ease-in-out infinite}
@keyframes abadge-light{0%,100%{background-position:130% 0;--abadge-a:0.35}25%,75%{--abadge-a:0.7}50%{background-position:-30% 0;--abadge-a:0.35}}
@media (prefers-reduced-motion:reduce){.abadge-sheen{display:none}}
`

/** the default mark: the ssych library mark, in its own 437.287 × 529.764 box */
const DEFAULT_MARK = {
  vb: "0 0 437.287 529.764",
  d: "M354.084 0C374.63 8.50833 392.5 23.8578 403.922 44.9326C418.809 72.4024 419.569 103.739 408.683 130.599C372.855 219 258.635 211.309 206.626 211.71C145.919 212.178 96.2825 259.131 91.5504 318.731C95.9969 371.278 140.054 412.539 193.751 412.539C250.399 412.539 296.322 366.615 296.322 309.967C296.322 285.118 287.485 262.333 272.784 244.583C323.926 247.005 407.022 268.509 437.287 366.686C413.233 460.456 328.149 529.763 226.877 529.764C175.525 529.764 128.335 511.943 91.1539 482.149C67.7037 480.784 45.3008 488.644 28.0719 502.979C-6.1077 470.701 -9.49672 415.736 20.2223 379.638C12.3178 355.271 9.66566 330.28 9.66566 304.795C9.6658 186.402 110.21 87.5845 226.877 87.584C253.145 87.584 278.167 88.1909 302.354 75.083C331.715 59.1705 349.967 30.7466 354.084 0Z",
}

export function AsciiBadge({ path = DEFAULT_MARK.d, viewBox = DEFAULT_MARK.vb, size = 120, flip = true, sway = true, label = "ASCII badge", pose, ramp = " .,:;-~=+*oxX#%@", cell = 5, className }: AsciiBadgeProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "")
  const [x0, y0, w, h] = viewBox.split(/[\s,]+/).map(Number)
  const strokeBase = `translate(${x0 + STROKE.tx * w} ${y0 + STROKE.ty * h}) rotate(${STROKE.rotate}) scale(${STROKE.sx * w} ${STROKE.sy * h})`

  const rootRef = useRef<HTMLDivElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const faceRef = useRef<HTMLDivElement>(null)
  const fillRef = useRef<SVGLinearGradientElement>(null)
  const strokeRef = useRef<SVGRadialGradientElement>(null)
  const sheenRef = useRef<HTMLSpanElement>(null)
  const driverRef = useRef<Driver | null>(null)
  const [renderer, setRenderer] = useState<"gpu" | "fallback">("gpu")
  const [reduced, setReduced] = useState(false)
  const poseKey = pose ? pose.join(",") : ""
  const still = reduced || poseKey !== ""
  const flippable = flip && !still

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches)
  }, [])

  useEffect(() => {
    const root = rootRef.current
    const box = boxRef.current
    if (!root || !box) return
    const gpu = renderer === "gpu" ? webgpu() : undefined
    if (renderer === "gpu" && !gpu) {
      setRenderer("fallback")
      return
    }
    const [vx, vy, vw, vh] = viewBox.split(/[\s,]+/).map(Number)
    let cancelled = false
    const fail = (error?: unknown) => {
      if (cancelled) return
      if (error) console.warn("AsciiBadge: WebGPU stopped, showing the flat mark", error)
      setRenderer("fallback")
    }

    let draw: ((m: Motion) => void) | null = null
    const driver = createDriver({
      root,
      hit: box,
      pose: poseKey ? poseKey.split(",").map(Number) : undefined,
      sway,
      still,
      flip: flippable,
      baseDeg: Math.atan2((FILL.y1 - FILL.y2) * vh, (FILL.x1 - FILL.x2) * vw) / RAD,
      draw: (m) => draw?.(m),
      onError: fail,
    })
    driverRef.current = driver
    let near = false
    const sync = () => driver.setActive(near && draw !== null)

    let canvas: HTMLCanvasElement | null = null
    let gpuRenderer: Renderer | null = null
    let started = false
    if (gpu) {
      // a canvas per renderer: a WebGPU canvas is configured once, and one renderer shutting
      // down (React's strict-mode double mount does this) would unconfigure it under the next
      canvas = document.createElement("canvas")
      canvas.setAttribute("aria-hidden", "true")
      canvas.className = "abadge-art"
      Object.assign(canvas.style, { position: "absolute", left: "50%", top: "50%", width: `${CANVAS_PAD * 100}%`, aspectRatio: "1", transform: "translate(-50%, -50%)", pointerEvents: "none" })
      box.appendChild(canvas)
    } else {
      // the flat chrome face: one layer, turned whole, its gradients turned toward the cursor
      const face = faceRef.current
      const fill = fillRef.current
      const stroke = strokeRef.current
      const sheen = sheenRef.current
      const cx = vx + vw / 2
      const cy = vy + vh / 2
      let light = Number.NaN
      if (face)
        draw = (m) => {
          face.style.transform = `perspective(${(size * CAMERA).toFixed(1)}px) rotateX(${m.rx.toFixed(2)}deg) rotateY(${(m.ry + m.flip).toFixed(2)}deg) rotate3d(0.22, 1, 0, ${m.sway.toFixed(2)}deg)`
          if (!(Math.abs(m.light - light) < 0.05)) {
            light = m.light
            const turn = `rotate(${light.toFixed(2)} ${cx} ${cy})`
            fill?.setAttribute("gradientTransform", turn)
            stroke?.setAttribute("gradientTransform", `${turn} ${strokeBase}`)
          }
          sheen?.style.setProperty("--abadge-on", m.hover ? "0" : "1")
        }
    }

    const io = new IntersectionObserver(
      ([e]) => {
        near = e.isIntersecting
        if (near && gpu && canvas && !started) {
          started = true
          createRenderer(gpu, canvas, path, viewBox, size < 100 ? 1.6 : 1, ramp, cell, () => fail(new Error("device lost")))
            .then((r) => {
              if (cancelled) r.dispose()
              else {
                gpuRenderer = r
                draw = r.draw
                sync()
              }
            })
            .catch(fail)
        }
        sync()
      },
      { rootMargin: "20% 0px" },
    )
    io.observe(root)
    const resized = canvas ? new ResizeObserver(() => driver.redraw()) : null
    if (canvas) resized?.observe(canvas)

    return () => {
      cancelled = true
      io.disconnect()
      resized?.disconnect()
      driver.dispose()
      driverRef.current = null
      gpuRenderer?.dispose()
      canvas?.remove()
    }
  }, [renderer, path, viewBox, size, sway, still, flippable, poseKey, strokeBase, ramp, cell])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Enter" && e.key !== " ") return
    e.preventDefault()
    if (!e.repeat) driverRef.current?.turn()
  }
  // a click with no pointer behind it (detail 0) comes from assistive tech: flip, as Enter does
  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.detail === 0) driverRef.current?.turn()
  }
  const button = flippable ? { role: "button", tabIndex: 0, "aria-label": label, onKeyDown, onClick } : {}

  return (
    <div
      ref={rootRef}
      data-renderer={renderer}
      aria-hidden={flippable ? undefined : true}
      {...button}
      className={cn("relative flex items-center justify-center p-8", flippable && "rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
    >
      <style>{CSS}</style>
      <div ref={boxRef} className={cn("relative select-none", flippable && "cursor-pointer")} style={{ width: size, aspectRatio: `${w} / ${h}`, touchAction: flippable ? "pan-y" : undefined }}>
        {renderer === "fallback" && (
          <div ref={faceRef} className="abadge-art absolute inset-0">
            <svg viewBox={viewBox} aria-hidden="true" className="absolute inset-0 block size-full overflow-visible">
              <defs>
                <pattern id={`mbp-${uid}`} patternUnits="userSpaceOnUse" width={w / 22} height={w / 22}>
                  <text x={w / 44} y={w / 44} textAnchor="middle" dominantBaseline="central" fontFamily="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" fontWeight={600} fontSize={w / 24} fill="currentColor">
                    #
                  </text>
                </pattern>
                <linearGradient ref={fillRef} id={`mbf-${uid}`} x1={x0 + FILL.x1 * w} y1={y0 + FILL.y1 * h} x2={x0 + FILL.x2 * w} y2={y0 + FILL.y2 * h} gradientUnits="userSpaceOnUse">
                  {FILL.stops.map(([o, c]) => (
                    <stop key={o} offset={o} stopColor={c} />
                  ))}
                </linearGradient>
                <radialGradient ref={strokeRef} id={`mbs-${uid}`} cx={0} cy={0} r={1} gradientUnits="userSpaceOnUse" gradientTransform={strokeBase}>
                  {STROKE.stops.map(([o, c]) => (
                    <stop key={o} offset={o} stopColor={c} />
                  ))}
                </radialGradient>
              </defs>
              <path d={path} fill={`url(#mbp-${uid})`} />
            </svg>
          </div>
        )}
      </div>
    </div>
  )
}
