export type RunOutcome = 'results' | 'empty' | 'budget-limited';

export function classifyRunOutcome(
    savedCount: number,
    spendingLimitReached: boolean,
    parsedTargetCount: number,
    failedTargetCount: number,
): RunOutcome {
    if (spendingLimitReached) return 'budget-limited';
    if (savedCount > 0) return 'results';
    if (parsedTargetCount > 0) return 'empty';
    throw new Error(`No Myntra target returned a valid product payload. Failed targets: ${failedTargetCount}.`);
}
