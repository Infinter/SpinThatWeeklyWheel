'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParticipants } from '@/lib/store/participants-store'
import { ScheduleTimeline } from '@/components/ScheduleTimeline'
import { SpinWheel } from '@/components/SpinWheel'
import { buildWheelSegments } from '@/lib/ui/wheel'
import { buildColorIndexMap } from '@/lib/ui/participant-colors'
import {
  CHAIN_DELAY_MS,
  ctaLabelFor,
  isCtaDisabled,
  isRotationComplete,
  shouldChainNext,
  type SpinMode,
} from '@/lib/ui/spin-mode'
import { formatDateFr } from '@/lib/format/date-fr'

// Carte Résultat (Story 4.3, FR12 ; timeline Story 5.3 ; ROUE Story 5.4, FR16/UX-DR9 ; DEUX MODES
// Story 5.5, FR16/axe A). UI pure : tout passe par le store (AD-11). 4.3 met en FORME le résultat
// (compteur, avertissement non-planifiés, états vides). 5.3 a remplacé le tableau par la timeline. 5.4
// fait de ce composant l'ORCHESTRATEUR de la révélation (curseur `revealedCount`, roue pilotée). 5.5
// ajoute le SÉLECTEUR DE MODE :
//   - « Rotation complète » : enchaîne automatiquement les révélations (~600 ms entre chaque) jusqu'au
//     message de fin ;
//   - « Jour le jour » : un clic révèle un seul jour, le CTA évoluant « premier » → « suivant » → « ✓ ».
//
// PRINCIPE DIRECTEUR (UX-DR9) : `generateSchedule` est la source de vérité ; la roue ne fait que RÉVÉLER
// le résultat (animation ≡ planning). L'état de révélation reste LOCAL et éphémère (la persistance « jour
// le jour » est l'objet de 5.6). Les libellés/booléens du CTA viennent du cœur pur `lib/ui/spin-mode.ts`.
// Le gel final de la microcopie/branding (favicon, titres contextuels) reste à 5.8.

