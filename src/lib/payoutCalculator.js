/**
 * Dynamic Payout Calculation System
 * Calculates fair and motivating reward multipliers based on multiple factors
 */

export class PayoutCalculator {
    constructor() {
        // Base configuration for payout calculations
        this.config = {
            baseMultiplier: { min: 1.1, max: 1.5, default: 1.2 },
            timelineCompression: { min: 1.0, max: 3.0 },
            difficultyBonus: { min: 1.0, max: 2.0 },
            userRiskFactor: { min: 0.8, max: 1.2 },
            marketAdjustment: { min: 0.9, max: 1.1 },
            platformFeePercentage: 5, // 5% platform fee
            minimumPayout: 1.05, // Minimum 5% return
            maximumPayout: 5.0   // Maximum 500% return
        };
    }

    /**
     * Calculate comprehensive payout multiplier
     * @param {Object} params - Calculation parameters
     * @returns {Object} Detailed payout calculation
     */
    calculatePayout(params) {
        const {
            timeline,           // weeks
            contentDifficulty,  // 1-10 scale
            userSkillLevel,     // 1-10 scale
            userHistory,        // user's past performance
            marketConditions,   // current platform metrics
            customizations = 0  // number of customizations made
        } = params;

        // Step 1: Base Multiplier
        const baseMultiplier = this.calculateBaseMultiplier(contentDifficulty, userSkillLevel);

        // Step 2: Timeline Compression Factor
        const timelineCompression = this.calculateTimelineCompression(timeline, contentDifficulty);

        // Step 3: Difficulty Bonus
        const difficultyBonus = this.calculateDifficultyBonus(contentDifficulty, userSkillLevel);

        // Step 4: User Risk Factor
        const userRiskFactor = this.calculateUserRiskFactor(userHistory, userSkillLevel);

        // Step 5: Market Adjustment
        const marketAdjustment = this.calculateMarketAdjustment(marketConditions);

        // Step 6: Customization Bonus
        const customizationBonus = this.calculateCustomizationBonus(customizations);

        // Calculate final multiplier
        const rawMultiplier = baseMultiplier *
            timelineCompression *
            difficultyBonus *
            userRiskFactor *
            marketAdjustment *
            customizationBonus;

        // Apply bounds
        const finalMultiplier = Math.max(
            this.config.minimumPayout,
            Math.min(this.config.maximumPayout, rawMultiplier)
        );

        // Calculate risk assessment
        const riskAssessment = this.assessRisk(params);

        return {
            finalMultiplier: parseFloat(finalMultiplier.toFixed(3)),
            breakdown: {
                baseMultiplier: parseFloat(baseMultiplier.toFixed(3)),
                timelineCompression: parseFloat(timelineCompression.toFixed(3)),
                difficultyBonus: parseFloat(difficultyBonus.toFixed(3)),
                userRiskFactor: parseFloat(userRiskFactor.toFixed(3)),
                marketAdjustment: parseFloat(marketAdjustment.toFixed(3)),
                customizationBonus: parseFloat(customizationBonus.toFixed(3))
            },
            riskAssessment,
            platformFee: this.config.platformFeePercentage,
            estimatedReturn: this.calculateEstimatedReturn(finalMultiplier),
            confidence: this.calculateConfidence(params),
            recommendations: this.generateRecommendations(params, finalMultiplier)
        };
    }

    /**
     * Calculate base multiplier based on content difficulty and user skill
     */
    calculateBaseMultiplier(contentDifficulty, userSkillLevel) {
        const { min, max, default: defaultValue } = this.config.baseMultiplier;

        // Higher difficulty relative to user skill = higher base multiplier
        const skillGap = Math.max(0, contentDifficulty - userSkillLevel);
        const gapFactor = skillGap / 10; // Normalize to 0-1

        return defaultValue + (gapFactor * (max - defaultValue));
    }

    /**
     * Calculate timeline compression factor
     */
    calculateTimelineCompression(timeline, contentDifficulty) {
        // Standard timeline expectations based on difficulty
        const standardTimeline = {
            1: 2,   // Very easy: 2 weeks
            2: 3,   // Easy: 3 weeks  
            3: 4,   // Below average: 4 weeks
            4: 6,   // Average: 6 weeks
            5: 8,   // Above average: 8 weeks
            6: 10,  // Difficult: 10 weeks
            7: 12,  // Hard: 12 weeks
            8: 16,  // Very hard: 16 weeks
            9: 20,  // Extremely hard: 20 weeks
            10: 24  // Expert level: 24 weeks
        };

        const expectedWeeks = standardTimeline[Math.round(contentDifficulty)] || 8;
        const compressionRatio = expectedWeeks / timeline;

        // Cap the compression factor
        return Math.min(this.config.timelineCompression.max,
            Math.max(this.config.timelineCompression.min, compressionRatio));
    }

