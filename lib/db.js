import { supabaseServer, supabasePublic, currentUser } from "./supabase/server.js";

// Every owner-side query pulls the same columns, so they live in one place.
const FORM_COLS =
  "id, user_id, workspace_id, title, description, submit_label, thank_you, fields, " +
  "is_open, closes_at, response_count, accent, logo_url, created_at";

// The database stores snake_case columns; the rest of the app speaks camelCase.
function toForm(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    workspaceId: row.workspace_id,
    title: row.title,
    description: row.description || "",
    submitLabel: row.submit_label || "Submit",
    thankYou: row.thank_you || "",
    fields: Array.isArray(row.fields) ? row.fields : [],
    open: row.is_open !== false,
    closesAt: row.closes_at || null,
    accent: row.accent || "",
    logoUrl: row.logo_url || "",
    createdAt: row.created_at,
    responseCount: Array.isArray(row.responses)
      ? row.responses[0]?.count ?? 0
      : row.response_count ?? undefined,
  };
}

function toWorkspace(row) {
  return { id: row.id, name: row.name, createdAt: row.created_at };
}

export class NotSignedIn extends Error {
  constructor() {
    super("Not signed in.");
    this.code = "not_signed_in";
  }
}

async function authed() {
  const supabase = await supabaseServer();
  if (!supabase) throw new NotSignedIn();
  const user = await currentUser();
  if (!user) throw new NotSignedIn();
  return { supabase, user };
}

// --- workspaces -------------------------------------------------------------

export async function listWorkspaces() {
  const { supabase } = await authed();
  const { data, error } = await supabase
    .from("workspaces")
    .select("id, name, created_at")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).map(toWorkspace);
}

export async function createWorkspace(name) {
  const { supabase, user } = await authed();
  const clean = String(name || "").trim().slice(0, 60);
  if (!clean) throw new Error("Give the section a name.");
  const { data, error } = await supabase
    .from("workspaces")
    .insert({ user_id: user.id, name: clean })
    .select("id, name, created_at")
    .single();
  if (error) throw new Error(error.message);
  return toWorkspace(data);
}

export async function renameWorkspace(id, name) {
  const { supabase } = await authed();
  const clean = String(name || "").trim().slice(0, 60);
  if (!clean) throw new Error("Give the section a name.");
  const { data, error } = await supabase
    .from("workspaces")
    .update({ name: clean })
    .eq("id", id)
    .select("id, name, created_at")
    .single();
  if (error) throw new Error(error.message);
  return toWorkspace(data);
}

