import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  CopyObjectCommand,
} from '@aws-sdk/client-s3'

const client = new S3Client({
  region: process.env.S3_REGION || 'us-east-1',
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
  },
})

const BUCKET = process.env.S3_BUCKET ?? ''

export function productKey(productId: string, ...segments: string[]): string {
  return ['products', productId, ...segments].join('/')
}

export async function putObject(
  key: string,
  body: Buffer,
  contentType?: string,
  metadata?: Record<string, string>,
): Promise<void> {
  await client.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
    Metadata: metadata,
  }))
}

export async function getObject(
  key: string,
): Promise<{ body: Buffer; contentType?: string; metadata?: Record<string, string> } | null> {
  try {
    const result = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }))
    const body = Buffer.from(await result.Body!.transformToByteArray())
    return { body, contentType: result.ContentType, metadata: result.Metadata }
  } catch (err: unknown) {
    if (err instanceof Error && (err.name === 'NoSuchKey' || err.name === 'NotFound')) return null
    throw err
  }
}

export async function objectExists(key: string): Promise<boolean> {
  try {
    await client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }))
    return true
  } catch (err: unknown) {
    if (err instanceof Error && (err.name === 'NotFound' || err.name === 'NoSuchKey')) return false
    throw err
  }
}

export async function deleteObject(key: string): Promise<void> {
  await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
}

export async function copyObjectsByPrefix(sourcePrefix: string, destPrefix: string): Promise<void> {
  let continuationToken: string | undefined
  do {
    const listed = await client.send(new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: sourcePrefix,
      ContinuationToken: continuationToken,
    }))
    for (const object of listed.Contents ?? []) {
      if (!object.Key) continue
      const destKey = destPrefix + object.Key.slice(sourcePrefix.length)
      await client.send(new CopyObjectCommand({
        Bucket: BUCKET,
        CopySource: `${BUCKET}/${object.Key}`,
        Key: destKey,
      }))
    }
    continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined
  } while (continuationToken)
}

export async function deleteObjectsByPrefix(prefix: string): Promise<void> {
  let continuationToken: string | undefined
  do {
    const listed = await client.send(new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    }))
    for (const object of listed.Contents ?? []) {
      if (!object.Key) continue
      await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: object.Key }))
    }
    continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined
  } while (continuationToken)
}
