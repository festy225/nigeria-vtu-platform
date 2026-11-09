"use client";

import { useCallback, useEffect, useState } from "react";
import { ProtectedRoute } from "@/components/protected-route";
import { fetchJson } from "@/lib/api";

type Program = {
  id: string; programCode: string; displayName: string; description: string | null;
  enabled: boolean; monthlyPriceMinor: string | number | null;
  annualPriceMinor: string | number | null; currency: string; termsVersion: string;
  validityDuration: number | null; validityUnit: string | null;
  termsAndConditions: string | null; updatedAt: string; updatedByUserId: string | null;
  updatedByEmail: string | null; updatedByPhone: string | null;
};
type MembershipPayment = {
  paymentId: string; paymentReference: string; userId: string; userEmail: string | null;
  programCode: string; programName: string; amountMinor: string | number; currency: string;
  billingPeriod: string; state: string; providerName: string | null;
  providerReference: string | null; createdAt: string;
};
type MembershipPaymentPage = {
  items: MembershipPayment[];
  total: number;
  limit: number;
  offset: number;
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
  const [activeProgramCode, setActiveProgramCode] = useState("SELLER");
  const [membershipPayments, setMembershipPayments] = useState<MembershipPayment[]>([]);
  const [historyProgram, setHistoryProgram] = useState("");
  const [historyState, setHistoryState] = useState("");
  const [historyOffset, setHistoryOffset] = useState(0);
  const [historyTotal, setHistoryTotal] = useState(0);
  const historyLimit = 50;
  const [rules, setRules] = useState<Rule[]>([]);
  const [ruleForm, setRuleForm] = useState<RuleForm>(emptyRule);
  const [editingRule, setEditingRule] = useState<string | null>(null);
  const [programForms, setProgramForms] = useState<Record<string, {
    displayName: string; description: string; enabled: boolean;
    monthlyPriceMinor: string; annualPriceMinor: string;
    currency: string; validityDuration: string; validityUnit: string;
    termsVersion: string; termsAndConditions: string;
  }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const loadPaymentHistory = useCallback(async () => {
    const params = new URLSearchParams();
    if (historyProgram) params.set("programCode", historyProgram);
    if (historyState) params.set("state", historyState);
    params.set("limit", String(historyLimit));
    params.set("offset", String(historyOffset));
    const query = params.toString();
    const suffix = query ? `?${query}` : "";
    try {
      const page = await fetchJson<MembershipPaymentPage>(
        `/admin/fees/membership-payments${suffix}`,
      );
      setMembershipPayments(page.items);
      setHistoryTotal(page.total);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load membership payment history.");
    }
  }, [historyLimit, historyOffset, historyProgram, historyState]);

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
        currency: item.currency,
        validityDuration: item.validityDuration == null ? "" : String(item.validityDuration),
        validityUnit: item.validityUnit ?? "",
        termsVersion: item.termsVersion,
        termsAndConditions: item.termsAndConditions ?? "",
      }])));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load fee settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadPaymentHistory(); }, [loadPaymentHistory]);

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
          Configure each membership program, its terms and prices, and platform fee definitions. Enter membership prices in major currency units; CHIMZO stores them in minor units.
        </p>
      </header>

      {message && <p role="status" className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">{message}</p>}
      {loading && <p className="text-sm text-slate-500">Loading configuration…</p>}

      <section className="space-y-4">
        <h2 className="text-lg font-bold text-slate-900">Membership programs</h2>
        <div role="tablist" aria-label="Membership program configuration" className="flex flex-wrap gap-2">
          {([
            ["SELLER", "Seller Membership"],
            ["WHOLESALER", "Wholesaler Membership"],
            ["DISTRIBUTOR", "Distributor Membership"],
          ] as const).map(([code, label]) => (
            <button
              key={code}
              type="button"
              role="tab"
              aria-selected={activeProgramCode === code}
              onClick={() => setActiveProgramCode(code)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold ${activeProgramCode === code ? "bg-[#08205B] text-white" : "border border-slate-300 bg-white text-slate-700"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {(() => {
            const program = programs.find((item) => item.programCode === activeProgramCode);
            const form = program ? programForms[program.programCode] : undefined;
            if (!program || !form) {
              return <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                {activeProgramCode} configuration is not present in the database. Apply the membership configuration migration before configuring this program.
              </p>;
            }
            const set = (key: keyof typeof form, value: string | boolean) =>
              setProgramForms((current) => ({ ...current, [program.programCode]: { ...current[program.programCode], [key]: value } }));
            return (
              <article key={program.id} role="tabpanel" className="max-w-3xl space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
                <h3 className="font-bold text-[#08205B]">{activeProgramCode === "SELLER" ? "Seller Membership" : activeProgramCode === "WHOLESALER" ? "Wholesaler Membership" : "Distributor Membership"}</h3>
                <aside className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-950">
                  <p className="font-semibold">Eligibility and upgrade requirements (enforced by the API)</p>
                  <p className="mt-1">
                    {program.programCode === "SELLER"
                      ? "A customer must accept the current Seller terms and complete a verified successful Seller payment. Seller application approval and verified KYC are required before upgrading."
                      : program.programCode === "WHOLESALER"
                        ? "An existing Seller account must be approved, KYC-verified, and have active Seller membership with current terms accepted. Wholesaler terms and a verified successful Wholesaler payment are also required."
                        : "An existing approved Wholesaler account must have verified KYC and active Seller and Wholesaler memberships with current terms accepted. Distributor terms and a verified successful Distributor payment are also required."}
                  </p>
                  <p className="mt-1 text-xs">
                    The CUSTOMER → SELLER → WHOLESALER → DISTRIBUTOR sequence is mandatory and cannot be bypassed by changing program prices or terms.
                  </p>
                </aside>
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
                <label className="block text-sm">Monthly price ({form.currency})
                  <input type="number" min="0" step="0.01" className="mt-1 w-full rounded-lg border p-2" value={form.monthlyPriceMinor} onChange={(e) => set("monthlyPriceMinor", e.target.value)} />
                </label>
                <label className="block text-sm">Annual price ({form.currency})
                  <input type="number" min="0" step="0.01" className="mt-1 w-full rounded-lg border p-2" value={form.annualPriceMinor} onChange={(e) => set("annualPriceMinor", e.target.value)} />
                </label>
                <label className="block text-sm">Membership duration (optional; blank means no expiry)
                  <input type="number" min="1" step="1" className="mt-1 w-full rounded-lg border p-2" value={form.validityDuration} onChange={(e) => set("validityDuration", e.target.value)} />
                </label>
                <label className="block text-sm">Duration unit
                  <select className="mt-1 w-full rounded-lg border p-2" value={form.validityUnit} onChange={(e) => set("validityUnit", e.target.value)}>
                    <option value="">No expiry</option><option value="DAY">Days</option><option value="WEEK">Weeks</option><option value="MONTH">Months</option><option value="YEAR">Years</option>
                  </select>
                </label>
                <label className="block text-sm">Terms version
                  <input className="mt-1 w-full rounded-lg border p-2" value={form.termsVersion} onChange={(e) => set("termsVersion", e.target.value)} required maxLength={120} />
                </label>
                <label className="block text-sm">Membership terms and conditions
                  <textarea className="mt-1 min-h-36 w-full rounded-lg border p-2" value={form.termsAndConditions} onChange={(e) => set("termsAndConditions", e.target.value)} maxLength={20000} />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.enabled} onChange={(e) => set("enabled", e.target.checked)} />
                  Enable program
                </label>
                <button disabled={saving} onClick={() => void saveProgram(program.programCode)} className="rounded-lg bg-[#08205B] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  Save membership
                </button>
                <p className="text-xs text-slate-500">
                  Last updated: {program.updatedAt ? new Date(program.updatedAt).toLocaleString() : "Not recorded"}
                  {" · "}
                  Administrator: {program.updatedByEmail ?? program.updatedByPhone ?? program.updatedByUserId ?? "Not recorded"}
                </p>
              </article>
            );
        })()}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-bold text-slate-900">Membership payment history</h2>
        <div className="flex flex-wrap gap-3">
          <label className="text-sm">Program
            <select className="ml-2 rounded-lg border p-2" value={historyProgram} onChange={(event) => { setHistoryProgram(event.target.value); setHistoryOffset(0); }}>
              <option value="">All programs</option>
              <option value="SELLER">Seller</option>
              <option value="WHOLESALER">Wholesaler</option>
              <option value="DISTRIBUTOR">Distributor</option>
            </select>
          </label>
          <label className="text-sm">Payment status
            <select className="ml-2 rounded-lg border p-2" value={historyState} onChange={(event) => { setHistoryState(event.target.value); setHistoryOffset(0); }}>
              <option value="">All statuses</option>
              <option value="PENDING">Pending</option>
              <option value="AUTHORIZED">Authorized</option>
              <option value="SUCCESSFUL">Successful</option>
              <option value="FAILED">Failed</option>
              <option value="REFUNDED">Refunded</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="UNKNOWN">Unknown</option>
            </select>
          </label>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr><th className="p-3">Date</th><th className="p-3">Program</th><th className="p-3">Account</th><th className="p-3">Amount</th><th className="p-3">Period</th><th className="p-3">Status</th><th className="p-3">Reference</th></tr>
            </thead>
            <tbody>
              {membershipPayments.map((payment) => (
                <tr key={payment.paymentId} className="border-t border-slate-100">
                  <td className="whitespace-nowrap p-3">{new Date(payment.createdAt).toLocaleString()}</td>
                  <td className="p-3">{payment.programName}</td>
                  <td className="p-3">{payment.userEmail ?? payment.userId}</td>
                  <td className="whitespace-nowrap p-3">{new Intl.NumberFormat(undefined, { style: "currency", currency: payment.currency }).format(Number(payment.amountMinor) / 100)}</td>
                  <td className="p-3">{payment.billingPeriod}</td>
                  <td className="p-3">{payment.state}</td>
                  <td className="p-3">{payment.paymentReference}</td>
                </tr>
              ))}
              {!membershipPayments.length && <tr><td className="p-4 text-slate-500" colSpan={7}>No membership payments match these filters.</td></tr>}
            </tbody>
          </table>
          <div className="flex items-center justify-between gap-3 px-3 pb-3 text-xs text-slate-500">
            <span>
              {historyTotal === 0
                ? "No matching payments"
                : `Showing ${historyOffset + 1}–${Math.min(historyOffset + historyLimit, historyTotal)} of ${historyTotal}`}
            </span>
            <div className="flex gap-2">
              <button type="button" disabled={historyOffset === 0} onClick={() => setHistoryOffset((offset) => Math.max(0, offset - historyLimit))} className="rounded border px-2 py-1 disabled:opacity-40">Previous</button>
              <button type="button" disabled={historyOffset + historyLimit >= historyTotal} onClick={() => setHistoryOffset((offset) => offset + historyLimit)} className="rounded border px-2 py-1 disabled:opacity-40">Next</button>
            </div>
          </div>
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