// Forms inside a deleted workspace are kept — they just become unfiled.
export async function deleteWorkspace(id) {
  const { supabase } = await authed();
  const { error } = await supabase.from("workspaces").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// --- forms ------------------------------------------------------------------

export async function listForms() {
  const { supabase, user } = await authed();
  const { data, error } = await supabase
    .from("forms")
    .select(`${FORM_COLS}, responses(count)`)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map(toForm);
}

export async function createForm(form, workspaceId, id) {
  const { supabase, user } = await authed();

  let targetWorkspace = null;
  if (workspaceId) {
    // Make sure the workspace really is theirs before filing anything in it.
    const { data: ws } = await supabase
      .from("workspaces")
      .select("id")
      .eq("id", workspaceId)
      .maybeSingle();
    if (ws) targetWorkspace = ws.id;
  }

  const { data, error } = await supabase
    .from("forms")
    .insert({
      id,
      user_id: user.id,
      workspace_id: targetWorkspace,
      title: form.title,
      description: form.description,
      submit_label: form.submitLabel,
      thank_you: form.thankYou,
      fields: form.fields,
      is_open: true,
    })
    .select(`${FORM_COLS}`)
    .single();
  if (error) throw new Error(error.message);
  return toForm(data);
}

export async function getOwnForm(id) {
  const { supabase, user } = await authed();
  const { data, error } = await supabase
    .from("forms")
    .select(`${FORM_COLS}`)
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return toForm(data);
}

export async function updateForm(id, patch) {
  const { supabase, user } = await authed();
  const row = {};
  if (patch.workspaceId !== undefined) row.workspace_id = patch.workspaceId || null;
  if (patch.open !== undefined) row.is_open = Boolean(patch.open);
  if (patch.title !== undefined) row.title = String(patch.title).slice(0, 120);
  if (patch.thankYou !== undefined) row.thank_you = String(patch.thankYou).slice(0, 300);

  // An empty string means "no deadline", which is different from not sending
  // the field at all — that is why these compare against undefined.
  if (patch.closesAt !== undefined) {
    const raw = String(patch.closesAt || "").trim();
    if (!raw) {
      row.closes_at = null;
    } else {
      const when = new Date(raw);
      if (Number.isNaN(when.getTime())) throw new Error("That closing date does not look right.");
      row.closes_at = when.toISOString();
    }
  }

  // Only a URL inside this project's own storage is accepted, so a form can
  // never be made to hotlink an image from somewhere else.
  if (patch.logoUrl !== undefined) {
    const raw = String(patch.logoUrl || "").trim();
    if (!raw) {
      row.logo_url = null;
    } else {
      const base = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
      if (base && raw.startsWith(`${base}/storage/v1/object/public/form-logos/`)) {
        row.logo_url = raw.slice(0, 500);
      } else {
        throw new Error("That image link is not one of ours.");
      }
    }
  }

  if (patch.accent !== undefined) {
    const raw = String(patch.accent || "").trim();
    if (!raw) row.accent = null;
    else if (/^#[0-9a-f]{6}$/i.test(raw)) row.accent = raw.toLowerCase();
    else throw new Error("Pick a colour from the list.");
  }

  if (Object.keys(row).length === 0) return null;

  const { data, error } = await supabase
    .from("forms")
    .update(row)
    .eq("id", id)
    .eq("user_id", user.id)
    .select(`${FORM_COLS}`)
    .single();
  if (error) throw new Error(error.message);
  return toForm(data);
}

export async function deleteForm(id) {
  const { supabase, user } = await authed();
  const { error } = await supabase
    .from("forms")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);
}

// --- responses --------------------------------------------------------------

// Pass { all: true } to pull every row (CSV export, the summary charts).
// Otherwise it hands back one page at a time, so a form with thousands of
// answers still opens instantly.
export async function listResponses(formId, { page = 1, size = 25, all = false } = {}) {
  const { supabase } = await authed();

  const form = await getOwnForm(formId);
  if (!form) return null;

  const perPage = Math.min(Math.max(Number(size) || 25, 5), 200);
  const pageNo = Math.max(Number(page) || 1, 1);

  let query = supabase
    .from("responses")
    .select("id, answers, submitted_at", { count: "exact" })
    .eq("form_id", formId)
    .order("submitted_at", { ascending: true });

  if (!all) {
    const from = (pageNo - 1) * perPage;
    query = query.range(from, from + perPage - 1);
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  return {
    form,
    total: count ?? (data || []).length,
    page: all ? 1 : pageNo,
    size: all ? (count ?? (data || []).length) : perPage,
    responses: (data || []).map((r) => ({
      id: r.id,
      answers: r.answers || {},
      submittedAt: r.submitted_at,
    })),
  };
}

// --- public (no login) ------------------------------------------------------
// These run as an ordinary logged-out visitor. The database's own rules are
// what keep them honest, not any secret key.

export async function getPublicForm(id) {
  if (!/^[a-z0-9_-]{4,40}$/i.test(String(id || ""))) return null;
  const client = supabasePublic();
  if (!client) return null;

  const { data, error } = await client
    .from("forms")
    .select(
      "id, title, description, submit_label, thank_you, fields, is_open, closes_at, accent, logo_url"
    )
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;

  let closedReason = "";
  if (data.is_open === false) {
    closedReason = "closed";
  } else if (data.closes_at && new Date(data.closes_at).getTime() <= Date.now()) {
    closedReason = "deadline";
  }

  // Deliberately does not include user_id or workspace_id — a stranger filling
  // the form has no business knowing who owns it.
  return {
    id: data.id,
    title: data.title,
    description: data.description || "",
    submitLabel: data.submit_label || "Submit",
    thankYou: data.thank_you || "",
    fields: Array.isArray(data.fields) ? data.fields : [],
    open: !closedReason,
    closedReason,
    closesAt: data.closes_at || null,
    accent: data.accent || "",
    logoUrl: data.logo_url || "",
  };
}

export async function addPublicResponse(formId, answers, ipHash = null) {
  const client = supabasePublic();
  if (!client) throw new Error("Storage is not connected yet.");

  const { error } = await client
    .from("responses")
    .insert({ form_id: formId, answers, ip_hash: ipHash });

  // The database itself refuses a response to a form that is shut, past its
  // deadline, or full. Those come back as our own error names.
  if (error) {
    const raw = String(error.message || "");
    if (raw.includes("form_not_found")) throw new Error("Form not found.");
    if (raw.includes("form_closed")) throw new Error("This form is closed and isn't taking answers.");
    if (raw.includes("form_past_deadline")) throw new Error("The deadline for this form has passed.");
    if (raw.includes("too_many_from_you"))
      throw new Error("You have sent a lot of answers in a short time. Try again in a little while.");
    if (raw.includes("too_fast"))
      throw new Error("This form is getting an unusual number of answers right now. Try again in a minute.");
    throw new Error(raw);
  }
}
