with open('./components/PaymentCalculatorTab.tsx', 'r') as f:
    content = f.read()

content = content.replace("FFDS pays ~18% GST on material purchases which is lost (dead cost) if sold in cash", "The Studio pays ~18% GST on material purchases which is lost (dead cost) if sold in cash")
content = content.replace("Theoretical FFDS Profit", "Theoretical Firm Profit")

with open('./components/PaymentCalculatorTab.tsx', 'w') as f:
    f.write(content)
