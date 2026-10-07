export type RunOutcome = 'results' | 'empty' | 'budget-limited';

export function classifyRunOutcome(
    savedCount: number,
    spendingLimitReached: boolean,
    parsedTargetCount: number,
    failedTargetCount: number,
): RunOutcome {
    if (spendingLimitReached) return 'budget-limited';
    if (savedCount > 0) return 'results';
    if (parsedTargetCount > 0 && failedTargetCount === 0) return 'empty';
    if (parsedTargetCount > 0) {
        throw new Error(`No Myntra products were saved: ${failedTargetCount} target(s) failed and the remaining parsed targets were empty.`);
    }
    throw new Error(`No Myntra target returned a valid product payload. Failed targets: ${failedTargetCount}.`);
}
