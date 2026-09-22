'use client';

import { useState, useEffect } from 'react';
import { useAccount, useWriteContract, useReadContract } from 'wagmi';
import { LEARNING_BETS_ABI } from '@/config/contracts';
import { eduToWei, weiToEdu, CONTRACTS, BLOCKCHAIN_ENABLED } from '@/config/blockchain';
import { ethers } from 'ethers';

export function useLearningBets() {
  const { address, isConnected } = useAccount();
  const [activeBets, setActiveBets] = useState([]);
  
  const { writeContract, data: hash, error, isPending } = useWriteContract();
  const contractAddress = CONTRACTS.LEARNING_BETS;

  // Read user's active bets from blockchain
  const { data: userBetIds } = useReadContract({
    address: contractAddress,
    abi: LEARNING_BETS_ABI,
    functionName: 'getActiveBets',
    args: [address],
    query: { enabled: !!address && BLOCKCHAIN_ENABLED && !!contractAddress },
  });

  // Place a new learning bet
  const placeBet = async (aiTime, challengeTime, courseId, stakeAmount) => {
    if (!BLOCKCHAIN_ENABLED || !contractAddress) throw new Error('Blockchain features unavailable');
    if (!isConnected) throw new Error('Wallet not connected');
    
    try {
      const stakeWei = eduToWei(stakeAmount);
      
      await writeContract({
        address: contractAddress,
        abi: LEARNING_BETS_ABI,
        functionName: 'placeBet',
        args: [
          BigInt(Math.floor(aiTime)),
          BigInt(Math.floor(challengeTime)),
          courseId
        ],
        value: stakeWei,
      });

      return hash;
    } catch (err) {
      console.error('Error placing bet:', err);
      throw err;
    }
  };

  // Complete a learning bet with results
  const completeBet = async (betId, actualTime, qualityScore) => {
    if (!BLOCKCHAIN_ENABLED || !contractAddress) throw new Error('Blockchain features unavailable');
    if (!isConnected) throw new Error('Wallet not connected');
    
    try {
      await writeContract({
        address: contractAddress,
        abi: LEARNING_BETS_ABI,
        functionName: 'completeBet',
        args: [
          BigInt(betId),
          BigInt(Math.floor(actualTime)),
          BigInt(Math.floor(qualityScore))
        ],
      });

      return hash;
    } catch (err) {
      console.error('Error completing bet:', err);
      throw err;
    }
  };

  const verifyMilestone = async (milestoneData) => {
    if (!BLOCKCHAIN_ENABLED || !contractAddress) throw new Error('Blockchain features unavailable');
    if (!isConnected) throw new Error('Wallet not connected');
    const hashBytes = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(milestoneData)));
    await writeContract({
      address: contractAddress,
      abi: LEARNING_BETS_ABI,
      functionName: 'verifyMilestone',
      args: [hashBytes],
    });
    return hash;
  };

  // Calculate potential payout before placing bet
  const calculatePotentialPayout = (stakeAmount, aiTime, challengeTime, qualityScore = 70) => {
    // Replicate smart contract logic
    const timeReduction = ((aiTime - challengeTime) * 100) / aiTime;
    
    let multiplier;
    if (timeReduction >= 50) {
      multiplier = 3.0;
    } else if (timeReduction >= 30) {
      multiplier = 2.0 + (timeReduction - 30) * 0.05;
    } else if (timeReduction >= 15) {
      multiplier = 1.5 + (timeReduction - 15) * 0.033;
    } else {
      multiplier = 1.05 + timeReduction * 0.03;
    }

    let basePayout = parseFloat(stakeAmount) * multiplier;
    
    // Quality bonus
    if (qualityScore >= 80) {
      basePayout *= 1.1;
    }
    
    // Platform fee
    const platformFee = basePayout * 0.05;
    const finalPayout = basePayout - platformFee;
    
    return {
      multiplier: multiplier.toFixed(2),
      basePayout: basePayout.toFixed(4),
      qualityBonus: qualityScore >= 80 ? '10%' : '0%',
      platformFee: platformFee.toFixed(4),
      finalPayout: finalPayout.toFixed(4),
      profit: (finalPayout - parseFloat(stakeAmount)).toFixed(4)
    };
  };

  // Check if user can complete a bet (meets requirements)
  const canCompleteBet = (actualTime, challengeTime, qualityScore) => {
    const metTimeChallenge = actualTime <= challengeTime;
    const metQualityRequirement = qualityScore >= 60;
    
    return {
      canComplete: metTimeChallenge && metQualityRequirement,
      metTimeChallenge,
      metQualityRequirement,
      timeStatus: metTimeChallenge ? 'PASS' : 'FAIL',
      qualityStatus: metQualityRequirement ? 'PASS' : 'FAIL'
    };
  };

  return {
    // State
    activeBets,
    isConnected,
    isPending,
    error,
    blockchainEnabled: BLOCKCHAIN_ENABLED,
    
    // Actions
    placeBet,
    completeBet,
    verifyMilestone,
    
    // Utilities
    calculatePotentialPayout,
    canCompleteBet,
    
    // Raw data
    userBetIds,
    hash
  };
}
