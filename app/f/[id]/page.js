import { getPublicForm } from "../../../lib/db.js";
import PublicForm from "./PublicForm.js";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { id } = await params;
  const form = await getPublicForm(id);
  return {
    title: form ? form.title : "Form not found",
    description: form?.description || "Fill in this form.",
  };
}

export default async function FormPage({ params }) {
  const { id } = await params;
  const form = await getPublicForm(id);

  if (!form) {
    return (
      <main className="shell narrow">
        <div className="card" style={{ marginTop: 48 }}>
          <h1 style={{ fontSize: 22 }}>This form isn&apos;t available</h1>
          <p className="lede" style={{ marginBottom: 0 }}>
            The link may be wrong, or the form may have been removed. Ask whoever sent it
            for a fresh link.
          </p>
        </div>
      </main>
    );
  }

  if (!form.open) {
    return (
      <main className="shell narrow">
        <div className="card" style={{ marginTop: 48 }}>
          <h1 style={{ fontSize: 22 }}>{form.title}</h1>
          <p className="lede" style={{ marginBottom: 0 }}>
            This form is closed and isn&apos;t accepting any more responses.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="shell narrow">
      <PublicForm form={form} />
      <p className="footer">Made with FormAgent</p>
    </main>
  );
}
