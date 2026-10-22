'use client';

import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { supabase } from './lib/supabase';
  Activity, ArrowDownToLine, ArrowRight, BadgeCheck, Building2,
  Check, ChevronDown, CircleHelp, ClipboardCheck, Clock3, FileCheck2, FileText,
  Filter, FolderOpen, Home, KeyRound, Layers3, LogOut, Menu, Plus, Search,
  Shield, Sparkles, Upload, Users, X,
} from 'lucide-react';
import {
  getGetCurrentUserQueryKey, getGetDashboardQueryKey, getGetRecordQueryKey, getGetEvidencePackageQueryKey, getListRecordsQueryKey,
  getListDocumentsQueryKey, getListUsersQueryKey, getListActivityQueryKey,
  getListEvidencePackagesQueryKey, useApproveDocument, useConfirmRecord,
  useCreateEvidencePackage, useCreateRecord, useGetCurrentUser, useGetDashboard, useGetEvidencePackage, useGetRecord, useIngestDocument,
  useInviteUser, useListActivity, useListDocuments, useListEvidencePackages,
  useListRecords, useListUsers, useRequestUploadUrl, useSignIn, useSignOut,
  useSignUp, useUpdateDocumentReview, useUpdateRecord, useUpdateUserRole,
  type ActivityEntry, type EvidencePackage, type IntelligenceRecord,
  type RecordCategory, type UserProfile, type UserRole,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { ErrorBoundary } from '@/components/error-boundary';
import NotFound from '@/components/not-found-view';

const sections = [
  { label: 'Workspace', items: [
    { label: 'Overview', path: '/dashboard', icon: Home },
    { label: 'Document intake', path: '/ingestion', icon: Upload },
  ]},
  { label: 'Evidence library', items: [
    { label: 'Valuations', path: '/valuations', icon: Building2 },
    { label: 'Construction costs', path: '/construction-costs', icon: Layers3 },
    { label: 'Housing', path: '/housing', icon: Home },
    { label: 'Evidence packages', path: '/evidence', icon: FolderOpen },
  ]},
  { label: 'Governance', items: [
    { label: 'Team & audit', path: '/team', icon: Users },
  ]},
];
const categoryLabels: Record<RecordCategory, string> = {
  valuation: 'Valuation', construction: 'Construction cost', housing: 'Housing',
};
const roleNames: UserRole[] = ['Admin', 'Senior Surveyor', 'Junior Surveyor', 'Viewer'];
const keyInvalidate = (client: ReturnType<typeof useQueryClient>, keys: readonly (readonly unknown[])[]) =>
  Promise.all(keys.map(queryKey => client.invalidateQueries({ queryKey })));
const shortDate = (date?: string | null) => date ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(date)) : '—';
const initials = (name: string) => name.split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase();
const displayError = (e: unknown) => e instanceof Error ? e.message : 'Something went wrong. Please try again.';
function downloadText(filename: string, content: string, mime = 'text/plain') {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; anchor.click();
  URL.revokeObjectURL(url);
}
function csvCell(value: unknown) { return `"${String(value ?? '').replaceAll('"', '""')}"`; }

function FormInput({ name, label, type = 'text', placeholder, autoComplete }: { name: string; label: string; type?: string; placeholder?: string; autoComplete?: string }) {
  return <FormField name={name} render={({ field }) => <FormItem>
    <FormLabel>{label}</FormLabel><FormControl><Input {...field} type={type} placeholder={placeholder} autoComplete={autoComplete} data-testid={`input-${name}`} /></FormControl><FormMessage />
  </FormItem>} />;
}

function AuthPage({ signup = false }: { signup?: boolean }) {
  const router = useRouter();
  const client = useQueryClient();
  const signIn = useSignIn();
  const signUp = useSignUp();
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);
  const form = useForm({ defaultValues: signup ? { fullName: '', email: '', password: '' } : { email: '', password: '' } });
  const busy = signup ? signUp.isPending : signIn.isPending;
  const error = signup ? signUp.error : signIn.error;
  const submit = form.handleSubmit(values => {
    setConfirmationEmail(null);
    const finishSignIn = async () => {
      await client.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
      router.push('/dashboard');
    };
    if (signup) {
      signUp.mutate(
        { data: values as { fullName: string; email: string; password: string } },
        {
          onSuccess: async response => {
            if (response.emailConfirmationRequired) {
              setConfirmationEmail(values.email);
              return;
            }
            await finishSignIn();
          },
        },
      );
    } else {
      signIn.mutate(
        { data: values as { email: string; password: string } },
        { onSuccess: finishSignIn },
      );
    }
  });
  return <main className="min-h-[100dvh] grid lg:grid-cols-[1fr_1fr] bg-background">
    <section className="hidden lg:flex flex-col justify-between bg-sidebar text-sidebar-foreground p-12 xl:p-16 relative overflow-hidden">
      <div className="absolute -right-36 -bottom-32 size-[34rem] rounded-full border border-white/10" />
      <div className="absolute -right-12 -bottom-8 size-[24rem] rounded-full border border-white/10" />
      <Link href="/sign-in" className="relative z-10 flex items-center gap-3 w-fit text-sidebar-foreground no-underline" data-testid="link-pinnacle-brand">
        <span className="grid size-11 place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground"><Building2 size={22}/></span>
        <span><span className="pis-brand block text-xl font-extrabold leading-none">Pinnacle</span><span className="text-[10px] tracking-[.2em] uppercase opacity-65">Intelligence system</span></span>
      </Link>
      <div className="relative z-10 max-w-xl pb-10">
        <p className="pis-mono text-xs uppercase tracking-[.18em] text-sidebar-primary">Pinnacle Estate Surveyors</p>
        <h1 className="pis-brand mt-6 text-5xl font-semibold leading-[1.05] xl:text-6xl">Evidence first.<br/>Judgement always.</h1>
        <p className="mt-6 max-w-md text-base leading-7 text-sidebar-foreground/70">One considered workspace for property intelligence—where every extracted field leads back to its source and every conclusion has a human name beside it.</p>
        <div className="mt-10 flex items-center gap-3 text-sm text-sidebar-foreground/70"><Shield size={16} className="text-sidebar-primary"/> Human-reviewed by design</div>
      </div>
      <div className="relative z-10 flex justify-between border-t border-white/10 pt-5 text-xs text-sidebar-foreground/50"><span>Property intelligence · London</span><span>© Pinnacle</span></div>
    </section>
    <section className="flex items-center justify-center px-6 py-12 sm:px-10">
      <div className="w-full max-w-md pis-enter">
        <div className="mb-10 lg:hidden flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground"><Building2 size={21}/></span>
          <span className="pis-brand text-xl font-extrabold">Pinnacle</span>
        </div>
        <p className="pis-mono text-[11px] uppercase tracking-[.16em] text-primary">Secure workspace</p>
        <h2 className="pis-brand mt-3 text-4xl font-semibold">{signup ? 'Create your account' : 'Welcome back'}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{signup ? 'Start building a traceable evidence practice.' : 'Sign in to continue your survey work.'}</p>
        <Form {...form}><form onSubmit={submit} className="mt-8 space-y-5" data-testid={signup ? 'form-sign-up' : 'form-sign-in'}>
          {signup && <FormInput name="fullName" label="Full name" placeholder="e.g. Amara Okafor" autoComplete="name" />}
          <FormInput name="email" label="Work email" type="email" placeholder="you@pinnacle.co.uk" autoComplete="email" />
          <FormInput name="password" label="Password" type="password" placeholder="At least 8 characters" autoComplete={signup ? 'new-password' : 'current-password'} />
          {error && <p role="alert" data-testid="status-auth-error" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{displayError(error)}</p>}
          {confirmationEmail && <p role="status" data-testid="status-email-confirmation" className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-foreground">Check {confirmationEmail} for the confirmation link, then sign in to continue.</p>}
          <Button className="w-full h-11" disabled={busy} type="submit" data-testid="button-auth-submit">{busy ? 'Please wait…' : signup ? 'Create account' : 'Sign in'}<ArrowRight size={16} className="ml-2"/></Button>
        </form></Form>
        <p className="mt-7 text-center text-sm text-muted-foreground">{signup ? 'Already have access?' : 'New to Pinnacle Intelligence?'}{' '}
          <Link href={signup ? '/sign-in' : '/sign-up'} className="font-semibold text-primary hover:underline" data-testid="link-auth-switch">{signup ? 'Sign in' : 'Create an account'}</Link>
        </p>
        <p className="mt-12 flex justify-center gap-2 text-xs text-muted-foreground"><KeyRound size={14}/> Your session is protected with secure same-origin authentication.</p>
      </div>
    </section>
  </main>;
}

