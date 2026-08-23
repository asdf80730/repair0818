// tests/node/r2.ts — 最小 R2 stub（本地測試用）
// 支援 src 用到的面：put(key, value, {httpMetadata}) / get(key) / delete(key)
export class R2Stub {
  private store = new Map<string, { data: Uint8Array; contentType?: string }>()

  async put(key: string, value: Uint8Array | ArrayBuffer | string, opts?: { httpMetadata?: { contentType?: string } }) {
    const data = typeof value === 'string'
      ? new TextEncoder().encode(value)
      : value instanceof Uint8Array ? value : new Uint8Array(value)
    this.store.set(key, { data, contentType: opts?.httpMetadata?.contentType })
    return { key }
  }

  async get(key: string) {
    const hit = this.store.get(key)
    if (!hit) return null
    const slice = hit.data.slice()
    return {
      arrayBuffer: async () => slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength),
      text: async () => new TextDecoder().decode(slice),
      httpMetadata: { contentType: hit.contentType },
      size: slice.byteLength,
      key,
    }
  }

  async head(key: string) {
    const hit = this.store.get(key)
    if (!hit) return null
    return { key, size: hit.data.byteLength, httpMetadata: { contentType: hit.contentType } }
  }

  async delete(key: string) {
    this.store.delete(key)
  }

  clear() { this.store.clear() }
}