    /**
     * Calculate difficulty bonus
     */
    calculateDifficultyBonus(contentDifficulty, userSkillLevel) {
        const { min, max } = this.config.difficultyBonus;

        // Bonus increases with content difficulty
        const difficultyFactor = contentDifficulty / 10;

        // Additional bonus if content is significantly harder than user's level
        const challengeFactor = Math.max(0, (contentDifficulty - userSkillLevel) / 10);

        const bonus = min + (difficultyFactor * (max - min)) + (challengeFactor * 0.3);

        return Math.min(max, bonus);
    }

    /**
     * Calculate user risk factor based on history
     */
    calculateUserRiskFactor(userHistory, userSkillLevel) {
        const { min, max } = this.config.userRiskFactor;

        if (!userHistory || Object.keys(userHistory).length === 0) {
            // New user - neutral risk factor
            return 1.0;
        }

        const {
            completionRate = 0.7,    // Default 70% completion rate
            averageScore = 0.75,     // Default 75% average score
            totalAttempts = 1,       // Number of previous attempts
            streakLength = 0         // Current success streak
        } = userHistory;

        // Calculate risk based on past performance
        let riskFactor = 1.0;

        // Completion rate impact
        if (completionRate > 0.8) {
            riskFactor += 0.1; // Bonus for high completion rate
        } else if (completionRate < 0.5) {
            riskFactor -= 0.15; // Penalty for low completion rate
        }

        // Average score impact
        if (averageScore > 0.85) {
            riskFactor += 0.05; // Bonus for high scores
        } else if (averageScore < 0.6) {
            riskFactor -= 0.1; // Penalty for low scores
        }

        // Experience bonus (diminishing returns)
        const experienceBonus = Math.min(0.1, totalAttempts * 0.02);
        riskFactor += experienceBonus;

        // Streak bonus
        const streakBonus = Math.min(0.05, streakLength * 0.01);
        riskFactor += streakBonus;

        return Math.max(min, Math.min(max, riskFactor));
    }

    /**
     * Calculate market adjustment based on platform conditions
     */
    calculateMarketAdjustment(marketConditions) {
        const { min, max } = this.config.marketAdjustment;

        if (!marketConditions) {
            return 1.0; // Neutral if no market data
        }

        const {
            platformUtilization = 0.5,  // 0-1 scale
            rewardPoolHealth = 0.8,     // 0-1 scale  
            averageCompletionRate = 0.7, // Platform average
            demandSupplyRatio = 1.0     // Demand vs supply of learning content
        } = marketConditions;

        let adjustment = 1.0;

        // Adjust based on platform utilization
        if (platformUtilization > 0.8) {
            adjustment -= 0.05; // Reduce payouts when platform is heavily used
        } else if (platformUtilization < 0.3) {
            adjustment += 0.05; // Increase payouts to encourage usage
        }

        // Adjust based on reward pool health
        if (rewardPoolHealth < 0.5) {
            adjustment -= 0.1; // Reduce payouts if pool is low
        } else if (rewardPoolHealth > 0.9) {
            adjustment += 0.05; // Increase payouts if pool is healthy
        }

        // Adjust based on completion rates
        if (averageCompletionRate < 0.5) {
            adjustment += 0.03; // Increase incentives if completion rates are low
        }

        return Math.max(min, Math.min(max, adjustment));
    }

    /**
     * Calculate customization bonus
     */
    calculateCustomizationBonus(customizations) {
        // Small bonus for users who customize their learning path
        // Shows engagement and thoughtful planning
        const bonusPerCustomization = 0.02; // 2% per customization
        const maxBonus = 0.1; // Cap at 10% bonus

        return 1.0 + Math.min(maxBonus, customizations * bonusPerCustomization);
    }

