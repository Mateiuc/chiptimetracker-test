import { useState, useEffect } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ClientCostBreakdown } from '@/components/ClientCostBreakdown';
import { ClientCostSummary, decodeClientData, checkPortalAccess, fetchPortalWithCode } from '@/lib/clientPortalUtils';
import { Lock, Wrench, Shield, Clock } from 'lucide-react';

const ClientPortal = () => {
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const isPreview = searchParams.get('preview') === '1';

  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [verified, setVerified] = useState(isPreview);
  const [costSummary, setCostSummary] = useState<ClientCostSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [requiresCode, setRequiresCode] = useState(false);
  const [activeTab, setActiveTab] = useState<'pending' | 'billed' | 'paid'>('pending');
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!lockedUntil) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [lockedUntil]);

  const isLocked = !!(lockedUntil && lockedUntil > now);

  const cloudPortalId = searchParams.get('id');
  const isSharedMode = location.pathname === '/client-view' && !cloudPortalId;

  useEffect(() => {
    const load = async () => {
      try {
        if (cloudPortalId) {
          const result = await checkPortalAccess(cloudPortalId, isPreview);
          if (result.requiresCode) {
            setRequiresCode(true);
            if (result.locked && result.lockedUntil) {
              const ms = new Date(result.lockedUntil).getTime();
              setLockedUntil(ms);
              setError(`Too many incorrect attempts. Try again at ${new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`);
            }
          } else {
            setCostSummary(result.data!);
            setVerified(true);
          }
        } else if (isSharedMode) {
          const hash = location.hash.slice(1);
          if (!hash) {
            setError('No data found in link.');
            setLoading(false);
            return;
          }
          // Hash-shared portals are advisory-only (no PIN gate). PIN protection
          // is enforced server-side only when using the cloud portal route (?id=...).
          const { data } = await decodeClientData(hash);
          setCostSummary(data);
          setVerified(true);
        } else {
          setError('Invalid portal link.');
        }
      } catch (e) {
        console.error('Portal load error:', e);
        setError('Failed to load data.');
      }
      setLoading(false);
    };
    load();
  }, [cloudPortalId, isSharedMode, location.hash]);

  const handleVerify = async () => {
    if (cloudPortalId) {
      setVerifying(true);
      setError('');
      try {
        const result = await fetchPortalWithCode(cloudPortalId, pin);
        setCostSummary(result.data);
        setVerified(true);
        setLockedUntil(null);
      } catch (e: any) {
        if (e?.locked && e?.lockedUntil) {
          const ms = new Date(e.lockedUntil).getTime();
          setLockedUntil(ms);
          setError(`Too many incorrect attempts. Try again at ${new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`);
        } else if (typeof e?.attemptsRemaining === 'number') {
          setError(`Incorrect code. ${e.attemptsRemaining} attempt${e.attemptsRemaining === 1 ? '' : 's'} remaining.`);
        } else {
          setError(e?.message?.includes('Invalid') ? 'Incorrect code. Please try again.' : 'Verification failed.');
        }
        setPin('');
      } finally {
        setVerifying(false);
      }
    } else {
      const expectedCode = (window as any).__portalAccessCode;
      if (!expectedCode || pin === expectedCode) {
        setVerified(true);
        setError('');
      } else {
        setError('Incorrect code. Please try again.');
        setPin('');
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 to-blue-950 gap-4">
        <div className="w-10 h-10 border-4 border-blue-400 border-t-transparent rounded-full animate-spin" />
        <p className="text-blue-200 text-sm font-medium">Loading your records...</p>
      </div>
    );
  }

  if (error && !costSummary && !requiresCode) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 to-blue-950 p-6 gap-6">
        <div className="text-5xl">⚠️</div>
        <p className="text-white font-semibold text-center">{error}</p>
        <Button variant="outline" onClick={() => window.location.reload()} className="border-white/30 text-white hover:bg-white/10">
          Try Again
        </Button>
      </div>
    );
  }

  // PIN screen
  if (!verified && requiresCode) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex flex-col">
        {/* Header */}
        <header className="px-4 py-4 flex items-center gap-3">
          <div className="bg-blue-500/20 rounded-xl p-2 border border-blue-400/30">
            <Wrench className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <span className="font-bold text-white text-sm">Auto Service Portal</span>
            <p className="text-xs text-blue-300/70">Secure client access</p>
          </div>
        </header>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-sm space-y-6">
            {/* Lock icon */}
            <div className="text-center space-y-3">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-blue-500/15 border-2 border-blue-400/30 mx-auto">
                <Lock className="h-9 w-9 text-blue-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Enter your code</h1>
                <p className="text-blue-200/70 text-sm mt-1">
                  Your mechanic provided a 4-digit access code
                </p>
              </div>
            </div>

            {/* OTP Input */}
            <div className="flex justify-center">
              <InputOTP maxLength={4} value={pin} onChange={setPin} disabled={isLocked}>
                <InputOTPGroup className="gap-3">
                  {[0,1,2,3].map(i => (
                    <InputOTPSlot
                      key={i}
                      index={i}
                      className="w-14 h-14 text-xl font-bold bg-white/10 border-white/20 text-white rounded-xl"
                    />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </div>

            {error && (
              <p className="text-red-400 text-sm text-center font-medium bg-red-500/10 border border-red-500/20 rounded-lg py-2 px-4">
                {error}
              </p>
            )}

            <Button
              onClick={handleVerify}
              disabled={pin.length < 4 || verifying || isLocked}
              className="w-full h-12 text-base font-semibold bg-blue-500 hover:bg-blue-400 text-white rounded-xl"
            >
              {isLocked ? (
                'Locked — try again later'
              ) : verifying ? (
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Verifying...
                </span>
              ) : (
                'View My Service Records'
              )}
            </Button>

            {/* Trust badge */}
            <div className="flex items-center justify-center gap-2 text-xs text-blue-300/50">
              <Shield className="h-3 w-3" />
              <span>Your data is private and secure</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Cost breakdown view
  const tabCounts = {
    pending: costSummary?.vehicles.flatMap(v => v.sessions).filter(s => ['pending','in-progress','paused','completed'].includes(s.status)).length ?? 0,
    billed: costSummary?.vehicles.flatMap(v => v.sessions).filter(s => s.status === 'billed').length ?? 0,
    paid: costSummary?.vehicles.flatMap(v => v.sessions).filter(s => s.status === 'paid').length ?? 0,
  };

  return (
    <div className="min-h-screen" style={
      costSummary?.portalBgImageUrl
        ? { backgroundImage: `url(${costSummary.portalBgImageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' }
        : { background: 'var(--color-background-tertiary, #f5f5f3)' }
    }>
      {/* Header */}
      <header className="shadow-lg sticky top-0 z-10" style={{ background: costSummary?.portalBgColor || '#1d4ed8' }}>
        <div className="px-4 py-3 max-w-4xl mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {costSummary?.portalLogoUrl ? (
                <img
                  src={costSummary.portalLogoUrl}
                  alt="logo"
                  className="h-8 w-8 rounded-lg object-contain bg-white/20 p-0.5"
                  onError={e => (e.currentTarget.style.display = 'none')}
                />
              ) : (
                <div className="bg-white/20 rounded-lg p-1.5">
                  <Wrench className="h-5 w-5 text-white" />
                </div>
              )}
              <div>
                <p className="font-bold text-white text-sm leading-tight">
                  {costSummary?.portalBusinessName || 'Service Portal'}
                </p>
                {costSummary && (
                  <p className="text-blue-100/80 text-xs leading-tight">Hello, {costSummary.client.name}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 text-xs text-blue-100/70">
              <Clock className="h-3 w-3" />
              <span>Live</span>
            </div>
          </div>

          {/* Tab bar */}
          <div className="mt-3">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'pending' | 'billed' | 'paid')}>
              <TabsList className="w-full bg-white/15 border border-white/20 p-1 rounded-xl h-auto">
                {([
                  { value: 'pending', label: 'In Progress', emoji: '🔧' },
                  { value: 'billed', label: 'Billed', emoji: '📋' },
                  { value: 'paid', label: 'Paid', emoji: '✅' },
                ] as const).map(tab => (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className="flex-1 text-white/70 data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:font-bold rounded-lg py-2 text-xs font-medium transition-all"
                  >
                    <span className="mr-1">{tab.emoji}</span>
                    {tab.label}
                    {tabCounts[tab.value] > 0 && (
                      <span className={`ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${activeTab === tab.value ? 'bg-blue-100 text-blue-700' : 'bg-white/20 text-white'}`}>
                        {tabCounts[tab.value]}
                      </span>
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        </div>
      </header>

      <div className="p-4 pb-10 max-w-4xl mx-auto">
        <div className="relative z-10">
          {costSummary && <ClientCostBreakdown costSummary={costSummary} filter={activeTab} />}
        </div>
      </div>
    </div>
  );
};

export default ClientPortal;
