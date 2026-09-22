'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Target, BookOpen, FolderKanban, Youtube, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function CareerPlanPage() {
  const router = useRouter();
  const [targetRole, setTargetRole] = useState('');
  const [gapsText, setGapsText] = useState('');
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState('');
  const [completed, setCompleted] = useState({});

  const generate = async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const gaps = gapsText
        .split('\n')
        .map((g) => g.trim())
        .filter(Boolean)
        .map((requirement) => ({ requirement, classification: 'skill_gap', priority: 'medium' }));

      const res = await fetch('/api/career-plan/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ targetRole, gaps }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed');
      setPlan(json.data);
      try {
        localStorage.setItem('xceed_career_plan', JSON.stringify(json.data));
      } catch {}
    } catch (e) {
      setError(e.message || 'Failed to generate plan');
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
  const resources = Array.isArray(plan?.resources) ? plan.resources : [];
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
            Generate objectives, projects, and learning resources from your skill gaps.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Target className="h-5 w-5" /> Target role
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
            <div>
              <Label htmlFor="gaps">Gaps (one per line, optional)</Label>
              <textarea
                id="gaps"
                className="mt-1 w-full h-24 rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="TypeScript&#10;System design&#10;GraphQL"
                value={gapsText}
                onChange={(e) => setGapsText(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button onClick={generate} disabled={!targetRole.trim() || loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {loading ? 'Generating…' : 'Generate plan'}
            </Button>
          </CardContent>
        </Card>

        {plan && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <BookOpen className="h-5 w-5" /> Objectives
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {objectives.length === 0 && (
                    <li className="text-sm text-muted-foreground">No objectives returned.</li>
                  )}
                  {objectives.map((obj, i) => {
                    const label = typeof obj === 'string' ? obj : obj.title || obj.description || JSON.stringify(obj);
                    return (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={!!completed[i]}
                          onChange={() => toggleObjective(i)}
                        />
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
                  {projects.length === 0 && <li className="text-muted-foreground list-none">No projects.</li>}
                  {projects.map((p, i) => (
                    <li key={i}>{typeof p === 'string' ? p : p.title || p.name || JSON.stringify(p)}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Youtube className="h-5 w-5" /> Resources
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {resources.length === 0 && <li className="text-muted-foreground">No resources.</li>}
                  {resources.map((r, i) => {
                    const title = typeof r === 'string' ? r : r.title || r.name || 'Resource';
                    const url = typeof r === 'object' ? r.url || r.link : null;
                    return (
                      <li key={i}>
                        {url ? (
                          <a href={url} target="_blank" rel="noreferrer" className="text-primary underline">
                            {title}
                          </a>
                        ) : (
                          title
                        )}
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
