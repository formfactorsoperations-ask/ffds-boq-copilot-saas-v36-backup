with open('./components/ProjectSetupWizard.tsx', 'r') as f:
    content = f.read()

content = content.replace("using FFDS standard specifications", "using standard firm specifications")

with open('./components/ProjectSetupWizard.tsx', 'w') as f:
    f.write(content)

with open('./components/ops/ScopeAdditionsModule.tsx', 'r') as f:
    content = f.read()

content = content.replace("FFDS_Supplementary_Ledger_", "Supplementary_Ledger_")
content = content.replace("FFDS Site", "Site")
content = content.replace("AUTHORIZED SIGNATORY (FFDS)", "AUTHORIZED SIGNATORY")
content = content.replace("FFDS_Invoice_", "Invoice_")

with open('./components/ops/ScopeAdditionsModule.tsx', 'w') as f:
    f.write(content)
