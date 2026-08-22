import { describe, expect, it } from 'bun:test'
import { cn } from '@/lib/cn'

describe('cn()', () => {
  it('merges plain string classes', () => {
    expect(cn('a', 'b')).toBe('a b')
  })

  it('resolves conflicting Tailwind classes', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4')
  })

  it('handles falsy and conditional inputs', () => {
    expect(cn('a', false && 'b', undefined, 'c')).toBe('a c')
  })
})
