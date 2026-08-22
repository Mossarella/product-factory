export function getPublicOrigin(request: Request) {
  const requestUrl = new URL(request.url)
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
  const host = forwardedHost || request.headers.get('host') || requestUrl.host
  const protocol = forwardedProto || requestUrl.protocol.replace(':', '')

  return `${protocol}://${host}`
}
