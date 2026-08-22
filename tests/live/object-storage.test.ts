import { afterAll, describe, expect, it } from 'bun:test'
import {
  copyObjectsByPrefix,
  deleteObject,
  getObject,
  objectExists,
  productKey,
  putObject,
} from '@/lib/object-storage'

const PREFIX = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`
const createdKeys = new Set<string>()

async function put(key: string, body: Buffer, contentType?: string, metadata?: Record<string, string>) {
  await putObject(key, body, contentType, metadata)
  createdKeys.add(key)
}

afterAll(async () => {
  await Promise.all([...createdKeys].map((key) => deleteObject(key)))
})

describe('object storage (real MinIO)', () => {
  it('putObject + getObject round-trips bytes, content type, and metadata', async () => {
    const key = `${PREFIX}/round-trip.txt`
    await put(key, Buffer.from('hello world'), 'text/plain', { custom: 'value' })

    const object = await getObject(key)

    expect(object?.body.toString()).toBe('hello world')
    expect(object?.contentType).toBe('text/plain')
    expect(object?.metadata?.custom).toBe('value')
  })

  it('getObject returns null for a missing key', async () => {
    expect(await getObject(`${PREFIX}/missing.txt`)).toBeNull()
  })

  it('objectExists reflects presence correctly', async () => {
    const key = `${PREFIX}/exists.txt`
    await put(key, Buffer.from('exists'))

    expect(await objectExists(key)).toBe(true)
    expect(await objectExists(`${PREFIX}/never-written.txt`)).toBe(false)
  })

  it('deleteObject removes the object', async () => {
    const key = `${PREFIX}/delete.txt`
    await put(key, Buffer.from('delete me'))

    expect(await objectExists(key)).toBe(true)
    await deleteObject(key)
    createdKeys.delete(key)
    expect(await objectExists(key)).toBe(false)
  })

  it('copyObjectsByPrefix copies every object under a prefix without disturbing objects outside it', async () => {
    const sourcePrefix = `${PREFIX}/source/`
    const destPrefix = `${PREFIX}/dest/`
    const sourceA = `${sourcePrefix}a.txt`
    const sourceB = `${sourcePrefix}nested/b.txt`
    const destA = `${destPrefix}a.txt`
    const destB = `${destPrefix}nested/b.txt`
    const unrelated = `${PREFIX}/unrelated.txt`

    await put(sourceA, Buffer.from('alpha'))
    await put(sourceB, Buffer.from('bravo'))
    await put(unrelated, Buffer.from('unrelated'))
    await copyObjectsByPrefix(sourcePrefix, destPrefix)
    createdKeys.add(destA)
    createdKeys.add(destB)

    expect((await getObject(destA))?.body.toString()).toBe('alpha')
    expect((await getObject(destB))?.body.toString()).toBe('bravo')
    expect(await objectExists(sourceA)).toBe(true)
    expect(await objectExists(sourceB)).toBe(true)
    expect(await getObject(`${destPrefix}unrelated.txt`)).toBeNull()
  })

  it('productKey builds the expected path', () => {
    expect(productKey('abc123', 'builds', 'v1.zip')).toBe('products/abc123/builds/v1.zip')
  })
})
