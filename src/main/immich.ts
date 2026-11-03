// Read-only access to Immich for the launcher's photo carousel, using an API
// key the user creates in Immich (Account settings → API keys, asset.read).

interface ImmichAsset {
  id: string
  type: string
}

export async function randomAssetIds(baseUrl: string, apiKey: string, count: number): Promise<string[]> {
  const res = await fetch(`${baseUrl}/api/search/random`, {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({ size: count, type: 'IMAGE' }),
    signal: AbortSignal.timeout(5000),
  })
  if (res.status === 401 || res.status === 403) throw new Error('Immich rejected the API key')
  if (!res.ok) throw new Error(`Immich returned ${res.status}`)
  return ((await res.json()) as ImmichAsset[]).filter((a) => a.type === 'IMAGE').map((a) => a.id)
}

export function thumbnail(baseUrl: string, apiKey: string, id: string): Promise<Response> {
  return fetch(`${baseUrl}/api/assets/${encodeURIComponent(id)}/thumbnail?size=preview`, {
    headers: { 'x-api-key': apiKey },
    signal: AbortSignal.timeout(10000),
  })
}
