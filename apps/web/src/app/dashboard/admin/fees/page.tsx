"use client";

import { useCallback, useEffect, useState } from "react";
import { ProtectedRoute } from "@/components/protected-route";
import { fetchJson } from "@/lib/api";

type Program = {
  id: string; programCode: string; displayName: string; description: string | null;
  enabled: boolean; monthlyPriceMinor: string | number | null;
  annualPriceMinor: string | number | null; currency: string; termsVersion: string;
};
type Rule = {
  id: string; feeCode: string; displayName: string; description: string | null;
  feeKind: "FIXED" | "PERCENTAGE"; amountMinor: string | number | null;
  rateBasisPoints: number | null; currency: string; countryCode: string | null;
  serviceCode: string | null; membershipTier: string | null; enabled: boolean;
  effectiveFrom: string | null; effectiveUntil: string | null;
};
const emptyRule = {
  feeCode: "", displayName: "", description: "", feeKind: "FIXED" as "FIXED" | "PERCENTAGE",
  amountMinor: "", rateBasisPoints: "", currency: "NGN", countryCode: "",
  serviceCode: "", membershipTier: "", enabled: false, effectiveFrom: "", effectiveUntil: "",
};
type RuleForm = typeof emptyRule;

function FeesWorkspace() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [ruleForm, setRuleForm] = useState<RuleForm>(emptyRule);
  const [editingRule, setEditingRule] = useState<string | null>(null);
  const [programForms, setProgramForms] = useState<Record<string, {
    displayName: string; description: string; enabled: boolean;
    monthlyPriceMinor: string; annualPriceMinor: string;
    currency: string; termsVersion: string;
  }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, r] = await Promise.all([
        fetchJson<Program[]>("/admin/fees/membership-programs"),
        fetchJson<Rule[]>("/admin/fees/rules"),
      ]);
      setPrograms(p);
      setRules(r);
      setProgramForms(Object.fromEntries(p.map((item) => [item.programCode, {
        displayName: item.displayName, description: item.description ?? "",
        enabled: item.enabled,
        monthlyPriceMinor: item.monthlyPriceMinor == null ? "" : String(Number(item.monthlyPriceMinor) / 100),
        annualPriceMinor: item.annualPriceMinor == null ? "" : String(Number(item.annualPriceMinor) / 100),
        currency: item.currency, termsVersion: item.termsVersion,
      }])));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load fee settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function saveProgram(code: string) {
    const form = programForms[code];
    if (!form) return;
    setSaving(true); setMessage("");
    try {
      await fetchJson<Program>("/admin/fees/membership-programs/" + code, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          monthlyPriceMinor: form.monthlyPriceMinor === "" ? null : Math.round(Number(form.monthlyPriceMinor) * 100),
          annualPriceMinor: form.annualPriceMinor === "" ? null : Math.round(Number(form.annualPriceMinor) * 100),
        }),
      });
      setMessage(code + " membership settings saved.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save membership settings.");
    } finally { setSaving(false); }
  }

  function editRule(rule: Rule) {
    setEditingRule(rule.id);
    setRuleForm({
      feeCode: rule.feeCode, displayName: rule.displayName, description: rule.description ?? "",
      feeKind: rule.feeKind, amountMinor: rule.amountMinor == null ? "" : String(rule.amountMinor),
      rateBasisPoints: rule.rateBasisPoints == null ? "" : String(rule.rateBasisPoints),
      currency: rule.currency, countryCode: rule.countryCode ?? "",
      serviceCode: rule.serviceCode ?? "", membershipTier: rule.membershipTier ?? "",
      enabled: rule.enabled,
      effectiveFrom: rule.effectiveFrom ? rule.effectiveFrom.slice(0, 16) : "",
      effectiveUntil: rule.effectiveUntil ? rule.effectiveUntil.slice(0, 16) : "",
    });
  }

  async function saveRule(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setMessage("");
    const payload = {
      ...ruleForm,
      amountMinor: ruleForm.feeKind === "FIXED" ? Number(ruleForm.amountMinor) : null,
      rateBasisPoints: ruleForm.feeKind === "PERCENTAGE" ? Number(ruleForm.rateBasisPoints) : null,
      countryCode: ruleForm.countryCode || null,
      serviceCode: ruleForm.serviceCode || null,
      membershipTier: ruleForm.membershipTier || null,
      effectiveFrom: ruleForm.effectiveFrom || null,
      effectiveUntil: ruleForm.effectiveUntil || null,
    };
    try {
      await fetchJson<Rule>(
        editingRule ? "/admin/fees/rules/" + editingRule : "/admin/fees/rules",
        { method: editingRule ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      );
      setMessage("Fee rule saved. Its change is recorded in the audit log.");
      setEditingRule(null); setRuleForm(emptyRule); await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save fee rule.");
    } finally { setSaving(false); }
  }

  return (
    <main className="mx-auto max-w-7xl space-y-8 p-4 sm:p-6">
      <header>
        <p className="text-sm font-semibold text-teal-700">CHIMZO · SUPER ADMIN</p>
        <h1 className="mt-1 text-2xl font-bold text-[#08205B]">Fees & membership</h1>
        <p className="mt-2 text-sm text-slate-600">
          Configure membership prices and platform fee definitions. Enter membership prices in naira (?) or dollars ($); CHIMZO converts them automatically when saving.
        </p>
      </header>

      {message && <p role="status" className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">{message}</p>}
      {loading && <p className="text-sm text-slate-500">Loading configuration…</p>}

      <section className="space-y-4">
        <h2 className="text-lg font-bold text-slate-900">Membership programs</h2>
        <div className="grid gap-4 lg:grid-cols-3">
          {programs.map((program) => {
            const form = programForms[program.programCode];
            if (!form) return null;
            const set = (key: keyof typeof form, value: string | boolean) =>
              setProgramForms((current) => ({ ...current, [program.programCode]: { ...current[program.programCode], [key]: value } }));
            return (
              <article key={program.id} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
                <h3 className="font-bold text-[#08205B]">{program.displayName}</h3>
                <label className="block text-sm">Display name
                  <input className="mt-1 w-full rounded-lg border p-2" value={form.displayName} onChange={(e) => set("displayName", e.target.value)} required maxLength={120} />
                </label>
                <label className="block text-sm">Description
                  <textarea className="mt-1 w-full rounded-lg border p-2" value={form.description} onChange={(e) => set("description", e.target.value)} maxLength={4000} />
                </label>
                <label className="block text-sm">Currency
                  <select className="mt-1 w-full rounded-lg border p-2" value={form.currency} onChange={(e) => set("currency", e.target.value)}>
                    <option value="NGN">NGN</option><option value="USD">USD</option>
                  </select>
                </label>
                <label className="block text-sm">{form.currency === "NGN" ? "Monthly price (?)" : "Monthly price ($)"}
                  <input type="number" min="0" step="0.01" className="mt-1 w-full rounded-lg border p-2" value={form.monthlyPriceMinor} onChange={(e) => set("monthlyPriceMinor", e.target.value)} />
                </label>
                <label className="block text-sm">{form.currency === "NGN" ? "Annual price (?)" : "Annual price ($)"}
                  <input type="number" min="0" step="0.01" className="mt-1 w-full rounded-lg border p-2" value={form.annualPriceMinor} onChange={(e) => set("annualPriceMinor", e.target.value)} />
                </label>
                <label className="block text-sm">Terms version
                  <input className="mt-1 w-full rounded-lg border p-2" value={form.termsVersion} onChange={(e) => set("termsVersion", e.target.value)} required maxLength={120} />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.enabled} onChange={(e) => set("enabled", e.target.checked)} />
                  Enable program
                </label>
                <button disabled={saving} onClick={() => void saveProgram(program.programCode)} className="rounded-lg bg-[#08205B] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  Save membership
                </button>
              </article>
            );
          })}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-bold text-slate-900">Platform fee rules</h2>
        <form onSubmit={saveRule} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-sm">Fee code
              <input required maxLength={80} pattern="[A-Za-z0-9_]{2,80}" className="mt-1 w-full rounded-lg border p-2" value={ruleForm.feeCode} onChange={(e) => setRuleForm({ ...ruleForm, feeCode: e.target.value.toUpperCase() })} />
            </label>
            <label className="text-sm">Display name
              <input required maxLength={160} className="mt-1 w-full rounded-lg border p-2" value={ruleForm.displayName} onChange={(e) => setRuleForm({ ...ruleForm, displayName: e.target.value })} />
            </label>
            <label className="text-sm">Fee type
              <select className="mt-1 w-full rounded-lg border p-2" value={ruleForm.feeKind} onChange={(e) => setRuleForm({ ...ruleForm, feeKind: e.target.value as RuleForm["feeKind"] })}>
                <option value="FIXED">Fixed amount</option><option value="PERCENTAGE">Percentage</option>
              </select>
            </label>
            {ruleForm.feeKind === "FIXED" ? (
              <label className="text-sm">Amount (minor units)
                <input required type="number" min="0" step="1" className="mt-1 w-full rounded-lg border p-2" value={ruleForm.amountMinor} onChange={(e) => setRuleForm({ ...ruleForm, amountMinor: e.target.value })} />
              </label>
            ) : (
              <label className="text-sm">Percentage (basis points; 100 = 1%)
                <input required type="number" min="0" max="10000" step="1" className="mt-1 w-full rounded-lg border p-2" value={ruleForm.rateBasisPoints} onChange={(e) => setRuleForm({ ...ruleForm, rateBasisPoints: e.target.value })} />
              </label>
            )}
            <label className="text-sm">Currency
              <select className="mt-1 w-full rounded-lg border p-2" value={ruleForm.currency} onChange={(e) => setRuleForm({ ...ruleForm, currency: e.target.value })}>
                <option value="NGN">NGN</option><option value="USD">USD</option>
              </select>
            </label>
            <label className="text-sm">Country code (optional)
              <input maxLength={2} placeholder="NG" className="mt-1 w-full rounded-lg border p-2" value={ruleForm.countryCode} onChange={(e) => setRuleForm({ ...ruleForm, countryCode: e.target.value.toUpperCase() })} />
            </label>
            <label className="text-sm">Service code (optional)
              <input maxLength={80} placeholder="MARKETPLACE_ORDER" className="mt-1 w-full rounded-lg border p-2" value={ruleForm.serviceCode} onChange={(e) => setRuleForm({ ...ruleForm, serviceCode: e.target.value.toUpperCase() })} />
            </label>
            <label className="text-sm">Membership tier (optional)
              <select className="mt-1 w-full rounded-lg border p-2" value={ruleForm.membershipTier} onChange={(e) => setRuleForm({ ...ruleForm, membershipTier: e.target.value })}>
                <option value="">All tiers</option><option value="CUSTOMER">CUSTOMER</option><option value="SELLER">SELLER</option><option value="WHOLESALER">WHOLESALER</option><option value="DISTRIBUTOR">DISTRIBUTOR</option>
              </select>
            </label>
            <label className="text-sm">Effective from (optional)
              <input type="datetime-local" className="mt-1 w-full rounded-lg border p-2" value={ruleForm.effectiveFrom} onChange={(e) => setRuleForm({ ...ruleForm, effectiveFrom: e.target.value })} />
            </label>
            <label className="text-sm">Effective until (optional)
              <input type="datetime-local" className="mt-1 w-full rounded-lg border p-2" value={ruleForm.effectiveUntil} onChange={(e) => setRuleForm({ ...ruleForm, effectiveUntil: e.target.value })} />
            </label>
            <label className="text-sm sm:col-span-2">Description (optional)
              <input maxLength={4000} className="mt-1 w-full rounded-lg border p-2" value={ruleForm.description} onChange={(e) => setRuleForm({ ...ruleForm, description: e.target.value })} />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={ruleForm.enabled} onChange={(e) => setRuleForm({ ...ruleForm, enabled: e.target.checked })} />
            Enable rule definition
          </label>
          <div className="flex flex-wrap gap-3">
            <button disabled={saving} className="rounded-lg bg-[#08205B] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {saving ? "Saving…" : editingRule ? "Update rule" : "Create rule"}
            </button>
            {editingRule && <button type="button" onClick={() => { setEditingRule(null); setRuleForm(emptyRule); }} className="rounded-lg border px-4 py-2 text-sm">Cancel edit</button>}
          </div>
        </form>

        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y text-sm">
            <thead className="bg-slate-50 text-left"><tr><th className="p-3">Rule</th><th className="p-3">Type / value</th><th className="p-3">Applicability</th><th className="p-3">Status</th><th className="p-3">Action</th></tr></thead>
            <tbody className="divide-y">
              {rules.map((rule) => <tr key={rule.id}>
                <td className="p-3"><p className="font-semibold">{rule.displayName}</p><p className="text-xs text-slate-500">{rule.feeCode}</p></td>
                <td className="p-3">{rule.feeKind === "FIXED" ? rule.currency + " " + rule.amountMinor + " minor units" : (((rule.rateBasisPoints ?? 0) / 100).toFixed(2) + "%")}</td>
                <td className="p-3 text-slate-600">{[rule.countryCode, rule.serviceCode, rule.membershipTier].filter(Boolean).join(" · ") || "All matching contexts"}</td>
                <td className="p-3">{rule.enabled ? "Enabled" : "Disabled"}</td>
                <td className="p-3"><button type="button" onClick={() => editRule(rule)} className="font-semibold text-blue-700">Edit</button></td>
              </tr>)}
              {!loading && rules.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-slate-500">No fee rules configured yet.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="text-xs leading-5 text-slate-500">
          Fee rules are definitions only. They will not charge customers until checkout explicitly consumes them.
          Existing payment intents retain their stored amount and currency.
        </p>
      </section>
    </main>
  );
}

export default function AdminFeesPage() {
  return <ProtectedRoute roles={["SUPER_ADMIN"]}><FeesWorkspace /></ProtectedRoute>;
}

