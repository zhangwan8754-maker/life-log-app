/** 极简 GitHub REST 客户端：只用到 contents / git trees / git blobs 四个端点 */

export interface Config {
  owner: string
  repo: string
  branch: string
  token: string
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export function encodeUtf8(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

export function decodeUtf8(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ''))
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

const encPath = (p: string) => p.split('/').map(encodeURIComponent).join('/')

export class GitHub {
  constructor(private cfg: Config) {}

  private get base() {
    return `https://api.github.com/repos/${encodeURIComponent(this.cfg.owner)}/${encodeURIComponent(this.cfg.repo)}`
  }

  private async req<T>(method: string, url: string, body?: unknown): Promise<T> {
    const res = await fetch(url, {
      method,
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.cfg.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
      let msg = res.statusText
      try {
        msg = (await res.json()).message ?? msg
      } catch {}
      throw new HttpError(res.status, msg)
    }
    return res.json() as Promise<T>
  }

  repoInfo() {
    return this.req<{ default_branch: string; private: boolean; full_name: string }>('GET', this.base)
  }

  async getFile(path: string): Promise<{ content: string; sha: string } | null> {
    try {
      const r = await this.req<{ content: string; sha: string; encoding: string }>(
        'GET',
        `${this.base}/contents/${encPath(path)}?ref=${encodeURIComponent(this.cfg.branch)}`,
      )
      return { content: decodeUtf8(r.content), sha: r.sha }
    } catch (e) {
      if (e instanceof HttpError && e.status === 404) return null
      throw e
    }
  }

  async putFile(path: string, content: string, sha: string | null, message: string): Promise<string> {
    const r = await this.req<{ content: { sha: string } }>('PUT', `${this.base}/contents/${encPath(path)}`, {
      message,
      content: encodeUtf8(content),
      branch: this.cfg.branch,
      ...(sha ? { sha } : {}),
    })
    return r.content.sha
  }

  async tree(): Promise<{ path: string; sha: string }[]> {
    try {
      const r = await this.req<{ tree: { path: string; sha: string; type: string }[] }>(
        'GET',
        `${this.base}/git/trees/${encodeURIComponent(this.cfg.branch)}?recursive=1`,
      )
      return r.tree.filter((t) => t.type === 'blob').map(({ path, sha }) => ({ path, sha }))
    } catch (e) {
      if (e instanceof HttpError && (e.status === 404 || e.status === 409)) return [] // 空仓库
      throw e
    }
  }

  async blob(sha: string): Promise<string> {
    const r = await this.req<{ content: string }>('GET', `${this.base}/git/blobs/${sha}`)
    return decodeUtf8(r.content)
  }
}