    /**
     * Assess overall risk of the learning plan
     */
    assessRisk(params) {
        const { timeline, contentDifficulty, userSkillLevel, userHistory } = params;

        let riskScore = 0;
        const factors = [];

        // Timeline risk
        const expectedWeeks = Math.max(4, contentDifficulty * 2);
        if (timeline < expectedWeeks * 0.5) {
            riskScore += 3;
            factors.push('Very aggressive timeline');
        } else if (timeline < expectedWeeks * 0.7) {
            riskScore += 2;
            factors.push('Aggressive timeline');
        } else if (timeline < expectedWeeks * 0.9) {
            riskScore += 1;
            factors.push('Moderately tight timeline');
        }

        // Skill gap risk
        const skillGap = contentDifficulty - userSkillLevel;
        if (skillGap > 4) {
            riskScore += 3;
            factors.push('Large skill gap');
        } else if (skillGap > 2) {
            riskScore += 2;
            factors.push('Moderate skill gap');
        } else if (skillGap > 0) {
            riskScore += 1;
            factors.push('Small skill gap');
        }

        // User history risk
        if (userHistory?.completionRate < 0.5) {
            riskScore += 2;
            factors.push('Low historical completion rate');
        } else if (userHistory?.completionRate < 0.7) {
            riskScore += 1;
            factors.push('Moderate historical completion rate');
        }

        // Determine risk level
        let riskLevel, riskDescription;
        if (riskScore >= 6) {
            riskLevel = 'high';
            riskDescription = 'High risk - consider extending timeline or reducing scope';
        } else if (riskScore >= 3) {
            riskLevel = 'medium';
            riskDescription = 'Medium risk - challenging but achievable with dedication';
        } else {
            riskLevel = 'low';
            riskDescription = 'Low risk - well-matched to your capabilities';
        }

        return {
            riskLevel,
            riskScore,
            riskDescription,
            riskFactors: factors,
            successProbability: Math.max(0.1, Math.min(0.95, 1 - (riskScore * 0.1)))
        };
    }

    /**
     * Calculate estimated return scenarios
     */
    calculateEstimatedReturn(multiplier) {
        return {
            conservative: parseFloat((multiplier * 0.8).toFixed(3)), // 80% of calculated
            expected: multiplier,
            optimistic: parseFloat((multiplier * 1.1).toFixed(3))    // 110% of calculated
        };
    }

    /**
     * Calculate confidence in the payout calculation
     */
    calculateConfidence(params) {
        let confidence = 0.8; // Base confidence

        // Reduce confidence for extreme parameters
        if (params.timeline < 2 || params.timeline > 52) {
            confidence -= 0.2;
        }

        if (params.contentDifficulty > 8 || params.userSkillLevel < 2) {
            confidence -= 0.1;
        }

        // Increase confidence if we have user history
        if (params.userHistory && params.userHistory.totalAttempts > 3) {
            confidence += 0.1;
        }

        return Math.max(0.3, Math.min(0.95, confidence));
    }

    /**
     * Generate recommendations for optimizing the payout
     */
    generateRecommendations(params, finalMultiplier) {
        const recommendations = [];
        const { timeline, contentDifficulty, userSkillLevel } = params;

        // Timeline recommendations
        const expectedWeeks = Math.max(4, contentDifficulty * 2);
        if (timeline < expectedWeeks * 0.6) {
            recommendations.push({
                type: 'timeline',
                message: `Consider extending timeline to ${Math.ceil(expectedWeeks * 0.8)} weeks for better success odds`,
                impact: 'Reduces risk but lowers payout multiplier'
            });
        }

        // Skill development recommendations
        const skillGap = contentDifficulty - userSkillLevel;
        if (skillGap > 3) {
            recommendations.push({
                type: 'preparation',
                message: 'Consider taking preparatory courses to build foundational skills first',
                impact: 'Improves success probability significantly'
            });
        }

        // Payout optimization
        if (finalMultiplier < 1.5) {
            recommendations.push({
                type: 'optimization',
                message: 'Choose a more aggressive timeline or higher difficulty content for better rewards',
                impact: 'Higher risk but potentially higher rewards'
            });
        } else if (finalMultiplier > 3.0) {
            recommendations.push({
                type: 'caution',
                message: 'This is a high-risk, high-reward scenario - ensure you have adequate preparation',
                impact: 'Consider if the risk level matches your goals'
            });
        }

        return recommendations;
    }

    /**
     * Simulate payout scenarios for different parameters
     */
    simulateScenarios(baseParams) {
        const scenarios = [];

        // Conservative scenario (longer timeline)
        scenarios.push({
            name: 'Conservative',
            description: 'Lower risk, steady progress',
            params: { ...baseParams, timeline: baseParams.timeline * 1.5 },
            result: this.calculatePayout({ ...baseParams, timeline: baseParams.timeline * 1.5 })
        });

        // Aggressive scenario (shorter timeline)
        scenarios.push({
            name: 'Aggressive',
            description: 'Higher risk, faster completion',
            params: { ...baseParams, timeline: Math.max(2, baseParams.timeline * 0.7) },
            result: this.calculatePayout({ ...baseParams, timeline: Math.max(2, baseParams.timeline * 0.7) })
        });

        // Balanced scenario (current params)
        scenarios.push({
            name: 'Balanced',
            description: 'Current settings',
            params: baseParams,
            result: this.calculatePayout(baseParams)
        });

        return scenarios;
    }
}

// Export singleton instance
export const payoutCalculator = new PayoutCalculator();