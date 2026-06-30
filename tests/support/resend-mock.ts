export type CapturedResendEmail = {
  from: string;
  to: string[];
  subject: string;
  text: string;
  html: string;
};

export const withCapturedResendEmails = async <T>(run: () => Promise<T>) => {
  const originalFetch = globalThis.fetch;
  const emails: CapturedResendEmail[] = [];

  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url) === "https://api.resend.com/emails" && init?.body) {
      emails.push(JSON.parse(String(init.body)) as CapturedResendEmail);

      return new Response(JSON.stringify({ id: `email_${emails.length}` }), {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      });
    }

    return originalFetch(url as RequestInfo | URL, init);
  }) as typeof fetch;

  try {
    const result = await run();
    return {
      result,
      emails
    };
  } finally {
    globalThis.fetch = originalFetch;
  }
};
