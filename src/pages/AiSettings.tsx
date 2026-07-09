import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, Eye, EyeOff, ShieldCheck, CheckCircle2, Loader2, Link2, Trash2, Zap, Send, Settings, MessageSquare } from 'lucide-react';
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

interface ProviderMeta {
  id: AiProvider;
  label: string;
  keyPlaceholder: string;
  modelPlaceholder: string;
  keyPrefixHint: string;
  helpUrl?: string;
  needsBaseUrl?: boolean;
}

const PROVIDERS: ProviderMeta[] = [
  { id: 'openai', label: 'OpenAI (ChatGPT)', keyPlaceholder: 'sk-…', modelPlaceholder: 'gpt-4o', keyPrefixHint: 'Commence par « sk- »', helpUrl: 'https://platform.openai.com/api-keys' },
  { id: 'anthropic', label: 'Claude (Anthropic)', keyPlaceholder: 'sk-ant-…', modelPlaceholder: 'claude-opus-4-8', keyPrefixHint: 'Commence par « sk-ant- »', helpUrl: 'https://console.anthropic.com/settings/keys' },
  { id: 'xai', label: 'Grok (xAI)', keyPlaceholder: 'xai-…', modelPlaceholder: 'grok-2', keyPrefixHint: 'Commence par « xai- »', helpUrl: 'https://console.x.ai' },
  { id: 'custom', label: 'Autre (compatible OpenAI)', keyPlaceholder: 'votre clé API', modelPlaceholder: 'nom du modèle', keyPrefixHint: 'Indiquez aussi l’adresse du service', needsBaseUrl: true },
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
  const [model, setModel] = useState('');
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

  const loadStatus = async () => {
    setLoading(true);
    const s = await getOrgAiStatus();
    setStatus(s);
    if (s.configured && s.provider) setProvider(s.provider);
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
    const res = await setOrgAiKey(provider, apiKey.trim(), model.trim() || undefined, baseUrl.trim() || undefined);
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
            {configured && (
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
        ) : showSettings || !configured ? (
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

            <form onSubmit={handleConnect} className="rounded-2xl border border-gray-200 bg-white p-6 space-y-5">
              <h2 className="text-lg font-semibold text-gray-900">
                {configured ? 'Changer de connexion' : 'Connecter une IA'}
              </h2>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Service d’IA</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {PROVIDERS.map((p) => (
                    <button key={p.id} type="button" onClick={() => setProvider(p.id)} className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${provider === p.id ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Clé API</label>
                <div className="relative">
                  <input type={showKey ? 'text' : 'password'} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={meta.keyPlaceholder} autoComplete="off" spellCheck={false} className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 font-mono text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500" />
                  <button type="button" onClick={() => setShowKey((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" aria-label={showKey ? 'Masquer la clé' : 'Afficher la clé'}>
                    {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {meta.keyPrefixHint}.
                  {meta.helpUrl ? <> <a href={meta.helpUrl} target="_blank" rel="noreferrer" className="text-orange-700 hover:underline">Où trouver ma clé ?</a></> : null}
                </p>
              </div>

              {meta.needsBaseUrl && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Adresse du service</label>
                  <input type="url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://exemple.com/v1" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500" />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Modèle <span className="font-normal text-gray-400">(optionnel)</span></label>
                <input type="text" value={model} onChange={(e) => setModel(e.target.value)} placeholder={meta.modelPlaceholder} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500" />
              </div>

              {error && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}

              <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-orange-700 transition-colors disabled:bg-gray-300">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                {saving ? 'Connexion…' : configured ? 'Mettre à jour' : 'Connecter'}
              </button>
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
