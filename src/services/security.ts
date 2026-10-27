export function encodeProjectId(projectId: string | number): string {
  return encodeURIComponent(String(projectId));
}

export function requireExactConfirmation(
  confirmTarget: string | undefined,
  expected: string,
  label = "target",
): void {
  if (confirmTarget !== expected) {
    throw new Error(
      `Confirmation required: confirm_target must exactly match ${label} "${expected}".`,
    );
  }
}
