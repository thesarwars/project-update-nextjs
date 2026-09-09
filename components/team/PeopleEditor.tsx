"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LuArrowDown, LuArrowUp, LuCheck, LuLink, LuPlus, LuTrash2 } from "react-icons/lu";
import { Button, Field, IconButton, inputClass } from "@/components/ui";
import { useToast } from "@/components/Toast";
import Modal from "@/components/Modal";
import Avatar from "@/components/shell/Avatar";
import { copyPlain } from "@/lib/clipboard";
import type { Invite, Person, Project, User } from "@/lib/types";

type Draft = Person & { isNew?: boolean };

interface Props {
  project: Project;
  /** The account attached to each roster row, keyed by person id. */
  accounts: Record<string, User>;
  /** Invitations sent but not yet claimed. */
  invites: Invite[];
  canManage: boolean;
}

export default function PeopleEditor({ project, accounts, invites, canManage }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft[]>(project.people);
  const [nextId, setNextId] = useState(0);
  const [saving, setSaving] = useState(false);
  const [inviting, setInviting] = useState<Person | null>(null);

  const pendingByPerson = new Map(invites.filter((i) => i.personId).map((i) => [i.personId!, i]));

  const dirty =
    JSON.stringify(draft.map((p) => ({ id: p.id, name: p.name, active: p.active }))) !==
    JSON.stringify(project.people.map((p) => ({ id: p.id, name: p.name, active: p.active })));

  const update = (index: number, patch: Partial<Draft>) =>
    setDraft((list) => list.map((p, i) => (i === index ? { ...p, ...patch } : p)));

  const move = (index: number, delta: number) =>
    setDraft((list) => {
      const target = index + delta;
      if (target < 0 || target >= list.length) return list;
      const next = [...list];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const remove = (index: number) => {
    const person = draft[index];
    const confirmed =
      person.isNew ||
      window.confirm(
        `Remove ${person.name || "this person"}? If they have written any standup entries, ` +
          `they are kept and simply left out of the update instead.`,
      );
    if (confirmed) setDraft((list) => list.filter((_, i) => i !== index));
  };

  const add = () => {
    setDraft((list) => [...list, { id: `new_${nextId}`, name: "", active: true, isNew: true }]);
    setNextId((n) => n + 1);
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          people: draft
            .filter((p) => p.name.trim())
            .map((p) => ({ id: p.isNew ? "" : p.id, name: p.name.trim(), active: p.active })),
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const { project: updated } = (await res.json()) as { project: Project };
      setDraft(updated.people);
      router.refresh();
      toast("People saved.");
    } catch {
      toast("Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="max-w-2xl">
      <header className="mb-3">
        <h2 className="text-[14px] font-semibold">People on {project.name}</h2>
        <p className="mt-0.5 text-[12.5px] text-muted">
          This order is the order they appear in the update. Unticking someone keeps their
          history but leaves them out.
        </p>
      </header>

      <ul className="flex flex-col gap-2">
        {draft.map((person, index) => (
          <li key={person.id} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={person.active}
              onChange={(e) => update(index, { active: e.target.checked })}
              aria-label={`Include ${person.name || "this person"} in the update`}
              className="h-4 w-4 shrink-0 accent-[var(--accent)]"
            />
            <input
              value={person.name}
              onChange={(e) => update(index, { name: e.target.value })}
              placeholder="Name"
              autoFocus={person.isNew}
              className={inputClass}
            />
            <PersonState
              account={accounts[person.id]}
              invite={pendingByPerson.get(person.id)}
              isNew={Boolean(person.isNew)}
            />
            <div className="flex shrink-0 items-center gap-0.5">
              {canManage && !person.isNew && !accounts[person.id] ? (
                <IconButton
                  label={`Invite ${person.name || "this person"}`}
                  variant="ghost"
                  size="sm"
                  onClick={() => setInviting(person)}
                >
                  <LuLink className="h-3.5 w-3.5" />
                </IconButton>
              ) : null}
              <IconButton
                label="Move up"
                variant="ghost"
                size="sm"
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                <LuArrowUp className="h-3.5 w-3.5" />
              </IconButton>
              <IconButton
                label="Move down"
                variant="ghost"
                size="sm"
                disabled={index === draft.length - 1}
                onClick={() => move(index, 1)}
              >
                <LuArrowDown className="h-3.5 w-3.5" />
              </IconButton>
              <IconButton label="Remove" variant="danger" size="sm" onClick={() => remove(index)}>
                <LuTrash2 className="h-3.5 w-3.5" />
              </IconButton>
            </div>
          </li>
        ))}
      </ul>

      {draft.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-muted">No one here yet.</p>
      ) : null}

      {inviting ? (
        <InviteDialog
          project={project}
          person={inviting}
          onClose={() => setInviting(null)}
          onSent={() => {
            setInviting(null);
            router.refresh();
          }}
        />
      ) : null}

      <div className="mt-4 flex items-center gap-2">
        <Button onClick={add}>
          <LuPlus className="h-3.5 w-3.5" />
          Add person
        </Button>
        <Button variant="primary" onClick={save} disabled={saving || !dirty} className="ml-auto">
          {saving ? "Saving…" : "Save people"}
        </Button>
      </div>
    </section>
  );
}

/** What state a roster row is in: unclaimed, invited, or a real account. */
function PersonState({
  account,
  invite,
  isNew,
}: {
  account?: User;
  invite?: Invite;
  isNew: boolean;
}) {
  if (isNew) return <span className="w-[132px] shrink-0" />;
  if (account) {
    return (
      <span
        className="flex w-[132px] shrink-0 items-center gap-1.5 text-[11px] text-muted"
        title={account.email}
      >
        <Avatar name={account.name} size={18} />
        <span className="truncate">{account.email}</span>
      </span>
    );
  }
  if (invite) {
    return (
      <span className="w-[132px] shrink-0 truncate text-[11px] text-accent" title={invite.email}>
        Invited · {invite.email}
      </span>
    );
  }
  return <span className="w-[132px] shrink-0 text-[11px] text-muted">No account yet</span>;
}

/**
 * Creates the invitation and puts the link on the clipboard.
 *
 * There is no mail server, and adding one to send a handful of links a year would be the
 * larger cost. Copy-and-paste into whatever the team already uses is the same gesture
 * the rest of this app is built on.
 */
function InviteDialog({
  project,
  person,
  onClose,
  onSent,
}: {
  project: Project;
  person: Person;
  onClose: () => void;
  onSent: () => void;
}) {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  const send = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, personId: person.id, email: email.trim() }),
      });
      if (!res.ok) {
        const { error } = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(error ?? "failed");
      }
      const { url } = (await res.json()) as { url: string };
      setLink(url);
      if (await copyPlain(url)) toast("Invitation link copied — paste it to them.");
    } catch (err) {
      toast(err instanceof Error && err.message !== "failed" ? err.message : "Could not create that invitation.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={link ? onSent : onClose}
      title={`Invite ${person.name}`}
      description={`They will claim ${person.name}'s place on ${project.name} and inherit everything already written under it.`}
      footer={
        link ? (
          <Button variant="primary" onClick={onSent}>
            Done
          </Button>
        ) : (
          <>
            <Button onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" onClick={send} disabled={busy || !email.trim()}>
              {busy ? "Creating…" : "Create link"}
            </Button>
          </>
        )
      }
    >
      {link ? (
        <div className="flex flex-col gap-2">
          <p className="flex items-center gap-1.5 text-[13px] text-success">
            <LuCheck className="h-4 w-4" />
            Link copied to your clipboard.
          </p>
          <code className="block break-all rounded-lg bg-surface-sunken px-3 py-2 font-mono text-[11.5px]">
            {link}
          </code>
          <p className="text-[12px] text-muted">
            It works once and expires in 7 days. Send it however you normally reach them.
          </p>
        </div>
      ) : (
        <Field label="Their email" hint="Used to sign in. No mail is sent — you send the link.">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            className={inputClass}
            data-autofocus
          />
        </Field>
      )}
    </Modal>
  );
}
