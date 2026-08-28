import re

with open('components/BoqItemCard.tsx', 'r') as f:
    content = f.read()

target = """                        </div>
                    )}
                </div>
            )}
        </div>

        {/* Premium Financials Footer */}"""

replacement = """                        </div>
                    )}
                </div>
                </MotionDiv>
            )}
            </AnimatePresence>
        </div>

        {/* Premium Financials Footer */}"""

content = content.replace(target, replacement)

with open('components/BoqItemCard.tsx', 'w') as f:
    f.write(content)