function Sidebar({ user, active, close }: { user: UserProfile; active: string; close: () => void }) {
  const signOut = useSignOut();
  const client = useQueryClient();
  const router = useRouter();
  return <aside className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
    <div className="flex h-[76px] items-center gap-3 border-b border-sidebar-border px-6">
      <span className="grid size-9 place-items-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground"><Building2 size={19}/></span>
      <span><span className="pis-brand block text-lg font-extrabold leading-none">Pinnacle</span><span className="pis-mono text-[9px] uppercase tracking-[.17em] opacity-60">Intelligence system</span></span>
    </div>
    <div className="flex items-center gap-3 px-5 py-5">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-sidebar-accent text-xs font-semibold text-sidebar-primary">{initials(user.fullName)}</span>
      <div className="min-w-0"><p className="truncate text-sm font-semibold" data-testid="text-user-name">{user.fullName}</p><p className="truncate text-xs text-sidebar-foreground/55">{user.role}</p></div>
      <ChevronDown size={14} className="ml-auto opacity-50"/>
    </div>
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-2" aria-label="Main navigation">
      {sections.map(group => <div key={group.label}>
        <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[.16em] text-sidebar-foreground/40">{group.label}</p>
        <div className="space-y-1">{group.items.map(({ label, path, icon: Icon }) => <Link key={path} href={path} onClick={close} data-testid={`link-nav-${path.slice(1)}`} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] transition-colors no-underline ${active === path ? 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground'}`}>
          <Icon size={16} strokeWidth={1.8}/>{label}{path === '/ingestion' && <span className="ml-auto rounded-full bg-sidebar-primary/20 px-2 py-0.5 text-[10px] text-sidebar-primary">INTAKE</span>}
        </Link>)}</div>
      </div>)}
    </nav>
    <div className="border-t border-sidebar-border p-4">
      <p className="mb-3 flex items-center gap-2 px-2 text-[11px] text-sidebar-foreground/50"><CircleHelp size={14}/> Need help? Contact your admin</p>
      <Button variant="ghost" className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground" data-testid="button-sign-out" disabled={signOut.isPending} onClick={() => signOut.mutate(undefined, { onSuccess: () => { client.setQueryData(getGetCurrentUserQueryKey(), null); router.push('/sign-in'); } })}><LogOut size={16} className="mr-3"/> Sign out</Button>
    </div>
  </aside>;
}

