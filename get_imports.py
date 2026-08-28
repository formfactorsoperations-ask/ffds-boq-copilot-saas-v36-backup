with open('components/BoqItemCard.tsx', 'r') as f:
    for line in f:
        if line.startswith('import '):
            print(line.strip())
