export function calculateProjectFinancials(context: any, activeTier?: any) {
    const financials = context?.financials || {
        initiationFeePaid: 4999,
        billablePercent: 100,
        executionGstEnabled: true,
        projectedCashValue: 0,
        taxLimitYearly: 2000000,
        goodwillDiscount: 0,
        discounts: []
    };
    const gstRate = context?.gstRate || 18;
    const initiationFee = financials.initiationFeePaid || 0;
    const billablePercent = financials.billablePercent ?? 100;
    const executionGstEnabled = financials.executionGstEnabled ?? true;
    const discounts = financials.discounts || [];
    
    // In Dashboard, activeTier could be passed, or we fallback to context.approvedExecutionValue
    let originalExecutionTotal = 0;
    let originalDesignFee = 0;
    if (activeTier) {
        originalExecutionTotal = activeTier.summary?.totalSell || 0;
        originalDesignFee = activeTier.summary?.designFee || 0;
    } else {
        originalExecutionTotal = context?.originalExecutionTotal || 0;
        originalDesignFee = context?.originalDesignFee || 0;
    }

    const rawExecutionTotal = financials.approvedExecutionValue ?? originalExecutionTotal;
    const rawDesignFee = financials.approvedDesignValue ?? originalDesignFee;

    const calculateDiscountValue = (base: number, target: 'execution' | 'design') => {
        const targetDiscounts = discounts.filter((d: any) => d.target === target);
        let totalDeduction = 0;
        targetDiscounts.forEach((d: any) => {
            if (d.type === 'percentage') {
                totalDeduction += base * (d.value / 100);
            } else {
                totalDeduction += d.value;
            }
        });
        return totalDeduction;
    };

    
    const executionDiscountVal = calculateDiscountValue(rawExecutionTotal, 'execution');
    const designDiscountVal = calculateDiscountValue(rawDesignFee, 'design');

    const taxableExecution = Math.max(0, rawExecutionTotal - executionDiscountVal);
    const taxableDesign = Math.max(0, rawDesignFee - designDiscountVal);

    const executionBillable = taxableExecution * (billablePercent / 100);
    const executionCash = taxableExecution * ((100 - billablePercent) / 100);
    
    const gstOnExecution = executionGstEnabled ? (executionBillable * (gstRate / 100)) : 0;
    const gstOnDesign = taxableDesign * (gstRate / 100);
    
    const totalGST = gstOnExecution + gstOnDesign;
    const currentProjectValue = executionBillable + executionCash + taxableDesign + totalGST;

    const calculateMilestoneTotal = (m: any) => {
        let baseAmount = taxableExecution; // default execution
        if (m.type === 'design') baseAmount = taxableDesign;
        if (m.lockedTaxableBase !== undefined) baseAmount = m.lockedTaxableBase;
        
        const rowBaseOriginal = m.isFixedAmount && m.fixedAmount !== undefined ? m.fixedAmount : baseAmount * ((m.percentage||0) / 100);
        
        let rowBillable = rowBaseOriginal;
        let rowCash = 0;
        let applicableGstRate = gstRate;
        
        if (m.type === 'execution') {
            rowBillable = rowBaseOriginal * (billablePercent / 100);
            rowCash = rowBaseOriginal * (Math.max(0, 100 - billablePercent) / 100);
            if (!executionGstEnabled) applicableGstRate = 0;
        }
        
        const rowGST = rowBillable * (applicableGstRate / 100);
        return Math.round(rowBillable + rowCash + rowGST);
    };

    const milestones = context?.paymentMilestones || [];
    let totalPaid = initiationFee;
    let designPaid = initiationFee; // Initiation fee counts towards design typically?
    let executionPaid = 0;
    let totalInvoicedBaseAmt = 0;
    let pendingAmt = 0;
    
    let isFirstDesign = true;

    milestones.forEach((m: any) => {
        const amount = calculateMilestoneTotal(m);
        let finalAmount = amount;
        
        // Handle initiation fee offset on first design milestone
        if (m.type === 'design' && isFirstDesign && initiationFee > 0) {
            finalAmount = Math.max(0, amount - initiationFee);
            isFirstDesign = false;
        }

        if (m.status === 'paid') {
            totalPaid += finalAmount;
            if (m.type === 'design') designPaid += finalAmount;
            else executionPaid += finalAmount;
        }
        
                if (m.status === 'invoiced' || m.status === 'advance_requested') {
            totalInvoicedBaseAmt += finalAmount;
            
            pendingAmt += finalAmount;
        }
    });

    return {
        currentProjectValue: Math.round(currentProjectValue),
        totalPaid: Math.round(totalPaid),
        designPaid: Math.round(designPaid),
        executionPaid: Math.round(executionPaid),
        totalInvoicedBaseAmt: Math.round(totalInvoicedBaseAmt),
        pendingAmt: Math.round(pendingAmt),
        calculateMilestoneTotal
    };
}
