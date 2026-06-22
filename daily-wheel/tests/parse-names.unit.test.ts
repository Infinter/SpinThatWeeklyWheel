import { describe, it, expect } from 'vitest'
import { parseNames } from '@/lib/store/parse-names'

// Test UNITAIRE pur (aucun réseau, aucune variable d'env) : il fixe le contrat du parseur
// de noms multi-saisie (Story 2.1, AC1/AC7) — split sur `,` ET `;`, trim, vides ignorés,
// ordre préservé, doublons conservés. C'est le cœur testable de cette story (roule en CI sans secrets).

describe('parseNames (FR1 — ajout multiple)', () => {
  it('découpe sur la virgule', () => {
    expect(parseNames('Alice,Bob')).toEqual(['Alice', 'Bob'])
  })

  it('découpe sur le point-virgule', () => {
    expect(parseNames('Alice;Bob')).toEqual(['Alice', 'Bob'])
  })

  it('découpe sur un mélange `,` et `;`', () => {
    expect(parseNames('Alice, Bob ; Chloé')).toEqual(['Alice', 'Bob', 'Chloé'])
  })

  it('trim les espaces superflus de chaque segment', () => {
    expect(parseNames('  Alice  ')).toEqual(['Alice'])
    expect(parseNames('  Alice ,  Bob  ')).toEqual(['Alice', 'Bob'])
  })

  it('ignore les segments vides (séparateurs consécutifs ou en tête/queue)', () => {
    expect(parseNames('Alice,,Bob')).toEqual(['Alice', 'Bob'])
    expect(parseNames('Alice; ;Bob')).toEqual(['Alice', 'Bob'])
    expect(parseNames(',Alice,Bob;')).toEqual(['Alice', 'Bob'])
  })

  it('préserve l’ordre de saisie', () => {
    expect(parseNames('Chloé;Alice,Bob')).toEqual(['Chloé', 'Alice', 'Bob'])
  })

  it('ne déduplique PAS les doublons de noms (autorisés en 2.1)', () => {
    expect(parseNames('Alice, Alice')).toEqual(['Alice', 'Alice'])
  })

  it('renvoie [] pour une chaîne vide', () => {
    expect(parseNames('')).toEqual([])
  })

  it('renvoie [] quand la saisie n’est que des séparateurs/espaces', () => {
    expect(parseNames(' , ; ')).toEqual([])
    expect(parseNames('   ')).toEqual([])
  })

  it('gère un nom unique sans séparateur', () => {
    expect(parseNames('Alice')).toEqual(['Alice'])
  })
})
