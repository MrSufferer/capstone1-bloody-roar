export type UploadPurpose = "ISSUE_IMAGE" | "DELIVERY" | "EVIDENCE" | "AVATAR" | "COMMENT_IMAGE" | "SOURCE" | "CHAT";

// Two-step upload: announce the file, send the bytes to the returned target, then confirm. Throws the server's message.
export async function uploadFile(file: File, purpose: UploadPurpose, issueId?: string, conversationId?: string): Promise<{ attachmentId: string; sha256: string; fileUrl: string }> {
  const fileType = file.type || (/\.(patch|diff)$/i.test(file.name) ? "text/x-diff" : /\.zip$/i.test(file.name) ? "application/zip" : "application/octet-stream");
  const start = await fetch("/api/uploads", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fileName: file.name, fileType, fileSize: file.size, purpose, ...(issueId ? { issueId } : {}), ...(conversationId ? { conversationId } : {}) }),
  });
  const announced = (await start.json().catch(() => ({}))) as { attachmentId?: string; uploadUrl?: string; fileUrl?: string; error?: string };
  if (!start.ok || !announced.attachmentId || !announced.uploadUrl) throw new Error(announced.error ?? "Could not start the upload.");

  const sent = await fetch(announced.uploadUrl, {
    method: "PUT",
    credentials: "same-origin",
    headers: { "content-type": fileType },
    body: file,
  });
  if (!sent.ok) throw new Error((await sent.json().catch(() => ({})) as { error?: string }).error ?? "Could not send the file.");

  const done = await fetch("/api/uploads/complete", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ attachmentId: announced.attachmentId }),
  });
  const confirmed = (await done.json().catch(() => ({}))) as { sha256?: string; error?: string };
  if (!done.ok || !confirmed.sha256) throw new Error(confirmed.error ?? "Could not confirm the upload.");
  return { attachmentId: announced.attachmentId, sha256: confirmed.sha256, fileUrl: announced.fileUrl ?? "" };
}
