// Replaces the query string of signed S3 URLs, which carries the request's
// credentials and signature, before agent output is printed to the job log.
// Other URLs and all other text are left unchanged.
const URL_WITH_QUERY = /(https?:\/\/[^\s"'?\\]+)\?((?:[^\s"'\\]|\\u0026)*)/g;
const SIGNED_QUERY = /X-Amz-(Signature|Credential|Security-Token)=/i;

export function redactSignedUrls(text: string): string {
  return text.replace(URL_WITH_QUERY, (match, base: string, query: string) =>
    SIGNED_QUERY.test(query) ? `${base}?REDACTED` : match
  );
}
