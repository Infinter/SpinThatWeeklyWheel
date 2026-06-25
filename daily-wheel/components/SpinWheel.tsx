'use client'

import { useEffect, useRef } from 'react'
import {
  segmentAngle,
  easeOutCubic,
  finalAngle,
  targetIndexInRemaining,
  remainingSegments,
  type WheelSegment,
} from '@/lib/ui/wheel'
import { colorForIndex } from '@/lib/ui/participant-colors'
import { useTheme } from '@/components/theme'

// Roue animée (Story 5.4, UX-DR9). Composant CLIENT « bête » : piloté par props, sans store ni domaine
// (AD-11). Il DESSINE le résultat déjà calculé et, au spin, oriente la roue vers le segment de l'animateur
// que l'EDF a désigné — il ne tire RIEN (UX-DR9). Le `<canvas>` est `aria-hidden` : l'info passe par la
// région live et la timeline (a11y gérée par le parent `ScheduleResult`, UX-DR13).
//
// Géométrie/easing/cible = helpers PURS de `lib/ui/wheel.ts` (testés). Ici : seulement l'impératif canvas
// (requestAnimationFrame, dessin, branche prefers-reduced-motion) — non testable sous Vitest (pas de jsdom).

// Backing canvas 560×560, affiché 280×280 par CSS (DPR 2 sans ctx.scale — on dessine à 2×, mockup l. 432-435).
const BACKING = 560
const R = 280
const CX = 280
const CY = 280
const DURATION_MS = 1200

export type SpinWheelProps = {
  /** Animateurs à révéler, ordre chronologique (= buildWheelSegments(planning)). */
  segments: WheelSegment[]
  /** Nb déjà révélés (ordre chronologique). Le prochain à révéler = segments[revealedCount]. */
  revealedCount: number
  /** Appelé en fin d'animation avec l'index du slot révélé (le parent incrémente revealedCount). */
  onRevealed: (slotIndex: number) => void
  /** Sentinelle de déclenchement : toute incrémentation (> 0) lance un spin. */
  spinNonce: number
}

export function SpinWheel({ segments, revealedCount, onRevealed, spinNonce }: SpinWheelProps) {
  const theme = useTheme() // redessine au changement de thème (le fond du canvas suit --background)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const angleRef = useRef(0) // angle courant de la roue (persiste entre spins ; écrit en effet seulement)
  const rafRef = useRef<number | null>(null)

  function draw(rot: number, remaining: WheelSegment[]) {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, BACKING, BACKING)

    const n = remaining.length
    if (n === 0) {
      ctx.beginPath()
      ctx.arc(CX, CY, R - 8, 0, Math.PI * 2)
      // Fond du disque vide = couleur de page (suit le thème clair/sombre via le token --background).
      ctx.fillStyle =
        getComputedStyle(document.documentElement).getPropertyValue('--background').trim() || '#eef4fb'
      ctx.fill()
      return
    }

    const seg = segmentAngle(n)
    for (let i = 0; i < n; i++) {
      const a0 = rot + i * seg
      const a1 = a0 + seg
      ctx.beginPath()
      ctx.moveTo(CX, CY)
      ctx.arc(CX, CY, R - 8, a0, a1)
      ctx.closePath()
      ctx.fillStyle = colorForIndex(remaining[i].colorIndex)
      ctx.fill()
      // Nom écrit radialement, en blanc, au milieu du segment.
      ctx.save()
      ctx.translate(CX, CY)
      ctx.rotate(a0 + seg / 2)
      ctx.textAlign = 'right'
      ctx.fillStyle = '#fff'
      ctx.font = "700 26px 'Segoe UI', system-ui, sans-serif"
      ctx.fillText(remaining[i].name, R - 38, 9)
      ctx.restore()
    }
  }

  // Redessin (sans animation) à chaque changement d'état : montage, retrait d'un segment révélé, reset.
  useEffect(() => {
    draw(angleRef.current, remainingSegments(segments, revealedCount))
  }, [segments, revealedCount, theme])

  // Spin : déclenché par toute incrémentation de spinNonce (> 0). Oriente la roue vers le segment de
  // l'animateur EDF du jour courant (segments[revealedCount]) — calcul déterministe, aucun hasard.
  useEffect(() => {
    if (spinNonce <= 0) return

    // Valeurs du rendu qui a incrémenté spinNonce (= état au moment du déclenchement) : correctes par
    // closure (le parent pose busy + nonce avec le revealedCount courant).
    const remaining = remainingSegments(segments, revealedCount)
    const slotIndex = revealedCount
    const target = segments[slotIndex]
    if (!target || remaining.length === 0) {
      // Rien à révéler (défensif) : on signale quand même la fin pour ne pas bloquer le parent.
      onRevealed(slotIndex)
      return
    }

    const n = remaining.length
    const targetIdx = targetIndexInRemaining(remaining, target.participantId)
    const start = angleRef.current
    const turns = (4 + (slotIndex % 3)) * Math.PI * 2 // 4 à 6 tours, varié sans hasard (mockup l. 472)
    const end = finalAngle(start, targetIdx < 0 ? 0 : targetIdx, n, turns)

    // prefers-reduced-motion : saut DIRECT au résultat, aucune rotation (UX-DR13).
    const reduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (reduced) {
      angleRef.current = end
      draw(end, remaining)
      onRevealed(slotIndex)
      return
    }

    let t0: number | null = null
    const frame = (ts: number) => {
      if (t0 === null) t0 = ts
      const p = Math.min(1, (ts - t0) / DURATION_MS)
      angleRef.current = start + (end - start) * easeOutCubic(p)
      draw(angleRef.current, remaining)
      if (p < 1) {
        rafRef.current = requestAnimationFrame(frame)
      } else {
        angleRef.current = end
        draw(end, remaining)
        rafRef.current = null
        onRevealed(slotIndex)
      }
    }
    rafRef.current = requestAnimationFrame(frame)

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinNonce])

  return (
    <div className="wheel-stage">
      <canvas
        ref={canvasRef}
        className="wheel"
        width={BACKING}
        height={BACKING}
        aria-hidden="true"
      />
      <div className="pointer" aria-hidden="true" />
      <div className="hub" aria-hidden="true">
        🎡
      </div>
    </div>
  )
}
