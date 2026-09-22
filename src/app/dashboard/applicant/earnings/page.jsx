'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft, Coins, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useLearningBets } from '@/hooks/useLearningBets';
import { useAccount } from 'wagmi';

export default function EarningsPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { userBetIds, blockchainEnabled, isConnected: betsConnected } = useLearningBets();

  const betIds = Array.isArray(userBetIds) ? userBetIds.map((id) => String(id)) : [];

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <Button variant="ghost" onClick={() => router.push('/dashboard/applicant')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>

        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Coins className="h-6 w-6" /> Learning bet earnings
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            On-chain learning bets from EduChain (when wallet + contract are available).
          </p>
        </div>

        {!blockchainEnabled && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground text-sm">
              Blockchain features are disabled. Connect a wallet and set contract addresses to track earnings.
            </CardContent>
          </Card>
        )}

        {blockchainEnabled && !(isConnected || betsConnected) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Wallet className="h-5 w-5" /> Connect wallet
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Connect your wallet to load active learning bets for {address || 'your account'}.
            </CardContent>
          </Card>
        )}

        {blockchainEnabled && (isConnected || betsConnected) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Active bets</CardTitle>
            </CardHeader>
            <CardContent>
              {betIds.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No active learning bets on-chain yet. Place a bet from a prep plan to see it here.
                </p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {betIds.map((id) => (
                    <li key={id} className="rounded-md border border-border px-3 py-2 font-mono">
                      Bet #{id}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
