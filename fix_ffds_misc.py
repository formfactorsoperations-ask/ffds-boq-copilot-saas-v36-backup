with open('./components/BankTab.tsx', 'r') as f:
    content = f.read()

content = content.replace("FFDS_Item_Bank_", "${orgData?.orgName?.replace(/\s+/g, '_') || 'Studio'}_Item_Bank_")
content = content.replace("FFDS_Bundle_", "${orgData?.orgName?.replace(/\s+/g, '_') || 'Studio'}_Bundle_")

with open('./components/BankTab.tsx', 'w') as f:
    f.write(content)

with open('./components/StudioExcelGrid.tsx', 'r') as f:
    content = f.read()

content = content.replace("Excluded from FFDS Scope", "Excluded from Firm Scope")
content = content.replace("Excluded (FFDS)", "Excluded (Firm)")

with open('./components/StudioExcelGrid.tsx', 'w') as f:
    f.write(content)

with open('./components/ops/ClientUpdatesManager.tsx', 'r') as f:
    content = f.read()

content = content.replace("'FFDS Site Supervisor'", "`${orgData?.orgName || 'Studio'} Site Supervisor`")
content = content.replace("'FFDS Design Team'", "`${orgData?.orgName || 'Studio'} Design Team`")

with open('./components/ops/ClientUpdatesManager.tsx', 'w') as f:
    f.write(content)
