import re

with open('components/BoqItemCard.tsx', 'r') as f:
    content = f.read()

target = """  const handleCalcChange = (field: 'l' | 'w' | 'm', val: number) => {
      const l = field === 'l' ? val : item.calcLength || 0;
      const w = field === 'w' ? val : item.calcWidth || 0;
      const m = field === 'm' ? val : item.calcMultiplier || 1;
      
      const newQty = parseFloat((l * w * m).toFixed(2));
      
      const updates: Partial<BoqItem> = {
          calcLength: l,
          calcWidth: w,
          calcMultiplier: m,
      };

      if (newQty > 0) {
          updates.qty = newQty;
      }
      onUpdate(item.id, updates);
  }"""
content = content.replace(target, "")

with open('components/BoqItemCard.tsx', 'w') as f:
    f.write(content)
