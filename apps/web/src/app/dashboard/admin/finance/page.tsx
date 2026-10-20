"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "@/lib/api";
import { ProtectedRoute } from "@/components/protected-route";

type Currency = {
  code: string;
  name: string;
  minor_unit: number;
  enabled: boolean;
};

type FinanceMetric = {
  currency: string;
  status: string;
  count: string;
  amount_minor: string;
  fee_minor?: string;
  commission_minor?: string;
};

type FinanceOverview = {
  currencies: Currency[];
  accountingStatus: string;
  revenue: number | null;
  profit: number | null;
  note: string;
  paymentsByCurrencyAndStatus: FinanceMetric[];
  airtimeByCurrencyAndStatus: FinanceMetric[];
};

type FinanceAccount = {
  id: string;
  code: string;
  name: string;
  account_type: string;
  currency: string;
  enabled: boolean;
  is_system: boolean;
  created_at: string;
};

type ExchangeRate = {
  id: string;
  base_currency: string;
  quote_currency: string;
  rate: string;
  source: string;
  effective_at: string;
  recorded_at: string;
  reason?: string | null;
};

function formatMinor(amount: string, currency: Currency | undefined) {
  const code = currency?.code ?? "XXX";
  const digits = currency?.minor_unit ?? 2;

  try {
    const value = BigInt(amount || "0");
    const negative = value < 0n;
    const absolute = negative ? -value : value;
    const divisor = 10n ** BigInt(digits);
    const major = absolute / divisor;
    const minor = (absolute % divisor).toString().padStart(digits, "0");
    const whole = new Intl.NumberFormat("en", {
      maximumFractionDigits: 0,
    }).format(major);

    return `${negative ? "-" : ""}${code} ${whole}${
      digits ? "." + minor : ""
    }`;
  } catch {
    return `${code} —`;
  }
}

