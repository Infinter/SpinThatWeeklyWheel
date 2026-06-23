'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParticipants } from '@/lib/store/participants-store'
import { ScheduleTimeline } from '@/components/ScheduleTimeline'
import { SpinWheel } from '@/components/SpinWheel'
import { buildWheelSegments } from '@/lib/ui/wheel'
import { buildColorIndexMap } from '@/lib/ui/participant-colors'
import { formatDateFr } from '@/lib/format/date-fr'

// Carte Résultat (Story 4.3, FR12 ; timeline Story 5.3 ; ROUE Story 5.4, FR16/UX-DR9). UI pure : tout
// passe par le store (AD-11). 4.3 met en FORME le résultat (compteur, avertissement non-planifiés en
// raison GÉNÉRIQUE, états vides). 5.3 a remplacé le tableau par la timeline. 5.4 fait de ce composant
// l'ORCHESTRATEUR de la révélation : il calcule le plan via `generate()` (inchangé), puis pilote la roue
// et la timeline avec un curseur `revealedCount`.
//
// PRINCIPE DIRECTEUR (UX-DR9) : `generateSchedule` est la source de vérité ; la roue ne fait que RÉVÉLER
// le résultat (animation ≡ planning). L'état de révélation est LOCAL et éphémère (pas de persistance —
// c'est l'objet de 5.6). Le sélecteur de mode + l'enchaînement « Rotation complète » + les libellés CTA
// évolutifs + le message de fin sont DIFFÉRÉS à 5.5. Le texte du bouton reste gelé pour 5.8.

export function ScheduleResult() {
  const { schedule, generate, participants } = useParticipants()
  const activeCount = participants.filter((p) => p.active).length
  const canGenerate = activeCount > 0

  // État de révélation (local, éphémère). `spinNonce` : toute incrémentation déclenche un spin dans la
  // roue. `busy` : une animation est en cours (CTA désactivé + aria-busy). `justRevealedDate` : cellule
  // à animer (pop/halo). `revealMessage` : annonce de la région live.
  const [revealedCount, setRevealedCount] = useState(0)
  const [spinNonce, setSpinNonce] = useState(0)
  const [busy, setBusy] = useState(false)
  const [justRevealedDate, setJustRevealedDate] = useState<string | null>(null)
  const [revealMessage, setRevealMessage] = useState('')
  const justPickedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
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
  // le CTA, on l'amorce dès que le plan est prêt.
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

  // Nettoyage du minuteur du halo « justpicked » au démontage.
  useEffect(
    () => () => {
      if (justPickedTimer.current) clearTimeout(justPickedTimer.current)
    },
    [],
  )

  const rotationComplete = schedule !== null && revealedCount >= planningLen

  // CTA — un seul bouton (texte gelé 5.8). Une activation = une révélation (baseline « jour le jour » ;
  // les modes/enchaînement sont 5.5). Si aucun plan ou rotation terminée → (re)génère, puis le pattern de
  // rendu ci-dessus amorce automatiquement le 1er spin une fois le nouveau plan prêt (auto-spin).
  const handleSpin = useCallback(() => {
    if (schedule === null || revealedCount >= schedule.planning.length) {
      setAutoSpin(true)
      generate()
    } else {
      setBusy(true)
      setSpinNonce((n) => n + 1)
    }
  }, [schedule, revealedCount, generate])

  // Fin d'animation : avance le curseur, débloque le CTA, déclenche pop/halo + annonce live. Appelé depuis
  // la boucle d'animation de la roue (callback rAF / chemin reduced-motion), jamais depuis un effet.
  const handleRevealed = useCallback(
    (slotIndex: number) => {
      setRevealedCount(slotIndex + 1)
      setBusy(false)
      const r = schedule?.planning[slotIndex]
      if (!r) return
      setJustRevealedDate(r.date)
      setRevealMessage(`${r.name} animera le standup du ${formatDateFr(r.date)}`)
      if (justPickedTimer.current) clearTimeout(justPickedTimer.current)
      justPickedTimer.current = setTimeout(() => setJustRevealedDate(null), 900)
    },
    [schedule],
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
      <div className="schedule-actions">
        <button type="button" onClick={handleSpin} disabled={!canGenerate || busy} aria-busy={busy}>
          🎲 Lancer la sélection
        </button>
        {!canGenerate && (
          <span className="card-empty">Ajoutez au moins un participant actif.</span>
        )}
      </div>

      {schedule === null ? (
        <p className="card-empty">
          Cliquez sur « Lancer la sélection » pour générer le planning.
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
