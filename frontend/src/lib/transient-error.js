// Only transport failures and recoverable HTTP failures may retain a prior decision.
export function isTransientError(error) {
  const status = error?.status
  return (status == null && error?.code !== 'not-paired') || status === 408 || status === 429 || status >= 500
}