function localDateTimeValue() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function FinanceWorkspace() {
  const [overview, setOverview] = useState<FinanceOverview | null>(null);
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [accountCode, setAccountCode] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountType, setAccountType] = useState("ASSET");
  const [accountCurrency, setAccountCurrency] = useState("NGN");
  const [accountSaving, setAccountSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [baseCurrency, setBaseCurrency] = useState("NGN");
  const [quoteCurrency, setQuoteCurrency] = useState("USD");
  const [rate, setRate] = useState("");
  const [source, setSource] = useState("");
  const [effectiveAt, setEffectiveAt] = useState(localDateTimeValue());
  const [reason, setReason] = useState("");

  const loadFinance = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [summary, exchangeRates, accountRows] = await Promise.all([
        fetchJson<FinanceOverview>("/admin/finance/overview"),
        fetchJson<ExchangeRate[]>("/admin/finance/exchange-rates"),
        fetchJson<FinanceAccount[]>("/admin/finance/accounts"),
      ]);

      setOverview(summary);
      setRates(exchangeRates);
      setAccounts(accountRows);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not load Finance records. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFinance();
  }, [loadFinance]);

  async function saveAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");

    if (!accountCode.trim() || !accountName.trim()) {
      setError("Account code and account name are required.");
      return;
    }

    setAccountSaving(true);
    try {
      await fetchJson<FinanceAccount>("/admin/finance/accounts", {
        method: "POST",
        body: JSON.stringify({
          code: accountCode.trim(),
          name: accountName.trim(),
          accountType,
          currency: accountCurrency,
        }),
      });
      setAccountCode("");
      setAccountName("");
      setNotice("Finance account created.");
      await loadFinance();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the account.");
    } finally {
      setAccountSaving(false);
    }
  }

  async function changeAccountStatus(account: FinanceAccount) {
    setError("");
    setNotice("");
    setAccountSaving(true);
    try {
      await fetchJson<FinanceAccount>(
        `/admin/finance/accounts/${account.id}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({ enabled: !account.enabled }),
        },
      );
      setNotice(`Account ${account.code} updated.`);
      await loadFinance();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the account.");
    } finally {
      setAccountSaving(false);
    }
  }

  async function saveRate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");

    if (baseCurrency === quoteCurrency) {
      setError("Choose two different currencies.");
      return;
    }

    const numericRate = Number(rate);
    if (!Number.isFinite(numericRate) || numericRate <= 0) {
      setError("Exchange rate must be a positive number.");
      return;
    }

    setSaving(true);
    try {
      await fetchJson<ExchangeRate>("/admin/finance/exchange-rates", {
        method: "POST",
        body: JSON.stringify({
          baseCurrency,
          quoteCurrency,
          rate: numericRate,
          source: source.trim(),
          effectiveAt: new Date(effectiveAt).toISOString(),
          ...(reason.trim() ? { reason: reason.trim() } : {}),
        }),
      });

      setRate("");
      setSource("");
      setReason("");
      setNotice("Exchange rate recorded and submitted to the audit-enabled API.");
      await loadFinance();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not record the exchange rate.",
      );
    } finally {
      setSaving(false);
    }
  }

  const currencies = overview?.currencies ?? [];
  const enabledCurrencies = currencies.filter((currency) => currency.enabled);
  const currencyByCode = new Map(
    currencies.map((currency) => [currency.code, currency]),
  );

  return (
    <div className="space-y-7">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-[#2F80ED]">
            SUPER ADMIN / FINANCE
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-[#08205B]">
            Finance & Accounting
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Currency-separated operational records and exchange-rate controls.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadFinance()}
          disabled={loading}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-[#08205B] hover:bg-slate-50 disabled:opacity-60"
        >
          {loading ? "Refreshing…" : "Refresh records"}
        </button>
      </header>

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <h2 className="font-semibold text-amber-950">
          Accounting reconciliation is incomplete
        </h2>
        <p className="mt-2 text-sm leading-6 text-amber-900">
          Payment confirmations and transaction totals are operational metrics,
          not verified company revenue, profit, available seller funds, or
          completed bank/provider settlements. Do not use them as reconciled
          accounting balances.
        </p>
        <p className="mt-2 text-sm font-semibold text-amber-950">
          Accounting status: {overview?.accountingStatus ?? "NOT YET LOADED"}
        </p>
        {overview?.note && (
          <p className="mt-1 text-sm text-amber-900">{overview.note}</p>
        )}
      </section>

      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm text-teal-900">
          {notice}
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Verified company revenue</p>
          <p className="mt-2 text-xl font-bold text-[#08205B]">Not available</p>
          <p className="mt-1 text-xs text-slate-500">
            Requires reconciled accounting records.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Verified company profit</p>
          <p className="mt-2 text-xl font-bold text-[#08205B]">Not available</p>
          <p className="mt-1 text-xs text-slate-500">
            Payment volume and commissions alone do not establish profit.
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-bold text-[#08205B]">
            Customer payment records
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Grouped by the recorded currency and payment status. These totals
            are not bank settlement totals.
          </p>
        </div>

        {loading && !overview ? (
          <p className="rounded-xl bg-white p-5 text-sm text-slate-500">
            Loading Finance records…
          </p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {currencies.map((currency) => {
              const rows = (overview?.paymentsByCurrencyAndStatus ?? []).filter(
                (item) => item.currency === currency.code,
              );
              const total = rows.reduce(
                (sum, item) => sum + BigInt(item.amount_minor || "0"),
                0n,
              );

              return (
                <div
                  key={currency.code}
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                >
                  <div className="border-b border-slate-100 p-5">
                    <p className="text-sm text-slate-500">
                      {currency.name} ({currency.code})
                    </p>
                    <p className="mt-1 text-2xl font-bold text-[#08205B]">
                      {formatMinor(total.toString(), currency)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Sum of payment records across statuses; not settlement.
                    </p>
                  </div>
                  {rows.length ? (
                    <div className="divide-y divide-slate-100">
                      {rows.map((item) => (
                        <div
                          key={`${item.currency}-${item.status}`}
                          className="flex items-center justify-between gap-4 px-5 py-3"
                        >
                          <div>
                            <p className="text-sm font-semibold text-slate-800">
                              {item.status}
                            </p>
                            <p className="text-xs text-slate-500">
                              {item.count} record(s)
                            </p>
                          </div>
                          <p className="text-right text-sm font-semibold text-slate-800">
                            {formatMinor(item.amount_minor, currency)}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="p-5 text-sm text-slate-500">
                      No payment records returned for this currency.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-bold text-[#08205B]">
            Airtime transaction metrics
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Existing transaction records only. Fees and commission fields are
            not treated as verified company earnings.
          </p>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Currency</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Count</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Recorded fees</th>
                <th className="px-4 py-3">Recorded commission</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(overview?.airtimeByCurrencyAndStatus ?? []).map((item, index) => {
                const currency = currencyByCode.get(item.currency);
                return (
                  <tr key={`${item.currency}-${item.status}-${index}`}>
                    <td className="px-4 py-3 font-medium text-slate-800">{item.currency}</td>
                    <td className="px-4 py-3 text-slate-600">{item.status}</td>
                    <td className="px-4 py-3 text-slate-600">{item.count}</td>
                    <td className="px-4 py-3 text-slate-800">{formatMinor(item.amount_minor, currency)}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {item.fee_minor == null ? "—" : formatMinor(item.fee_minor, currency)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {item.commission_minor == null ? "—" : formatMinor(item.commission_minor, currency)}
                    </td>
                  </tr>
                );
              })}
              {!loading && !(overview?.airtimeByCurrencyAndStatus.length) && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    No airtime transaction metrics returned.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-[#08205B]">Create finance account</h2>
          <p className="mt-1 text-sm text-slate-500">
            Create a currency-specific ledger account. Account creation does not itself record revenue or settlement.
          </p>
          <form onSubmit={saveAccount} className="mt-5 space-y-4">
            <label className="block text-sm font-medium text-slate-700">
              Account code
              <input required maxLength={80} value={accountCode}
                onChange={(e) => setAccountCode(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                placeholder="e.g. CASH_NGN" />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Account name
              <input required maxLength={180} value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                placeholder="e.g. Operating cash" />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Account type
              <select value={accountType} onChange={(e) => setAccountType(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                {["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"].map((type) =>
                  <option key={type} value={type}>{type}</option>
                )}
              </select>
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Currency
              <select value={accountCurrency} onChange={(e) => setAccountCurrency(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                {(overview?.currencies ?? []).filter((c) => c.enabled).map((c) =>
                  <option key={c.code} value={c.code}>{c.code} ? {c.name}</option>
                )}
              </select>
            </label>
            <button disabled={accountSaving || !(overview?.currencies ?? []).some((c) => c.enabled)}
              className="w-full rounded-xl bg-[#08205B] px-4 py-3 font-semibold text-white disabled:opacity-60">
              {accountSaving ? "Saving?" : "Create account"}
            </button>
          </form>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-5">
            <h2 className="text-lg font-bold text-[#08205B]">Chart of accounts</h2>
            <p className="mt-1 text-sm text-slate-500">
              Accounts are separated by currency. System accounts cannot be disabled.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3">Account</th>
                  <th className="px-4 py-3">Type / currency</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {accounts.map((account) => (
                  <tr key={account.id}>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-800">{account.code}</div>
                      <div className="text-slate-500">{account.name}</div>
                      {account.is_system && <div className="text-xs text-slate-400">System account</div>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {account.account_type} / {account.currency}
                    </td>
                    <td className="px-4 py-3">
                      <span className={account.enabled
                        ? "rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700"
                        : "rounded-full bg-slate-100 px-2.5 py-1 text-slate-600"}>
                        {account.enabled ? "Enabled" : "Disabled"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button type="button"
                        disabled={accountSaving || (account.is_system && account.enabled)}
                        onClick={() => void changeAccountStatus(account)}
                        className="font-semibold text-[#2F80ED] disabled:cursor-not-allowed disabled:opacity-40">
                        {account.enabled ? "Disable" : "Enable"}
                      </button>
                    </td>
                  </tr>
                ))}
                {accounts.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                    No finance accounts found.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-[#08205B]">
            Record exchange rate
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Enter a rate from a documented source. Recording a rate does not
            automatically convert balances or establish settlement.
          </p>

          <form onSubmit={saveRate} className="mt-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium text-slate-700">
                Base currency
                <select
                  required
                  value={baseCurrency}
                  onChange={(event) => setBaseCurrency(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3"
                >
                  {enabledCurrencies.map((item) => (
                    <option key={item.code} value={item.code}>{item.code}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Quote currency
                <select
                  required
                  value={quoteCurrency}
                  onChange={(event) => setQuoteCurrency(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3"
                >
                  {enabledCurrencies.map((item) => (
                    <option key={item.code} value={item.code}>{item.code}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block text-sm font-medium text-slate-700">
              Rate
              <input
                required
                type="number"
                min="0"
                step="any"
                value={rate}
                onChange={(event) => setRate(event.target.value)}
                placeholder="Enter verified rate"
                className="mt-1 w-full rounded-xl border border-slate-300 p-3"
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Source
              <input
                required
                maxLength={120}
                value={source}
                onChange={(event) => setSource(event.target.value)}
                placeholder="Rate provider or documented source"
                className="mt-1 w-full rounded-xl border border-slate-300 p-3"
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Effective date and time
              <input
                required
                type="datetime-local"
                value={effectiveAt}
                onChange={(event) => setEffectiveAt(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 p-3"
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Reason / audit note (optional)
              <textarea
                rows={2}
                maxLength={1000}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 p-3"
              />
            </label>

            <button
              type="submit"
              disabled={saving || enabledCurrencies.length < 2}
              className="w-full rounded-xl bg-[#08205B] px-4 py-3 font-semibold text-white hover:bg-[#12347D] disabled:opacity-60"
            >
              {saving ? "Recording…" : "Record exchange rate"}
            </button>
            {enabledCurrencies.length < 2 && (
              <p className="text-sm text-amber-800">
                Enable at least two currencies before recording a rate.
              </p>
            )}
          </form>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-5">
            <h2 className="text-lg font-bold text-[#08205B]">
              Recorded exchange rates
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Historical records are shown as returned by the API.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Pair</th>
                  <th className="px-4 py-3">Rate</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Effective</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rates.map((item) => (
                  <tr key={item.id}>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-800">
                      {item.base_currency}/{item.quote_currency}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{item.rate}</td>
                    <td className="px-4 py-3 text-slate-600">{item.source}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {new Date(item.effective_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
                {!loading && rates.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                      No exchange rates have been recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

export default function AdminFinancePage() {
  return (
    <ProtectedRoute roles={["SUPER_ADMIN"]}>
      <FinanceWorkspace />
    </ProtectedRoute>
  );
}