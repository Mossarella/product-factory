import { describe, expect, it } from 'bun:test'
import { avatarColor, formatDate, greeting, tagKey } from '@/lib/utils'

describe('greeting()', () => {
  it('returns morning for hour < 12', () => {
    expect(greeting('Alice', 9)).toBe('Good morning, Alice')
  })
  it('returns afternoon for hour 12–16', () => {
    expect(greeting('Bob', 14)).toBe('Good afternoon, Bob')
  })
  it('returns evening for hour >= 17', () => {
    expect(greeting('Carol', 20)).toBe('Good evening, Carol')
  })
  it('uses first name only', () => {
    expect(greeting('Alice Smith', 9)).toBe('Good morning, Alice')
  })
  it('falls back to "there" when name is null', () => {
    expect(greeting(null, 9)).toBe('Good morning, there')
  })
  it('falls back to "there" when name is empty string', () => {
    expect(greeting('', 9)).toBe('Good morning, there')
  })
})

describe('avatarColor()', () => {
  it('returns a Tailwind bg class', () => {
    expect(avatarColor('Abc')).toMatch(/^bg-/)
  })
  it('is deterministic — same name always same color', () => {
    expect(avatarColor('MyProduct')).toBe(avatarColor('MyProduct'))
  })
  it('cycles through 6 colors', () => {
    const colors = new Set(
      Array.from({ length: 12 }, (_, i) => avatarColor(String.fromCharCode(65 + i)))
    )
    expect(colors.size).toBeLessThanOrEqual(6)
  })
})

describe('tagKey()', () => {
  it('sorts tags before joining', () => {
    expect(tagKey(['b', 'a', 'c'])).toBe('a|b|c')
  })
  it('is stable regardless of input order', () => {
    expect(tagKey(['z', 'a'])).toBe(tagKey(['a', 'z']))
  })
  it('returns empty string for empty array', () => {
    expect(tagKey([])).toBe('')
  })
})

describe('formatDate()', () => {
  it('returns a non-empty string', () => {
    expect(formatDate(new Date('2025-07-15'))).toBeString()
    expect(formatDate(new Date('2025-07-15')).length).toBeGreaterThan(0)
  })
  it('includes the year', () => {
    expect(formatDate(new Date('2025-07-15'))).toContain('2025')
  })
})
