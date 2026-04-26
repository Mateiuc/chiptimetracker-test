import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useNotifications } from '@/hooks/useNotifications';
import { Loader2, Wrench } from 'lucide-react';

type Mode = 'signin' | 'signup';
type WorkspaceStep = 'choose' | 'create' | 'join' | 'claim';

const Auth = () => {
  const navigate = useNavigate();
  const { toast } = useNotifications();
  const { session, workspace, loading, refreshWorkspace } = useAuth();

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  // Workspace setup
  const [wsStep, setWsStep] = useState<WorkspaceStep>('choose');
  const [workspaceName, setWorkspaceName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [hasUnclaimed, setHasUnclaimed] = useState(false);

  // Once authenticated and workspace resolved, move on
  useEffect(() => {
    if (loading) return;
    if (session && workspace) {
      navigate('/', { replace: true });
    }
  }, [loading, session, workspace, navigate]);

  // Once signed in but no workspace, check if there's an unclaimed one to offer claim
  useEffect(() => {
    if (!session || workspace) return;
    (async () => {
      const { count } = await supabase
        .from('workspaces')
        .select('id', { count: 'exact', head: true })
        .eq('is_unclaimed', true);
      setHasUnclaimed((count ?? 0) > 0);
    })();
  }, [session, workspace]);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === 'signup') {
        const redirectUrl = `${window.location.origin}/auth`;
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: redirectUrl },
        });
        if (error) throw error;
        toast({ title: 'Account created', description: 'Check your email to confirm your address, then sign in.' });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err: any) {
      toast({ title: 'Authentication error', description: err.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    setBusy(true);
    try {
      const { lovable } = await import('@/integrations/lovable');
      const result = await lovable.auth.signInWithOAuth('google', {
        redirect_uri: `${window.location.origin}/auth`,
      });
      if (result.error) throw new Error(result.error.message);
      if (result.redirected) return; // browser is navigating to Google
      // Session set in-place — AuthContext's onAuthStateChange will pick it up
    } catch (err: any) {
      toast({ title: 'Google sign-in failed', description: err.message, variant: 'destructive' });
      setBusy(false);
    }
  };

  const handleClaim = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('claim_unclaimed_workspace');
      if (error) throw error;
      if (!data) {
        toast({ title: 'Nothing to claim', description: 'No unclaimed workspace available.' });
      } else {
        toast({ title: 'Workspace claimed', description: 'You now own the existing workspace.' });
        await refreshWorkspace();
      }
    } catch (err: any) {
      toast({ title: 'Claim failed', description: err.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const handleCreateWorkspace = async () => {
    if (!session?.user) return;
    if (!workspaceName.trim()) {
      toast({ title: 'Name required', variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.rpc('create_workspace', {
        _name: workspaceName.trim(),
      });
      if (error) throw error;
      toast({ title: 'Workspace created' });
      await refreshWorkspace();
    } catch (err: any) {
      console.error('[Auth] create_workspace failed', err);
      toast({ title: 'Could not create workspace', description: err.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async () => {
    if (!inviteCode.trim()) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc('redeem_workspace_invite', { _code: inviteCode.trim() });
      if (error) throw error;
      toast({ title: 'Joined workspace' });
      await refreshWorkspace();
    } catch (err: any) {
      toast({ title: 'Invalid invite', description: err.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Step 2: signed in, but no workspace yet
  if (session && !workspace) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Set up your workspace</CardTitle>
            <CardDescription>
              Signed in as {session.user.email}. Choose how you want to start.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {wsStep === 'choose' && (
              <div className="space-y-2">
                {hasUnclaimed && (
                  <Button onClick={handleClaim} disabled={busy} className="w-full" variant="default">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Claim existing workspace (recommended)'}
                  </Button>
                )}
                <Button onClick={() => setWsStep('create')} variant="outline" className="w-full">
                  Create a new workspace
                </Button>
                <Button onClick={() => setWsStep('join')} variant="outline" className="w-full">
                  Join with invite code
                </Button>
                <Button onClick={() => supabase.auth.signOut()} variant="ghost" className="w-full text-muted-foreground">
                  Sign out
                </Button>
              </div>
            )}
            {wsStep === 'create' && (
              <div className="space-y-3">
                <Label htmlFor="ws-name">Workspace name</Label>
                <Input
                  id="ws-name"
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  placeholder="My shop"
                />
                <div className="flex gap-2">
                  <Button onClick={handleCreateWorkspace} disabled={busy} className="flex-1">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create'}
                  </Button>
                  <Button onClick={() => setWsStep('choose')} variant="outline">Back</Button>
                </div>
              </div>
            )}
            {wsStep === 'join' && (
              <div className="space-y-3">
                <Label htmlFor="invite">Invite code</Label>
                <Input
                  id="invite"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  placeholder="ABCD-1234"
                />
                <div className="flex gap-2">
                  <Button onClick={handleJoin} disabled={busy} className="flex-1">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Join'}
                  </Button>
                  <Button onClick={() => setWsStep('choose')} variant="outline">Back</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Step 1: not signed in
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto bg-primary/10 rounded-xl p-2 w-fit mb-2">
            <Wrench className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>ChipTime</CardTitle>
          <CardDescription>Sign in to access your workspace</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
            <TabsList className="grid grid-cols-2 mb-4 w-full">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Sign up</TabsTrigger>
            </TabsList>
            <TabsContent value={mode}>
              <form onSubmit={handleEmailAuth} className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <Button type="submit" disabled={busy} className="w-full">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === 'signup' ? 'Create account' : 'Sign in'}
                </Button>
              </form>
              <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
                <div className="h-px flex-1 bg-border" /> OR <div className="h-px flex-1 bg-border" />
              </div>
              <Button onClick={handleGoogle} disabled={busy} variant="outline" className="w-full">
                Continue with Google
              </Button>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;