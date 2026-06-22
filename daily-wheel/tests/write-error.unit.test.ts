import { describe, it, expect } from 'vitest'
import { writeErrorFromStatus } from '@/lib/data/participants'

// Test UNITAIRE pur (aucun réseau, aucune variable d'env) : il fixe la taxonomie
// d'erreurs d'écriture (AD-17). C'est le vrai filet du mapping statut HTTP → classe.
describe('writeErrorFromStatus (taxonomie AD-17)', () => {
  it('401 → auth', () => {
    expect(writeErrorFromStatus(401)).toBe('auth')
  })
  it('400 → validation', () => {
    expect(writeErrorFromStatus(400)).toBe('validation')
  })
  it('409 → conflict', () => {
    expect(writeErrorFromStatus(409)).toBe('conflict')
  })
  it('5xx → transient', () => {
    expect(writeErrorFromStatus(500)).toBe('transient')
    expect(writeErrorFromStatus(503)).toBe('transient')
  })
  it('statut inattendu → transient (défaut prudent)', () => {
    expect(writeErrorFromStatus(418)).toBe('transient')
  })
})
