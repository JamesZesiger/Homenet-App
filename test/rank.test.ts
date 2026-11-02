import { describe, expect, it } from 'vitest'
import { matchScore, normalize, rank } from '../src/main/rank'

const t = (name: string, voteCount = 100) => ({ name, normalizedName: normalize(name), voteCount })

describe('normalize', () => {
  it('folds case, accents, punctuation and ampersands', () => {
    expect(normalize('Pokémon: Tom & Jerry!')).toBe('pokemon tom and jerry')
  })
})

describe('matchScore tiers', () => {
  it('ranks exact > prefix > word prefix > all words > substring > typo', () => {
    const q = (query: string, name: string) => matchScore(normalize(query), normalize(name))
    expect(q('the office', 'The Office')).toBe(100)
    expect(q('the off', 'The Office')).toBe(90)
    expect(q('office', 'The Office')).toBe(75)
    expect(q('office the', 'The Office')).toBe(70)
    expect(q('ffic', 'The Office')).toBe(60)
    expect(q('strnger things', 'Stranger Things')).toBeGreaterThan(0)
    expect(q('strnger things', 'Stranger Things')).toBeLessThan(60)
    expect(q('zzzz', 'The Office')).toBe(0)
  })
})

describe('rank', () => {
  it('puts the closest name first, with votes breaking ties', () => {
    const items = [t('Office Space', 900), t('The Office', 5000), t('The Office', 20), t('Officer Down', 10)]
    expect(rank('the office', items, 10).map((i) => `${i.name}/${i.voteCount}`)).toEqual([
      'The Office/5000', 'The Office/20', 'Office Space/900', 'Officer Down/10',
    ])
  })

  it('returns nothing for an empty query and respects the limit', () => {
    expect(rank('  ', [t('A')], 10)).toEqual([])
    expect(rank('a', [t('A1'), t('A2'), t('A3')], 2)).toHaveLength(2)
  })
})