function AppShell({ children, user, active }: { children: ReactNode; user: UserProfile; active: string }) {
  const [open, setOpen] = useState(false);
  const location = usePathname() ?? '/';
  return <div className="pis-app min-h-[100dvh] md:grid md:grid-cols-[250px_minmax(0,1fr)]">
    <div className="hidden md:block"><div className="sticky top-0 h-[100dvh]"><Sidebar user={user} active={active} close={() => setOpen(false)}/></div></div>
    {open && <div className="fixed inset-0 z-50 md:hidden"><button aria-label="Close navigation" className="absolute inset-0 bg-foreground/30" onClick={() => setOpen(false)} data-testid="button-close-menu"/><div className="relative h-full w-[280px]"><Sidebar user={user} active={active} close={() => setOpen(false)}/></div></div>}
    <main className="pis-main min-w-0">
      <header className="sticky top-0 z-30 flex h-[68px] items-center justify-between border-b border-border/80 bg-background/90 px-5 backdrop-blur-md sm:px-8">
        <div className="flex items-center gap-3"><Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation" onClick={() => setOpen(true)} data-testid="button-open-menu"><Menu size={18}/></Button><p className="text-xs text-muted-foreground">Pinnacle <span className="mx-1.5">/</span><span className="font-medium text-foreground">{sections.flatMap(s => s.items).find(i => i.path === location)?.label ?? 'Workspace'}</span></p></div>
        <div className="flex items-center gap-2"><span className="hidden sm:flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-[11px] text-muted-foreground"><span className="size-1.5 rounded-full bg-primary"/> Evidence ledger active</span><span className="grid size-8 place-items-center rounded-full bg-secondary text-[11px] font-semibold text-secondary-foreground" data-testid="text-user-initials">{initials(user.fullName)}</span></div>
      </header>
      <div className="mx-auto w-full max-w-[1440px] px-5 py-8 sm:px-8 lg:px-10">{children}</div>
    </main>
  </div>;
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div>
    <p className="pis-mono text-[10px] uppercase tracking-[.18em] text-primary">{eyebrow}</p>
    <h1 className="pis-brand mt-2 text-3xl font-semibold tracking-tight sm:text-[38px]" data-testid="text-page-title">{title}</h1>
    <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
  </div>{action && <div className="shrink-0">{action}</div>}</div>;
}
function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-border/90 bg-card shadow-[0_8px_24px_-20px_rgba(32,45,53,.28)] ${className}`}>{children}</section>;
}
function QueryState({ loading, error, retry, children }: { loading: boolean; error: unknown; retry: () => void; children: ReactNode }) {
  if (loading) return <div className="space-y-3" aria-label="Loading"><Skeleton className="h-12 w-full"/><Skeleton className="h-24 w-full"/><Skeleton className="h-24 w-full"/></div>;
  if (error) return <Panel className="p-8 text-center"><p className="text-sm font-semibold">We couldn't load this view</p><p className="mt-1 text-sm text-muted-foreground">{displayError(error)}</p><Button variant="outline" className="mt-4" onClick={retry} data-testid="button-retry">Try again</Button></Panel>;
  return <>{children}</>;
}
function EmptyState({ title, detail, icon: Icon = FileText }: { title: string; detail: string; icon?: typeof FileText }) {
  return <div className="flex min-h-52 flex-col items-center justify-center px-6 py-10 text-center" data-testid="state-empty"><span className="grid size-11 place-items-center rounded-xl bg-secondary text-primary"><Icon size={20}/></span><p className="mt-4 text-sm font-semibold">{title}</p><p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">{detail}</p></div>;
}
function StatusPill({ status }: { status: string }) {
  const verified = status === 'confirmed' || status === 'approved';
  return <Badge variant="outline" data-testid={`status-record-${status}`} className={`gap-1 rounded-full px-2.5 py-1 text-[10px] font-medium ${verified ? 'border-primary/25 bg-primary/8 text-primary' : 'border-accent/35 bg-accent/10 text-foreground'}`}>
    {verified ? <BadgeCheck size={12}/> : <Clock3 size={12}/>} {status === 'confirmed' ? 'Verified' : status === 'approved' ? 'Approved' : 'Awaiting review'}
  </Badge>;
}
function ErrorLine({ error }: { error: unknown }) {
  return error ? <p role="alert" className="text-xs text-destructive" data-testid="status-mutation-error">{displayError(error)}</p> : null;
}

function DashboardPage({ user }: { user: UserProfile }) {
  const dash = useGetDashboard();
  const canReview = ['Admin', 'Senior Surveyor'].includes(user.role);
  const data = dash.data;
  const metrics = [
    { label: 'Valuations', value: data?.valuations, icon: Building2, shade: 'bg-primary/10 text-primary' },
    { label: 'Construction costs', value: data?.constructionCosts, icon: Layers3, shade: 'bg-accent/15 text-foreground' },
    { label: 'Housing evidence', value: data?.housingRecords, icon: Home, shade: 'bg-secondary text-secondary-foreground' },
    { label: 'Awaiting review', value: data?.pendingReviews, icon: ClipboardCheck, shade: 'bg-[hsl(8_48%_56%/.12)] text-[hsl(8_48%_44%)]' },
  ];
  return <div className="pis-enter">
    <PageHeading eyebrow="Workspace / 01" title={`Good ${new Date().getHours() < 12 ? 'morning' : 'afternoon'}, ${user.fullName.split(' ')[0]}.`} description="A clear view of the evidence your team is building—and what still needs a human eye." action={<Link href="/ingestion" className="no-underline"><Button data-testid="button-start-intake"><Plus size={16} className="mr-2"/> New intake</Button></Link>}/>
    <QueryState loading={dash.isLoading} error={dash.error} retry={() => void dash.refetch()}>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ label, value, icon: Icon, shade }) => <Panel key={label} className="relative overflow-hidden p-5" data-testid={`card-metric-${label.toLowerCase().replaceAll(' ', '-')}`}>
          <div className="flex items-start justify-between"><span className={`grid size-9 place-items-center rounded-lg ${shade}`}><Icon size={17}/></span><span className="pis-mono text-[10px] text-muted-foreground">LIVE</span></div>
          <p className="pis-brand mt-6 text-[34px] font-semibold leading-none">{value ?? '—'}</p><p className="mt-2 text-xs text-muted-foreground">{label}</p>
        </Panel>)}
      </div>
      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,.8fr)]">
        <Panel className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-4"><div><p className="text-sm font-semibold">Recent activity</p><p className="mt-1 text-xs text-muted-foreground">A traceable record of the latest changes</p></div><Activity size={17} className="text-primary"/></div>
          {data?.recentActivity?.length ? <div className="divide-y divide-border">{data.recentActivity.slice(0, 7).map((entry, index) => <ActivityRow key={entry.id} entry={entry} index={index}/>)}</div> : <EmptyState title="Your activity ledger starts here" detail="Uploads, approvals and team changes will appear in this timeline." icon={Activity}/>}
        </Panel>
        <Panel className="p-5 sm:p-6">
          <p className="pis-mono text-[10px] uppercase tracking-[.16em] text-primary">Evidence integrity</p>
          <h2 className="pis-brand mt-3 text-2xl font-semibold">A record is only as strong as its source.</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">Every document stays attached to its extracted fields. Every verified record has a reviewer. Nothing enters the evidence library without a trail.</p>
          <div className="mt-6 space-y-3 border-t border-border pt-5">
            <div className="flex justify-between text-xs"><span className="text-muted-foreground">Verified records</span><span className="pis-mono font-medium">{data?.confirmedRecords ?? '—'}</span></div>
            <div className="flex justify-between text-xs"><span className="text-muted-foreground">Pending review</span><span className="pis-mono font-medium">{data?.pendingReviews ?? '—'}</span></div>
          </div>
          <div className="mt-6 flex gap-2 rounded-lg bg-secondary/70 p-3 text-xs leading-5 text-secondary-foreground"><Shield size={15} className="mt-0.5 shrink-0 text-primary"/>{canReview ? 'Your role can review, correct and verify incoming evidence.' : 'Your current role is read-only. Ask an administrator for review permissions.'}</div>
        </Panel>
      </div>
    </QueryState>
  </div>;
}
function ActivityRow({ entry, index }: { entry: ActivityEntry; index: number }) {
  return <div className="flex gap-3 px-5 py-4" data-testid={`row-activity-${entry.id}`}>
    <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-secondary text-primary"><Activity size={13}/></span>
    <div className="min-w-0 flex-1"><p className="text-xs font-medium leading-5">{entry.description || entry.action}</p><p className="mt-1 text-[10px] text-muted-foreground">{entry.actor || 'System'} <span className="mx-1">·</span>{shortDate(entry.createdAt)}</p></div>
    <span className="pis-mono mt-1 text-[9px] text-muted-foreground">{String(index + 1).padStart(2, '0')}</span>
  </div>;
}

function IntakePage({ user }: { user: UserProfile }) {
  const client = useQueryClient();
  const docs = useListDocuments();
  const uploadUrl = useRequestUploadUrl();
  const ingest = useIngestDocument();
  const saveReview = useUpdateDocumentReview();
  const approve = useApproveDocument();
  const [category, setCategory] = useState<RecordCategory>('valuation');
  const [file, setFile] = useState<File | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [reviewJson, setReviewJson] = useState('');
  const [uploadError, setUploadError] = useState('');
  const canUpload = user.role !== 'Viewer';
  const canApprove = ['Admin', 'Senior Surveyor'].includes(user.role);
  const selectedDoc = docs.data?.find(d => d.id === selectedId);
  const upload = async () => {
    if (!file) return;
    setUploadError('');
    try {
      const contentType = file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      const { uploadURL, objectPath } = await uploadUrl.mutateAsync({ data: { name: file.name, size: file.size, contentType } });
      const response = await window.fetch(uploadURL, { method: 'PUT', headers: { 'Content-Type': contentType }, body: file });
      if (!response.ok) throw new Error('The source file could not be uploaded. Please try again.');
      const doc = await ingest.mutateAsync({ data: { fileName: file.name, objectPath, category } });
      await keyInvalidate(client, [getListDocumentsQueryKey(), getGetDashboardQueryKey()]);
      setFile(null); setSelectedId(doc.id); setReviewJson(JSON.stringify(doc.extractedData, null, 2));
    } catch (error) { setUploadError(displayError(error)); }
  };
  const save = async () => {
    if (!selectedDoc) return;
    try {
      const extractedData = JSON.parse(reviewJson) as Record<string, unknown>;
      const updated = await saveReview.mutateAsync({ documentId: selectedDoc.id, data: { extractedData } });
      setReviewJson(JSON.stringify(updated.extractedData, null, 2));
      await keyInvalidate(client, [getListDocumentsQueryKey()]);
    } catch (error) { setUploadError(error instanceof SyntaxError ? 'Review fields must be valid JSON.' : displayError(error)); }
  };
  const approveDoc = async () => {
    if (!selectedDoc) return;
    try {
      const fields = JSON.parse(reviewJson) as Record<string, unknown>;
      const title = String(fields.title ?? fields.propertyName ?? selectedDoc.fileName.replace(/\.[^.]+$/, ''));
      const location = String(fields.location ?? fields.address ?? '');
      if (!location.trim()) { setUploadError('Add a location to the reviewed fields before approval.'); return; }
      const observedAt = String(fields.observedAt ?? fields.date ?? new Date().toISOString().slice(0, 10));
      const { title: _title, location: _location, propertyType, observedAt: _observed, ...details } = fields;
      await approve.mutateAsync({ documentId: selectedDoc.id, data: { category: selectedDoc.category, title, location, propertyType: propertyType ? String(propertyType) : undefined, observedAt, sourceName: selectedDoc.fileName, details } });
      await keyInvalidate(client, [getListDocumentsQueryKey(), getGetDashboardQueryKey(), getListRecordsQueryKey()]);
      setSelectedId(null); setReviewJson(''); setUploadError('');
    } catch (error) { setUploadError(error instanceof SyntaxError ? 'Review fields must be valid JSON.' : displayError(error)); }
  };
  const loading = uploadUrl.isPending || ingest.isPending;
  return <div className="pis-enter">
    <PageHeading eyebrow="Source desk / 02" title="Document intake" description="Upload a source, inspect extracted fields and verify the evidence before it enters the library."/>
    <div className="grid gap-5 xl:grid-cols-[minmax(320px,.8fr)_minmax(0,1.35fr)]">
      <div className="space-y-5">
        <Panel className="p-5 sm:p-6">
          <div className="flex items-start gap-3"><span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary"><Upload size={17}/></span><div><h2 className="text-sm font-semibold">Add a source document</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">PDF or DOCX up to your organisation's upload limit.</p></div></div>
          {!canUpload && <p className="mt-4 rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground" data-testid="text-role-restriction">Viewer access is read-only. Ask your administrator to upload source material.</p>}
          <label className={`mt-5 flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-background/65 px-4 text-center transition-colors hover:border-primary/50 hover:bg-primary/[.03] ${!canUpload ? 'pointer-events-none opacity-55' : ''}`} data-testid="dropzone-source">
            <input type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="sr-only" disabled={!canUpload || loading} onChange={e => setFile(e.currentTarget.files?.[0] ?? null)} data-testid="input-source-file"/>
            <span className="grid size-9 place-items-center rounded-lg bg-card text-primary shadow-sm">{file ? <FileCheck2 size={18}/> : <Upload size={18}/>}</span>
            <span className="mt-3 text-xs font-medium">{file ? file.name : 'Choose a PDF or DOCX'}</span><span className="mt-1 text-[10px] text-muted-foreground">{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB · ready to process` : 'Select a file from your device'}</span>
          </label>
          <div className="mt-4"><label htmlFor="intake-category" className="mb-1.5 block text-xs font-medium">Evidence category</label><select id="intake-category" value={category} onChange={e => setCategory(e.target.value as RecordCategory)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" data-testid="select-intake-category"><option value="valuation">Valuation</option><option value="construction">Construction costs</option><option value="housing">Housing</option></select></div>
          <ErrorLine error={uploadError || uploadUrl.error || ingest.error}/>
          <Button className="mt-4 w-full" onClick={() => void upload()} disabled={!file || !canUpload || loading} data-testid="button-upload-source">{loading ? 'Uploading & extracting…' : <><Sparkles size={15} className="mr-2"/> Upload and extract</>}</Button>
          <p className="mt-3 text-center text-[10px] text-muted-foreground">Source remains linked to all extracted and reviewed fields.</p>
        </Panel>
        <Panel className="overflow-hidden">
          <div className="border-b border-border px-5 py-4"><p className="text-sm font-semibold">Review queue</p><p className="mt-1 text-xs text-muted-foreground">Documents awaiting a surveyor's eye</p></div>
          <QueryState loading={docs.isLoading} error={docs.error} retry={() => void docs.refetch()}>
            {docs.data?.length ? <div className="max-h-[430px] divide-y divide-border overflow-y-auto">{docs.data.map(doc => <button key={doc.id} onClick={() => { setSelectedId(doc.id); setReviewJson(JSON.stringify(doc.extractedData, null, 2)); setUploadError(''); }} className={`flex w-full items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-secondary/50 ${selectedId === doc.id ? 'bg-primary/[.05]' : ''}`} data-testid={`button-review-document-${doc.id}`}>
              <FileText size={16} className="mt-1 shrink-0 text-primary"/><span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{doc.fileName}</span><span className="mt-1 block text-[10px] text-muted-foreground">{categoryLabels[doc.category]} · {shortDate(doc.createdAt)}</span></span><StatusPill status={doc.status}/>
            </button>)}</div> : <EmptyState title="No documents in the queue" detail="Upload your first PDF or DOCX to begin the human review process." icon={FileCheck2}/>}
          </QueryState>
        </Panel>
      </div>
      <Panel className="min-h-[520px] overflow-hidden">
        <div className="flex items-start justify-between border-b border-border px-5 py-4 sm:px-6"><div><p className="text-sm font-semibold">Extraction review</p><p className="mt-1 text-xs text-muted-foreground">{selectedDoc ? `Source: ${selectedDoc.fileName}` : 'Select a document to inspect its extracted fields'}</p></div>{selectedDoc && <StatusPill status={selectedDoc.status}/>}</div>
        {selectedDoc ? <div className="p-5 sm:p-6">
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            {[['Source ID', `DOC-${String(selectedDoc.id).padStart(4, '0')}`], ['Category', categoryLabels[selectedDoc.category]], ['Uploaded', shortDate(selectedDoc.createdAt)]].map(([label, value]) => <div key={label} className="rounded-lg bg-secondary/55 p-3"><p className="pis-mono text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-1 text-xs font-medium" data-testid={`text-document-${label.toLowerCase().replace(' ', '-')}`}>{value}</p></div>)}
          </div>
          <label htmlFor="extracted-review" className="mb-2 block text-xs font-semibold">Extracted fields <span className="font-normal text-muted-foreground">· editable JSON</span></label>
          <Textarea id="extracted-review" value={reviewJson} onChange={e => setReviewJson(e.target.value)} disabled={!canApprove || selectedDoc.status === 'approved'} className="pis-mono min-h-[300px] resize-y bg-background text-xs leading-6" spellCheck={false} data-testid="textarea-extracted-fields"/>
          <div className="mt-3 flex items-start gap-2 text-[11px] leading-5 text-muted-foreground"><Shield size={14} className="mt-0.5 shrink-0 text-primary"/> Extraction is a draft, not a finding. Confirm every material field against the source before approval.</div>
          <ErrorLine error={uploadError || saveReview.error || approve.error}/>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => void save()} disabled={!canApprove || saveReview.isPending || selectedDoc.status === 'approved'} data-testid="button-save-review">{saveReview.isPending ? 'Saving…' : 'Save corrections'}</Button>
            <Button onClick={() => void approveDoc()} disabled={!canApprove || approve.isPending || selectedDoc.status === 'approved'} data-testid="button-approve-document"><Check size={15} className="mr-2"/>{approve.isPending ? 'Approving…' : selectedDoc.status === 'approved' ? 'Approved' : 'Approve & add to library'}</Button>
          </div>
          {!canApprove && <p className="mt-3 text-right text-xs text-muted-foreground" data-testid="text-approval-restriction">Only Admins and Senior Surveyors can edit or approve.</p>}
        </div> : <EmptyState title="Select a source to review" detail="Extracted values will appear here alongside their source context. Edits are saved to the document before approval." icon={ClipboardCheck}/>}
      </Panel>
    </div>
  </div>;
}

