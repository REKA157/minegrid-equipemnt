import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, Eye, EyeOff, ShieldCheck, CheckCircle2, Loader2, Link2, Trash2, Zap, Send, Settings, MessageSquare, ChevronDown, KeyRound, Cpu, Server } from 'lucide-react';
import BackToDashboardButton from '../components/common/BackToDashboardButton';
import {
  getOrgAiStatus,
  setOrgAiKey,
  clearOrgAiKey,
  type AiProvider,
  type AiStatus,
} from '../utils/api/aiCredentials';
import { testAiConnection, askAssistant, type ChatMessage } from '../utils/api/aiAssistant';
import { toast } from '../utils/toast';
import { useMemberScope } from '../hooks/useMemberScope';
import { isInvitedMember } from '../utils/api/memberScope';

interface ModelOption {
  id: string;
  label: string;
}

interface ProviderMeta {
  id: AiProvider;
  label: string;
  badge: string;
  blurb: string;
  keyPlaceholder: string;
  modelPlaceholder: string;
  keyPrefixHint: string;
  helpUrl?: string;
  needsBaseUrl?: boolean;
  models: ModelOption[];
}

const PROVIDERS: ProviderMeta[] = [
  {
    id: 'openai', label: 'OpenAI (ChatGPT)', badge: 'AI', blurb: 'Les modèles GPT.',
    keyPlaceholder: 'sk-…', modelPlaceholder: 'ex : gpt-4o', keyPrefixHint: 'Commence par « sk- »',
    helpUrl: 'https://platform.openai.com/api-keys',
    models: [
      { id: 'gpt-4o', label: 'GPT-4o — polyvalent (recommandé)' },
      { id: 'gpt-4o-mini', label: 'GPT-4o mini — rapide & économique' },
      { id: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
    ],
  },
  {
    id: 'anthropic', label: 'Claude (Anthropic)', badge: 'C', blurb: 'Les modèles Claude.',
    keyPlaceholder: 'sk-ant-…', modelPlaceholder: 'ex : claude-sonnet-4-6', keyPrefixHint: 'Commence par « sk-ant- »',
    helpUrl: 'https://console.anthropic.com/settings/keys',
    models: [
      { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 — équilibré (recommandé)' },
      { id: 'claude-opus-4-8', label: 'Claude Opus 4.8 — le plus puissant' },
      { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 — rapide & économique' },
    ],
  },
  {
    id: 'xai', label: 'Grok (xAI)', badge: 'X', blurb: 'Les modèles Grok.',
    keyPlaceholder: 'xai-…', modelPlaceholder: 'ex : grok-2', keyPrefixHint: 'Commence par « xai- »',
    helpUrl: 'https://console.x.ai',
    models: [
      { id: 'grok-2', label: 'Grok 2 (recommandé)' },
    ],
  },
  {
    id: 'custom', label: 'Autre service', badge: '+', blurb: 'Tout service compatible OpenAI.',
    keyPlaceholder: 'votre clé API', modelPlaceholder: 'nom exact du modèle', keyPrefixHint: 'Indiquez aussi l’adresse du service',
    needsBaseUrl: true, models: [],
  },
];

const providerLabel = (p: AiProvider | null) => PROVIDERS.find((x) => x.id === p)?.label ?? p ?? '';

const SUGGESTIONS = [
  'Rédige une annonce pour une pelle Caterpillar 320 de 2019',
  'À quel prix vendre un chargeur JCB de 2015 en bon état ?',
  'Rédige un message de relance pour un client intéressé mais silencieux',
];

const AiSettings: React.FC = () => {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  const [provider, setProvider] = useState<AiProvider>('openai');
  const [apiKey, setApiKey] = useState('');
  // '' = modèle par défaut ; '__custom__' = saisie libre ; sinon = identifiant du modèle
  const [modelSel, setModelSel] = useState<string>('');
  const [customModel, setCustomModel] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const meta = PROVIDERS.find((p) => p.id === provider)!;
  const configured = !!status?.configured;
  // Configuration de l'IA (fournisseur, clé) réservée au propriétaire/admin ;
  // un membre invité voit seulement le chat (ou un message si non configuré).
  const { scope: memberScope } = useMemberScope();
  const canConfigureAi = !isInvitedMember(memberScope);
  // Modèle réellement envoyé au serveur ('' => le serveur choisit un défaut).
  const effectiveModel = modelSel === '__custom__' ? customModel.trim() : modelSel;

  // Sélectionne un fournisseur et réinitialise le choix de modèle en conséquence.
  const selectProvider = (id: AiProvider) => {
    setProvider(id);
    setError('');
    const m = PROVIDERS.find((p) => p.id === id)!;
    // Fournisseur « Autre » : pas de catalogue → saisie libre directe.
    setModelSel(m.models.length === 0 ? '__custom__' : '');
    setCustomModel('');
  };

  const loadStatus = async () => {
    setLoading(true);
    const s = await getOrgAiStatus();
    setStatus(s);
    if (s.configured && s.provider) {
      setProvider(s.provider);
      const m = PROVIDERS.find((p) => p.id === s.provider);
      if (s.model && m) {
        // Modèle connu du catalogue → on le pré-sélectionne ; sinon saisie libre.
        if (m.models.some((x) => x.id === s.model)) {
          setModelSel(s.model);
          setCustomModel('');
        } else {
          setModelSel('__custom__');
          setCustomModel(s.model);
        }
      } else if (m && m.models.length === 0) {
        setModelSel('__custom__');
      }
    }
    // Sans IA connectée, on ouvre d'emblée les réglages (onboarding).
    setShowSettings(!s.configured);
    setLoading(false);
  };

  useEffect(() => {
    loadStatus();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat, chatBusy]);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (apiKey.trim().length < 8) {
      setError('La clé semble trop courte. Vérifiez que vous l’avez copiée en entier.');
      return;
    }
    setSaving(true);
    const res = await setOrgAiKey(provider, apiKey.trim(), effectiveModel || undefined, baseUrl.trim() || undefined);
    setSaving(false);
    if (res.success) {
      setApiKey('');
      setShowKey(false);
      setTestMsg(null);
      toast('✅ IA connectée !');
      await loadStatus();
      setShowSettings(false);
    } else {
      setError(res.error || 'La connexion a échoué.');
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Déconnecter l’IA de votre société ? L’assistant cessera de fonctionner jusqu’à une nouvelle connexion.')) return;
    const res = await clearOrgAiKey();
    if (res.success) {
      setChat([]);
      setTestMsg(null);
      toast('IA déconnectée.');
      await loadStatus();
    } else {
      toast(`❌ ${res.error || 'Échec de la déconnexion.'}`);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestMsg(null);
    const res = await testAiConnection();
    setTesting(false);
    setTestMsg(
      res.ok
        ? { ok: true, text: `L’IA a répondu : « ${res.reply || 'OK'} »` }
        : { ok: false, text: res.error || 'Le test a échoué.' },
    );
  };

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || chatBusy) return;
    const next: ChatMessage[] = [...chat, { role: 'user', content: t }];
    setChat(next);
    setChatInput('');
    setChatBusy(true);
    const res = await askAssistant(next);
    setChatBusy(false);
    setChat([...next, { role: 'assistant', content: res.ok ? res.reply || '(réponse vide)' : `⚠️ ${res.error || 'Erreur.'}` }]);
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    void send(chatInput);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* En-tête */}
      <div className="bg-white shadow-sm border-b shrink-0">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4 py-4">
            <div className="flex items-center gap-4 min-w-0">
              <BackToDashboardButton />
              <div className="h-6 w-px bg-gray-300" />
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2 truncate">
                <Sparkles className="h-6 w-6 text-orange-600 shrink-0" /> Assistant IA
              </h1>
            </div>
            {configured && canConfigureAi && (
              <button
                onClick={() => setShowSettings((v) => !v)}
                className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:border-orange-300 hover:text-orange-700 transition-colors"
              >
                {showSettings ? <><MessageSquare className="h-4 w-4" /> Revenir au chat</> : <><Settings className="h-4 w-4" /> Paramètres</>}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 min-h-0">
        {loading ? (
          <div className="flex items-center gap-2 text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin" /> Chargement…
          </div>
        ) : !configured && !canConfigureAi ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-600">
            L’assistant IA n’est pas encore configuré. Demandez à un administrateur de votre société de le connecter.
          </div>
        ) : canConfigureAi && (showSettings || !configured) ? (
          /* ---------------- RÉGLAGES / CONNEXION ---------------- */
          <div className="space-y-6">
            <p className="text-gray-600">
              Connectez le compte d’intelligence artificielle de votre société pour activer l’assistant.
              Toute votre équipe en profitera.
            </p>

            {configured && (
              <div className="rounded-xl border border-green-200 bg-green-50 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-6 w-6 text-green-600 shrink-0" />
                    <div>
                      <p className="font-medium text-green-900">Connecté à {providerLabel(status!.provider)}</p>
                      <p className="text-sm text-green-800 mt-0.5">
                        Clé : ••••••••{status!.keyLast4}
                        {status!.model ? <> · Modèle : {status!.model}</> : null}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button onClick={handleTest} disabled={testing} className="inline-flex items-center gap-1.5 rounded-lg border border-green-300 bg-white px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-100 transition-colors disabled:opacity-60">
                      {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />} Tester
                    </button>
                    <button onClick={handleDisconnect} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 transition-colors">
                      <Trash2 className="h-4 w-4" /> Déconnecter
                    </button>
                  </div>
                </div>
                {testMsg && (
                  <div className={`mt-3 rounded-lg px-3 py-2 text-sm ${testMsg.ok ? 'bg-white text-green-800 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                    {testMsg.text}
                  </div>
                )}
              </div>
            )}

            <form onSubmit={handleConnect} className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              {/* Barre de titre style console */}
              <div className="flex items-center gap-2.5 border-b border-gray-100 bg-gray-50/80 px-5 sm:px-6 py-4">
                <Settings className="h-5 w-5 text-gray-500" />
                <div>
                  <h2 className="text-base font-semibold text-gray-900">
                    {configured ? 'Modifier la connexion IA' : 'Configurer l’assistant IA'}
                  </h2>
                  <p className="text-xs text-gray-500">3 étapes : fournisseur, clé, modèle.</p>
                </div>
              </div>

              <div className="p-5 sm:p-6 space-y-6">
                {/* 1. Fournisseur */}
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-700">1</span>
                    <h3 className="text-sm font-semibold text-gray-800">Fournisseur d’IA</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {PROVIDERS.map((p) => {
                      const active = provider === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => selectProvider(p.id)}
                          className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${active ? 'border-orange-500 bg-orange-50 ring-1 ring-orange-500' : 'border-gray-200 bg-white hover:border-gray-300'}`}
                        >
                          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${active ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                            {p.badge}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium text-gray-900 truncate">{p.label}</span>
                            <span className="block text-xs text-gray-500 truncate">{p.blurb}</span>
                          </span>
                          {active && <CheckCircle2 className="h-4 w-4 shrink-0 text-orange-600" />}
                        </button>
                      );
                    })}
                  </div>
                </section>

                {/* 2. Clé API */}
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-700">2</span>
                    <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5"><KeyRound className="h-4 w-4 text-gray-400" /> Clé API</h3>
                  </div>
                  <div className="relative">
                    <input type={showKey ? 'text' : 'password'} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={meta.keyPlaceholder} autoComplete="off" spellCheck={false} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 pr-10 font-mono text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500" />
                    <button type="button" onClick={() => setShowKey((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" aria-label={showKey ? 'Masquer la clé' : 'Afficher la clé'}>
                      {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="mt-1.5 text-xs text-gray-500">
                    {meta.keyPrefixHint}.
                    {meta.helpUrl ? <> <a href={meta.helpUrl} target="_blank" rel="noreferrer" className="text-orange-700 hover:underline">Où trouver ma clé ?</a></> : null}
                  </p>

                  {meta.needsBaseUrl && (
                    <div className="mt-3">
                      <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-gray-600"><Server className="h-3.5 w-3.5 text-gray-400" /> Adresse du service</label>
                      <input type="url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://exemple.com/v1" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500" />
                    </div>
                  )}
                </section>

                {/* 3. Modèle */}
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-700">3</span>
                    <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5"><Cpu className="h-4 w-4 text-gray-400" /> Modèle</h3>
                  </div>
                  {meta.models.length > 0 ? (
                    <>
                      <div className="relative">
                        <select value={modelSel} onChange={(e) => setModelSel(e.target.value)} className="w-full appearance-none rounded-lg border border-gray-300 bg-white px-3 py-2.5 pr-9 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500">
                          <option value="">Par défaut (recommandé)</option>
                          {meta.models.map((m) => (
                            <option key={m.id} value={m.id}>{m.label}</option>
                          ))}
                          <option value="__custom__">Personnalisé…</option>
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      </div>
                      {modelSel === '__custom__' && (
                        <input type="text" value={customModel} onChange={(e) => setCustomModel(e.target.value)} placeholder={meta.modelPlaceholder} autoComplete="off" spellCheck={false} className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500" />
                      )}
                      <p className="mt-1.5 text-xs text-gray-500">Laissez « Par défaut » en cas de doute. Un modèle plus puissant répond mieux mais coûte plus cher par message.</p>
                    </>
                  ) : (
                    <>
                      <input type="text" value={customModel} onChange={(e) => setCustomModel(e.target.value)} placeholder={meta.modelPlaceholder} autoComplete="off" spellCheck={false} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 font-mono text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500" />
                      <p className="mt-1.5 text-xs text-gray-500">Saisissez le nom exact du modèle fourni par votre service.</p>
                    </>
                  )}
                </section>

                {error && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}

                <div className="flex items-center gap-3 pt-1">
                  <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-orange-700 transition-colors disabled:bg-gray-300">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                    {saving ? 'Connexion…' : configured ? 'Mettre à jour' : 'Connecter l’IA'}
                  </button>
                  {configured && showSettings && (
                    <button type="button" onClick={() => setShowSettings(false)} className="text-sm font-medium text-gray-500 hover:text-gray-700">
                      Annuler
                    </button>
                  )}
                </div>
              </div>
            </form>

            <div className="flex items-start gap-2 text-xs text-gray-500">
              <ShieldCheck className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
              <p>
                Votre clé est stockée de façon sécurisée côté serveur et n’est jamais réaffichée en entier
                (seuls les 4 derniers caractères sont visibles). Seul un administrateur peut la connecter ou la changer.
              </p>
            </div>
          </div>
        ) : (
          /* ---------------- ASSISTANT (CHAT) ---------------- */
          <div className="flex-1 flex flex-col min-h-0 rounded-2xl border border-gray-200 bg-white overflow-hidden">
            <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[24rem]">
              {chat.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center px-4">
                  <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center mb-3">
                    <Sparkles className="h-6 w-6 text-orange-600" />
                  </div>
                  <p className="text-gray-700 font-medium">Comment puis-je vous aider ?</p>
                  <p className="text-sm text-gray-500 mt-1 mb-4">Votre assistant commercial, connecté à {providerLabel(status!.provider)}.</p>
                  <div className="flex flex-col gap-2 w-full max-w-md">
                    {SUGGESTIONS.map((s) => (
                      <button key={s} onClick={() => send(s)} className="text-left rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 hover:border-orange-300 hover:bg-orange-50 transition-colors">
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                chat.map((m, i) => (
                  <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm ${m.role === 'user' ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-800'}`}>
                      {m.content}
                    </div>
                  </div>
                ))
              )}
              {chatBusy && (
                <div className="flex justify-start">
                  <div className="rounded-2xl bg-gray-100 px-3.5 py-2.5 text-sm text-gray-500 flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> L’assistant réfléchit…
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <form onSubmit={handleSend} className="border-t border-gray-200 p-3 flex items-center gap-2">
              <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Écrivez votre message…" className="flex-1 rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500" />
              <button type="submit" disabled={chatBusy || !chatInput.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-orange-700 transition-colors disabled:bg-gray-300">
                <Send className="h-4 w-4" /> Envoyer
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};

export default AiSettings;
