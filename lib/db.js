import { supabaseServer, supabaseAdmin, currentUser } from "./supabase/server.js";

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
    createdAt: row.created_at,
    responseCount: Array.isArray(row.responses) ? row.responses[0]?.count ?? 0 : undefined,
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
  const { supabase } = await authed();
  const { data, error } = await supabase
    .from("forms")
    .select("id, user_id, workspace_id, title, description, submit_label, thank_you, fields, is_open, created_at, responses(count)")
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
    .select("id, user_id, workspace_id, title, description, submit_label, thank_you, fields, is_open, created_at")
    .single();
  if (error) throw new Error(error.message);
  return toForm(data);
}

export async function getOwnForm(id) {
  const { supabase } = await authed();
  const { data, error } = await supabase
    .from("forms")
    .select("id, user_id, workspace_id, title, description, submit_label, thank_you, fields, is_open, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return toForm(data);
}

export async function updateForm(id, patch) {
  const { supabase } = await authed();
  const row = {};
  if (patch.workspaceId !== undefined) row.workspace_id = patch.workspaceId || null;
  if (patch.open !== undefined) row.is_open = Boolean(patch.open);
  if (patch.title !== undefined) row.title = String(patch.title).slice(0, 120);
  if (Object.keys(row).length === 0) return null;

  const { data, error } = await supabase
    .from("forms")
    .update(row)
    .eq("id", id)
    .select("id, user_id, workspace_id, title, description, submit_label, thank_you, fields, is_open, created_at")
    .single();
  if (error) throw new Error(error.message);
  return toForm(data);
}

export async function deleteForm(id) {
  const { supabase } = await authed();
  const { error } = await supabase.from("forms").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// --- responses --------------------------------------------------------------

export async function listResponses(formId) {
  const { supabase } = await authed();

  const form = await getOwnForm(formId);
  if (!form) return null;

  const { data, error } = await supabase
    .from("responses")
    .select("id, answers, submitted_at")
    .eq("form_id", formId)
    .order("submitted_at", { ascending: true });
  if (error) throw new Error(error.message);

  return {
    form,
    responses: (data || []).map((r) => ({
      id: r.id,
      answers: r.answers || {},
      submittedAt: r.submitted_at,
    })),
  };
}

// --- public (no login) ------------------------------------------------------
// These two run with the service role key, so they must do their own checking.

export async function getPublicForm(id) {
  if (!/^[a-z0-9_-]{4,40}$/i.test(String(id || ""))) return null;
  const admin = supabaseAdmin();
  if (!admin) return null;

  const { data, error } = await admin
    .from("forms")
    .select("id, title, description, submit_label, thank_you, fields, is_open")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;

  // Deliberately does not include user_id or workspace_id — a stranger filling
  // the form has no business knowing who owns it.
  return {
    id: data.id,
    title: data.title,
    description: data.description || "",
    submitLabel: data.submit_label || "Submit",
    thankYou: data.thank_you || "",
    fields: Array.isArray(data.fields) ? data.fields : [],
    open: data.is_open !== false,
  };
}

export async function addPublicResponse(formId, answers) {
  const admin = supabaseAdmin();
  if (!admin) throw new Error("Storage is not connected yet.");

  const { data: form } = await admin
    .from("forms")
    .select("id, is_open")
    .eq("id", formId)
    .maybeSingle();
  if (!form) throw new Error("Form not found.");
  if (form.is_open === false) throw new Error("This form is closed.");

  const { error } = await admin.from("responses").insert({ form_id: formId, answers });
  if (error) throw new Error(error.message);
}