function RecordsPage({ category, user }: { category: RecordCategory; user: UserProfile }) {
  const client = useQueryClient();
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const params = useMemo(() => ({ category, location: search || undefined, dateFrom: from || undefined, dateTo: to || undefined }), [category, search, from, to]);
  const query = useListRecords(params);
  const confirm = useConfirmRecord();
  const update = useUpdateRecord();
  const createRecord = useCreateRecord();
  const canVerify = ['Admin', 'Senior Surveyor'].includes(user.role);
  const canCreate = user.role !== 'Viewer';
  const [editing, setEditing] = useState<number | null>(null);
  const [editLocation, setEditLocation] = useState('');
  const [detailId, setDetailId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [newPropertyType, setNewPropertyType] = useState('');
  const [newObservedAt, setNewObservedAt] = useState('');
  const [newDetails, setNewDetails] = useState('{}');
  const [createError, setCreateError] = useState('');
  const detail = useGetRecord(detailId ?? 0, { query: { enabled: detailId !== null, queryKey: getGetRecordQueryKey(detailId ?? 0) } });
  const rows = query.data ?? [];
  const title = category === 'construction' ? 'Construction costs' : category === 'housing' ? 'Housing evidence' : 'Valuation evidence';
  const verify = async (record: IntelligenceRecord) => {
    try {
      await confirm.mutateAsync({ recordId: record.id });
      await keyInvalidate(client, [getListRecordsQueryKey(), getGetDashboardQueryKey()]);
    } catch { /* mutation state is surfaced beside the records table */ }
  };
  const saveEdit = async (record: IntelligenceRecord) => {
    try {
      await update.mutateAsync({ recordId: record.id, data: { location: editLocation } });
      setEditing(null);
      await keyInvalidate(client, [getListRecordsQueryKey(params), getListRecordsQueryKey()]);
    } catch { /* mutation state is surfaced beside the records table */ }
  };
  const addRecord = async () => {
    try {
      const details = JSON.parse(newDetails) as Record<string, unknown>;
      if (!newLocation.trim()) { setCreateError('Location is required.'); return; }
      await createRecord.mutateAsync({ data: { category, title: newTitle || undefined, location: newLocation, propertyType: newPropertyType || undefined, observedAt: newObservedAt || undefined, details } });
      await keyInvalidate(client, [getListRecordsQueryKey(), getListRecordsQueryKey(params), getGetDashboardQueryKey()]);
      setCreateOpen(false); setNewTitle(''); setNewLocation(''); setNewPropertyType(''); setNewObservedAt(''); setNewDetails('{}'); setCreateError('');
    } catch (error) { setCreateError(error instanceof SyntaxError ? 'Record details must be valid JSON.' : displayError(error)); }
  };
  return <div className="pis-enter">
    <PageHeading eyebrow={`Evidence library / ${category}`} title={title} description={`Search and review traceable ${category === 'construction' ? 'construction cost' : category} records. Date and status are preserved with each source.`} action={<div className="flex flex-wrap items-center gap-2"><div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground"><Shield size={14} className="text-primary"/>{canVerify ? 'Reviewer access' : 'Read-only access'}</div><Button variant="outline" onClick={() => downloadText(`${category}-records.csv`, [['Title', 'Location', 'Property type', 'Observed date', 'Status', 'Source', 'Category'].map(csvCell).join(','), ...rows.map(r => [r.title, r.location, r.propertyType, r.observedAt, r.status, r.sourceName, r.category].map(csvCell).join(','))].join('\n'), 'text/csv')} disabled={!rows.length} data-testid="button-export-records"><ArrowDownToLine size={14} className="mr-2"/>Export filtered</Button>{canCreate && <Button onClick={() => setCreateOpen(value => !value)} data-testid="button-open-create-record"><Plus size={15} className="mr-2"/>Add record</Button>}</div>}/>
    {createOpen && <Panel className="mb-5 p-5"><div className="mb-4 flex items-start justify-between"><div><p className="text-sm font-semibold">Add intelligence record</p><p className="mt-1 text-xs text-muted-foreground">New records begin as pending and require reviewer verification.</p></div><Button variant="ghost" size="icon" onClick={() => setCreateOpen(false)} aria-label="Close form" data-testid="button-close-create-record"><X size={16}/></Button></div><div className="grid gap-3 sm:grid-cols-2"><div><label htmlFor="new-record-title" className="mb-1 block text-[11px] font-medium">Record title</label><Input id="new-record-title" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Property or project name" data-testid="input-new-record-title"/></div><div><label htmlFor="new-record-location" className="mb-1 block text-[11px] font-medium">Location *</label><Input id="new-record-location" value={newLocation} onChange={e => setNewLocation(e.target.value)} placeholder="Address or locality" data-testid="input-new-record-location"/></div><div><label htmlFor="new-record-type" className="mb-1 block text-[11px] font-medium">Property type</label><Input id="new-record-type" value={newPropertyType} onChange={e => setNewPropertyType(e.target.value)} placeholder="e.g. Retail, terraced house" data-testid="input-new-record-type"/></div><div><label htmlFor="new-record-date" className="mb-1 block text-[11px] font-medium">Observed date</label><Input id="new-record-date" type="date" value={newObservedAt} onChange={e => setNewObservedAt(e.target.value)} data-testid="input-new-record-date"/></div><div className="sm:col-span-2"><label htmlFor="new-record-details" className="mb-1 block text-[11px] font-medium">Additional details · JSON</label><Textarea id="new-record-details" value={newDetails} onChange={e => setNewDetails(e.target.value)} className="pis-mono min-h-20 text-xs" data-testid="textarea-new-record-details"/></div></div><ErrorLine error={createError || createRecord.error}/><div className="mt-4 flex justify-end"><Button onClick={() => void addRecord()} disabled={!newLocation.trim() || createRecord.isPending} data-testid="button-create-record">{createRecord.isPending ? 'Saving…' : 'Save pending record'}</Button></div></Panel>}
    <Panel className="mb-5 p-4">
      <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_180px_180px_auto] md:items-end">
        <div><label htmlFor="records-search" className="mb-1.5 block text-[11px] font-medium">Location search</label><div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/><Input id="records-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by location…" className="pl-9" data-testid="input-record-search"/></div></div>
        <div><label htmlFor="date-from" className="mb-1.5 block text-[11px] font-medium">Observed from</label><Input id="date-from" type="date" value={from} onChange={e => setFrom(e.target.value)} data-testid="input-date-from"/></div>
        <div><label htmlFor="date-to" className="mb-1.5 block text-[11px] font-medium">Observed to</label><Input id="date-to" type="date" value={to} onChange={e => setTo(e.target.value)} data-testid="input-date-to"/></div>
        <Button variant="outline" onClick={() => { setSearch(''); setFrom(''); setTo(''); }} data-testid="button-clear-filters"><Filter size={14} className="mr-2"/> Clear filters</Button>
      </div>
    </Panel>
    <Panel className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-5 py-4"><div><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs text-muted-foreground">Source-linked property evidence</p></div><span className="pis-mono text-xs text-muted-foreground">{query.data?.length ?? '—'} records</span></div>
      <QueryState loading={query.isLoading} error={query.error} retry={() => void query.refetch()}>
        {rows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-xs"><thead className="bg-secondary/55 text-[10px] uppercase tracking-wider text-muted-foreground"><tr><th className="px-5 py-3 font-medium">Property / source</th><th className="px-4 py-3 font-medium">Location</th><th className="px-4 py-3 font-medium">Observed</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium text-right">Action</th></tr></thead><tbody className="divide-y divide-border">{rows.map(record => <tr key={record.id} className="transition-colors hover:bg-secondary/25" data-testid={`row-record-${record.id}`}>
          <td className="px-5 py-4"><p className="font-semibold">{record.title || record.propertyType || categoryLabels[record.category]}</p><p className="mt-1 text-[10px] text-muted-foreground">{record.sourceName || 'Source not specified'}</p></td>
          <td className="px-4 py-4">{editing === record.id ? <div className="flex gap-1"><Input value={editLocation} onChange={e => setEditLocation(e.target.value)} className="h-8 w-40" data-testid={`input-edit-location-${record.id}`}/><Button size="sm" className="h-8 px-2" onClick={() => void saveEdit(record)} data-testid={`button-save-record-${record.id}`}><Check size={14}/></Button><Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => setEditing(null)} data-testid={`button-cancel-record-${record.id}`}><X size={14}/></Button></div> : <span>{record.location}</span>}</td>
          <td className="px-4 py-4 text-muted-foreground">{shortDate(record.observedAt)}</td><td className="px-4 py-4"><StatusPill status={record.status}/></td>
          <td className="px-4 py-4 text-right"><div className="inline-flex items-center gap-2"><Button size="sm" variant="ghost" onClick={() => setDetailId(detailId === record.id ? null : record.id)} data-testid={`button-record-details-${record.id}`}>{detailId === record.id ? 'Hide' : 'Details'}</Button>{record.status === 'pending' && canVerify ? <><Button size="sm" variant="outline" onClick={() => { setEditing(record.id); setEditLocation(record.location); }} data-testid={`button-edit-record-${record.id}`}>Edit</Button><Button size="sm" onClick={() => void verify(record)} disabled={confirm.isPending} data-testid={`button-confirm-record-${record.id}`}><Check size={13} className="mr-1"/>Verify</Button></> : record.status === 'pending' ? <span className="text-[10px] text-muted-foreground">Reviewer required</span> : <span className="text-[10px] text-primary">Evidence verified</span>}</div></td>
        </tr>)}</tbody></table></div> : <EmptyState title="No matching evidence yet" detail="Try adjusting your search or date range. Approved documents appear here once added to the evidence library." icon={Search}/>}
      </QueryState>
      {detailId !== null && <div className="border-t border-border bg-secondary/25 p-5" data-testid={`panel-record-details-${detailId}`}><div className="flex items-center justify-between"><p className="text-xs font-semibold">Record detail · #{detailId}</p><Button variant="ghost" size="sm" onClick={() => setDetailId(null)} data-testid="button-close-record-details">Close</Button></div>{detail.isLoading ? <Skeleton className="mt-3 h-20 w-full"/> : detail.error ? <p className="mt-3 text-xs text-destructive">{displayError(detail.error)}</p> : detail.data && <div className="mt-3 grid gap-3 sm:grid-cols-3"><div><p className="pis-mono text-[9px] uppercase text-muted-foreground">Source</p><p className="mt-1 text-xs">{detail.data.sourceName || 'Not specified'}</p></div><div><p className="pis-mono text-[9px] uppercase text-muted-foreground">Created by</p><p className="mt-1 text-xs">{detail.data.createdBy || 'Not specified'}</p></div><div className="sm:col-span-3"><p className="pis-mono text-[9px] uppercase text-muted-foreground">Field evidence</p><pre className="pis-mono mt-1 overflow-auto rounded-md bg-background p-3 text-[10px] leading-5">{JSON.stringify(detail.data.details, null, 2)}</pre></div></div>}</div>}
      <div className="px-5 pb-4"><ErrorLine error={confirm.error || update.error}/></div>
    </Panel>
  </div>;
}

function EvidencePage({ user }: { user: UserProfile }) {
  const client = useQueryClient();
  const [subject, setSubject] = useState('');
  const [title, setTitle] = useState('');
  const [commentary, setCommentary] = useState('');
  const [selected, setSelected] = useState<number[]>([]);
  const records = useListRecords({ status: 'confirmed' });
  const packages = useListEvidencePackages();
  const createPackage = useCreateEvidencePackage();
  const canCreate = user.role !== 'Viewer';
  const toggle = (id: number) => setSelected(current => current.includes(id) ? current.filter(x => x !== id) : [...current, id]);
  const create = async () => {
    if (!title.trim() || !subject.trim() || !selected.length) return;
    try {
      await createPackage.mutateAsync({ data: { title, subjectProperty: subject, recordIds: selected, commentary } });
      await keyInvalidate(client, [getListEvidencePackagesQueryKey()]);
      setTitle(''); setSubject(''); setCommentary(''); setSelected([]);
    } catch { /* mutation state is surfaced in the package builder */ }
  };
  return <div className="pis-enter">
    <PageHeading eyebrow="Evidence desk / 06" title="Comparable evidence" description="Select verified records, anchor them to a subject property and create a traceable evidence package."/>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,.85fr)]">
      <Panel className="overflow-hidden">
        <div className="border-b border-border px-5 py-4"><p className="text-sm font-semibold">Build a package</p><p className="mt-1 text-xs text-muted-foreground">Only confirmed records can be selected as comparables.</p></div>
        {!canCreate && <p className="m-5 mb-0 rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground" data-testid="text-role-restriction">Viewer role cannot generate or edit packages.</p>}
        <div className="space-y-4 p-5">
          <div className="grid gap-3 sm:grid-cols-2"><div><label htmlFor="package-title" className="mb-1.5 block text-xs font-medium">Package name</label><Input id="package-title" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Mayfair office review" disabled={!canCreate} data-testid="input-package-title"/></div><div><label htmlFor="subject-property" className="mb-1.5 block text-xs font-medium">Subject property</label><Input id="subject-property" value={subject} onChange={e => setSubject(e.target.value)} placeholder="Address or property reference" disabled={!canCreate} data-testid="input-subject-property"/></div></div>
          <div><label htmlFor="package-commentary" className="mb-1.5 block text-xs font-medium">Surveyor commentary</label><Textarea id="package-commentary" value={commentary} onChange={e => setCommentary(e.target.value)} placeholder="Describe relevance, adjustments and limitations…" className="min-h-20" disabled={!canCreate} data-testid="textarea-package-commentary"/></div>
          <div className="flex items-center justify-between"><p className="text-xs font-semibold">Verified comparables</p><span className="pis-mono text-[10px] text-muted-foreground">{selected.length} selected</span></div>
          <QueryState loading={records.isLoading} error={records.error} retry={() => void records.refetch()}>
            {records.data?.length ? <div className="max-h-64 divide-y divide-border overflow-y-auto rounded-lg border border-border">{records.data.map(record => <label key={record.id} className="flex cursor-pointer items-center gap-3 p-3 hover:bg-secondary/40" data-testid={`option-comparable-${record.id}`}><input type="checkbox" checked={selected.includes(record.id)} disabled={!canCreate} onChange={() => toggle(record.id)} className="size-4 accent-[hsl(var(--primary))]" data-testid={`checkbox-comparable-${record.id}`}/><span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{record.title || record.propertyType || categoryLabels[record.category]}</span><span className="mt-1 block truncate text-[10px] text-muted-foreground">{record.location} · {shortDate(record.observedAt)}</span></span><span className="pis-mono text-[9px] uppercase text-muted-foreground">{record.category}</span></label>)}</div> : <EmptyState title="No verified comparables" detail="Verify records in the evidence library before assembling a package."/>}
          </QueryState>
          <div className="flex justify-end"><Button onClick={() => void create()} disabled={!canCreate || !title.trim() || !subject.trim() || !selected.length || createPackage.isPending} data-testid="button-create-package"><Plus size={15} className="mr-2"/>{createPackage.isPending ? 'Generating…' : 'Generate package'}</Button></div>
          <ErrorLine error={createPackage.error}/>
        </div>
      </Panel>
      <Panel className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-4"><div><p className="text-sm font-semibold">Saved packages</p><p className="mt-1 text-xs text-muted-foreground">Previously prepared evidence sets</p></div><FolderOpen size={17} className="text-primary"/></div>
        <QueryState loading={packages.isLoading} error={packages.error} retry={() => void packages.refetch()}>
          {packages.data?.length ? <div className="divide-y divide-border">{packages.data.map(pack => <PackageCard key={pack.id} item={pack}/>)}</div> : <EmptyState title="No packages prepared" detail="A saved evidence package will appear here when a surveyor creates one." icon={FolderOpen}/>}
        </QueryState>
      </Panel>
    </div>
  </div>;
}
function PackageCard({ item }: { item: EvidencePackage }) {
  const [expanded, setExpanded] = useState(false);
  const detail = useGetEvidencePackage(item.id, { query: { enabled: expanded, queryKey: getGetEvidencePackageQueryKey(item.id) } });
  return <article className="p-5 print-sheet" data-testid={`card-evidence-package-${item.id}`}><button onClick={() => setExpanded(value => !value)} className="flex w-full items-start gap-3 text-left" data-testid={`button-toggle-package-${item.id}`}><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-primary"><FolderOpen size={16}/></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{item.title}</span><span className="mt-1 block truncate text-xs text-muted-foreground">{item.subjectProperty}</span></span><ChevronDown size={15} className={`mt-1 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`}/></button>
    <div className="ml-12 mt-3 flex flex-wrap items-center gap-3"><span className="text-[10px] text-muted-foreground">{item.recordIds.length} comparables <span className="mx-1">·</span>{shortDate(item.createdAt)}</span><Button size="sm" variant="outline" className="ml-auto h-7 px-2 text-[10px]" onClick={e => { e.stopPropagation(); downloadText(`${item.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-evidence.txt`, [`${item.title}`, `Subject property: ${item.subjectProperty}`, `Prepared: ${shortDate(item.createdAt)}`, `Comparable record IDs: ${item.recordIds.join(', ')}`, '', 'Surveyor commentary:', item.commentary || 'No commentary provided.'].join('\n')); }} data-testid={`button-export-package-${item.id}`}><ArrowDownToLine size={12} className="mr-1"/>Export</Button><Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={e => { e.stopPropagation(); const sheet = e.currentTarget.closest('.print-sheet'); sheet?.classList.add('print-target'); window.addEventListener('afterprint', () => sheet?.classList.remove('print-target'), { once: true }); window.print(); }} data-testid={`button-print-package-${item.id}`}><FileText size={12} className="mr-1"/>Print</Button></div>
    <div className="print-only hidden"><p className="pis-mono text-[10px] uppercase tracking-[.18em]">Pinnacle · Evidence package</p><h1 className="pis-brand mt-5 text-3xl font-semibold">{item.title}</h1><p className="mt-2 text-sm">Subject property: {item.subjectProperty}</p><p className="mt-1 text-xs">Prepared {shortDate(item.createdAt)} · {item.recordIds.length} verified comparable records</p><h2 className="mt-8 text-sm font-semibold">Surveyor commentary</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{item.commentary || 'No commentary provided.'}</p><h2 className="mt-8 text-sm font-semibold">Source records</h2><p className="mt-2 pis-mono text-xs">{item.recordIds.join(', ')}</p><p className="mt-12 border-t pt-4 text-[10px] text-muted-foreground">Prepared from human-verified Pinnacle property evidence. Source traceability retained in the workspace.</p></div>
    {expanded && <div className="ml-12 mt-4 border-t border-border pt-3 text-xs leading-5"><p className="pis-mono mb-2 text-[9px] uppercase tracking-wider text-primary">Surveyor commentary</p>{detail.isLoading ? <Skeleton className="h-10 w-full"/> : detail.error ? <p className="text-destructive">{displayError(detail.error)}</p> : <p className="text-muted-foreground">{detail.data?.commentary || item.commentary || 'No commentary provided.'}</p>}<p className="pis-mono mt-3 text-[9px] text-muted-foreground">RECORD IDS · {(detail.data?.recordIds ?? item.recordIds).join(', ')}</p></div>}
  </article>;
}

