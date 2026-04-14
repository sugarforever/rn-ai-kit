export class FetchProxy {
  private allowedDomains: string[];

  constructor(allowedDomains: string[]) {
    this.allowedDomains = allowedDomains;
  }

  async handle(payload: {
    url: string;
    options?: RequestInit;
  }): Promise<{ status: number; body: string; headers: Record<string, string> }> {
    const url = new URL(payload.url);
    if (!this.allowedDomains.includes(url.hostname)) {
      throw new Error(`Domain ${url.hostname} is not allowed for this skill`);
    }

    const res = await fetch(payload.url, payload.options);
    const body = await res.text();
    const headers: Record<string, string> = {};
    res.headers.forEach((value: string, key: string) => {
      headers[key] = value;
    });

    return { status: res.status, body, headers };
  }
}
