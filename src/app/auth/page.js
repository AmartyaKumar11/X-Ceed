'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from "next/link";
import styles from './auth.module.css';
import { clientAuth } from '@/lib/auth';

// Import shadcn components
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function AuthPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("login");
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [isLoading, setIsLoading] = useState(false);  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    
    if (activeTab === "login") {
      try {
        // Login logic - make API call
        console.log('Logging in', { email, password });
          const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email,
            password,
          }),
        });

        let result;
        try {
          result = await response.json();
        } catch (jsonError) {
          console.error('Failed to parse JSON response:', jsonError);
          alert('Login failed. Please try again.');
          return;
        }

        if (!response.ok) {
          alert(result.message || 'Login failed. Please try again.');
          return;
        }// Store authentication data using clientAuth
        if (typeof window !== 'undefined') {
          // Store user data using the clientAuth method
          clientAuth.setUser({
            _id: result.user._id,
            email: result.user.email,
            userType: result.user.userType,
            token: result.token,
            personal: result.user.personal,
            recruiter: result.user.recruiter
          });
          
          // Also store individual items for backward compatibility (if needed elsewhere)
          localStorage.setItem('token', result.token);
          localStorage.setItem('userRole', result.user.userType);
          localStorage.setItem('userId', result.user._id);
          localStorage.setItem('userName', result.user.userType === 'applicant' ? result.user.personal?.name : result.user.recruiter?.name);
          localStorage.setItem('userEmail', result.user.email);
        }

        // Redirect to dashboard based on user role
        if (result.user.userType === 'applicant') {
          router.push('/dashboard/applicant');
        } else if (result.user.userType === 'recruiter') {
          router.push('/dashboard/recruiter');
        } else {
          router.push('/dashboard');
        }
      } catch (error) {
        console.error('Login error:', error);
        alert('Login failed. Please try again.');
      } finally {
        setIsLoading(false);
      }
    } else {
      // Registration logic
      console.log('Signing up', { email, password, name, role });
        // Store the user role in localStorage for demo purposes
      // In a real app, this would be stored in a database and retrieved via an API
      if (typeof window !== 'undefined') {
        localStorage.setItem('userRole', role);
        localStorage.setItem('userEmail', email);
        localStorage.setItem('userName', name);
      }
        // Redirect based on role
      if (role === "applicant") {
        // For applicants, redirect to registration form for profile completion
        router.push('/register');
      } else if (role === "recruiter") {
        // For recruiters, redirect to recruiter registration form
        router.push('/register/recruiter');
      }
    }
  };
  return (
    <div className={styles.authContainer}>
      <div className="flex w-full items-center justify-center">
        <div className="w-full max-w-md p-4">
          <div className="mb-4 flex justify-between items-center">
            <div className="text-2xl font-bold">X-CEED</div>            <div className="text-sm text-muted-foreground">
              <Link href="#" className="underline underline-offset-4 hover:text-primary cursor-pointer">
                Need help?
              </Link>
            </div>
          </div>
            <Card className={styles.authCard}>
            <CardHeader className="space-y-1 py-4">
              <CardTitle className="text-xl">Authentication</CardTitle>
              <CardDescription>
                Enter your credentials to access your account
              </CardDescription>
            </CardHeader>
            <CardContent className="py-2">
              <Tabs defaultValue={activeTab} onValueChange={setActiveTab} className="w-full">                <TabsList className="grid w-full grid-cols-2 mb-3">
                  <TabsTrigger value="login" className="cursor-pointer">Login</TabsTrigger>
                  <TabsTrigger value="register" className="cursor-pointer">Register</TabsTrigger>
                </TabsList><TabsContent value="login">
                  <form onSubmit={handleSubmit} className="space-y-3">
                    <div>
                      <div className="space-y-0.5">
                        <Label htmlFor="email">Email</Label>
                        <Input 
                          id="email" 
                          placeholder="name@example.com" 
                          required 
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="h-9"
                        />
                      </div>
                    </div>
                    <div>
                      <div className="space-y-0.5">
                        <Label htmlFor="password">Password</Label>
                        <Input 
                          id="password" 
                          required 
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)} 
                          className="h-9"
                        />
                      </div>
                    </div>
                    <Button type="submit" className="w-full h-9" disabled={isLoading}>
                      {isLoading ? 'Signing In...' : 'Sign In'}
                    </Button>
                  </form>
                </TabsContent>                <TabsContent value="register">
                  <form onSubmit={handleSubmit} className="space-y-3">
                    <div>
                      <div className="space-y-0.5">
                        <Label htmlFor="name">Full Name</Label>
                        <Input 
                          id="name" 
                          placeholder="John Doe" 
                          required 
                          type="text"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className="h-9"
                        />
                      </div>
                    </div>
                    <div>
                      <div className="space-y-0.5">
                        <Label htmlFor="email">Email</Label>
                        <Input 
                          id="email" 
                          placeholder="name@example.com" 
                          required 
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="h-9"
                        />
                      </div>
                    </div>
                    <div>
                      <div className="space-y-0.5">
                        <Label htmlFor="password">Password</Label>
                        <Input 
                          id="password" 
                          required 
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)} 
                          className="h-9"
                        />
                      </div>
                    </div>                    <div>
                      <div className="space-y-0.5">
                        <Label htmlFor="role">Select Role</Label>
                        <div className={styles.selectWrapper}>
                          <select
                            id="role"
                            name="role"
                            required
                            value={role}
                            onChange={(e) => setRole(e.target.value)}
                            className="flex h-9 w-full rounded-md bg-background px-3 py-1 text-sm vercel-border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                          >
                            <option value="" disabled>Select your role</option>
                            <option value="applicant">Applicant</option>
                            <option value="recruiter">Recruiter</option>
                          </select>
                        </div>
                      </div>
                    </div>
                    <Button type="submit" className="w-full h-9" disabled={!role}>Create Account</Button>
                  </form>
                </TabsContent>
              </Tabs>
            </CardContent>            <CardFooter className="py-3">              <div className="text-xs text-muted-foreground text-center w-full">
                By continuing, you agree to our{" "}
                <Link href="#" className="underline underline-offset-4 hover:text-primary cursor-pointer">
                  Terms
                </Link>{" "}
                and{" "}
                <Link href="#" className="underline underline-offset-4 hover:text-primary cursor-pointer">
                  Privacy Policy
                </Link>
              </div>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}