function TeamPage({ user }: { user: UserProfile }) {
  const client = useQueryClient();
  const users = useListUsers();
  const activity = useListActivity();
  const invite = useInviteUser();
  const roleUpdate = useUpdateUserRole();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('Junior Surveyor');
  const isAdmin = user.role === 'Admin';
  const inviteMember = async () => {
    try {
      await invite.mutateAsync({ data: { email, role } });
      setEmail('');
      await keyInvalidate(client, [getListUsersQueryKey(), getListActivityQueryKey()]);
    } catch { /* mutation state is surfaced beside the team list */ }
  };
  const changeRole = async (memberId: string, nextRole: UserRole) => {
    try {
      await roleUpdate.mutateAsync({ userId: memberId, data: { role: nextRole } });
      await keyInvalidate(client, [getListUsersQueryKey(), getListActivityQueryKey()]);
    } catch { /* mutation state is surfaced beside the team list */ }
  };
  return <div className="pis-enter">
    <PageHeading eyebrow="Governance / 07" title="Team & audit" description="Roles define who can change, review and verify evidence. Every important action is recorded in the activity ledger."/>
    {!isAdmin && <div className="mb-5 flex items-start gap-3 rounded-xl border border-accent/35 bg-accent/10 p-4 text-xs leading-5" data-testid="text-role-restriction"><Shield size={16} className="mt-0.5 shrink-0 text-primary"/><span><strong>Administrator controls.</strong> You can view team membership and audit activity. Invitations and role changes are restricted to Admins.</span></div>}
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(300px,.75fr)]">
      <Panel className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-4"><div><p className="text-sm font-semibold">Team members</p><p className="mt-1 text-xs text-muted-foreground">Access is scoped by professional role</p></div><Users size={17} className="text-primary"/></div>
        {isAdmin && <div className="grid gap-2 border-b border-border bg-secondary/35 p-4 sm:grid-cols-[minmax(160px,1fr)_180px_auto]"><Input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="colleague@pinnacle.co.uk" aria-label="Invite email" data-testid="input-invite-email"/><select aria-label="New member role" value={role} onChange={e => setRole(e.target.value as UserRole)} className="h-10 rounded-md border border-input bg-background px-3 text-sm" data-testid="select-invite-role">{roleNames.map(r => <option key={r} value={r}>{r}</option>)}</select><Button onClick={() => void inviteMember()} disabled={!email.trim() || invite.isPending} data-testid="button-invite-user"><Plus size={15} className="mr-1"/>Invite</Button></div>}
        <QueryState loading={users.isLoading} error={users.error} retry={() => void users.refetch()}>
          {users.data?.length ? <div className="divide-y divide-border">{users.data.map(member => <div key={member.id} className="flex flex-wrap items-center gap-3 px-5 py-4" data-testid={`row-user-${member.id}`}><span className="grid size-9 place-items-center rounded-full bg-secondary text-xs font-semibold text-primary">{initials(member.fullName)}</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold" data-testid={`text-user-name-${member.id}`}>{member.fullName}{member.id === user.id && <span className="ml-2 text-[9px] font-normal text-muted-foreground">YOU</span>}</span><span className="mt-1 block truncate text-[10px] text-muted-foreground">{member.email}</span></span>
            {isAdmin && member.id !== user.id ? <select value={member.role} onChange={e => void changeRole(member.id, e.target.value as UserRole)} className="h-8 rounded-md border border-input bg-background px-2 text-[11px]" data-testid={`select-role-${member.id}`}>{roleNames.map(r => <option key={r} value={r}>{r}</option>)}</select> : <Badge variant="outline" className="text-[10px]">{member.role}</Badge>}
          </div>)}</div> : <EmptyState title="No team members found" detail="New users will appear here after their account is created." icon={Users}/>}
        </QueryState>
        <div className="px-5 pb-4"><ErrorLine error={invite.error || roleUpdate.error}/></div>
      </Panel>
      <Panel className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-4"><div><p className="text-sm font-semibold">Audit activity</p><p className="mt-1 text-xs text-muted-foreground">Changes in the workspace</p></div><Activity size={17} className="text-primary"/></div>
        <QueryState loading={activity.isLoading} error={activity.error} retry={() => void activity.refetch()}>
          {activity.data?.length ? <div className="divide-y divide-border">{activity.data.slice(0, 12).map((entry, index) => <ActivityRow entry={entry} index={index} key={entry.id}/>)}</div> : <EmptyState title="No activity recorded yet" detail="Audit events will appear here as your team works." icon={Activity}/>}
        </QueryState>
      </Panel>
    </div>
    <Panel className="mt-5 p-5">
      <div className="flex items-start gap-3"><span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary"><KeyRound size={16}/></span><div><p className="text-sm font-semibold">Role permissions</p><p className="mt-1 text-xs text-muted-foreground">Applied across the workspace</p></div></div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{[
        ['Admin', 'Manage membership, review and verify records.'],
        ['Senior Surveyor', 'Review extracted fields and verify evidence.'],
        ['Junior Surveyor', 'Upload source documents and prepare records.'],
        ['Viewer', 'Read-only access to evidence and activity.'],
      ].map(([name, detail]) => <div key={name} className="rounded-lg border border-border p-3" data-testid={`card-permission-${name.toLowerCase().replaceAll(' ', '-')}`}><p className="text-xs font-semibold">{name}</p><p className="mt-1.5 text-[10px] leading-4 text-muted-foreground">{detail}</p></div>)}</div>
    </Panel>
  </div>;
}

