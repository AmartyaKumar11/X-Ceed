'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Target, BookOpen, FolderKanban, Youtube, Loader2, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const CLASSIFICATIONS = [
  { value: 'missing', label: 'Missing (fundamentals)' },
  { value: 'weak', label: 'Weak (intermediate)' },
  { value: 'under-evidenced', label: 'Under-evidenced (portfolio)' },
];

export default function CareerPlanPage() {
  const router = useRouter();
  const [targetRole, setTargetRole] = useState('');
  const [gaps, setGaps] = useState([{ requirement: '', classification: 'missing', priority: 'high' }]);
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState('');
  const [completed, setCompleted] = useState({});
  const [openModules, setOpenModules] = useState({});

  const updateGap = (i, field, value) => {
    setGaps((prev) => prev.map((g, idx) => (idx === i ? { ...g, [field]: value } : g)));
  };

  const generate = async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const cleanGaps = gaps
        .map((g) => ({
          requirement: g.requirement.trim(),
          classification: g.classification,
          priority: g.priority || 'medium',
        }))
        .filter((g) => g.requirement);
      if (!cleanGaps.length) throw new Error('Add at least one skill gap');

      const res = await fetch('/api/career-plan/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ targetRole, gaps: cleanGaps }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed');
      setPlan(json.data);
      const opens = {};
      (json.data.modules || []).forEach((_, i) => { opens[i] = i === 0; });
      setOpenModules(opens);
      try {
        localStorage.setItem('xceed_career_plan', JSON.stringify(json.data));
      } catch {}
    } catch (e) {
      setError(e.message || 'Failed to generate plan');
      setPlan(null);
    } finally {
      setLoading(false);
    }
  };

  const toggleObjective = (idx) => {
    setCompleted((prev) => {
      const next = { ...prev, [idx]: !prev[idx] };
      try {
        localStorage.setItem('xceed_career_milestones', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const objectives = Array.isArray(plan?.objectives) ? plan.objectives : [];
  const projects = Array.isArray(plan?.projects) ? plan.projects : [];
  const modules = Array.isArray(plan?.modules) ? plan.modules : [];
  const studyPlan = plan?.study_plan;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <Button variant="ghost" onClick={() => router.push('/dashboard/applicant')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>

        <div>
          <h1 className="text-2xl font-semibold text-foreground">Career Plan</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Per-gap courses from live YouTube + Jev filter + DeepSeek sequencing.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Target className="h-5 w-5" /> Target role & skill gaps
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="role">Role</Label>
              <Input
                id="role"
                className="mt-1"
                placeholder="e.g. Senior Frontend Engineer"
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value)}
              />
            </div>

            {gaps.map((g, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[1fr_12rem] border border-border rounded-md p-3">
                <div>
                  <Label>Skill gap</Label>
                  <Input
                    className="mt-1"
                    placeholder="e.g. Python"
                    value={g.requirement}
                    onChange={(e) => updateGap(i, 'requirement', e.target.value)}
                  />
                </div>
                <div>
                  <Label>Classification</Label>
                  <select
                    className="mt-1 w-full h-10 rounded-md border border-input bg-background px-2 text-sm"
                    value={g.classification}
                    onChange={(e) => updateGap(i, 'classification', e.target.value)}
                  >
                    {CLASSIFICATIONS.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            ))}

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setGaps((p) => [...p, { requirement: '', classification: 'weak', priority: 'medium' }])}
              >
                Add gap
              </Button>
              <Button onClick={generate} disabled={!targetRole.trim() || loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {loading ? 'Generating…' : 'Generate plan'}
              </Button>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>

        {plan && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Youtube className="h-5 w-5" /> Gap learning modules
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {modules.length === 0 && (
                  <p className="text-sm text-muted-foreground">No modules returned.</p>
                )}
                {modules.map((mod, i) => {
                  const open = !!openModules[i];
                  return (
                    <div key={i} className="border border-border rounded-md">
                      <button
                        type="button"
                        className="w-full flex items-center justify-between px-3 py-2 text-left text-sm font-medium"
                        onClick={() => setOpenModules((p) => ({ ...p, [i]: !p[i] }))}
                      >
                        <span>
                          {mod.requirement}{' '}
                          <span className="text-muted-foreground font-normal">
                            ({mod.classification})
                          </span>
                        </span>
                        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                      {open && (
                        <div className="px-3 pb-3 space-y-2 border-t border-border pt-2">
                          {(mod.queries || []).length > 0 && (
                            <p className="text-xs text-muted-foreground">
                              Searches: {(mod.queries || []).join(' · ')}
                            </p>
                          )}
                          {(mod.videos || []).length === 0 && (
                            <p className="text-sm text-muted-foreground">No videos passed Jev filter for this gap.</p>
                          )}
                          {(mod.videos || []).map((v, vi) => (
                            <div key={vi} className="rounded-md bg-muted/40 p-2 text-sm">
                              <div className="font-medium">
                                {v.order ? `${v.order}. ` : ''}{v.title}
                              </div>
                              <p className="text-muted-foreground text-xs mt-1">{v.description}</p>
                              <a
                                href={v.url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-primary text-xs mt-1 underline"
                              >
                                Watch <ExternalLink className="h-3 w-3" />
                              </a>
                              <Button
                                size="sm"
                                variant="outline"
                                className="ml-2 h-7 text-xs"
                                onClick={() => {
                                  const id = (v.url || '').match(/[?&]v=([^&]+)/)?.[1];
                                  if (id) {
                                    router.push(
                                      `/video-ai-assistant?videoId=${id}&title=${encodeURIComponent(v.title || '')}`
                                    );
                                  }
                                }}
                              >
                                Open in assistant
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <BookOpen className="h-5 w-5" /> Objectives
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {objectives.map((obj, i) => {
                    const label = typeof obj === 'string' ? obj : obj.objective || obj.title || JSON.stringify(obj);
                    return (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <input type="checkbox" className="mt-1" checked={!!completed[i]} onChange={() => toggleObjective(i)} />
                        <span className={completed[i] ? 'line-through text-muted-foreground' : ''}>{label}</span>
                      </li>
                    );
                  })}
                </ul>
                {studyPlan && (
                  <pre className="mt-4 whitespace-pre-wrap text-xs bg-muted p-3 rounded-md overflow-auto max-h-48">
                    {typeof studyPlan === 'string' ? studyPlan : JSON.stringify(studyPlan, null, 2)}
                  </pre>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <FolderKanban className="h-5 w-5" /> Projects
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 list-disc pl-5 text-sm">
                  {projects.map((p, i) => (
                    <li key={i}>{typeof p === 'string' ? p : p.name || p.title || JSON.stringify(p)}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