export function ScheduleResult() {
  const { schedule, generate, participants } = useParticipants()
  const activeCount = participants.filter((p) => p.active).length
  const canGenerate = activeCount > 0

  // Mode de révélation (Story 5.5). Défaut = « Rotation complète » (spec UX autoritaire, mockup:295).
  const [mode, setMode] = useState<SpinMode>('rotation-complete')

  // État de révélation (local, éphémère). `spinNonce` : toute incrémentation déclenche un spin dans la
  // roue. `busy` : une animation/un enchaînement est en cours (CTA désactivé + aria-busy). `justRevealedDate`
  // : cellule à animer (pop/halo). `revealMessage` : annonce de la région live.
  const [revealedCount, setRevealedCount] = useState(0)
  const [spinNonce, setSpinNonce] = useState(0)
  const [busy, setBusy] = useState(false)
  const [justRevealedDate, setJustRevealedDate] = useState<string | null>(null)
  const [revealMessage, setRevealMessage] = useState('')
  const justPickedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Minuteur d'enchaînement « Rotation complète » (~600 ms entre deux spins) — annulé au reset/démontage.
  const chainTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Demande de spin automatique du 1er jour juste après une (re)génération (state, pas ref : lisible et
  // ajustable pendant le rendu via le pattern « ajuster l'état pendant le rendu »).
  const [autoSpin, setAutoSpin] = useState(false)

  const planningLen = schedule?.planning.length ?? 0
  // Contrat couleur partagé 5.3 : index = position dans les ACTIFS (ordre du store). Réutilisé tel quel.
  // Mémoïsé pour ne pas recalculer/redessiner à chaque rendu (stable tant que schedule/participants ne
  // changent pas).
  const segments = useMemo(
    () => buildWheelSegments(schedule?.planning ?? [], buildColorIndexMap(participants.filter((p) => p.active))),
    [schedule, participants],
  )

  // RESET + auto-spin à chaque NOUVEAU schedule, via le pattern React « ajuster l'état pendant le rendu »
  // (garde sur la valeur précédente — PAS un effet, donc aucun setState-in-effect). `generate()` repose un
  // nouveau résultat (nouveau seed) ⇒ on remet la révélation à zéro, et si un spin auto a été demandé par
  // le CTA, on amorce le PREMIER spin dès que le plan est prêt (l'enchaînement éventuel est décidé ensuite
  // par handleRevealed selon le mode).
  const [prevSchedule, setPrevSchedule] = useState(schedule)
  if (schedule !== prevSchedule) {
    setPrevSchedule(schedule)
    setRevealedCount(0)
    setBusy(false)
    setJustRevealedDate(null)
    setRevealMessage('')
    if (autoSpin && schedule && schedule.planning.length > 0) {
      setAutoSpin(false)
      setBusy(true)
      setSpinNonce((n) => n + 1)
    } else if (autoSpin) {
      setAutoSpin(false)
    }
  }

  // Nettoyage des minuteurs (halo + enchaînement) au démontage.
  useEffect(
    () => () => {
      if (justPickedTimer.current) clearTimeout(justPickedTimer.current)
      if (chainTimer.current) clearTimeout(chainTimer.current)
    },
    [],
  )

  const rotationComplete = isRotationComplete(revealedCount, planningLen)

  // Reset propre de la révélation (curseur à 0, roue/timeline à l'état initial, enchaînement annulé).
  // Le plan (`schedule`) n'est PAS recalculé : seul le curseur repart de zéro.
  const resetReveal = useCallback(() => {
    setRevealedCount(0)
    setBusy(false)
    setJustRevealedDate(null)
    setRevealMessage('')
    if (justPickedTimer.current) {
      clearTimeout(justPickedTimer.current)
      justPickedTimer.current = null
    }
    if (chainTimer.current) {
      clearTimeout(chainTimer.current)
      chainTimer.current = null
    }
  }, [])

  // Changement de mode (AC-6) : bascule + reset propre. Aucun `generate()` (le plan reste).
  const switchMode = useCallback(
    (next: SpinMode) => {
      if (next === mode) return
      setMode(next)
      resetReveal()
    },
    [mode, resetReveal],
  )

  // Navigation clavier du tablist (AC-2) : ←/→ basculent le mode (deux onglets ⇒ les deux flèches
  // alternent) puis focalisent l'onglet actif. Entrée/Espace sont gérés nativement par <button>.
  const onTabKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      e.preventDefault()
      const next: SpinMode = mode === 'rotation-complete' ? 'jour-le-jour' : 'rotation-complete'
      switchMode(next)
      const id = next === 'rotation-complete' ? 'mode-rotation' : 'mode-jour'
      if (typeof document !== 'undefined') document.getElementById(id)?.focus()
    },
    [mode, switchMode],
  )

  // CTA — un seul bouton, libellé piloté par le mode/curseur (cœur pur). Si aucun plan ou rotation
  // terminée → (re)génère, puis le pattern de rendu amorce le 1er spin. Sinon (« Jour le jour » en cours,
  // car en « Rotation complète » le bouton est désactivé pendant l'enchaînement) → un spin de plus.
  const handleSpin = useCallback(() => {
    if (schedule === null || revealedCount >= schedule.planning.length) {
      setAutoSpin(true)
      generate()
    } else {
      setBusy(true)
      setSpinNonce((n) => n + 1)
    }
  }, [schedule, revealedCount, generate])

  // Fin d'animation : avance le curseur, déclenche pop/halo + annonce live, puis décide de la suite selon
  // le mode. « Rotation complète » : tant qu'il reste des jours, on RESTE busy et on programme le spin
  // suivant (~600 ms ; 0 ms sous reduced-motion — option A). Sinon on débloque le CTA et, à la complétion,
  // on annonce le message de fin (les deux modes). Appelé depuis la boucle d'animation de la roue (callback
  // rAF / chemin reduced-motion), jamais depuis un effet.
  const handleRevealed = useCallback(
    (slotIndex: number) => {
      const nextCount = slotIndex + 1
      setRevealedCount(nextCount)
      const r = schedule?.planning[slotIndex]
      if (r) {
        setJustRevealedDate(r.date)
        setRevealMessage(`${r.name} animera le standup du ${formatDateFr(r.date)}`)
        if (justPickedTimer.current) clearTimeout(justPickedTimer.current)
        justPickedTimer.current = setTimeout(() => setJustRevealedDate(null), 900)
      }
      const len = schedule?.planning.length ?? 0
      if (shouldChainNext(mode, nextCount, len)) {
        // « Rotation complète » : enchaîner le jour suivant ; le CTA reste désactivé (busy inchangé).
        const reduced =
          typeof window !== 'undefined' &&
          typeof window.matchMedia === 'function' &&
          window.matchMedia('(prefers-reduced-motion: reduce)').matches
        if (chainTimer.current) clearTimeout(chainTimer.current)
        chainTimer.current = setTimeout(() => setSpinNonce((n) => n + 1), reduced ? 0 : CHAIN_DELAY_MS)
      } else {
        setBusy(false)
        if (isRotationComplete(nextCount, len)) {
          setRevealMessage('Rotation complète ! Chacun anime une fois.')
        }
      }
    },
    [schedule, mode],
  )

  // Bloc d'avertissement « non planifiés » : raison GÉNÉRIQUE collective (pas de cause par personne —
  // le domaine renvoie {id,name}, et recalculer la cause côté UI dupliquerait isPersonUnavailable /
  // isTeamNonSessionDay hors du domaine, ce qu'AD-1/AD-3 interdisent). Réutilisé dans deux états.
  const unscheduledWarning =
    schedule && schedule.unscheduled.length > 0 ? (
      <div className="schedule-warning" role="status">
        <p className="schedule-warning-title">
          Non planifié{schedule.unscheduled.length > 1 ? 's' : ''} :{' '}
          {schedule.unscheduled.map((u) => u.name).join(', ')}
        </p>
        <p className="schedule-warning-reason">
          Ces participants n&apos;ont pas pu être placés : indisponibles sur la
          période, ou les placer aurait créé un jour sans animateur.
        </p>
      </div>
    ) : null

  return (
    <div className="schedule">
      {/* Sélecteur de mode (Story 5.5, AC-1/2) : deux onglets, navigation ←/→, reset au changement. */}
      <div className="modes" role="tablist" aria-label="Mode de sélection" onKeyDown={onTabKeyDown}>
        <button
          type="button"
          role="tab"
          id="mode-rotation"
          aria-selected={mode === 'rotation-complete'}
          tabIndex={mode === 'rotation-complete' ? 0 : -1}
          className={mode === 'rotation-complete' ? 'sel' : undefined}
          onClick={() => switchMode('rotation-complete')}
        >
          Rotation complète
        </button>
        <button
          type="button"
          role="tab"
          id="mode-jour"
          aria-selected={mode === 'jour-le-jour'}
          tabIndex={mode === 'jour-le-jour' ? 0 : -1}
          className={mode === 'jour-le-jour' ? 'sel' : undefined}
          onClick={() => switchMode('jour-le-jour')}
        >
          Jour le jour
        </button>
      </div>

      <div className="schedule-actions">
        <button
          type="button"
          onClick={handleSpin}
          disabled={!canGenerate || isCtaDisabled(mode, revealedCount, planningLen, busy)}
          aria-busy={busy}
        >
          {ctaLabelFor(mode, revealedCount, planningLen)}
        </button>
        {!canGenerate && (
          <span className="card-empty">Ajoutez au moins un participant actif.</span>
        )}
      </div>

      {schedule === null ? (
        <p className="card-empty">
          Cliquez sur « {ctaLabelFor(mode, 0, 0)} » pour générer le planning.
        </p>
      ) : schedule.planning.length > 0 ? (
        <div className="schedule-result">
          <div className="schedule-header">
            <span className="schedule-header-label">Planning</span>
            <span className="schedule-count">
              {schedule.planning.length} session
              {schedule.planning.length > 1 ? 's' : ''}
            </span>
          </div>

          {/* Roue : visible tant que la rotation n'est pas révélée en entier. */}
          {!rotationComplete && (
            <SpinWheel
              segments={segments}
              revealedCount={revealedCount}
              onRevealed={handleRevealed}
              spinNonce={spinNonce}
            />
          )}

          {/* Région live : la révélation est annoncée ici (le canvas est aria-hidden, UX-DR13). */}
          <p className="reveal" role="status" aria-live="polite">
            {revealMessage}
          </p>

          <ScheduleTimeline revealedCount={revealedCount} justRevealedDate={justRevealedDate} />

          {unscheduledWarning}
        </div>
      ) : schedule.unscheduled.length > 0 ? (
        <div className="schedule-result">
          <p className="card-empty">Aucune session planifiée.</p>
          {unscheduledWarning}
        </div>
      ) : (
        <p className="card-empty">Aucun participant n&apos;a pu être planifié.</p>
      )}
    </div>
  )
}