function AuthGate({ location }: { location: string }) {
  const current = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey(), retry: false } });
  if (location === '/sign-in' || location === '/sign-up') return current.data ? <RedirectDashboard/> : <AuthPage signup={location === '/sign-up'}/>;
  if (current.isLoading) return <div className="min-h-[100dvh] bg-background p-8"><Skeleton className="h-14 w-full"/><Skeleton className="mt-8 h-64 w-full"/></div>;
  if (current.error || !current.data) return <AuthPage/>;
  const user = current.data;
  let content: ReactNode;
  switch (location) {
    case '/': case '/dashboard': content = <DashboardPage user={user}/>; break;
    case '/ingestion': content = <IntakePage user={user}/>; break;
    case '/valuations': content = <RecordsPage category="valuation" user={user}/>; break;
    case '/construction-costs': content = <RecordsPage category="construction" user={user}/>; break;
    case '/housing': content = <RecordsPage category="housing" user={user}/>; break;
    case '/evidence': content = <EvidencePage user={user}/>; break;
    case '/team': content = <TeamPage user={user}/>; break;
    default: content = <NotFound/>; break;
  }
  return <AppShell user={user} active={location === '/' ? '/dashboard' : location}>{content}</AppShell>;
}
function RedirectDashboard() {
  const router = useRouter();
  useEffect(() => { router.replace('/dashboard'); }, [router]);
  return <div className="min-h-[100dvh] bg-background p-8"><Skeleton className="h-16 w-full"/></div>;
}

function App() {
  const location = usePathname() ?? '/';
  return <ErrorBoundary><AuthGate location={location}/></ErrorBoundary>;
}
export default App;
