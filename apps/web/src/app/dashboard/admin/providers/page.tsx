"use client";

import { useCallback, useEffect, useState } from "react";
import { ProtectedRoute } from "@/components/protected-route";
import { useAuth } from "@/components/providers/auth-provider";
import {
  api,
  ApiError,
  type AdminProviderRecord,
  type AdminProviderConfiguration,
  type AdminProviderHealth,
} from "@/lib/api";
import { Badge, Button, Card } from "@/components/ui/primitives";

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "The request could not be completed.";
}

function parseObject(
  value: string,
  label: string,
): Record<string, unknown> | undefined {
  if (!value.trim()) return undefined;
  const parsed: unknown = JSON.parse(value);
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error(label + " must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

function ProviderAdministration() {
  const { hasRole } = useAuth();
  const isSuperAdmin = hasRole("SUPER_ADMIN");

  const [providers, setProviders] = useState<AdminProviderRecord[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [configurations, setConfigurations] = useState<
    AdminProviderConfiguration[]
  >([]);
  const [health, setHealth] = useState<AdminProviderHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [savingProvider, setSavingProvider] = useState(false);
  const [savingConfiguration, setSavingConfiguration] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showProviderForm, setShowProviderForm] = useState(false);
  const [showConfigurationForm, setShowConfigurationForm] = useState(false);

  const [providerName, setProviderName] = useState("");
  const [adapterKey, setAdapterKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [capabilitiesJson, setCapabilitiesJson] = useState("{}");

  const [serviceId, setServiceId] = useState("");
  const [priority, setPriority] = useState("100");
  const [isPrimary, setIsPrimary] = useState(false);
  const [isBackup, setIsBackup] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [secretRef, setSecretRef] = useState("");
  const [configurationJson, setConfigurationJson] = useState("{}");

  const [editingConfigurationId, setEditingConfigurationId] = useState("");
  const [editPriority, setEditPriority] = useState("100");
  const [editIsPrimary, setEditIsPrimary] = useState(false);
  const [editIsBackup, setEditIsBackup] = useState(false);
  const [editEnabled, setEditEnabled] = useState(true);
  const [editSecretRef, setEditSecretRef] = useState("");
  const [editConfigurationJson, setEditConfigurationJson] = useState("{}");

  const loadProviders = useCallback(async (preferredId?: string) => {
    setLoading(true);
    setError("");
    try {
      const result = await api.getAdminProviders();
      setProviders(result);
      setSelectedId((currentId) =>
        preferredId && result.some((item) => item.id === preferredId)
          ? preferredId
          : currentId && result.some((item) => item.id === currentId)
            ? currentId
            : (result[0]?.id ?? ""),
      );
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, []);
  const loadDetails = useCallback(async (providerId: string) => {
    if (!providerId) {
      setConfigurations([]);
      setHealth([]);
      return;
    }
    setDetailsLoading(true);
    setError("");
    try {
      const [configurationResult, healthResult] = await Promise.all([
        api.getAdminProviderConfigurations(providerId),
        api.getAdminProviderHealth(providerId),
      ]);
      setConfigurations(configurationResult);
      setHealth(healthResult);
    } catch (requestError) {
      setError(errorMessage(requestError));
      setConfigurations([]);
      setHealth([]);
    } finally {
      setDetailsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProviders();
  }, [loadProviders]);

  useEffect(() => {
    void loadDetails(selectedId);
  }, [selectedId, loadDetails]);

  async function submitProvider(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setSavingProvider(true);
    try {
      const capabilities = parseObject(capabilitiesJson, "Capabilities");
      const created = await api.createAdminProvider({
        name: providerName.trim(),
        adapterKey: adapterKey.trim(),
        ...(baseUrl.trim() ? { baseUrl: baseUrl.trim() } : {}),
        ...(capabilities ? { capabilities } : {}),
      });
      setProviderName("");
      setAdapterKey("");
      setBaseUrl("");
      setCapabilitiesJson("{}");
      setShowProviderForm(false);
      setNotice("Provider created successfully.");
      await loadProviders(created.id);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSavingProvider(false);
    }
  }

  async function submitConfiguration(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId) return;
    setError("");
    setNotice("");
    setSavingConfiguration(true);
    try {
      const trimmedSecretRef = secretRef.trim();
      const validEnvReference = /^env:[A-Z][A-Z0-9_]*$/.test(trimmedSecretRef);
      const validFlutterwaveVaultReference =
        selectedProvider?.adapterKey === "FLUTTERWAVE" &&
        trimmedSecretRef === "vault:" + selectedId + ":api_secret";

      if (!validEnvReference && !validFlutterwaveVaultReference) {
        throw new Error(
          "Use env:VARIABLE_NAME, or vault:<this Flutterwave provider ID>:api_secret."
        );
      }

      const config = parseObject(configurationJson, "Configuration");
      await api.createAdminProviderConfiguration({
        providerId: selectedId,
        ...(serviceId.trim() ? { serviceId: serviceId.trim() } : {}),
        priority: Number(priority),
        isPrimary,
        isBackup,
        enabled,
        secretRef: trimmedSecretRef,
        ...(config ? { config } : {}),
      });
      setServiceId("");
      setPriority("100");
      setIsPrimary(false);
      setIsBackup(false);
      setEnabled(true);
      setSecretRef("");
      setConfigurationJson("{}");
      setShowConfigurationForm(false);
      setNotice(
        "Provider configuration created. Secret references are not displayed.",
      );
      await loadDetails(selectedId);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSavingConfiguration(false);
    }
  }

  function beginEditConfiguration(item: AdminProviderConfiguration) {
    setEditingConfigurationId(item.id);
    setEditPriority(String(item.priority));
    setEditIsPrimary(item.isPrimary);
    setEditIsBackup(item.isBackup);
    setEditEnabled(item.enabled);
    setEditSecretRef(item.secretRef);
    setEditConfigurationJson(JSON.stringify(item.config ?? {}, null, 2));
    setShowConfigurationForm(false);
    setError("");
    setNotice("");
  }

  async function submitConfigurationUpdate(
    event: React.FormEvent<HTMLFormElement>,
    configurationId: string,
  ) {
    event.preventDefault();
    if (!isSuperAdmin) return;

    setError("");
    setNotice("");
    setSavingConfiguration(true);

    try {
      const parsedConfig = parseObject(
        editConfigurationJson,
        "Configuration",
      );
      const trimmedSecretRef = editSecretRef.trim();

            const validEnvReference = /^env:[A-Z][A-Z0-9_]*$/.test(trimmedSecretRef);
      const validFlutterwaveVaultReference =
        selectedProvider?.adapterKey === "FLUTTERWAVE" &&
        trimmedSecretRef === "vault:" + selectedId + ":api_secret";

      if (!validEnvReference && !validFlutterwaveVaultReference) {
        throw new Error(
          "Use env:VARIABLE_NAME, or vault:<this Flutterwave provider ID>:api_secret."
        );
      }

      await api.updateAdminProviderConfiguration(configurationId, {
        priority: Number(editPriority),
        isPrimary: editIsPrimary,
        isBackup: editIsBackup,
        enabled: editEnabled,
        secretRef: trimmedSecretRef,
        ...(parsedConfig ? { config: parsedConfig } : {}),
      });

      setEditingConfigurationId("");
      setNotice("Provider configuration updated successfully.");
      await loadDetails(selectedId);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSavingConfiguration(false);
    }
  }

  const selectedProvider = providers.find(
    (provider) => provider.id === selectedId,
  );

  return (
    <div className="space-y-6">
      {" "}
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        {" "}
        <div>
          {" "}
          <p className="eyebrow">CHIMZO · System administration</p>{" "}
          <h1 className="mt-2 text-3xl font-bold text-white">
            Provider administration
          </h1>{" "}
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Manage provider records, routing configurations and available health
            information. Provider credentials must remain in your server-side
            secret store.{" "}
          </p>{" "}
        </div>{" "}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => void loadProviders(selectedId)}
          >
            Refresh{" "}
          </Button>
          <Button
            type="button"
            onClick={() => setShowProviderForm((value) => !value)}
          >
            {showProviderForm ? "Close provider form" : "Add provider"}{" "}
          </Button>{" "}
        </div>{" "}
      </header>
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          {error}
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
        >
          {notice}
        </div>
      )}
      {showProviderForm && (
        <Card>
          <h2 className="text-lg font-semibold text-white">
            Register provider
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Register the adapter identity. This does not add credentials or
            activate an external integration by itself.
          </p>
          <form
            onSubmit={submitProvider}
            className="mt-5 grid gap-4 md:grid-cols-2"
          >
            <label className="block text-sm text-slate-300">
              Provider name
              <input
                required
                maxLength={160}
                value={providerName}
                onChange={(event) => setProviderName(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900"
                placeholder="Payment or logistics provider"
              />
            </label>
            <label className="block text-sm text-slate-300">
              Adapter key
              <input
                required
                maxLength={120}
                value={adapterKey}
                onChange={(event) => setAdapterKey(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900"
                placeholder="Configured adapter identifier"
              />
            </label>
            <label className="block text-sm text-slate-300 md:col-span-2">
              Base URL (optional)
              <input
                type="url"
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900"
                placeholder="https://provider.example"
              />
            </label>
            <label className="block text-sm text-slate-300 md:col-span-2">
              Capabilities JSON
              <textarea
                rows={3}
                value={capabilitiesJson}
                onChange={(event) => setCapabilitiesJson(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900"
              />
            </label>
            <div className="flex gap-2 md:col-span-2">
              <Button type="submit" disabled={savingProvider}>
                {savingProvider ? "Saving…" : "Create provider"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowProviderForm(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.7fr)]">
        <Card>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-white">
              Registered providers
            </h2>
            <Badge>{providers.length}</Badge>
          </div>
          {loading ? (
            <p className="mt-4 text-sm text-slate-400">Loading providers…</p>
          ) : providers.length === 0 ? (
            <p className="mt-4 text-sm text-slate-400">
              No providers are registered yet.
            </p>
          ) : (
            <div className="mt-4 space-y-2">
              {providers.map((provider) => (
                <button
                  key={provider.id}
                  type="button"
                  onClick={() => setSelectedId(provider.id)}
                  className={
                    "w-full rounded-xl border p-3 text-left transition " +
                    (provider.id === selectedId
                      ? "border-brand-500 bg-brand-50"
                      : "border-slate-200 hover:border-brand-300")
                  }
                >
                  <span className="flex items-start justify-between gap-2">
                    <span
                      className={
                        "font-semibold " +
                        (provider.id === selectedId
                          ? "text-slate-900"
                          : "text-white")
                      }
                    >
                      {provider.name}
                    </span>
                    <Badge
                      tone={
                        provider.status.toLowerCase() === "active" ||
                        provider.status.toLowerCase() === "enabled"
                          ? "success"
                          : "neutral"
                      }
                    >
                      {provider.status}
                    </Badge>
                  </span>
                  <span className="mt-1 block break-all text-xs text-slate-500">
                    {provider.baseUrl || "No base URL configured"}
                  </span>
                  <span className="mt-2 block text-xs text-slate-500">
                    Adapter capabilities are configuration-driven.
                  </span>
                </button>
              ))}
            </div>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  Provider details
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  Select a provider to inspect its configurations and health
                  records.
                </p>
              </div>
              {selectedProvider && <Badge>{selectedProvider.status}</Badge>}
            </div>
            {!selectedProvider ? (
              <p className="mt-4 text-sm text-slate-400">
                Choose a provider from the list to view details.
              </p>
            ) : (
              <dl className="mt-5 grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">
                    Provider ID
                  </dt>
                  <dd className="mt-1 break-all text-sm text-slate-200">
                    {selectedProvider.id}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">
                    Adapter / capabilities
                  </dt>
                  <dd className="mt-1 break-words text-sm text-slate-200">
                    {JSON.stringify(selectedProvider.capabilities ?? {})}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">
                    Created
                  </dt>
                  <dd className="mt-1 text-sm text-slate-200">
                    {new Date(selectedProvider.createdAt).toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">
                    Last updated
                  </dt>
                  <dd className="mt-1 text-sm text-slate-200">
                    {new Date(selectedProvider.updatedAt).toLocaleString()}
                  </dd>
                </div>
              </dl>
            )}
          </Card>

          {isSuperAdmin && selectedProvider?.adapterKey === "FLUTTERWAVE" && (
            <FlutterwaveCredentialsPanel
              providerId={selectedProvider.id}
              isSuperAdmin={isSuperAdmin}
            />
          )}

          <Card>
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  Configurations
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  Routing priority, primary/backup designation and enabled
                  state.
                </p>
              </div>
              {isSuperAdmin && selectedProvider && (
                <Button
                  type="button"
                  onClick={() => setShowConfigurationForm((value) => !value)}
                >
                  {showConfigurationForm ? "Close form" : "Add configuration"}
                </Button>
              )}
            </div>

            {showConfigurationForm && isSuperAdmin && selectedProvider && (
              <form
                onSubmit={submitConfiguration}
                className="mt-5 space-y-4 rounded-xl border border-slate-200 p-4"
              >
                <p className="text-sm text-slate-500">
                  The secret reference must point to a server-side environment
                  variable, for example env:CHIMZO_PROVIDER_SECRET. Never paste
                  the secret value here.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm text-slate-300">
                    Service ID (optional UUID)
                    <input
                      value={serviceId}
                      onChange={(event) => setServiceId(event.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900"
                      placeholder="Service UUID"
                    />
                  </label>
                  <label className="block text-sm text-slate-300">
                    Priority (1–32767)
                    <input
                      required
                      type="number"
                      min={1}
                      max={32767}
                      step={1}
                      value={priority}
                      onChange={(event) => setPriority(event.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900"
                    />
                  </label>
                  <label className="block text-sm text-slate-300 sm:col-span-2">
                    Secret reference
                    <input
                      required
                      pattern="(env:[A-Z][A-Z0-9_]*|vault:[0-9a-fA-F-]{36}:api_secret)"
                      title="Use env:VARIABLE_NAME format"
                      value={secretRef}
                      onChange={(event) => setSecretRef(event.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-slate-900"
                      placeholder="env:CHIMZO_PROVIDER_SECRET"
                    />
                  </label>
                  <label className="block text-sm text-slate-300 sm:col-span-2">
                    Non-secret configuration JSON
                    <textarea
                      rows={3}
                      value={configurationJson}
                      onChange={(event) =>
                        setConfigurationJson(event.target.value)
                      }
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900"
                    />
                  </label>
                </div>
                <div className="flex flex-wrap gap-5">
                  <label className="flex items-center gap-2 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(event) => setEnabled(event.target.checked)}
                    />{" "}
                    Enabled
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={isPrimary}
                      onChange={(event) => {
                        setIsPrimary(event.target.checked);
                        if (event.target.checked) setIsBackup(false);
                      }}
                    />{" "}
                    Primary
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={isBackup}
                      onChange={(event) => {
                        setIsBackup(event.target.checked);
                        if (event.target.checked) setIsPrimary(false);
                      }}
                    />{" "}
                    Backup
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={savingConfiguration}>
                    {savingConfiguration ? "Saving…" : "Create configuration"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setShowConfigurationForm(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            )}

            {!isSuperAdmin && (
              <p className="mt-3 text-xs text-slate-500">
                Configuration changes are available to Super Admins only.
              </p>
            )}
            {detailsLoading ? (
              <p className="mt-4 text-sm text-slate-400">
                Loading configuration records…
              </p>
            ) : configurations.length === 0 ? (
              <p className="mt-4 text-sm text-slate-400">
                No configurations found for this provider.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {configurations.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-slate-200 p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={item.enabled ? "success" : "warning"}>
                        {item.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                      {item.isPrimary && <Badge tone="success">Primary</Badge>}
                      {item.isBackup && <Badge tone="warning">Backup</Badge>}
                      <span className="text-sm text-slate-500">
                        Priority {item.priority}
                      </span>
                    </div>
                    <p className="mt-2 break-all text-xs text-slate-500">
                      Configuration ID: {item.id}
                    </p>
                    <p className="mt-1 break-all text-xs text-slate-500">
                      Service ID: {item.serviceId || "Not service-specific"}
                    </p>
                    <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
                      {JSON.stringify(item.config ?? {}, null, 2)}
                    </pre>
                    <p className="mt-2 text-xs text-slate-500">
                      Updated: {new Date(item.updatedAt).toLocaleString()}
                    </p>

                    {isSuperAdmin && (
                      <div className="mt-3">
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => beginEditConfiguration(item)}
                          disabled={savingConfiguration}
                        >
                          {editingConfigurationId === item.id
                            ? "Editing configuration"
                            : "Edit configuration"}
                        </Button>

                        {editingConfigurationId === item.id && (
                          <form
                            onSubmit={(event) =>
                              submitConfigurationUpdate(event, item.id)
                            }
                            className="mt-4 space-y-4 rounded-xl border border-slate-200 p-4"
                          >
                            <p className="text-sm text-slate-500">
                              Edit routing and configuration references here.
                              Enter a server-side environment variable reference
                              only. Never enter an actual credential or secret.
                            </p>

                            <label className="block text-sm text-slate-700">
                              Secret reference
                              <input
                                required
                                pattern="(env:[A-Z][A-Z0-9_]*|vault:[0-9a-fA-F-]{36}:api_secret)"
                                title="Use env:VARIABLE_NAME format"
                                value={editSecretRef}
                                onChange={(event) =>
                                  setEditSecretRef(event.target.value)
                                }
                                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-slate-900"
                                placeholder="env:FLUTTERWAVE_SECRET_KEY"
                              />
                            </label>

                            <label className="block text-sm text-slate-700">
                              Priority (1?32767)
                              <input
                                required
                                type="number"
                                min={1}
                                max={32767}
                                step={1}
                                value={editPriority}
                                onChange={(event) =>
                                  setEditPriority(event.target.value)
                                }
                                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900"
                              />
                            </label>

                            <label className="block text-sm text-slate-700">
                              Non-secret configuration JSON
                              <textarea
                                required
                                rows={5}
                                value={editConfigurationJson}
                                onChange={(event) =>
                                  setEditConfigurationJson(event.target.value)
                                }
                                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900"
                              />
                            </label>

                            <div className="flex flex-wrap gap-5">
                              <label className="flex items-center gap-2 text-sm text-slate-700">
                                <input
                                  type="checkbox"
                                  checked={editEnabled}
                                  onChange={(event) =>
                                    setEditEnabled(event.target.checked)
                                  }
                                />
                                Enabled
                              </label>

                              <label className="flex items-center gap-2 text-sm text-slate-700">
                                <input
                                  type="checkbox"
                                  checked={editIsPrimary}
                                  onChange={(event) => {
                                    setEditIsPrimary(event.target.checked);
                                    if (event.target.checked) {
                                      setEditIsBackup(false);
                                    }
                                  }}
                                />
                                Primary
                              </label>

                              <label className="flex items-center gap-2 text-sm text-slate-700">
                                <input
                                  type="checkbox"
                                  checked={editIsBackup}
                                  onChange={(event) => {
                                    setEditIsBackup(event.target.checked);
                                    if (event.target.checked) {
                                      setEditIsPrimary(false);
                                    }
                                  }}
                                />
                                Backup
                              </label>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="submit"
                                disabled={savingConfiguration}
                              >
                                {savingConfiguration
                                  ? "Saving..."
                                  : "Save changes"}
                              </Button>
                              <Button
                                type="button"
                                variant="secondary"
                                disabled={savingConfiguration}
                                onClick={() =>
                                  setEditingConfigurationId("")
                                }
                              >
                                Cancel
                              </Button>
                            </div>
                          </form>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <h2 className="text-lg font-semibold text-white">
              Provider health
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Displays recorded health data when available; opening this page
              does not run a provider health check.
            </p>
            {detailsLoading ? (
              <p className="mt-4 text-sm text-slate-400">
                Loading health records…
              </p>
            ) : health.length === 0 ? (
              <p className="mt-4 text-sm text-slate-400">
                No health records are available for this provider.
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[540px] text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="pb-3 pr-3">Status</th>
                      <th className="pb-3 pr-3">Success rate</th>
                      <th className="pb-3 pr-3">Timeout rate</th>
                      <th className="pb-3 pr-3">Latency</th>
                      <th className="pb-3">Checked</th>
                    </tr>
                  </thead>
                  <tbody>
                    {health.map((record) => (
                      <tr key={record.id} className="border-t border-slate-200">
                        <td className="py-3 pr-3">
                          <Badge>{record.status}</Badge>
                        </td>
                        <td className="py-3 pr-3">
                          {record.successRate == null
                            ? "—"
                            : record.successRate + "%"}
                        </td>
                        <td className="py-3 pr-3">
                          {record.timeoutRate == null
                            ? "—"
                            : record.timeoutRate + "%"}
                        </td>
                        <td className="py-3 pr-3">
                          {record.averageLatencyMs == null
                            ? "—"
                            : record.averageLatencyMs + " ms"}
                        </td>
                        <td className="py-3">
                          {record.checkedAt
                            ? new Date(record.checkedAt).toLocaleString()
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function AdminProvidersPage() {
  return (
    <ProtectedRoute roles={["ADMIN", "SUPER_ADMIN"]}>
      {" "}
      <ProviderAdministration />{" "}
    </ProtectedRoute>
  );
}

function FlutterwaveCredentialsPanel({
  providerId,
  isSuperAdmin,
}: {
  providerId: string;
  isSuperAdmin: boolean;
}) {
  const [status, setStatus] = useState<{
    hasApiSecret: boolean;
    hasWebhookSecret: boolean;
  } | null>(null);

  const [apiSecret, setApiSecret] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;

    setLoading(true);
    setError("");

    api.getAdminProviderSecretStatus(providerId)
      .then((result) => {
        if (active) setStatus(result);
      })
      .catch((requestError) => {
        if (active) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Could not load credential status."
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [providerId]);

  async function saveCredentials(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    setError("");
    setNotice("");

    const payload: {
      apiSecret?: string;
      webhookSecret?: string;
    } = {};

    if (apiSecret.trim()) {
      payload.apiSecret = apiSecret.trim();
    }

    if (webhookSecret.trim()) {
      payload.webhookSecret = webhookSecret.trim();
    }

    if (!payload.apiSecret && !payload.webhookSecret) {
      setError("Enter at least one credential to save.");
      return;
    }

    setSaving(true);

    try {
      const result = await api.updateAdminProviderSecrets(
        providerId,
        payload
      );

      setStatus(result);
      setApiSecret("");
      setWebhookSecret("");
      setNotice(
        "Flutterwave credentials saved securely. Secret values are not displayed."
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not save Flutterwave credentials."
      );
    } finally {
      setSaving(false);
    }
  }

  if (!isSuperAdmin) return null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-900">
          Flutterwave credentials
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Credentials are encrypted and stored on the server.
          Leave a field blank to preserve its existing value.
        </p>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            API secret
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-800">
            {loading
              ? "Checking..."
              : status?.hasApiSecret
                ? "Configured"
                : "Not configured"}
          </p>
        </div>

        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Webhook secret
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-800">
            {loading
              ? "Checking..."
              : status?.hasWebhookSecret
                ? "Configured"
                : "Not configured"}
          </p>
        </div>
      </div>

      <form onSubmit={saveCredentials} className="space-y-4">
        <div>
          <label
            className="mb-1 block text-sm font-medium text-slate-700"
            htmlFor="flutterwave-api-secret"
          >
            Flutterwave API secret
          </label>
          <input
            id="flutterwave-api-secret"
            type="password"
            autoComplete="new-password"
            value={apiSecret}
            onChange={(event) => setApiSecret(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            placeholder="Enter API secret"
          />
        </div>

        <div>
          <label
            className="mb-1 block text-sm font-medium text-slate-700"
            htmlFor="flutterwave-webhook-secret"
          >
            Flutterwave webhook secret
          </label>
          <input
            id="flutterwave-webhook-secret"
            type="password"
            autoComplete="new-password"
            value={webhookSecret}
            onChange={(event) => setWebhookSecret(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            placeholder="Enter webhook secret"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        {notice && (
          <p role="status" className="text-sm text-emerald-700">
            {notice}
          </p>
        )}

        <button
          type="submit"
          disabled={
            saving ||
            (!apiSecret.trim() && !webhookSecret.trim())
          }
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving
            ? "Saving securely..."
            : "Save Flutterwave credentials"}
        </button>
      </form>
    </section>
  );
}
