// Blockchain configuration for X-CEED Learning Bets
import { http, createConfig } from 'wagmi';
import { injected, metaMask } from 'wagmi/connectors';

// EduChain Testnet Configuration (Free Educational Blockchain)
export const EDUCHAIN_TESTNET_CONFIG = {
  id: 656476,
  name: 'EduChain Testnet',
  network: 'educhain-testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'EDU Token',
    symbol: 'EDU',
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.open-campus-codex.gelato.digital'],
    },
    public: {
      http: ['https://rpc.open-campus-codex.gelato.digital'],
    },
  },
  blockExplorers: {
    default: {
      name: 'EduChain Explorer',
      url: 'https://opencampus-codex.blockscout.com',
    },
  },
  testnet: true,
};

// Create custom EduChain definition
const eduChain = EDUCHAIN_TESTNET_CONFIG;

// Wagmi Configuration for EduChain
export const wagmiConfig = createConfig({
  chains: [eduChain],
  connectors: [
    injected(),
    metaMask(),
  ],
  transports: {
    [eduChain.id]: http(),
  },
});

// Smart Contract Addresses — unset/zero = blockchain disabled in UI
const _rawContract = process.env.NEXT_PUBLIC_LEARNING_BETS_CONTRACT || '';
const ZERO = '0x0000000000000000000000000000000000000000';
export const BLOCKCHAIN_ENABLED =
  !!_rawContract && _rawContract.toLowerCase() !== ZERO.toLowerCase();

export const CONTRACTS = {
  LEARNING_BETS: BLOCKCHAIN_ENABLED ? _rawContract : null,
};

// Betting Configuration
export const BETTING_CONFIG = {
  MIN_STAKE: '0.01', // 0.01 EDU minimum
  MAX_STAKE: '10',   // 10 EDU maximum
  MAX_MULTIPLIER: 3.0,
  MIN_QUALITY_SCORE: 60,
  PLATFORM_FEE: 0.05, // 5% platform fee
};

// Helper function to convert EDU to Wei
export const eduToWei = (edu) => {
  return BigInt(Math.floor(parseFloat(edu) * 10**18));
};

// Helper function to convert Wei to EDU
export const weiToEdu = (wei) => {
  return parseFloat(wei) / 10**18;
};

// Calculate betting multiplier based on challenge
export const calculateMultiplier = (aiTime, userChallenge, difficulty = 1.0) => {
  const timeReduction = (aiTime - userChallenge) / aiTime;
  const riskFactor = Math.min(timeReduction * 2, 1.0); // Cap risk factor at 1.0
  const baseMultiplier = 1.0 + (riskFactor * difficulty);
  
  return Math.min(baseMultiplier, BETTING_CONFIG.MAX_MULTIPLIER);
};

// Format time for display
export const formatTime = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};
