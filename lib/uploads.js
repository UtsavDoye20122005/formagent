"use client";

import { supabaseBrowser } from "./supabase/browser.js";

export const FILES_BUCKET = "form-files";
export const LOGOS_BUCKET = "form-logos";

export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2 MB

// Keeps the original name recognisable in the dashboard while making sure the
// stored name is safe and cannot collide with somebody else's upload.
function safeName(original) {
  const dot = String(original || "").lastIndexOf(".");
  const ext = dot > 0 ? original.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  const stem = (dot > 0 ? original.slice(0, dot) : String(original || "file"))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "file";
  const tag = Math.random().toString(36).slice(2, 8);
  return ext ? `${stem}-${tag}.${ext}` : `${stem}-${tag}`;
}

export function prettyBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// Respondent attaching something to a form. The path always starts with the
// form's id — that is what the storage rules check.
export async function uploadFormFile(formId, file) {
  const supabase = supabaseBrowser();
  if (!supabase) throw new Error("Uploads are not set up.");
  if (file.size > MAX_FILE_BYTES) {
    // A photo taken on a recent phone is routinely over the cap, and "too big"
    // on its own leaves someone stuck. Say how big, and say what to do.
    const isImage = /^image\//.test(file.type || "");
    throw new Error(
      `That file is ${prettyBytes(file.size)} — the limit is ${prettyBytes(MAX_FILE_BYTES)}. ` +
      (isImage
        ? "Photos off a phone are often this big. Share it from your gallery at a smaller size, or send a PDF instead."
        : "Try a PDF, or put it on Google Drive and paste the link.")
    );
  }

  const path = `${formId}/${safeName(file.name)}`;
  const { error } = await supabase.storage
    .from(FILES_BUCKET)
    .upload(path, file, { cacheControl: "3600", upsert: false });

  if (error) throw new Error(friendlyUploadError(error.message));
  return path;
}

// Owner putting a logo on their own form. Lands in a folder named after them.
export async function uploadLogo(userId, file) {
  const supabase = supabaseBrowser();
  if (!supabase) throw new Error("Uploads are not set up.");
  if (!/^image\/(png|jpe?g|webp|gif|svg\+xml)$/.test(file.type)) {
    throw new Error("Pick a PNG, JPG, WEBP or SVG image.");
  }
  if (file.size > MAX_LOGO_BYTES) {
    throw new Error(`That image is too big. Keep it under ${prettyBytes(MAX_LOGO_BYTES)}.`);
  }

  const path = `${userId}/${safeName(file.name)}`;
  const { error } = await supabase.storage
    .from(LOGOS_BUCKET)
    .upload(path, file, { cacheControl: "3600", upsert: true });

  if (error) throw new Error(friendlyUploadError(error.message));

  const { data } = supabase.storage.from(LOGOS_BUCKET).getPublicUrl(path);
  return data?.publicUrl || "";
}

// Owner looking at an answer. Private bucket, so the link is temporary.
export async function signedFileUrl(path, seconds = 3600) {
  const supabase = supabaseBrowser();
  if (!supabase) return "";
  const { data, error } = await supabase.storage
    .from(FILES_BUCKET)
    .createSignedUrl(path, seconds);
  if (error) return "";
  return data?.signedUrl || "";
}

function friendlyUploadError(raw) {
  const text = String(raw || "");
  if (/bucket not found/i.test(text)) {
    return "File storage has not been set up in Supabase yet.";
  }
  if (/exceeded|too large|payload/i.test(text)) return "That file is too big.";
  if (/row-level security|not authorized|denied/i.test(text)) {
    return "This form is not accepting files right now.";
  }
  return text.slice(0, 160) || "The upload failed.";
}
