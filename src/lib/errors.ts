export function formatCliError(error: unknown): string {
  if (error instanceof Error) return error.stack ?? error.message;
  if (typeof error === "string") return error;
  try {
    const json = JSON.stringify(error);
    if (json !== undefined) return json;
  } catch {
    // Fall through to the object tag for cyclic/non-serializable values.
  }
  return Object.prototype.toString.call(error);
}
