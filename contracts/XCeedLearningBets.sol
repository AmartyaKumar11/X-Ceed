// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract XCeedLearningBets {
    struct LearningBet {
        address user;
        uint256 stakeAmount;
        uint256 aiEstimatedTime; // in seconds
        uint256 userChallengeTime; // in seconds
        uint256 multiplier; // multiplied by 100 (e.g., 150 = 1.5x)
        uint256 qualityThreshold; // minimum quality score (out of 100)
        string courseId;
        bool isActive;
        bool isCompleted;
        uint256 actualCompletionTime;
        uint256 qualityScore;
        uint256 timestamp;
    }
    
    mapping(uint256 => LearningBet) public bets;
    mapping(address => uint256[]) public userBets;
    uint256 public nextBetId = 1;
    
    // Platform settings
    uint256 public constant PLATFORM_FEE = 5; // 5% platform fee
    uint256 public constant MIN_QUALITY_SCORE = 60;
    uint256 public constant MAX_PARTIAL_PAYOUT_PERCENT = 45; // Max 45% of stake for partial completion
    uint256 public constant MIN_PARTIAL_PAYOUT_PERCENT = 5;  // Min 5% of stake for any completion
    address public owner;
    
    event BetPlaced(uint256 indexed betId, address indexed user, uint256 stake, uint256 multiplier);
    event BetCompleted(uint256 indexed betId, address indexed user, uint256 payout);
    event BetFailed(uint256 indexed betId, address indexed user, string reason);
    event PartialPayout(uint256 indexed betId, address indexed user, uint256 payout, string reason);
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this function");
        _;
    }
    
    modifier onlyBetOwner(uint256 betId) {
        require(bets[betId].user == msg.sender, "Not your bet");
        _;
    }
    
    constructor() {
        owner = msg.sender;
    }
    
    function placeBet(
        uint256 aiTime,
        uint256 challengeTime,
        string memory courseId
    ) external payable {
        require(msg.value > 0, "Stake must be greater than 0");
        require(challengeTime < aiTime, "Challenge time must be faster than AI estimate");
        require(challengeTime > 0, "Challenge time must be positive");
        require(bytes(courseId).length > 0, "Course ID cannot be empty");
        
        uint256 multiplier = calculateMultiplier(aiTime, challengeTime);
        
        // Store the bet
        bets[nextBetId] = LearningBet({
            user: msg.sender,
            stakeAmount: msg.value,
            aiEstimatedTime: aiTime,
            userChallengeTime: challengeTime,
            multiplier: multiplier,
            qualityThreshold: MIN_QUALITY_SCORE,
            courseId: courseId,
            isActive: true,
            isCompleted: false,
            actualCompletionTime: 0,
            qualityScore: 0,
            timestamp: block.timestamp
        });
        
        userBets[msg.sender].push(nextBetId);
        
        emit BetPlaced(nextBetId, msg.sender, msg.value, multiplier);
        nextBetId++;
    }
    
    function completeBet(
        uint256 betId,
        uint256 actualTime,
        uint256 qualityScore
    ) external onlyBetOwner(betId) {
        LearningBet storage bet = bets[betId];
        require(bet.isActive, "Bet is not active");
        require(!bet.isCompleted, "Bet already completed");
        require(actualTime > 0, "Actual time must be positive");
        require(qualityScore <= 100, "Quality score cannot exceed 100");
        
        bet.actualCompletionTime = actualTime;
        bet.qualityScore = qualityScore;
        bet.isCompleted = true;
        bet.isActive = false;
        
        // Check completion status
        bool metTimeChallenge = actualTime <= bet.userChallengeTime;
        bool metQualityRequirement = qualityScore >= bet.qualityThreshold;
        
        uint256 payout = calculatePayout(betId);
        
        if (payout > 0) {
            // Transfer payout to user
            (bool success, ) = payable(msg.sender).call{value: payout}("");
            require(success, "Payout transfer failed");
            
            // Emit appropriate event based on completion status
            if (metTimeChallenge && metQualityRequirement) {
                emit BetCompleted(betId, msg.sender, payout);
            } else {
                // Partial completion - determine reason
                string memory reason;
                if (metQualityRequirement && !metTimeChallenge) {
                    reason = "Quality met, time exceeded";
                } else if (metTimeChallenge && !metQualityRequirement) {
                    reason = "Time met, quality insufficient";
                } else {
                    reason = "Both time and quality failed";
                }
                emit PartialPayout(betId, msg.sender, payout, reason);
            }
        } else {
            // This should rarely happen with partial payout system
            emit BetFailed(betId, msg.sender, "No payout calculated");
        }
    }
    
    function calculateMultiplier(uint256 aiTime, uint256 challengeTime) internal pure returns (uint256) {
        require(challengeTime < aiTime, "Challenge must be faster");
        
        uint256 timeReduction = ((aiTime - challengeTime) * 100) / aiTime; // Percentage reduction
        uint256 baseMultiplier = 100; // 1.0x in basis points
        
        // More aggressive time reduction = higher multiplier
        if (timeReduction >= 50) {
            return 300; // 3.0x max
        } else if (timeReduction >= 30) {
            return 200 + (timeReduction - 30) * 5; // 2.0x to 3.0x
        } else if (timeReduction >= 15) {
            return 150 + (timeReduction - 15) * 3; // 1.5x to 2.0x
        } else {
            return 105 + timeReduction * 3; // 1.05x to 1.5x
        }
    }
    
    function calculatePayout(uint256 betId) internal view returns (uint256) {
        LearningBet storage bet = bets[betId];
        
        // Check if user met the challenge conditions
        bool metTimeChallenge = bet.actualCompletionTime <= bet.userChallengeTime;
        bool metQualityRequirement = bet.qualityScore >= bet.qualityThreshold;
        
        // FULL SUCCESS: Both conditions met
        if (metTimeChallenge && metQualityRequirement) {
            // Calculate full payout with multiplier
            uint256 basePayout = (bet.stakeAmount * bet.multiplier) / 100;
            
            // Quality bonus: extra 10% if quality score >= 80
            if (bet.qualityScore >= 80) {
                basePayout = (basePayout * 110) / 100;
            }
            
            // Platform fee
            uint256 platformFee = (basePayout * PLATFORM_FEE) / 100;
            uint256 finalPayout = basePayout - platformFee;
            
            // Ensure contract has enough balance
            return finalPayout > address(this).balance ? address(this).balance : finalPayout;
        }
        
        // PARTIAL SUCCESS: Calculate partial payout (always less than original stake)
        return calculatePartialPayout(betId, metTimeChallenge, metQualityRequirement);
    }
    
    function calculatePartialPayout(uint256 betId, bool metTimeChallenge, bool metQualityRequirement) 
        internal view returns (uint256) {
        LearningBet storage bet = bets[betId];
        uint256 partialPayout = 0;
        
        // Base partial percentage of original stake
        uint256 basePartialPercent = 20; // Start with 20% of stake
        
        // CASE 1: Met quality but failed time challenge
        if (metQualityRequirement && !metTimeChallenge) {
            // Reward quality completion but penalize time failure
            basePartialPercent = 35; // 35% of original stake
            
            // Bonus for high quality even without time success
            if (bet.qualityScore >= 80) {
                basePartialPercent = 45; // 45% of original stake
            } else if (bet.qualityScore >= 70) {
                basePartialPercent = 40; // 40% of original stake
            }
        }
        
        // CASE 2: Met time challenge but failed quality requirement
        else if (metTimeChallenge && !metQualityRequirement) {
            // Reward time success but penalize quality failure
            basePartialPercent = 30; // 30% of original stake
            
            // Sliding scale based on quality score (minimum 25, below threshold)
            if (bet.qualityScore >= 50) {
                basePartialPercent = 35; // 35% of original stake
            } else if (bet.qualityScore >= 40) {
                basePartialPercent = 30; // 30% of original stake
            } else {
                basePartialPercent = 25; // 25% of original stake
            }
        }
        
        // CASE 3: Failed both conditions but completed some content
        else {
            // Minimal completion reward (encourage future attempts)
            if (bet.qualityScore >= 30) {
                basePartialPercent = 15; // 15% of original stake
            } else if (bet.qualityScore >= 20) {
                basePartialPercent = 10; // 10% of original stake
            } else {
                basePartialPercent = 5;  // 5% of original stake (minimal effort)
            }
        }
        
        // Calculate partial payout (always less than original stake)
        partialPayout = (bet.stakeAmount * basePartialPercent) / 100;
        
        // Apply platform fee to partial payout too
        uint256 platformFee = (partialPayout * PLATFORM_FEE) / 100;
        partialPayout = partialPayout - platformFee;
        
        // Ensure partial payout is always less than original stake
        require(partialPayout < bet.stakeAmount, "Partial payout cannot exceed stake");
        
        return partialPayout;
    }
    
    function getUserBets(address user) external view returns (uint256[] memory) {
        return userBets[user];
    }
    
    function getBetDetails(uint256 betId) external view returns (LearningBet memory) {
        return bets[betId];
    }
    
    function previewPayout(uint256 betId, uint256 simulatedActualTime, uint256 simulatedQualityScore) 
        external view returns (uint256 fullPayout, uint256 partialPayout, bool wouldGetFull) {
        
        LearningBet storage bet = bets[betId];
        require(bet.isActive, "Bet is not active");
        
        // Simulate the completion conditions
        bool metTimeChallenge = simulatedActualTime <= bet.userChallengeTime;
        bool metQualityRequirement = simulatedQualityScore >= bet.qualityThreshold;
        
        // Calculate what full payout would be
        if (metTimeChallenge && metQualityRequirement) {
            uint256 basePayout = (bet.stakeAmount * bet.multiplier) / 100;
            
            if (simulatedQualityScore >= 80) {
                basePayout = (basePayout * 110) / 100;
            }
            
            uint256 platformFee = (basePayout * PLATFORM_FEE) / 100;
            fullPayout = basePayout - platformFee;
            wouldGetFull = true;
        } else {
            fullPayout = 0;
            wouldGetFull = false;
        }
        
        // Calculate partial payout (for comparison)
        partialPayout = calculatePartialPayoutSimulation(bet, metTimeChallenge, metQualityRequirement, simulatedQualityScore);
        
        return (fullPayout, partialPayout, wouldGetFull);
    }
    
    function calculatePartialPayoutSimulation(
        LearningBet storage bet, 
        bool metTimeChallenge, 
        bool metQualityRequirement,
        uint256 simulatedQualityScore
    ) internal view returns (uint256) {
        uint256 basePartialPercent = 20;
        
        if (metQualityRequirement && !metTimeChallenge) {
            basePartialPercent = 35;
            if (simulatedQualityScore >= 80) {
                basePartialPercent = 45;
            } else if (simulatedQualityScore >= 70) {
                basePartialPercent = 40;
            }
        } else if (metTimeChallenge && !metQualityRequirement) {
            basePartialPercent = 30;
            if (simulatedQualityScore >= 50) {
                basePartialPercent = 35;
            } else if (simulatedQualityScore >= 40) {
                basePartialPercent = 30;
            } else {
                basePartialPercent = 25;
            }
        } else {
            if (simulatedQualityScore >= 30) {
                basePartialPercent = 15;
            } else if (simulatedQualityScore >= 20) {
                basePartialPercent = 10;
            } else {
                basePartialPercent = 5;
            }
        }
        
        uint256 partialPayout = (bet.stakeAmount * basePartialPercent) / 100;
        uint256 platformFee = (partialPayout * PLATFORM_FEE) / 100;
        return partialPayout - platformFee;
    }
    
    function getActiveBets(address user) external view returns (uint256[] memory) {
        uint256[] memory allBets = userBets[user];
        uint256 activeCount = 0;
        
        // Count active bets
        for (uint256 i = 0; i < allBets.length; i++) {
            if (bets[allBets[i]].isActive) {
                activeCount++;
            }
        }
        
        // Create array of active bet IDs
        uint256[] memory activeBets = new uint256[](activeCount);
        uint256 index = 0;
        
        for (uint256 i = 0; i < allBets.length; i++) {
            if (bets[allBets[i]].isActive) {
                activeBets[index] = allBets[i];
                index++;
            }
        }
        
        return activeBets;
    }
    
    // Emergency functions
    function emergencyWithdraw() external onlyOwner {
        payable(owner).transfer(address(this).balance);
    }
    
    function updatePlatformFee(uint256 newFee) external onlyOwner {
        require(newFee <= 10, "Fee cannot exceed 10%");
        // Platform fee is now a constant, but this could be made variable
    }
    
    // Get contract balance
    function getContractBalance() external view returns (uint256) {
        return address(this).balance;
    }

    // Milestone verification (accountability hashes — no PII on-chain)
    event MilestoneVerified(address indexed user, bytes32 indexed milestoneHash, uint256 timestamp);
    mapping(address => bytes32[]) public userMilestones;

    function verifyMilestone(bytes32 milestoneHash) external {
        userMilestones[msg.sender].push(milestoneHash);
        emit MilestoneVerified(msg.sender, milestoneHash, block.timestamp);
    }

    function getMilestones(address user) external view returns (bytes32[] memory) {
        return userMilestones[user];
    }
    
    // Receive function to accept ETH
    receive() external payable {}
}
